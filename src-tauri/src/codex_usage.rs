//! Read only rate-limit events from bounded tails of recent local Codex rollouts.
use serde_json::Value;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

fn collect(dir: &Path, depth: usize, out: &mut Vec<(std::time::SystemTime, std::path::PathBuf)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() && depth > 0 {
            collect(&entry.path(), depth - 1, out);
        } else if kind.is_file() && entry.path().extension().is_some_and(|e| e == "jsonl") {
            if let Ok(time) = entry.metadata().and_then(|m| m.modified()) {
                out.push((time, entry.path()));
            }
        }
    }
}

#[tauri::command]
pub async fn codex_plan_usage() -> Option<Value> {
    tauri::async_runtime::spawn_blocking(|| {
        let root = std::env::var_os("CODEX_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| {
                std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
                    .map(|h| std::path::PathBuf::from(h).join(".codex"))
            })?;
        let mut files = Vec::new();
        collect(&root.join("sessions"), 3, &mut files);
        files.sort_unstable_by_key(|entry| std::cmp::Reverse(entry.0));
        let mut latest: Option<(String, Value)> = None;
        for (_, path) in files.into_iter().take(8) {
            let Ok(mut file) = fs::File::open(path) else {
                continue;
            };
            let Ok(len) = file.metadata().map(|m| m.len()) else {
                continue;
            };
            let offset = len.saturating_sub(512 * 1024);
            if file.seek(SeekFrom::Start(offset)).is_err() {
                continue;
            }
            let mut bytes = Vec::new();
            if file.take(512 * 1024).read_to_end(&mut bytes).is_err() {
                continue;
            }
            for line in String::from_utf8_lossy(&bytes).lines() {
                let Ok(event) = serde_json::from_str::<Value>(line) else {
                    continue;
                };
                if event["type"] != "event_msg" || event["payload"]["type"] != "token_count" {
                    continue;
                }
                let limits = &event["payload"]["rate_limits"];
                if !limits.is_object()
                    || limits
                        .get("limit_id")
                        .and_then(Value::as_str)
                        .is_some_and(|id| id != "codex")
                {
                    continue;
                }
                let Some(time) = event["timestamp"].as_str() else {
                    continue;
                };
                if latest.as_ref().is_none_or(|(prev, _)| time > prev.as_str()) {
                    latest = Some((time.to_owned(), limits.clone()));
                }
            }
        }
        latest.map(|(_, value)| value)
    })
    .await
    .ok()
    .flatten()
}
