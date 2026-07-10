// Hook 事件接收器：CLI agent（Claude Code / Codex）的 hook 程序繼承 PTY 的
// HELM_SESSION_ID / HELM_EVENT_PORT 環境變數，把 hook stdin 的 JSON POST 回
// 這裡（POST /hook?session=<id>&source=<cli>），轉成 `agent://hook` 事件給前端。
// 只綁 127.0.0.1、隨機 port；任何請求一律回 200——hook 程序絕不能因 Helm 而失敗。
use std::io::Read;
use std::sync::atomic::{AtomicU16, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// 單次 POST body 上限：hook payload（tool_input / statusline JSON）遠小於此，
/// 上限只是擋本機惡意/失控程序灌爆記憶體。
const MAX_BODY_BYTES: u64 = 256 * 1024;

/// Managed state：對外只暴露已綁定的 port（0 = 未啟動，PTY spawn 時不注入）。
#[derive(Default)]
pub struct HookServer {
    port: AtomicU16,
}

impl HookServer {
    pub fn port(&self) -> u16 {
        self.port.load(Ordering::Relaxed)
    }
}

/// 發給前端的事件內容；payload 原樣轉交（正規化在前端純函式做，可單元測試）。
#[derive(Serialize, Clone)]
struct HookEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    source: String,
    payload: serde_json::Value,
}

/// 啟動 listener 執行緒並記下綁定的 port。失敗只回 Err 讓呼叫端記 log——
/// 沒有 hook server 時 app 仍正常運作（agent 偵測退回 viewport 掃描）。
pub fn start(app: AppHandle, state: &HookServer) -> Result<(), String> {
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| format!("bind failed: {e}"))?;
    let port = server.server_addr().to_ip().ok_or("no ip addr")?.port();
    state.port.store(port, Ordering::Relaxed);

    std::thread::spawn(move || {
        for mut request in server.incoming_requests() {
            if let Some(event) = parse_request(&mut request) {
                let _ = app.emit("agent://hook", event);
            }
            let _ = request.respond(tiny_http::Response::empty(200));
        }
    });
    Ok(())
}

/// 驗證並解析請求；非 POST /hook、缺 session、壞 JSON 都回 None（丟棄）。
fn parse_request(request: &mut tiny_http::Request) -> Option<HookEvent> {
    if *request.method() != tiny_http::Method::Post {
        return None;
    }
    let url = request.url().to_string();
    let (path, query) = url.split_once('?').unwrap_or((url.as_str(), ""));
    if path != "/hook" {
        return None;
    }
    let mut session_id = None;
    let mut source = None;
    for pair in query.split('&') {
        match pair.split_once('=') {
            Some(("session", v)) if !v.is_empty() => session_id = Some(v.to_string()),
            Some(("source", v)) if !v.is_empty() => source = Some(v.to_string()),
            _ => {}
        }
    }
    let session_id = session_id?;

    let mut body = String::new();
    request
        .as_reader()
        .take(MAX_BODY_BYTES)
        .read_to_string(&mut body)
        .ok()?;
    let payload: serde_json::Value = serde_json::from_str(&body).ok()?;
    Some(HookEvent {
        session_id,
        source: source.unwrap_or_default(),
        payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;
    use std::net::TcpStream;

    // 對綁在隨機 port 的 tiny_http server 發真實 HTTP 請求，回傳 parse 結果。
    fn roundtrip(request_text: impl Fn(u16) -> String) -> Option<HookEvent> {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        let handle = std::thread::spawn(move || {
            let mut req = server.recv().unwrap();
            let ev = parse_request(&mut req);
            let _ = req.respond(tiny_http::Response::empty(200));
            ev
        });
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(request_text(port).as_bytes()).unwrap();
        let mut buf = [0u8; 128];
        let _ = stream.read(&mut buf); // 等到 200 回應，確保 server 端已處理完
        handle.join().unwrap()
    }

    fn post(path_query: &str, body: &str) -> String {
        format!(
            "POST {path_query} HTTP/1.1\r\nHost: helm\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
    }

    // 合法 POST：session/source 與 JSON body 都被解析。
    #[test]
    fn parses_valid_hook_post() {
        let ev = roundtrip(|_| {
            post(
                "/hook?session=abc&source=claude-code",
                r#"{"hook_event_name":"Stop"}"#,
            )
        })
        .unwrap();
        assert_eq!(ev.session_id, "abc");
        assert_eq!(ev.source, "claude-code");
        assert_eq!(ev.payload["hook_event_name"], "Stop");
    }

    // 壞 JSON、缺 session、錯誤路徑都丟棄（server 仍回 200，hook 不因 Helm 失敗）。
    #[test]
    fn drops_bad_requests() {
        assert!(roundtrip(|_| post("/hook?session=abc", "not json")).is_none());
        assert!(roundtrip(|_| post("/hook?source=x", "{}")).is_none());
        assert!(roundtrip(|_| post("/other?session=abc", "{}")).is_none());
    }
}
