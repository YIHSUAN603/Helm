# Helm Companion 設計稿

> 狀態：第一階段已實作 · 最後更新 2026-10-27

用一陣子之後，Toolbar 上會出現一隻小海鷗。牠會對 agent 的狀態做反應、提醒你有人在等批准，並隨著你們一起工作慢慢變熟。這是一個彩蛋：**解鎖前完全看不到**。

## 0. 兩條不可違反的界線

1. **只用滑鼠互動，不搶焦點、不攔按鍵。** 鍵盤四層架構（global / region / modal / terminal）完全不動。寵物元件不可 focusable；監聽「使用者是否閒置」的 window 事件一律 passive，不 `preventDefault`、不 `stopPropagation`。
2. **有人在等批准時，牠只做一件事：提醒你。** 只要有任何 session 在 `waiting`，其他反應、泡泡、閒晃全部暫停。這條規則寫在行為仲裁的純函式裡（§4），用測試鎖住，不靠元件自律。

另外：
- 不走通知中心，不發桌面通知
- 尊重 `prefers-reduced-motion`：只顯示每個狀態的第一格，不位移
- 解鎖後可以在設定裡隨時關掉

## 1. 寵物格式（與 Codex 相同）

一隻寵物是一個資料夾，存在 Helm 自己的位置：`app_data_dir/pets/<id>/`。

- `pet.json`：欄位為 `id`、`displayName`、`description`、`spritesheetPath`
- sprite sheet：WebP 或 PNG，1536×1872，8 欄 × 9 列，每格 192×208，背景透明，用不到的格子留空
- **擴充版**：1536×2288，多兩列轉頭方向（見下方第 9、10 列）

| 列 | 動畫 | 幀數 |
|---|---|---|
| 0 | idle | 6 |
| 1 | running-right | 8 |
| 2 | running-left | 8 |
| 3 | waving | 4 |
| 4 | jumping | 5 |
| 5 | failed | 8 |
| 6 | waiting | 6 |
| 7 | running | 6 |
| 8 | review | 6 |
| 9 | 轉頭 0°–157.5° | 8 |
| 10 | 轉頭 180°–337.5° | 8 |

轉頭方向從正上方 0° 起順時針每 22.5° 一格：90° 朝右、180° 正對畫面、270° 朝左。Helm 從圖片高度判斷是哪一版；9 列的寵物照常運作，只是不會轉頭。

Helm 不讀 `~/.codex/pets`，寵物一律透過 Helm 的介面匯入（§7）。

預設海鷗（戴水手帽的版本，擴充版 WebP）放在 `public/pets/seagull/`，隨 app 一起打包，不能刪除。

## 2. 解鎖

計數器存在 `companion.json`（app data 目錄，走 `appstore.rs`，需要把檔名加入白名單）。

| 計數 | 怎麼算 |
|---|---|
| `answered` | session 從 `waiting` 轉到 `thinking`/`tool`。**不只算 `respondApproval`**，使用者在 terminal 直接按 `y` 也要算 |
| `done` | `detectAgentEvent` 產生 `done` 事件 |
| `agentSessions` | 偵測到 agent 的 session 數 |

**解鎖條件**：`answered ≥ 30` 或 `done ≥ 20`，任一個先達到。解鎖時海鷗從 Toolbar 右側跑進來（running-left），停下來揮手（waving），並寫下航海日誌第一頁。

解鎖前：設定裡沒有 Companion 區塊，命令面板也沒有相關指令。計數器照樣在背景累積。

## 3. 顯示

- **位置**：Toolbar 上，fleet 狀態列旁邊有一條專屬的「甲板」區域，寵物縮到大約 32px 高
- **播放**：CSS `background-position` 搭配 `steps()` 逐格播放；位移用 `transform`，不觸發 layout
- **跟著誰**：跟著目前的 session；任何 session 在等批准時，優先顯示 waiting
- 拖曳後的位置（在甲板內的水平比例）存進 `companion.json`

## 4. 行為仲裁（核心純函式）

`pickBehavior(context) → { anim, motion, speed, bubble? }`，每次狀態變化或計時器觸發時重新計算。由上往下，**第一個符合的就勝出**：

