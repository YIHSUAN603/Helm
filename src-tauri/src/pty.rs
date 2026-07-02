// PTY 管理：每個 session 一條 PTY。
// 設計為多 session（id -> PtySession 的 map），Phase 1 可直接沿用。
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use base64::Engine;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

/// 單一 PTY session 在 Rust 端持有的資源。
struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    // 保留 child 以便日後查詢/終止；drop 時會嘗試結束子行程。
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// 全域 PTY 管理器，作為 Tauri managed state。
#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

#[derive(Deserialize)]
pub struct SpawnOptions {
    pub id: String,
    pub cols: u16,
    pub rows: u16,
    /// 啟動的 shell / 指令；None 則用使用者預設 shell。
    pub shell: Option<String>,
    /// 工作目錄；None 則用使用者 home。
    pub cwd: Option<String>,
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

/// 建立一條新的 PTY 並啟動 shell，同時開一條讀取執行緒把輸出以
/// `pty://output/<id>` 事件（base64 編碼的原始 bytes）串流到前端。
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyManager>,
    options: SpawnOptions,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: options.rows.max(1),
            cols: options.cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {e}"))?;

    let shell = options.shell.unwrap_or_else(default_shell);
    let mut cmd = CommandBuilder::new(shell);
    cmd.env("TERM", "xterm-256color");
    if let Some(cwd) = options.cwd {
        cmd.cwd(cwd);
    } else if let Some(home) = dirs_home() {
        cmd.cwd(home);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn failed: {e}"))?;

    // 先取得讀取端 clone，再把 master 收進 session。
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone reader failed: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take writer failed: {e}"))?;

    // 讀取端 slave 已被 spawn 使用；drop 掉本地 slave handle 讓 EOF 能被偵測。
    drop(pair.slave);

    let session = PtySession {
        master: pair.master,
        writer,
        child,
    };

    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(options.id.clone(), session);
    }

    // 讀取執行緒：把 PTY 輸出串流給前端。
    let id = options.id.clone();
    std::thread::spawn(move || {
        let output_event = format!("pty://output/{id}");
        let exit_event = format!("pty://exit/{id}");
        let engine = base64::engine::general_purpose::STANDARD;
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF：子行程結束
                Ok(n) => {
                    let encoded = engine.encode(&buf[..n]);
                    let _ = app.emit(&output_event, encoded);
                }
                Err(_) => break,
            }
        }
        let _ = app.emit(&exit_event, ());
    });

    Ok(())
}

/// 將鍵盤輸入寫入指定 PTY。
#[tauri::command]
pub fn pty_write(state: State<'_, PtyManager>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("no pty session: {id}"))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("write failed: {e}"))?;
    session.writer.flush().map_err(|e| format!("flush failed: {e}"))?;
    Ok(())
}

/// 調整 PTY 視窗大小（前端 fit addon 觸發）。
#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("no pty session: {id}"))?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {e}"))?;
    Ok(())
}

/// 終止並移除指定 PTY session。
#[tauri::command]
pub fn pty_kill(state: State<'_, PtyManager>, id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.child.kill();
    }
    Ok(())
}

fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok()
}
