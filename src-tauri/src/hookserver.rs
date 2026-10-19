// Hook 事件接收器：CLI agent（Claude Code / Codex）的 hook 程序繼承 PTY 的
// HELM_SESSION_ID / HELM_EVENT_PORT 環境變數，把 hook stdin 的 JSON POST 回
// 這裡（POST /hook?session=<id>&source=<cli>），轉成 `agent://hook` 事件給前端。
// 只綁 127.0.0.1、隨機 port；任何請求一律回 200——hook 程序絕不能因 Helm 而失敗。
//
// 光靠 127.0.0.1 + 隨機 port 擋不住偽造：本機任何程序掃得到 port，瀏覽器裡的
// 網頁也能對 127.0.0.1 發 text/plain 的 POST（不觸發 CORS 預檢）。偽造一個
// PermissionRequest 就能讓 Helm 跳出假的審批提示與桌面通知。所以每次啟動另產
// 一組隨機 token，經 HELM_EVENT_TOKEN 注入 PTY，hook 程序以 X-Helm-Token header
// 帶回；不符者丟棄。用 header 而非 query：網頁要帶自訂 header 必須先過 CORS
// 預檢（OPTIONS），而這裡只收 POST，預檢必然失敗。
use std::io::Read;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// 單次 POST body 上限：hook payload（tool_input / statusline JSON）遠小於此，
/// 上限只是擋本機惡意/失控程序灌爆記憶體。
const MAX_BODY_BYTES: u64 = 256 * 1024;

/// hook 程序帶回 token 用的 header 名稱（與 scripts/ 下的轉發腳本一致）。
const TOKEN_HEADER: &str = "X-Helm-Token";

/// Managed state：對外只暴露已綁定的 port（0 = 未啟動，PTY spawn 時不注入）
/// 與本次啟動的 token。
#[derive(Default)]
pub struct HookServer {
    port: AtomicU16,
    token: OnceLock<String>,
}

impl HookServer {
    pub fn port(&self) -> u16 {
        self.port.load(Ordering::Relaxed)
    }

    /// 本次啟動的 token；server 沒起來時為 None。
    pub fn token(&self) -> Option<&str> {
        self.token.get().map(String::as_str)
    }
}