| 優先 | 條件 | 動畫與動作 |
|---|---|---|
| 1 | 任何 session 等批准 ≥ 5 分鐘 | waiting（靜止），泡泡寫「還在等你喔」 |
| 2 | 任何 session 等批准 ≥ 60 秒 | 甲板上左右來回跑（running-left/right），催你 |
| 3 | 任何 session 等批准 | waiting |
| 4 | 正在播的一次性反應（§5、§6） | 播完回到下一個符合的狀態 |
| 5 | 被惹毛跑走的冷卻時間內 | 不顯示 |
| 6 | 目前的 session 是 error 或 interrupted | 倒地（failed，停在最後一格），點一下才爬起來 |
| 7 | 目前的 session stalled | idle 放慢到一半速度，探頭看向 pane，泡泡寫「牠好像睡著了？」 |
| 8 | 目前的 session 在 thinking | running；速度隨整個 fleet 忙碌的 agent 數增加（1 個 1.0×，最多 1.6×） |
| 9 | 目前的 session 在 tool | running-right/left，在甲板上來回 |
| 10 | 目前的 session 是 done | review |
| 11 | 使用者閒置 ≥ 5 分鐘 | 在甲板上散步（running 慢速 + idle 交替） |
| 12 | 深夜（當地時間 0–5 點） | idle 放慢，加上 `z` 泡泡 |
| 13 | 其他 | idle |

**規則 1–3 優先於規則 4**：一次性反應在有人等批准時會被打斷，這就是 §0 第 2 條的實作。這點必須有測試。

點寵物時，如果有人在等批准，會跳到那個 session（沿用 `activateNextInFleetState("waiting")`），這時不算互動反應。

## 5. 你對牠做的事（只限滑鼠）

| 操作 | 反應 |
|---|---|
| 點一下 | waving，加上一句依狀態、時間、親密度挑選的台詞 |
| 2 秒內連點 5 下 | jumping，泡泡寫「別戳了！」 |
| 2 秒內連點 10 下 | running-left 跑出畫面，60 秒後才回來 |
| 游標在附近（320px 內） | 轉頭看向游標（擴充版限定，只在 idle / review 時） |
| 滑鼠停在牠身上 | 正面看著你（180°）；9 列的寵物則停在當下那一格 |
| 拖曳 | 拎起來時播 failed 當作掙扎，放下後播 idle，記住新位置 |
| 雙擊 | waving，然後打開航海日誌 |
| 右鍵 | 小選單：換寵物、讓牠去睡（等於關掉）、看日誌 |
| 倒地時點一下 | 爬起來（播 jumping 一次），泡泡寫「再來一次」 |

## 6. 牠主動做的事（一次性反應）

| 觸發 | 反應 |
|---|---|
| 一個 prompt 被回答（`answered` +1） | waving |
| 連續 3 次 done，中間沒有 error | jumping，泡泡寫「順風！」 |
| 目前 workspace 的 changed files 在 10 秒內增加超過 10 個 | jumping，加上「!」泡泡（嚇一跳） |
| 達成里程碑 | jumping，再跳出里程碑小卡（§9） |
| 閒置後回來 | waving |
| 凌晨 3 點後第一次互動（每晚一次） | 泡泡勸你去睡 |
| 親密度 4 級以上，app 啟動時 | 從旁邊跑進來，接著 waving |

**泡泡頻率限制**：牠主動冒出的泡泡至少間隔 2 分鐘；你點牠觸發的不受限制。泡泡顯示 4 秒，不擋 Toolbar 上的按鈕（`pointer-events: none`）。

## 7. 寵物管理（設定 → Companion，解鎖後出現）

- 開關、從收藏的寵物中選一隻（可以收藏多隻）、匯入、刪除（預設海鷗不可刪）
- 匯入可以選資料夾，或只選一張 `.webp`（之後輸入名字，自動產生 `pet.json`）
- `pets.rs` 驗證通過才複製進來：
  - `id` 只能用 `[a-z0-9-_]`，不符合的話由名字產生
  - `spritesheetPath` 不能是絕對路徑，也不能含 `..`，正規化後必須留在資料夾內
  - 看檔頭判斷格式（WebP 的 VP8 / VP8L / VP8X，或 PNG 的 IHDR），不信副檔名
  - 尺寸必須是 1536×1872 或 1536×2288
  - 檔案大小上限 8MB
  - `id` 重複時詢問是否覆蓋
- 讀圖由 Rust 轉成 data URL（同背景圖）：打包後的 macOS 上 asset protocol 常載不出圖

