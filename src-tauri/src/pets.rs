// Companion 寵物的匯入 / 列出 / 讀取 / 刪除。
//
// 格式與 Codex 寵物相同（pet.json + sprite sheet，1536×1872 的 8×9 格），另外也
// 接受多兩列轉頭方向的擴充版（1536×2288），圖片可以是 WebP 或 PNG。Helm 只讀
// 自己資料夾裡的寵物（app_data_dir/pets/<id>/），一律經由匯入複製進來：原始
// 資料夾之後被刪、被改都不影響。內建的預設寵物隨前端打包（public/pets/），
// 不在這裡。
//
// 匯入時把 pet.json 正規化重寫（spritesheetPath 固定為 spritesheet.<webp|png>），
// 所以之後的讀取只需要信任資料夾名稱，不必再解讀使用者給的路徑。
//
// 錯誤一律回傳短代碼（not-found / bad-manifest / ...），文字由前端 i18n 對應。
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

const SHEET_WIDTH: u32 = 1536;
/// 標準 9 列，或多兩列轉頭方向的擴充版 11 列（每列 208）。
const SHEET_HEIGHTS: &[u32] = &[1872, 2288];
const MAX_SHEET_BYTES: u64 = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
const MANIFEST_FILE: &str = "pet.json";
/// 內建寵物的 id；匯入同名寵物時自動改名，內建的永遠不會被蓋掉。
const RESERVED_IDS: &[&str] = &["seagull"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    id: String,
    display_name: String,
    #[serde(default)]
    description: String,
    spritesheet_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetInfo {
    id: String,
    display_name: String,
    description: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ImportOutcome {
    Imported { id: String },
    /// 同 id 已存在且沒有要求覆蓋：前端詢問後帶 overwrite = true 再呼叫一次。
    Exists { id: String },
}

/// 寵物資料夾名稱 = id。只允許小寫英數、`-`、`_`，`..` 與路徑分隔在結構上不可能。
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
}

/// 名字 → 合法 id：非英數一律變 `-`、合併連續的 `-`；全是中文等字元時退回 "pet"。
fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.trim().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if c == '_' {
            out.push('_');
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let out: String = out.trim_matches('-').chars().take(64).collect();
    if out.is_empty() {
        "pet".to_string()
    } else {
        out
    }
}

/// 匯入時的最終 id：不合法就 slug，撞到內建寵物就加後綴。
fn import_id(raw: &str) -> String {
    let id = if valid_id(raw) { raw.to_string() } else { slug(raw) };
    if RESERVED_IDS.contains(&id.as_str()) {
        format!("{id}-custom")
    } else {
        id
    }
}

/// spritesheetPath 必須是資料夾內的相對路徑：不可為絕對路徑、不可含 `..`。
fn safe_relative(path: &str) -> bool {
    let p = Path::new(path);
    !path.is_empty() && p.components().all(|c| matches!(c, Component::Normal(_)))
}

/// 從 WebP 檔頭讀出畫布尺寸。支援三種 chunk：VP8（有損）、VP8L（無損）、
/// VP8X（擴充，含動畫與 alpha）。不是 WebP 回 None。
fn webp_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 30 || &b[0..4] != b"RIFF" || &b[8..12] != b"WEBP" {
        return None;
    }
    let le16 = |i: usize| u32::from(b[i]) | (u32::from(b[i + 1]) << 8);
    let le24 = |i: usize| le16(i) | (u32::from(b[i + 2]) << 16);
    match &b[12..16] {
        b"VP8 " => {
            // 3 bytes frame tag + start code 9d 01 2a，之後是 14-bit 寬高。
            if b[23..26] != [0x9d, 0x01, 0x2a] {
                return None;
            }
            Some((le16(26) & 0x3fff, le16(28) & 0x3fff))
        }
        b"VP8L" => {
            if b[20] != 0x2f {
                return None;
            }
            let bits = u32::from(b[21])
                | (u32::from(b[22]) << 8)
                | (u32::from(b[23]) << 16)
                | (u32::from(b[24]) << 24);
            Some(((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1))
        }
        b"VP8X" => Some((le24(24) + 1, le24(27) + 1)),
        _ => None,
    }
}

/// 從 PNG 的 IHDR 讀出尺寸（簽章之後第一個 chunk，寬高各 4 bytes big endian）。
fn png_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 24 || &b[0..8] != b"\x89PNG\r\n\x1a\n" || &b[12..16] != b"IHDR" {
        return None;
    }
    let be32 = |i: usize| u32::from_be_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]);
    Some((be32(16), be32(20)))
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum SheetFormat {
    Webp,
    Png,
}

