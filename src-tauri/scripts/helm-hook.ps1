# Helm hook forwarder: relay a CLI agent's hook stdin JSON to Helm.
#
# Claude Code 與 Codex 共用本檔，以 -Source 區分（預設 claude-code，讓舊版
# 寫進 settings.json、不帶參數的指令照舊運作）。
#
# Windows 上 Claude Code 用 Git Bash（沒裝才 PowerShell）執行 settings.json 的
# command 字串，因此指令寫成「powershell -File <本檔>」——「執行檔 + 參數」的
# 形式在兩種 host 下解析一致，不必偵測 host。
#
# 用 curl.exe 而非 Invoke-RestMethod：後者對 string body 在沒給 -ContentType 時
# 會送成 form-urlencoded 並把 JSON URL-encode，且 5.1/7.x 的字串編碼與 BOM 行為
# 不一致。curl --data-binary @- 則與 Unix 版語義逐行對應：原始 bytes、無編碼轉換。
# 例外是 BOM：Windows PowerShell 5.1 把字串 pipe 給原生 exe 時，在某些啟動情境下
# 即使下面把 $OutputEncoding 設成無 BOM，仍會在開頭補一個 BOM（實測；pwsh 7 不會），
# 所以 hookserver.rs 在解析前自己剝掉，不靠這裡。
# 注意必須寫 curl.exe：裸 curl 在 PowerShell 5.1 是 Invoke-WebRequest 的別名。
param([string]$Source = 'claude-code')

$ErrorActionPreference = 'SilentlyContinue'

# PowerShell 5.1 的 $OutputEncoding 預設是 ASCII，pipe 給原生 exe 時會把非 ASCII
# 轉成 '?'——CJK 檔案路徑或中文 prompt 會被打爛且無聲失敗。必須設成無 BOM UTF-8。
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

try {
  $port = $env:HELM_EVENT_PORT
  if ($port) {
    # $input 只在 PowerShell pipeline 內才有值；-File 啟動的腳本要讀真實 stdin。
    $json = [Console]::In.ReadToEnd()
    $curl = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
    if ($curl -and $json) {
      $uri = "http://127.0.0.1:$port/hook?session=$($env:HELM_SESSION_ID)&source=$Source"
      # token 走 header（見 hookserver.rs）；沒帶的請求會被 Helm 丟棄。
      $auth = "X-Helm-Token: $($env:HELM_EVENT_TOKEN)"
      # '@-' 單引號：否則 PowerShell 會把 @- 當 splat token 解析。
      # *> $null 導掉所有 stream——hook 的 stdout 會被 CLI 當控制輸出解讀。
      $json | & $curl -s -m 2 -X POST $uri -H $auth --data-binary '@-' *> $null
    }
  }
} catch { }

# 無條件成功（等價於 Unix 版的 "; exit 0"）：Helm 沒開或 hook server 沒起來時，
# 絕不能讓 CLI 對使用者顯示 hook 失敗。
exit 0
