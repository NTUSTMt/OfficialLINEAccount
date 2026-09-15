# 專案架構地圖與按需 Skills 調度導航 (Architecture Navigation & Skills Router)

本專案採「輕量 Rules 核心約束 + 按需載入 Skills（漸進揭露 Progressive Disclosure）」架構。
Agent 在處理各面向任務時，應依據當前工作內容，主動讀取 `.agents/skills/` 對應的領域 Skill，切勿一次讀取不相關的模組。

---

## 領域與 Skills 調度對照表

| 任務領域 / 關鍵字 | 適用情境與問題類型 | 對應 Skill 路徑 |
| :--- | :--- | :--- |
| **Supabase / 資料庫** | Schema 異動、RPC 函式撰寫、Enum 類型轉換、Trigger 觸發器防遞迴、RLS 權限、交易原子性 | `.agents/skills/supabase-architecture/SKILL.md` |
| **GAS / LINE Bot / 同步** | GAS Web App (01~06 模組)、LINE Bot Webhook、Flex Message 樣板排版、Google Drive 上傳、Google Sheets 雙向同步 (Sync Worker) | `.agents/skills/gas-linebot-integration/SKILL.md` |
| **LIFF / 前端 / WebKit** | React 19 + TypeScript 前端、LIFF 初始化、iOS WebKit `Load failed` 避坑、純資料走 Supabase 直通、i18n 多語系、Mobile UI | `.agents/skills/liff-frontend-webkit/SKILL.md` |
| **社團核心業務邏輯** | 會員與幹部身份驗證、活動報名/候補/取消遞補狀態機、裝備借還/押金/狀態流轉、繳費審核與自動對帳通知 | `.agents/skills/club-business-workflows/SKILL.md` |

---

## 按需載入原則 (Progressive Disclosure)
1. **處理單一子系統時，僅載入該領域之 Skill**：例如修改活動報名表單時，優先查閱 `club-business-workflows` 與 `liff-frontend-webkit`，不需載入 `gas-linebot-integration` 除非涉及 Bot 廣播通知。
2. **遇到跨層連動**：先查閱呼叫端（如 LIFF 前端），確認資料路徑（走 Supabase 直通或 GAS），再按需查閱被呼叫端之 Skill。
3. **查閱完整 Schema 欄位**：Supabase 資料庫詳細欄位定義可直接參考 [supabase/SCHEMA_DICTIONARY.md](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/SCHEMA_DICTIONARY.md)。