impl SheetFormat {
    fn file_name(self) -> &'static str {
        match self {
            SheetFormat::Webp => "spritesheet.webp",
            SheetFormat::Png => "spritesheet.png",
        }
    }
    fn mime(self) -> &'static str {
        match self {
            SheetFormat::Webp => "image/webp",
            SheetFormat::Png => "image/png",
        }
    }
}

/// 驗證 sprite sheet 內容：是 WebP 或 PNG（看檔頭，不信副檔名）、尺寸正確。
fn check_sheet(bytes: &[u8]) -> Result<SheetFormat, String> {
    let (format, size) = if let Some(size) = webp_size(bytes) {
        (SheetFormat::Webp, size)
    } else if let Some(size) = png_size(bytes) {
        (SheetFormat::Png, size)
    } else {
        return Err("not-image".into());
    };
    if size.0 == SHEET_WIDTH && SHEET_HEIGHTS.contains(&size.1) {
        Ok(format)
    } else {
        Err("bad-size".into())
    }
}

fn parse_manifest(text: &str) -> Result<Manifest, String> {
    let m: Manifest = serde_json::from_str(text).map_err(|_| "bad-manifest".to_string())?;
    if m.id.trim().is_empty() || m.display_name.trim().is_empty() {
        return Err("bad-manifest".into());
    }
    if !safe_relative(&m.spritesheet_path) {
        return Err("bad-path".into());
    }
    Ok(m)
}

fn read_capped(path: &Path, cap: u64) -> Result<Vec<u8>, String> {
    let meta = std::fs::metadata(path).map_err(|_| "not-found".to_string())?;
    if !meta.is_file() {
        return Err("not-found".into());
    }
    if meta.len() > cap {
        return Err("too-large".into());
    }
    std::fs::read(path).map_err(|_| "io".to_string())
}

fn pets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "io".to_string())?
        .join("pets");
    std::fs::create_dir_all(&dir).map_err(|_| "io".to_string())?;
    Ok(dir)
}

fn manifest_json(id: &str, display_name: &str, description: &str, format: SheetFormat) -> String {
    serde_json::json!({
        "id": id,
        "displayName": display_name,
        "description": description,
        "spritesheetPath": format.file_name(),
    })
    .to_string()
}

#[tauri::command]
pub fn list_pets(app: AppHandle) -> Result<Vec<PetInfo>, String> {
    let dir = pets_dir(&app)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|_| "io".to_string())?.flatten() {
        let id = entry.file_name().to_string_lossy().to_string();
        if !valid_id(&id) || !entry.path().is_dir() {
            continue;
        }
        let Ok(bytes) = read_capped(&entry.path().join(MANIFEST_FILE), MAX_MANIFEST_BYTES) else {
            continue;
        };
        let Ok(m) = parse_manifest(&String::from_utf8_lossy(&bytes)) else {
            continue;
        };
        out.push(PetInfo {
            id,
            display_name: m.display_name,
            description: m.description,
        });
    }
    out.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(out)
}

/// sprite sheet 以 data: URL 回傳（同 background.rs：打包後的 macOS 上 asset
/// protocol 常載不出圖，CSP 的 img-src 已允許 data:）。
#[tauri::command]
pub async fn read_pet_sprite(app: AppHandle, id: String) -> Result<String, String> {
    if !valid_id(&id) {
        return Err("not-found".into());
    }
    let dir = pets_dir(&app)?.join(&id);
    for format in [SheetFormat::Webp, SheetFormat::Png] {
        let path = dir.join(format.file_name());
        if path.is_file() {
            let bytes = read_capped(&path, MAX_SHEET_BYTES)?;
            return Ok(format!("data:{};base64,{}", format.mime(), STANDARD.encode(bytes)));
        }
    }
    Err("not-found".into())
}

