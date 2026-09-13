# 錯誤處理與顯示規範 (Error Handling & Transparency Rules)

## 核心原則：錯誤訊息直接透明印出 (Transparent Error Handling)

1. **嚴禁掩蓋或吞掉錯誤**：
   - 無論是前端 UI 介面、後端服務 (GAS/Node.js)、資料庫存取 (Supabase) 或外部第三方服務 (LINE API, Google Drive)，發生例外 (Exception) 或錯誤時，**絕對禁止**將錯誤遮蔽或置換為模糊籠統的文字（例如只顯示「請聯絡社團管理員」、「儲存失敗」、「系統異常」而無任何錯誤詳情）。
2. **透明化印出完整錯誤細節**：
   - 所有的錯誤處理、彈跳視窗 (`alert` / `toast`)、錯誤畫面與系統日誌 (`console.error`)，必須**直接印出完整具體的錯誤訊息**（包括 `error.message`、PostgreSQL 錯誤代碼、HTTP 狀態碼或原始回傳內容）。
   - 格式範例：`儲存失敗: ${err?.message || JSON.stringify(err)}`，讓使用者、社團幹部與開發者能在第一時間掌握確切問題，無須猜測或通靈。
3. **資料庫雙向觸發器防遞迴守衛**：
   - 任何涉及兩個資料表相互同步連動的 PostgreSQL 觸發器（例如 `members` 與 `officers`），函式開頭**必須第一行加入** `IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;`，防範雙向無窮遞迴導致 `ERROR 54001: stack depth limit exceeded`。
4. **跨平台與瀏覽器相容性 (特別是 iOS WebKit)**：
   - 前端發送 POST 請求至 Google Apps Script Web App 時，GAS 會回傳 `302 Found` 跨域重導向至 `script.googleusercontent.com`。iOS LINE 內建 WebKit 瀏覽器經常會因此引發 `TypeError: Load failed`。
   - 對於不需要 Google Drive 上傳的純資料更新（例如純照片刪除、排序、欄位修改），應一律走 Supabase 直接更新（耗時 < 30ms，0% 依賴 GAS），徹底杜絕跨域轉址錯誤。