/// 32 bytes 的作業系統亂數，hex 編碼。
fn generate_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| format!("random token failed: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// 比對時間不隨「前幾個字元相同」而變的字串比較。本機攻擊面很小，但這是零成本。
fn token_matches(given: &str, expected: &str) -> bool {
    given.len() == expected.len()
        && given
            .bytes()
            .zip(expected.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
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
    // token 先於 bind：拿不到亂數就不開 server（port 維持 0，PTY 不注入），
    // 絕不退回成不驗證的接收器。
    let token = generate_token()?;
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| format!("bind failed: {e}"))?;
    let port = server.server_addr().to_ip().ok_or("no ip addr")?.port();
    state
        .token
        .set(token.clone())
        .map_err(|_| "hook server already started")?;
    state.port.store(port, Ordering::Relaxed);

    std::thread::spawn(move || {
        for mut request in server.incoming_requests() {
            if let Some(event) = parse_request(&mut request, &token) {
                let _ = app.emit("agent://hook", event);
            }
            let _ = request.respond(tiny_http::Response::empty(200));
        }
    });
    Ok(())
}

/// 驗證並解析請求；非 POST /hook、token 不符、缺 session、壞 JSON 都回 None（丟棄）。
fn parse_request(request: &mut tiny_http::Request, token: &str) -> Option<HookEvent> {
    if *request.method() != tiny_http::Method::Post {
        return None;
    }
    // 先驗 token 再讀 body：偽造的請求連 256KB 的讀取額度都不給。這也是單執行緒
    // listener 不被拖住的關鍵——header 由 tiny_http 自己的執行緒解析，body 才在
    // 這條執行緒上讀；不帶正確 token 的慢速連線根本走不到讀 body 這一步。
    let authorized = request
        .headers()
        .iter()
        .any(|h| h.field.equiv(TOKEN_HEADER) && token_matches(h.value.as_str(), token));
    if !authorized {
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
    // Windows PowerShell 5.1 的 pipe 有時會在 body 前加 UTF-8 BOM（見測試
    // accepts_powershell_51_bom_body），serde_json 不認 BOM，會整筆丟棄。
    let payload: serde_json::Value =
        serde_json::from_str(body.trim_start_matches('\u{feff}')).ok()?;
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

    const TOKEN: &str = "0123456789abcdef";

    // 對綁在隨機 port 的 tiny_http server 發真實 HTTP 請求，回傳 parse 結果。
    fn roundtrip(request_text: impl Fn(u16) -> String) -> Option<HookEvent> {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        let handle = std::thread::spawn(move || {
            let mut req = server.recv().unwrap();
            let ev = parse_request(&mut req, TOKEN);
            let _ = req.respond(tiny_http::Response::empty(200));
            ev
        });
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(request_text(port).as_bytes()).unwrap();
        let mut buf = [0u8; 128];
        let _ = stream.read(&mut buf); // 等到 200 回應，確保 server 端已處理完
        handle.join().unwrap()
    }

    fn post_with_headers(path_query: &str, headers: &str, body: &str) -> String {
        format!(
            "POST {path_query} HTTP/1.1\r\nHost: helm\r\n{headers}Content-Length: {}\r\n\r\n{body}",
            body.len()
        )
    }

    // 帶正確 token 的請求（轉發腳本的正常形態）。
    fn post(path_query: &str, body: &str) -> String {
        post_with_headers(path_query, &format!("X-Helm-Token: {TOKEN}\r\n"), body)
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

    // 缺 token、token 錯、只差一個字元、長度不同都丟棄；header 名稱不分大小寫。
    #[test]
    fn requires_matching_token_header() {
        let body = r#"{"hook_event_name":"PermissionRequest"}"#;
        let q = "/hook?session=abc&source=codex";
        assert!(roundtrip(|_| post_with_headers(q, "", body)).is_none());
        assert!(roundtrip(|_| post_with_headers(q, "X-Helm-Token: nope\r\n", body)).is_none());
        assert!(roundtrip(|_| {
            post_with_headers(q, "X-Helm-Token: 0123456789abcdeF\r\n", body)
        })
        .is_none());
        assert!(roundtrip(|_| {
            post_with_headers(q, "X-Helm-Token: 0123456789abcdef0\r\n", body)
        })
        .is_none());
        // 放在 query 裡不算：token 只認 header（見檔頭的 CORS 說明）。
        assert!(
            roundtrip(|_| { post_with_headers(&format!("{q}&token={TOKEN}"), "", body) }).is_none()
        );
        let ev = roundtrip(|_| post_with_headers(q, &format!("x-helm-token: {TOKEN}\r\n"), body))
            .unwrap();
        assert_eq!(ev.source, "codex");
    }

    // Windows PowerShell 5.1 把字串 pipe 給 curl.exe 時，在某些啟動情境下即使
    // $OutputEncoding 設成無 BOM 的 UTF-8，仍會在 body 前加 BOM、尾端加 CRLF
    // （實測：由另一個程序以 pipe 直接啟動 helm-hook.ps1 時會；由 Codex 0.163
    // 啟動時不會；pwsh 7 都不會）。觸發條件沒有釐清，所以 server 端一律容忍。
    #[test]
    fn accepts_powershell_51_bom_body() {
        let ev = roundtrip(|_| {
            post(
                "/hook?session=abc&source=codex",
                "\u{feff}{\"hook_event_name\":\"Stop\"}\r\n",
            )
        })
        .unwrap();
        assert_eq!(ev.payload["hook_event_name"], "Stop");
    }

    #[test]
    fn generated_tokens_are_long_and_distinct() {
        let a = generate_token().unwrap();
        let b = generate_token().unwrap();
        assert_eq!(a.len(), 64);
        assert!(a.bytes().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }
}