/// source 是寵物資料夾（含 pet.json）或單一圖片（.webp / .png）；後者需要 display_name。
#[tauri::command]
pub async fn import_pet(
    app: AppHandle,
    source: String,
    display_name: Option<String>,
    overwrite: bool,
) -> Result<ImportOutcome, String> {
    let src = PathBuf::from(&source);
    let (id, name, description, sheet) = if src.is_dir() {
        let text = read_capped(&src.join(MANIFEST_FILE), MAX_MANIFEST_BYTES)?;
        let m = parse_manifest(&String::from_utf8_lossy(&text))?;
        let sheet = read_capped(&src.join(&m.spritesheet_path), MAX_SHEET_BYTES)?;
        (import_id(&m.id), m.display_name, m.description, sheet)
    } else {
        let name = display_name
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty())
            .ok_or_else(|| "bad-manifest".to_string())?;
        let sheet = read_capped(&src, MAX_SHEET_BYTES)?;
        (import_id(&slug(&name)), name, String::new(), sheet)
    };
    let format = check_sheet(&sheet)?;

    let dir = pets_dir(&app)?;
    let dest = dir.join(&id);
    if dest.exists() && !overwrite {
        return Ok(ImportOutcome::Exists { id });
    }
    // 先寫到暫存資料夾再換上：寫到一半失敗不會留下半隻寵物。
    let tmp = dir.join(format!(".{id}.tmp"));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|_| "io".to_string())?;
    let write = || -> std::io::Result<()> {
        std::fs::write(tmp.join(format.file_name()), &sheet)?;
        std::fs::write(
            tmp.join(MANIFEST_FILE),
            manifest_json(&id, &name, &description, format),
        )?;
        if dest.exists() {
            std::fs::remove_dir_all(&dest)?;
        }
        std::fs::rename(&tmp, &dest)
    };
    if write().is_err() {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err("io".into());
    }
    Ok(ImportOutcome::Imported { id })
}

