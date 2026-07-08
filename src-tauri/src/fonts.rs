// 列舉系統已安裝的等寬字型（供設定對話框的字型下拉選單使用）。
// monospaced 旗標來自字型 metadata（post table isFixedPitch / PANOSE），
// 少數標記不良的字型可能漏掉，前端保留「自訂」輸入作為補救。
use std::sync::OnceLock;

fn scan_monospace_families() -> Vec<String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut names: Vec<String> = db
        .faces()
        .filter(|f| f.monospaced)
        .filter_map(|f| f.families.first().map(|(name, _)| name.clone()))
        .collect();
    names.sort_by_key(|a| a.to_lowercase());
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    names
}

/// 回傳系統等寬字型的 family 名稱清單（排序、去重）。
/// 掃描結果以 OnceLock 快取，app 生命週期內只掃一次；
/// 宣告為 async 讓首次掃描跑在執行緒池而非 UI 執行緒。
#[tauri::command]
pub async fn list_monospace_fonts() -> Result<Vec<String>, String> {
    static CACHE: OnceLock<Vec<String>> = OnceLock::new();
    Ok(CACHE.get_or_init(scan_monospace_families).clone())
}
