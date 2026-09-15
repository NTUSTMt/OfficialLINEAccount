# 開發與交付規範 (Development Standards & Guidelines)

## 1. 檔案修改前同意原則 (Agreement Before Modification)
- 在變更、覆寫或刪除任何現有程式碼檔案前，必須先向使用者提出變更計劃並**取得明確同意**。
- 嚴禁未經確認逕自更動專案既有程式碼。

## 2. 文檔即時維護 (README Synchronous Updates)
- 每次進行程式碼開發、修復或架構分析後，必須更新專案根目錄的 `README.md`。
- `README.md` 內容必須以**繁體中文 (Traditional Chinese)** 為主，可輔以關鍵英文術語以便理解與維護。
- 若專案尚未建立 `README.md`，必須自動新建。

## 3. 版本號遞增原則 (App Version Bump)
- 每次完成功能開發或 Bug 修復後，必須同步遞增 `package.json` 中的版本號 (`version`) tag。
- 版本號推進應符合語意化版本或專案既有標籤規範（如 patch 遞增 `0.1.x`）。

## 4. 套件依賴管理 (Package Management)
- 專案嚴格使用 `pnpm` 作為唯一套件管理工具。
- 若需安裝、更新或移除依賴，嚴禁使用 `npm` 或 `yarn`，一律使用 `pnpm add`、`pnpm remove` 等指令。
