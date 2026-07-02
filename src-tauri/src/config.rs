// 讀取使用者的 agents.json（放在 app config dir）。
// 不存在時寫一份空範本，方便使用者編輯來新增自訂 agent。
use tauri::{AppHandle, Manager};

// 預設範本：帶一個可直接玩的 demo launcher，示範「任何工具都能用 config 加進來」。
// profiles 以 id 覆寫內建；launchers 會追加到側欄「+」選單。
const TEMPLATE: &str = r#"{
  "_readme": "在此新增自訂 agent。profiles 以 id 覆寫內建；launchers 會追加到側欄選單。command 會被當成輸入送進該 session 的 shell。",
  "profiles": [],
  "launchers": [
    {
      "label": "Mock Agent (demo)",
      "command": "printf 'thinking...\\n'; sleep 1; printf 'edited: demo.txt\\n'; printf 'created: notes.md\\n'; printf 'Do you want to proceed? (y/n) '; read a; printf 'you answered: %s\\n' \"$a\"; printf 'Total cost: $0.0123\\n'; printf '512 input tokens, 340 output tokens\\n'",
      "profileId": "generic"
    }
  ]
}
"#;

#[tauri::command]
pub fn read_agents_config(app: AppHandle) -> Result<Option<String>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("app_config_dir failed: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;
    let path = dir.join("agents.json");
    if !path.exists() {
        std::fs::write(&path, TEMPLATE).map_err(|e| format!("write template failed: {e}"))?;
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("read failed: {e}"))?;
    Ok(Some(content))
}
