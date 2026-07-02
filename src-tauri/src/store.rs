// Session metadata 持久化（SQLite）。只存輕量 metadata，PTY 於還原時重新 spawn。
use std::sync::Mutex;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

pub struct Store {
    conn: Mutex<Connection>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSession {
    pub id: String,
    pub title: String,
    pub status: String,
    pub created_at: i64,
    pub agent_id: Option<String>,
    pub launch_command: Option<String>,
}

impl Store {
    /// 在 app data dir 開啟（或建立）DB 並確保 schema 存在。
    pub fn init(app: &AppHandle) -> Result<Self, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app_data_dir failed: {e}"))?;
        std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;
        let conn = Connection::open(dir.join("aiterminal.db"))
            .map_err(|e| format!("open db failed: {e}"))?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                agent_id TEXT,
                launch_command TEXT
            )",
            [],
        )
        .map_err(|e| format!("create table failed: {e}"))?;
        // 舊 DB 升級：補欄位（已存在則忽略錯誤）。
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN agent_id TEXT", []);
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN launch_command TEXT", []);
        Ok(Store {
            conn: Mutex::new(conn),
        })
    }
}

#[tauri::command]
pub fn sessions_list(state: State<'_, Store>) -> Result<Vec<StoredSession>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, title, status, created_at, agent_id, launch_command
             FROM sessions ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(StoredSession {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                created_at: row.get(3)?,
                agent_id: row.get(4)?,
                launch_command: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn session_upsert(state: State<'_, Store>, session: StoredSession) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO sessions (id, title, status, created_at, agent_id, launch_command)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET title = ?2, status = ?3, agent_id = ?5, launch_command = ?6",
        rusqlite::params![
            session.id,
            session.title,
            session.status,
            session.created_at,
            session.agent_id,
            session.launch_command
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn session_delete(state: State<'_, Store>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM sessions WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
