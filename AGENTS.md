# 台科登山社專案 Agent 核心規範與指引

## 1. 錯誤處理與顯示規範 (Error Handling & Transparency Rules)
- **錯誤訊息一律直接印出**：無論前端 UI、後端 API 或資料庫操作，發生錯誤時必須直接顯示完整具體的錯誤原因（如 `error.message`、PostgreSQL 錯誤代碼、狀態碼），嚴禁遮蔽或替換為空泛的「請聯絡社團管理員」或「儲存失敗」。
- **資料庫 Trigger 必設防遞迴守衛**：所有相互連動的觸發器函式開頭必須加上 `IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;`，杜絕 `stack depth limit exceeded`。
- **純資料更新走 Supabase 直通**：無 Google Drive 新上傳的純欄位與既有照片更動，一律直接寫入 Supabase，避免 iOS WebKit 對 GAS 302 重導向之 `Load failed` 阻斷。

## 2. 開發與交付規範
- **更新 README.md**：每次分析或程式碼變更後，必須以繁體中文更新 `README.md`。
- **版本號遞增**：每次修改後必須在 `package.json` 與相關說明中遞增版本號 tag。
- **依賴套件管理**：若需安裝新套件，必須使用 `pnpm`。
- **檔案變更同意**：修改任何現有程式碼檔案前需先取得使用者同意。