#[tauri::command]
pub async fn delete_pet(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("not-found".into());
    }
    match std::fs::remove_dir_all(pets_dir(&app)?.join(&id)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("io".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn riff(chunk: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(b"RIFF");
        b.extend_from_slice(&[0, 0, 0, 0]);
        b.extend_from_slice(b"WEBP");
        b.extend_from_slice(chunk);
        b.extend_from_slice(&[0, 0, 0, 0]);
        b.extend_from_slice(payload);
        b.resize(b.len().max(40), 0);
        b
    }

    #[test]
    fn reads_vp8x_canvas_size() {
        // 寬高各存 (n - 1) 的 24-bit little endian，前面是 4 bytes flags。
        let (w, h) = (1536u32 - 1, 1872u32 - 1);
        let mut p = vec![0x10, 0, 0, 0];
        p.extend_from_slice(&w.to_le_bytes()[..3]);
        p.extend_from_slice(&h.to_le_bytes()[..3]);
        assert_eq!(webp_size(&riff(b"VP8X", &p)), Some((1536, 1872)));
    }

    #[test]
    fn reads_vp8l_size() {
        let bits: u32 = (1536 - 1) | ((1872 - 1) << 14);
        let mut p = vec![0x2f];
        p.extend_from_slice(&bits.to_le_bytes());
        assert_eq!(webp_size(&riff(b"VP8L", &p)), Some((1536, 1872)));
    }

    #[test]
    fn reads_vp8_size() {
        let mut p = vec![0, 0, 0, 0x9d, 0x01, 0x2a];
        p.extend_from_slice(&1536u16.to_le_bytes());
        p.extend_from_slice(&1872u16.to_le_bytes());
        assert_eq!(webp_size(&riff(b"VP8 ", &p)), Some((1536, 1872)));
    }

    #[test]
    fn rejects_non_webp() {
        assert_eq!(webp_size(b"\x89PNG\r\n\x1a\n not a webp at all, padding padding"), None);
        assert_eq!(webp_size(b"RIFF"), None);
        assert_eq!(webp_size(&riff(b"VP8 ", &[0, 0, 0, 1, 2, 3])), None);
        assert_eq!(check_sheet(b"nope"), Err("not-image".into()));
    }

    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut b = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec();
        b.extend_from_slice(&w.to_be_bytes());
        b.extend_from_slice(&h.to_be_bytes());
        b.extend_from_slice(&[8, 6, 0, 0, 0]);
        b
    }

    #[test]
    fn accepts_png_and_extended_sheets() {
        assert_eq!(png_size(&png(1536, 2288)), Some((1536, 2288)));
        assert_eq!(check_sheet(&png(1536, 1872)), Ok(SheetFormat::Png));
        assert_eq!(check_sheet(&png(1536, 2288)), Ok(SheetFormat::Png));
        assert_eq!(check_sheet(&png(1536, 2000)), Err("bad-size".into()));
        let mut p = vec![0x10, 0, 0, 0];
        p.extend_from_slice(&1535u32.to_le_bytes()[..3]);
        p.extend_from_slice(&2287u32.to_le_bytes()[..3]);
        assert_eq!(check_sheet(&riff(b"VP8X", &p)), Ok(SheetFormat::Webp));
    }

    #[test]
    fn rejects_wrong_sheet_size() {
        let mut p = vec![0x10, 0, 0, 0];
        p.extend_from_slice(&511u32.to_le_bytes()[..3]);
        p.extend_from_slice(&511u32.to_le_bytes()[..3]);
        assert_eq!(check_sheet(&riff(b"VP8X", &p)), Err("bad-size".into()));
    }

    #[test]
    fn sprite_path_must_stay_inside_folder() {
        assert!(safe_relative("spritesheet.webp"));
        assert!(safe_relative("assets/sheet.webp"));
        assert!(!safe_relative(""));
        assert!(!safe_relative("../secret.webp"));
        assert!(!safe_relative("assets/../../x.webp"));
        assert!(!safe_relative("/etc/passwd"));
        assert!(!safe_relative("./sheet.webp"));
    }

    #[test]
    fn manifest_requires_fields_and_safe_path() {
        let ok = r#"{"id":"byte","displayName":"Byte","spritesheetPath":"spritesheet.webp"}"#;
        assert_eq!(parse_manifest(ok).unwrap().description, "");
        let missing = r#"{"id":"byte","spritesheetPath":"spritesheet.webp"}"#;
        assert_eq!(parse_manifest(missing).unwrap_err(), "bad-manifest");
        let blank = r#"{"id":" ","displayName":"Byte","spritesheetPath":"a.webp"}"#;
        assert_eq!(parse_manifest(blank).unwrap_err(), "bad-manifest");
        let escape = r#"{"id":"byte","displayName":"Byte","spritesheetPath":"../a.webp"}"#;
        assert_eq!(parse_manifest(escape).unwrap_err(), "bad-path");
        assert_eq!(parse_manifest("not json").unwrap_err(), "bad-manifest");
    }

    #[test]
    fn ids_are_safe_folder_names() {
        assert!(valid_id("byte-sprite_2"));
        assert!(!valid_id(""));
        assert!(!valid_id(".."));
        assert!(!valid_id("a/b"));
        assert!(!valid_id("Upper"));
        assert_eq!(slug("Byte Sprite!"), "byte-sprite");
        assert_eq!(slug("  阿嘎  "), "pet");
        assert_eq!(slug("../../etc"), "etc");
        assert_eq!(import_id("Byte Sprite"), "byte-sprite");
        assert_eq!(import_id("seagull"), "seagull-custom");
        assert!(valid_id(&import_id("..")));
    }
}