## 8. 親密度

| 來源 | 分數 |
|---|---|
| 點牠 | +1，每天最多 10 分 |
| 回答一個 prompt | +2 |
| 完成一個回合 | +1 |
| 達成里程碑 | +10 |

| 等級 | 門檻 | 解鎖什麼 |
|---|---|---|
| 1 | 0 | 基本台詞 |
| 2 | 50 | 依時段打招呼（早安、午安、晚安） |
| 3 | 200 | 記得你的習慣（見下方） |
| 4 | 600 | 啟動 app 時跑進來迎接你 |
| 5 | 1500 | 專屬台詞，可以改名字（右鍵選單多一個「取名」） |

**記得你的習慣**：`companion.json` 存一份「每天第一次啟動的小時」分布，共 24 格。今天比你常來的時間早 2 小時以上，牠會說「今天來得真早」。另外也會講累積數字，例如「這是我們一起完成的第 500 個回合」。

分數只增不減。不做「冷落太久會難過」的懲罰，彩蛋不應該讓人有壓力。

## 9. 航海日誌

- **里程碑**：解鎖、回答 100 / 500 / 1000 次、完成 100 / 500 次、第一次在深夜掌舵、同時有 4 個以上 agent 在忙、親密度每升一級、累積花費第一次超過 $10 / $100
- 達成時寵物播 jumping，旁邊跳出一張小卡，5 秒後自己淡掉
- 所有里程碑收在設定 Companion 區塊裡的日誌清單，也可以從寵物的雙擊或右鍵選單打開
- 只記在 `companion.json`，不寫進 `events.jsonl`，不進通知中心

## 10. 台詞庫

- 放在 i18n（`companion.line.*`），中英雙語
- 每句台詞標上條件：情境（click / stalled / error / night …）、最低親密度、時段
- 純函式 `pickLine(context, rng)` 負責篩選和挑選，避免同一句連續出現；`rng` 用參數傳入，測試才能重現
- 第一版每個情境準備 3–5 句

## 11. 檔案拆分

| 檔案 | 內容 |
|---|---|
| `src/companion/petAnimation.ts` | 純函式：動畫名稱 → 列號、幀數、播放時間，一次性動畫是否播完 |
| `src/companion/behavior.ts` | 純函式：`pickBehavior` 行為仲裁（§4）、連點偵測、changed files 突增判斷 |
| `src/companion/progress.ts` | 純函式：計數、解鎖、里程碑、親密度與等級、`companion.json` schema 與 normalize |
| `src/companion/lines.ts` | 純函式：`pickLine` 台詞挑選 |
| `src/store/companion.ts` | Zustand store、讀寫 `companion.json`（debounce，不在 store setter 裡同步寫檔） |
| `src/components/Companion/` | 甲板與寵物、泡泡、里程碑小卡、右鍵選單、日誌 |
| `src/components/SettingsDialog/` | 新增 Companion 區塊（解鎖後才渲染） |
| `src-tauri/src/pets.rs` | `list_pets` / `import_pet` / `delete_pet`，含路徑安全和 WebP 尺寸檢查的 cargo test |
| `src-tauri/src/appstore.rs` | 白名單加入 `companion.json` |
| `src/ipc/pets.ts`、`src/ipc/dialog.ts` | IPC 包裝、新增只接受 `.webp` 的選檔函式 |
| `src/i18n/translations/*` | 台詞與設定介面的文字 |
| `tests/companion-*.test.ts` | 四個純函式模組的測試 |

**接上現有資料流的地方**：
- `sessions.ts` 的 `setAgentState`（`detectAgentEvent` 旁邊）：回報 `answered` 和 `done`
- changed files 的 store：回報新增數量，用來判斷突增
- `staleBusyWatch`：stalled 狀態直接從 session 讀取，不另外輪詢

## 12. 第二階段（這次不做）

- 餵食：每天第一次點牠時掉一塊小餅乾
- 節日裝飾：解鎖週年、新年、中秋
- 隱藏小遊戲：抓海鷗、猜回合會不會出錯

## 13. 待決事項

- [x] 預設海鷗的 sprite sheet
- [x] 內建圖轉成 WebP（q85，2.8MB → 640KB）
- [ ] 解鎖門檻和親密度數值，實際用過之後再調整
