# 🏕️ 野境戶外裝備租借系統 (Wilderness Gear Rental Store)

本專案是一個基於 **React + TypeScript + Vite** 開發的 LINE LIFF 網頁應用程式，為社團或個人提供直覺、現代化的露營與登山裝備預約租借平台。

## 📌 版本資訊 (Version Info)
- **當前版本**：`0.0.62` (v0.0.62)

---

## 🛠️ 主要更新與修復 (Key Updates & Bug Fixes)

### 62. 調整底部浮動購物條顯示位置 (v0.0.62)
- 由於底部導覽列已移除，將 [App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 中的 `.floating-cart-bar` 底部定位從 `calc(76px + ...)` 修正為 `calc(20px + ...)`，將浮動購物條往下移動到適當位置，避免遮擋裝備卡片內容。

### 61. 修復 Borrow 頁面 JSX 語法錯誤 (v0.0.61)
- 修復 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 中 `<div className="detail-modal-section">` 標籤未正確閉合導致編譯失敗（Unexpected token）的問題。

### 60. 新增裝備詳情彈窗與註冊意願幹部通知 (v0.0.60)
- **裝備詳細資訊彈窗**：
  - 更新 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。點擊裝備卡片時可彈出詳細資訊 Modal，顯示裝備大圖、細節規格/說明、庫存代碼，並在彈窗內直接增減預約數量。
  - 後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `getEquipmentsListAPI` 新增擷取試算表中的「說明 / 規格」欄位資料傳送至前端。
- **註冊新增意願調查選項**：
  - 更新 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)。在最後一步隱私同意書後方，新增「加入社員意願（`我有意願成為社員` / `我目前沒有意願成為社員`，二選一必填）」與「擔任社團幹部意願（`我有意願成為社團幹部`，選填）」欄位。
  - 後端 `getMemberProfileAPI` 與 `processSaveProfile` 同步支援「加入社員意願」與「擔任幹部意願」的讀寫。
- **擔任幹部意願 LINE 通知**：
  - 新增幹部群組通知邏輯：若新註冊使用者勾選幹部意願，或者更新資料填寫者的幹部意願變更為「我有意願成為社團幹部」時，系統會自動向幹部群組推播包含 `姓名`、`性別`、`系所`、`學號`、`登山經驗` 與 `體能` 的詳細通知信。
- **購物車回復浮動膠囊樣式**：
  - 將 [App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 中的 `.floating-cart-bar` 復原為漂浮圓角膠囊樣式並包含 Hover 動效，容器 padding-bottom 還原為 `95px`。

### 59. 裝備租借頁面優化 (嵌入真實圖片、置底購物車與雙重費用顯示) (v0.0.59)
- **支援讀取試算表圖片網址**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `getEquipmentsListAPI` 引擎，新增讀取試算表 `Equipments` 工作表的「圖片網址」欄位，並包裝於 JSON 傳送至前端。
- **Google Drive 連結直連與 Unsplash 美圖 fallback**：
  - 更新 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。新增 `getDirectImageUrl` 輔助函式，支援將使用者的 Google Drive 共享網址轉換為直接下載/嵌入格式。
  - 重構 `ProductImage` 元件，優先使用轉換後的自訂圖片連結；若無設定，則依據名稱關鍵字自動隨機配對精美的 Unsplash 實體山林裝備圖片（帳篷、睡袋、背包、登山杖、炊具、安全裝備等）。
- **底置購物車與雙重費用顯示**：
  - 重調 [App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css)，將 `.floating-cart-bar` 設定為固定在容器底部（寬度 100%、最大寬 600px 貼齊容器、微圓角頂部、移除 Hover 浮動動畫、增加下方安全區域 padding），並加寬主容器底部 padding。
  - 在購物車欄與結帳彈出 Drawer 中，並排且清晰顯示 **「基本費用 (原價)」** 與 **「個人使用費用 (若是社員即 5 折，非社員則顯示原價)」**。
  - 針對非社員的使用者，加入顯著黃色小字提醒 `(社員可享 5 折)`。

### 58. 支援體能證明多圖上傳 (最大 5 張) (v0.0.58)
- **多檔案前端處理**：
  - 更新 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)。調整 `strengthProofFiles` 狀態以陣列儲存選取的圖片。
  - 使用者現在可以同時選取多張圖片，或分次累加選取，上限為 5 張。
  - 新增「已選取待上傳檔案列表」UI，並支援個別移除。選取的圖片依然會在前端自動壓縮（品質 0.7 JPEG），以維持最佳效能。
  - 對於資料庫已存有的舊證明連結，若包含多個網址，前端會自動以逗號 `,` 解析，並渲染多個對應的「🔍 查看已上傳證明」超連結。
- **後端批次上傳與逗號區隔**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `processSaveProfile` 函數。
  - 遍歷接收到的 `strengthProofFiles` 陣列，逐一呼叫 `uploadFileToDrive` 函數，產生的 Google Drive 預覽網址再以逗號 `,` 拼接成一長字串寫回 Sheets 欄位。

### 57. 修復生日欄位比對誤判問題 (v0.0.57)
- **問題原因**：Google 試算表儲存日期時，有時以 `Date` 物件或 ISO 8601 字串（含時區，如 `2005-06-01T16:00:00.000Z`）方式回傳。舊的比對邏輯使用 `.split(" ")[0]` 僅能處理空格分隔格式，無法正確去除 `T` 分隔的時間資訊，導致生日未修改時仍被誤判為「已變更」。
- **修復方式**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中 `processSaveProfile` 的生日比對區塊。
  - 改為同時對 `T` 與空格進行分割（`.split("T")[0].split(" ")[0]`），確保不論 Sheet 回傳的日期格式為何，都能只取 `YYYY-MM-DD` 日期部分進行比對，杜絕誤報。

### 56. 電話與生日格式強制文字與規格化 (v0.0.56)
- **試算表電話強制文字**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `processSaveProfile` 函數。在寫入「聯絡電話」與「緊急聯絡人電話」時，前置單引號 `'` 逃逸字元，強制 Google 試算表以文字格式儲存，防止手機號碼開頭的 `0` 被自動省略。
- **試算表生日格式 YYYY/MM/DD**：
  - 將前端傳來的 `YYYY-MM-DD` 日期字串橫線 `-` 轉為斜線 `/`，同樣前置單引號 `'` 以文字儲存為 `2026/06/20`，配合使用者要求的格式標準。
- **前端載入解析相容**：
  - 在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 的 API 讀取區塊中，主動將生日字串中的斜線 `/` 轉回橫線 `-`，確保 HTML5 日期選擇器於各平台皆可完整載入歷史生日值，不產生白屏或無法帶入的情況。

### 55. 新增社員資料儲存動態變更通知機制 (v0.0.55)
- **修改明細通知**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `processSaveProfile` 函數。在寫入試算表前，主動深拷貝原資料列 `oldValues` 與新表單 `data` 進行 18 項主要欄位值比對。
  - 當用戶「更新資料」時，LINE 自動推播通知會明確條列出哪些欄位被修改，例如 `✏️ 聯絡地址：舊地址 ➡️ 新地址`；若有新上傳圖片，會特別提示 `📷 體能證明截圖：已重新上傳新檔案`；若無變更，則溫馨提示 `內容無變更`。
  - 當用戶為「全新註冊」時，則會條列出該用戶填寫的所有資料欄位明細。

### 54. 新增前端圖片上傳自動壓縮功能 (v0.0.54)
- **上傳失敗優化**：
  - **圖片自動壓縮**：在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中重新實作 `handleFileChange`。採用瀏覽器原生的 Canvas 繪圖技術，當使用者上傳體能證明截圖時，系統會自動將圖片等比例縮放至長寬最大 1024px，並以 `0.7` 的品質進行壓縮轉換為 JPEG base64。
  - **解決 GAS 上傳大小限制**：原本數 MB 的大型手機截圖經由前端壓縮後會降至 150KB ~ 300KB，徹底避免了因上傳資料過大而導致 Google Apps Script 伺服器流量溢出、超時或回傳 CORS / 網路錯誤的連線失敗狀況。
  - **放寬限制**：因具備壓縮功能，前端選取原始檔案大小限制安全地放寬至 10MB。

### 53. 解決載入狀態與錯誤畫面閃爍 UX 優化 (v0.0.53)
- **載入防閃爍機制**：
  - **全域守衛優化**：在 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 的 `AppContent` 函數最上方新增了 `liffInit.loading` 全域守衛阻擋。當 LIFF SDK 還在初始化或尚未解析出 `userId` 時，完全不渲染任何子路由或子頁面（直接呈現統一的驗證登入轉圈畫面）。
  - **優化成效**：徹底解決了使用者在載入頁面時，因 `userId` 尚未解析完成而造成子元件提前掛載、以空白 ID 發送無效 API 請求導致「載入失敗，請檢查網路」錯誤畫面短暫閃爍一秒後又恢復正常的體驗 Bug。
  - **程式碼簡化**：移除了 `/` 與 `/index.html` 路由內部的行內三元運算子 Loading 檢查，直接在載入完成後進行路由重定向，提升程式碼可讀性。

### 52. 歷史繳費紀錄獨立 LIFF 網址更新與按鈕連結直開優化 (v0.0.52)
- **歷史紀錄獨立 LIFF**：
  - 更新 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 導航列中的「歷史紀錄」連結，改為指向專屬獨立的 LIFF ID：`https://liff.line.me/2009217429-FRB6rjph`。
  - 修改前端 LIFF 初始化分流機制，確保訪問 `/history` 路由時以 `'2009217429-FRB6rjph'` 載入。
- **點擊按鈕直接打開網頁 (UX 優化)**：
  - 修改 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 中 `sendPaymentCenterMenu` 的 Flex 訊息按鈕動作。將原本需要回傳文字對話的「💰 繳費系統」與「📜 繳費紀錄」按鈕更改為 `'uri'` 動作類型，使用者點選後可直接在 LINE 內開啟對應的 LIFF 頁面，不需重複點擊。

### 51. 圖文選單指令對應與繳費中心移出獨立 (v0.0.51)
- **選單名稱指令升級**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的指令白名單 `menuCommands` 與 `handleTextCommand` 路由。新增對 `個人主頁 My Dashboard` (舊為「我的狀態」)、`裝備租借 Equipment Loan` (舊為「器材借用」)、`繳費中心 Payment Center` 的支援，同時保留舊指令的向下相容性。
- **繳費中心獨立化**：
  - 新增 `sendPaymentCenterMenu(replyToken)` 方法，當使用者點擊「繳費中心」時直接發送獨立的帳務卡片（包含「繳費系統」與「繳費紀錄」）。
  - 將「繳費中心」從「更多服務」中移出，並將 `sendMoreOptionsMenu(replyToken)` 簡化為直接發送「幫助中心 Help Center」（包含「幹部是誰」與「意見與回饋」）單一 bubble 卡片。

### 50. 獨立身分狀態欄位與必填設定 (v0.0.50)
- **解耦身分狀態與系所欄位**：
  - **欄位解耦**：將「身分狀態」下拉選單與「在校系所 / 校外單位」欄位解耦。在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中新增獨立的 `identityStatus` 欄位，變數不再共用 `department`，防止選擇身分時自動帶入或覆蓋系所資料。
  - **必填設定**：將「身分狀態」下拉選單設為必填（`required`），新增預設的提示選項（`請選擇身分狀態`），並將其加入步驟 1 的 `isStepValid` 驗證，防止用戶漏填。
  - **後端 API 升級**：在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `processSaveProfile` 與 `getMemberProfileAPI` 中，新增對「身分狀態」這項獨立欄位的資料庫讀寫支援。

### 49. 清理註冊表單中未使用的 lineProfile 變數 (v0.0.49)
- **TypeScript 編譯錯誤修正**：
  - 移除了因刪除「LINE 歡迎資訊卡」後，在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中殘留且不再被讀取的 `lineProfile` 狀態變數與其對應的 `setLineProfile` 設定方法，徹底修復 `error TS6133: 'lineProfile' is declared but its value is never read` 的編譯失敗問題。

### 48. 新增聯絡地址與緊急聯絡人地址欄位與標籤優化 (v0.0.48)
- **新增選填表單欄位**：
  - **聯絡地址**：於步驟 2 (基本選填資料) 後方新增了選填的 `聯絡地址 (Correspondence Address)` 欄位，變數對應 `studentAddr` 並串接後端儲存。
  - **緊急聯絡人地址**：於步驟 3 (緊急聯絡人資訊) 後方新增了選填的 `緊急聯絡人地址 (Emergency Address)` 欄位，變數對應 `emerAddr` 並串接後端儲存。
- **體能證明標籤雙語優化**：
  - 將步驟 4 (登山經驗與體能證明) 的欄位名稱更新為 `體能證明 (Proof of Physical Fitness) - 連結或描述` 與 `上傳體能證明截圖 (Upload Proof of Physical Fitness)`，並加註其為選填項目。

### 47. 移除註冊表單頂部 LINE 歡迎資訊卡 (v0.0.47)
- **版面優化調整**：
  - 應使用者要求，將 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 表單頂部的「LINE 歡迎資訊卡 (暱稱與頭像)」區塊移除，使步驟進度條能直接呈現在頁面最頂部，版面更加簡潔並提升表單欄位的可見度。

### 46. 新增註冊表單載入中 (Loading) 狀態阻擋 (v0.0.46)
- **載入狀態優化**：
  - **問題修正**：修復了 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中已填寫個人資料正在非同步獲取時，因為缺少 `loading` 畫面阻擋，導致表單欄位先呈現空白預設值，容易使使用者產生困惑或發生誤填的狀況。
  - **實作載入畫面**：將原先未在渲染中被使用的 `_loading` 狀態啟用並重新命名為 `loading`。在 JSX 渲染前，加入 `if (loading)` 的守衛分流，預先呈現旋轉的 Loading 動態提示與「載入個人資料中，請稍候...」字樣，直至 API 資料取得完畢後才完整展示表單。

### 45. 整合取消活動報名與裝備預約至 LIFF Dashboard (v0.0.45)
- **取消預約功能 LIFF 整合**：
  - **後端 API 實作**：在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `doPost` 路由中新增 `liff_cancel_event` 與 `liff_cancel_loan` 處理引擎。並在 `getMyStatusAPI` 中，額外回傳報名資料的「專屬碼 (`code`)」供前端對接。
  - **裝備預約取消**：於 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 的裝備租借卡片中，針對「待領取」狀態的預約新增「取消預約」按鈕。點選確認後以 POST 發送請求，由後端將狀態設為「已取消」並透過鎖定機制自動回補對應的庫存數量。
  - **活動報名取消 (含正取原因防呆)**：於活動卡片中新增「取消報名」按鈕。若使用者為「備取/審核中」，點擊確認後直接取消；若為「正取」，系統會自動彈出填寫原因的 Modal，使用者必須輸入取消原因後才能送出，送出後後端會將取消原因附加於 `Signups` 表的「備註」中，並即時以 LINE 幹部群組通知幹部以便進行遞補手續。

### 44. 將隱私權同意書改為必填項目 (v0.0.44)
- **欄位規則調整**：
  - 將步驟 4 中的「隱私權同意書」核取方塊改為**必填**，使用者必須勾選同意後，才能啟用「確認送出」按鈕以完成表單。
  - 修正了 `isStepValid` 的 `case 4` 判定逻辑，引入 `privacyAgreed` 狀態值，並將其加入對應的 `useMemo` 相依性陣列，使狀態變更時按鈕的 disabled 狀態能即時更新。
  - 在核取方塊文字旁新增了紅色必填星號 `*`，提供直覺的視覺提示。

### 43. 修復註冊表單第三步「下一步」直接送出的問題 (v0.0.43)
- **問題分析與修正**：
  - **問題根源**：在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中，底部的「下一步」按鈕（`type="button"`）與「確認送出」按鈕（`type="submit"`）原先是透過同一個 DOM 位置的 ternary 條件運算子進行渲染。當使用者在第 3 步點擊「下一步」時，會觸發 `setStep(3 + 1)`，使 `step` 即刻變為 4 並引發重新渲染。但因 React 在相同位置重用了該 button 元素並僅將其 type 更改為 `"submit"`，導致瀏覽器在此時將仍未結束的點擊事件當作 submit 按鈕觸發，進而直接送出表單。
  - **解決方式**：將按鈕重構為兩個獨立的條件渲染區塊，並分別賦予唯一的 `key` 屬性（`btn-next` 與 `btn-submit`），強迫 React 在步驟變更時完整卸載舊按鈕並掛載新按鈕，避免 DOM 元素被重用，進而徹底根除此事件冒泡與提交錯誤的問題。

### 42. 修復 LIFF 跳轉非對應頁面問題 (v0.0.42)
- **多頁面 LIFF 跳轉相容性修正**：
  - **問題根源**：因為 LINE Developers 主機後台設定中，`2009217429-jvj3ydDT` (個人主頁) 的 Endpoint URL 設為 `https://.../dashboard`，而 `2009217429-u7OCkmQO` (繳費系統) 設為 `https://.../payment`。當透過 LINE 客戶端開啟 `liff.openWindow()` 連往子路徑（如 `/achievements` 或 `/history`）時，LINE LIFF 會將其拼裝轉換為 `/dashboard/achievements` 與 `/payment/history`，導致 React 路由找不到實體匹配而觸發 `*` 萬用導向至預設的 `/borrow` (裝備租借)。
  - **雙重安全防護機制**：
    1. **加入路由別名**：在 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中除了原有的 `/achievements` 與 `/history` 之外，額外註冊了 `/dashboard/achievements` 及 `/payment/history` 路由別名，確保 LINE 自動拼裝的路徑能精準渲染對應頁面。
    2. **改採 liff.state 進行跳轉**：將頭貼下拉選單中的「🏆 出隊足跡」與「📜 歷史紀錄」點擊導覽連結，修正為以 `liff.state` 參數傳遞路由（如 `?liff.state=%2Fachievements` 及 `?liff.state=%2Fhistory`），此方式符合 LINE 官方的跨 LIFF 跳轉與重定向路徑標準。

### 41. 已參與活動與心得系統 (Past Events & Reflections) 實作 (v0.0.41)
- **歷史活動相片牆與寫心得功能**：
  - 新增了 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx) 頁面，顯示使用者的出隊次數、心得篇數等足跡統計。
  - 系統自動過濾並顯示該社員所有「已結束且正取」的歷史活動，並為其提供高亮的「✏️ 寫出隊心得」與「📖 查看我的心得」操作。
  - 實作了心得填寫彈出視窗（Modal），支援「路線難易度評分（1-5星）」、「風景推薦度評分（1-5星）」、心得內容文字框及登頂合照網址輸入。
- **GAS 後端 API 與 Reflections 資料庫**：
  - 在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 中新增 `action=get_past_activities` 及 `action=submit_reflection` API。
  - 自動偵測並在 Google Sheets 中建立 `Reflections` 心得回饋工作表，保存社員的心得與評分資料，並在收到新心得時，自動推送 LINE 幹部群組通知。
- **全域路由與選單**：
  - 於 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中註冊 `/achievements` 路由，並於全域 Header 的頭貼下拉選單中新增「🏆 出隊足跡」連結。

### 40. 移除未使用的 liff 宣告 (v0.0.40)
- **修復 TypeScript 編譯錯誤**：移除了 [History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx) 中未使用的 `liff` 導入，修復了因 `noUnusedLocals` 與 `verbatimModuleSyntax` 嚴格 TypeScript 設定導致的編譯失敗。

### 39. 繳費紀錄 (Payment History) 頁面與後端 API 實作 (v0.0.39)
- **全新對帳明細時間軸頁面**：
  - 新增了 [History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx) 頁面，提供美觀的時間軸交易明細卡片。
  - **累計貢獻 Dashboard**：頁面頂部卡片顯示累計已確認繳費金額（累計贊助金額），並顯示目前有多少筆對帳申請正處於「待確認」審核狀態。
  - **分類篩選功能**：提供「全部」、「社費」、「活動」、「裝備」水平切換標籤進行快速明細篩選。
  - **細節手風琴折疊**：點擊卡片可向下展開，顯示當時申報所使用的「匯款帳號末 5 碼」與說明提示。
- **GAS 後端 API 支援**：
  - 在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 中新增 `action=get_payment_history` 分流路由。
  - 實作 `getPaymentHistoryAPI` 函式，掃描 `Payments` 對帳表，提取使用者名下所有的交易明細，並且自動依據項目名稱匹配分類（社費、活動、裝備），最後依日期降冪排序回傳。
- **全域路由與導覽註冊**：
  - 於 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 註冊 `/history` 路由並以 `ProfileCheck` 進行權限保護。
  - 將 `/history` 綁定至 `2009217429-u7OCkmQO` LIFF ID，並於全域 Header 的頭貼下拉選單中註冊「📜 歷史紀錄」選項。

### 38. 租借費用折扣判定修復與已繳費無到期日顯示優化 (v0.0.38)
- **裝備租借費用折扣與用途連動**：
  - 在 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 中引入了 `isOfficial` 狀態，並在組件掛載時向 GAS `action=get_my_status` API 獲取使用者社籍身分。
  - **費用折扣判定**：修改租金計算邏輯，當出隊用途選擇「社團出隊」時，租金全免（$0）；當選擇其餘個人使用（個人露營、登山活動等）且使用者具有有效社籍（`isOfficial === true`）時，提供 5 折優惠；非社員個人使用則維持全額收費。該計算將即時呈現在試算公式、商品清單及預訂單明細中。
- **已繳費無到期日顯示優化**：
  - 修改了 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 中的 `getMyStatusAPI` 引擎。當社員在 Members 表中的 `繳費狀態` 為「已繳費」（或同義詞），但 `社籍到期日` 欄位為空或無效時，系統會強制將其 `isOfficial` 設定為 `true`（視為正式社員），且到期日欄位回傳「尚未提供，請聯繫幹部確認」，完美避免了因後台到期日尚未填寫而導致已繳費社員無法存取租借系統或顯示為非社員的體驗瑕疵。

### 37. 繳費頁面宣傳條移除與社費彈性學期方案選擇 (v0.0.37)
- **移除冗餘宣傳條**：移除了 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 頂部的「合併項目，輕鬆對帳」漸層宣傳 Banner，讓對帳申報區版面更加精簡聚焦。
- **新增社費說明與方案選擇**：
  - 於社籍社費項目下新增了詳細的社費計費說明：一學期 $200，直到畢業 $800（大學部）/ $400（研究所）。
  - **學期與到期日動態推算**：系統會以現在日期自動推算當前學期（如：7 月份自動推算為 `114-2` 學期），並提供「當前學期 ($200)」、「下一學期 ($200)」、「直到畢業 - 大學部 ($800)」、「直到畢業 - 研究所 ($400)」共四個方案下拉選單。
  - **即時預估到期日**：下拉選項中會自動計算並顯示各個方案對應的預期社員資格到期日（學期結束日為 01/31 或 07/31，畢業為 06/30）。
  - **動態金額與名稱綁定**：切換下拉選項時會同步更新清單中的應繳金額與項目名稱，確保總金額計算與最終送出的申報 payload 完美連動。
- **防止點擊穿透優化**：將未繳費清單的外層容器從 `<label>` 標籤重構為 `<div>`，改由內層單獨監聽點擊，解決了點擊下拉選單（select）時會意外觸發 checkbox 切換的 HTML 點擊穿透（bubbling）問題。

### 36. 會員卡樣式修正與表單欄位間距優化 (v0.0.36)
- **社員證卡片優化**：
  - 移除了數位社員證卡片右下角冗餘的「野境戶外 NTUST OAC」文字標誌（[Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)）。
  - 將數位社員證左上角的使用者 LINE 暱稱與連線說明文字塊設定為靠左對齊（`textAlign: 'left'`），避免非預期的置中對齊影響美觀。
- **表單輸入間距優化**：
  - 修改了 [App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 中的 `.form-group` 樣式。將其垂直 `gap` 從 `6px` 縮小至 `4px`，並移除 `.form-group label` 原本帶有的 `margin-bottom: 6px`。此調整能顯著拉近表單輸入框標題與輸入框之間的間隙，使表單佈局更加緊湊自然。

### 35. 實現點擊選單外部空白處自動收合下拉選單 (v0.0.35)
- **新增 Document 點擊接聽器**：由於 `.app-header` 使用了 `backdrop-filter: blur`，這在 CSS 規範中會建立獨立的 Stacking Context (層疊上下文)，導致子元素中 `position: fixed` 的全螢幕背景遮罩無法正確延伸覆蓋至 header 之外的頁面區域。
- **點擊外部自動收合**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中移除了原本的 fixed 背景遮罩，改為透過 `useEffect` 於 `document` 註冊全域點擊事件接聽器。點擊時自動檢查滑鼠目標是否在 `.avatar-dropdown-container` 外部，若為外部則將選單狀態設為關閉，完美解決點擊網頁其他空白處無法收合選單的體驗瑕疵。

### 34. 統一全頁面 Header 樣式與移除裝備租借購物車按鈕 (v0.0.34)
- **統一 Header 佈局尺寸**：重新設計 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中的 `GlobalHeader`，使其作為全域唯一的粘性定位頂部導覽列（`.app-header`）。左側會根據當前路由（`/borrow`、`/payment`、`/register`、`/dashboard`）動態呈現對應的標題、副標題與圖示；右側則為帶有下拉導航選單的頭貼按鈕。
- **清理各分頁本地 Header**：
  - 移除了 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 內部的局部 Header。
  - 移除了 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 內部的局部 Header。
- **移除租借右上角購物車按鈕**：伴隨局部 Header 的移除，同步清除了裝備租借頁面右上角冗餘的購物車圖示按鈕，維持界面視覺的一致與極簡。使用者仍可點擊底部浮動條展開購物車。

### 33. 全域頭貼導覽選單與個人主頁連結更新 (v0.0.33)
- **更新個人主頁連結**：將個人主頁的 LINE LIFF 連結更新為 `https://liff.line.me/2009217429-jvj3ydDT`。
- **全頁面右上角頭貼下拉選單**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 實作 `GlobalHeader` 組件，於所有頁面右上角渲染 LINE 頭貼。點擊後展開下拉選單，包含「個人主頁」、「資料填寫」、「裝備租借」與「繳費系統」四個一鍵跳轉選項。
- **LIFF 環境動態跳轉**：選單跳轉支援在 LINE 內呼叫 `liff.openWindow` 喚起獨立的 LIFF 網頁，在一般瀏覽器/開發環境則使用 React Router `navigate` 跳轉。
- **GAS 狀態查詢指令附加連結**：在 [src/GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `handleStatusQuery`（我的狀態指令）回覆訊息末尾附加個人主頁儀表板連結。

### 32. 數位社員證與個人總覽 My Dashboard 實作 (v0.0.32)
- **GAS 後端新增總覽 API**：在 [src/GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 實作 `action=get_my_status` 的處理引擎 `getMyStatusAPI`，打包從 `Members`, `Signups`, `Events` 與 `Loan_Records` 四張大表中所篩選出來的個人資料、活動報名記錄與裝備租借明細。
- **全新 Dashboard 頁面**：新增 [src/pages/Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 頁面。
  - **數位社員證**：根據社員到期日狀態動態渲染漸層背景（正式社員為綠色漸層，未繳費或過期為灰色背景）。顯示姓名、系所、學號與到期日，不包含 QR Code 按鈕。
  - **活動報名追蹤**：條列所有報名活動與審核、繳費狀態。若狀態為「正取且未繳費」，提供「前往申報繳費」按鈕，點擊跳轉至 `/payment`。
  - **裝備租借清單**：列出所有預約租借裝備之編號、名稱與日期，若預估歸還日過期且狀態不為已歸還，會顯示紅色字體警告。
- **路由註冊與整合**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 註冊 `/dashboard` 路由。

### 31. 進入租借與繳費系統前檢查個人資料完整性 (v0.0.31)
- **個人資料完整性檢查**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中新增 `ProfileCheck` 包裹組件，進入「裝備租借 (`/borrow`)」與「繳費系統 (`/payment`)」路由前會先透過 GAS API 查詢個人資料。
- **資料完整性規則**：檢查 6 個必填欄位（姓名、系所、學號、手機、Email、LINE ID）是否皆有非空值。
- **阻擋與跳轉**：若資料不完整或非社員，會彈出「個人資料不完整」的對話視窗阻擋操作，並提供「前往填寫資料」按鈕，點擊後跳轉至註冊的 LINE LIFF 網頁 `https://liff.line.me/2009217429-AhPRqAHg`。
- **開發者測試與容錯**：若 `userId` 為 `TEST_USER_ID`（本地測試）或 API 請求發生錯誤，預設直接放行不進行阻擋，以避免影響本地端開發與出隊緊急使用。
- **類型導入修正 (TS1484)**：修復在啟用 `verbatimModuleSyntax` 時的型別編譯錯誤，將 `App.tsx` 中 `ReactNode` 的引入方式改為 `type ReactNode`。

### 30. 必填項目加紅星與欄位重新編排集中至第一頁 (v0.0.30)
- **必填欄位紅星標記**：在 [src/App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 中新增 `.required::after` 偽元素樣式，在所有必填欄位的標籤後顯示紅色星號標記 ` *`。
- **欄位重新編排**：修改 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)，將原本分散在步驟 2 的 5 個必填欄位（系所、學號、手機、Email、LINE ID）與步驟 1 的姓名一起集中到第一頁（步驟 1）；原本在步驟 1 的選填欄位（性別、生日、身分證字號）則移往步驟 2。
- **步驟驗證與標籤名稱**：
  - 更新進度條標籤為：步驟 1「必填」、步驟 2「基本」、步驟 3「安全」、步驟 4「經驗」。
  - 調整 `isStepValid` 驗證邏輯，步驟 1 驗證所有必填欄位為非空值（Email 暫不驗證格式），步驟 2、3、4 則無任何必填限制，直接返回 `true`。

### 29. 修復第二次加載個人資料白屏、防止舊資料覆寫、移除電話防呆 (v0.0.29)
- **修復載入白屏**：在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中，先前直接使用來自 GAS 查詢到的原始 profile 資料。如果試算表中的生日欄位為非標準字串或為數字時，在 React 中調用 `new Date(p.birthday).toISOString()` 會拋出 RangeError 並引發 React 崩潰白屏。現已改為安全的 `birthday` 格式轉換，若無效則安全回傳空字串，防止白屏。
- **優化資料載入**：在 [src/GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `getMemberProfileAPI` 中，若是 Date 物件，會主動以 `yyyy-MM-dd` 格式序列化後回傳，優化前後端資料讀取。
- **防止覆寫未映射欄位**：修復了 `processSaveProfile` 寫入邏輯的重大缺陷。先前舊社員在更新資料時會重新開闢空陣列，導致「社籍到期日」等未映射欄位被清空。現已改為更新時預先複製原有整列的全部舊資料值，再複寫填寫的資料欄位。
- **移除電話防呆限制**：移除 `isStepValid` 中手機號碼與緊急聯絡人電話的 Regular Expression 格式限制，手機號碼改為僅進行「非空」檢查，緊急聯絡電話則完全無須任何字元或非空限制。

### 28. 修復編譯時的未宣告使用 (TS6133) 錯誤 (v0.0.28)
- **清理冗餘宣告**：由於先前移除了底部導覽 Tab Bar，在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中遺留了未使用的 `NavLink`、`useLocation` 引用以及 `location` 宣告。現已將其完全清除，修復 TypeScript 在 Production 建置時的阻擋錯誤並成功通過建置。

### 27. 調整資料註冊欄位之必填限制 (v0.0.27)
- **必填欄位調整**：根據新需求，簡化註冊防呆門檻。除了 **姓名、Email、真實 LINE ID、電話、在校系所、學號** 共 6 個核心欄位維持必填之外，其餘所有欄位（性別、生日、身分證字號、緊急聯絡人姓名、聯絡人關係、聯絡人電話、隱私同意書）皆已改為「非必填 (Optional)」。
- **防呆與程式修改**：在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中移除了上述非必填欄位的 `required` HTML 屬性與紅色星號標記，並調整 `isStepValid` 驗證邏輯，僅在有填寫緊急聯絡人電話時才進行格式正規表達式檢查，確保使用者可以快速送出表單。

### 26. 攔截中間步驟按鍵 Enter 導致的提前表單提交 (v0.0.26)
- **防提前提交**：在分步表單（Step 1~3）中，若使用者在文字輸入框焦點狀態下按下手機鍵盤的「Enter」或「Go / 開始」鍵，瀏覽器會觸發 `<form>` 的預設提交行為。由於此時 `step === 3` 且當前步驟必填欄位已填寫，`isStepValid` 會判定為 `true` 並將不完整的表單直接上傳至後端。
- **修復方案**：修改 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中的 `handleSubmit`。若目前 `step < 4`，則攔截提交行為並自動前進到下一步 (`step + 1`)，只有當處於第 4 步時才允許真正送出表單，解決了中間步驟提前觸發上傳儲存的 Bug。

### 25. 優化表單下拉選單（select）與導覽按鈕（button）大小與樣式 (v0.0.25)
- **表單選單放大**：在 [src/App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 中將 `.form-group select` 與 `.form-group textarea` 納入全域表單控制樣式，將內距提升至 `12px 14px`，字型大小提升至 `15px`，以匹配文字輸入框的外觀與大小，並加大點擊熱區。
- **按鈕樣式套用**：為前端分步精靈按鈕（下一步、上一步、確認送出）補上缺漏的 `.btn`、`.btn-primary`、`.btn-secondary` 樣式，設定大按鈕內距 `12px 20px`、字型大小 `16px` 與圓角，符合手機端好按、美觀的觸控體驗。

### 24. 移除底部的導覽列 Tab Bar (v0.0.24)
- **底欄移除**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中已將全域底部導覽列 (`bottom-nav-bar`) 的 HTML 與 CSS 切換邏輯完全移除。現在所有主要功能頁面（如裝備租借、對帳系統、資料填寫）皆透過各自獨立的 LINE LIFF 應用程式與連結獨立載入，無須保留底欄，提升視覺極簡感並符合 App 單一頁面設計規範。

### 23. 修復資料註冊提交時產生的 CORS 預檢 (OPTIONS) 錯誤 (v0.0.23)
- **問題原因**：前端 `Register.tsx` 先前使用 `'Content-Type': 'application/json'` 發送 POST 請求。此配置會觸發瀏覽器發送 CORS 預檢 `OPTIONS` 請求，但 Google Apps Script (GAS) Web App 無法處理 `OPTIONS`，導致 preflight 失敗、引發連線阻擋，進而在行動裝置上彈出「網路連線失敗，請檢查您的網路狀態！」警告。
- **修復方案**：將 `Register.tsx` 的提交 headers 調整為 `'Content-Type': 'text/plain'`，改用「簡單請求 (Simple Request)」避開 `OPTIONS` 預檢，以順暢通過 GAS CORS 存取限制。

### 22. 支援獨立多 LIFF 應用程式動態初始化與註冊連結更新 (v0.0.22)
- **動態 LIFF ID 初始化**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中，為避免不同 LIFF 網址（例如：借用 `2009217429-zXvGeSrI`、對帳 `2009217429-u7OCkmQO`、註冊 `2009217429-AhPRqAHg`）在同一份程式碼初始化時發生 LIFF ID 衝突或不對稱錯誤，現在 `liff.init()` 會動態根據目前的瀏覽器 path 或 `liff.state` 內容自動選擇正確的 `liffId` 進行初始化。
- **註冊網址更新**：將 [src/GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `sendRegisterForm` 改為指向全新的獨立註冊 LIFF 縮網址 `https://liff.line.me/2009217429-AhPRqAHg`，確保機器人「填寫資料」訊息導向正確的獨立應用程式。

### 21. 將機器人「填寫資料」回覆連結切換為新 LIFF 網址 (v0.0.21)
- **回覆切換**：修改 [src/GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `sendRegisterForm` 函式。原先社員在圖文選單或輸入關鍵字觸發「填寫資料」時會收到 Google 表單連結，現已完全切換為新的 LIFF 頁面縮網址 `https://liff.line.me/2009217429-zXvGeSrI/register`，實現入口全面 LIFF 化。

### 20. 修復 LIFF SDK 清除 URL 參數後繳費連結仍跳至裝備租借的問題 (v0.0.20)
- **問題原因**：`AppContent` 元件中的 `redirectPath` 每次 render 都會重新呼叫 `getInitialRedirectPath()` 計算。LINE App 開啟 `https://liff.line.me/.../payment` 時，LIFF SDK 會將路徑包成 `?liff.state=%2Fpayment` 附在 URL 後，供第一次渲染正確解析。然而 `liff.init()` 完成後，LIFF SDK 會自動清除 URL 中的 `liff.state` 參數；此時 `liffInit.loading` 由 `true` 變為 `false` 觸發重新渲染，`getInitialRedirectPath()` 再次執行時 URL 已被清空，找不到 `liff.state` 便 fallback 回 `'/borrow'`，導致繳費連結永遠跳至裝備租借頁面。
- **修復方案**：
  - 將 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中的 `const redirectPath = getInitialRedirectPath()` 改為 `const [redirectPath] = useState(() => getInitialRedirectPath())`。
  - 利用 `useState` 初始化函式（lazy initializer）的特性，確保 `redirectPath` 僅在元件**首次掛載時**計算一次（此時 `liff.state` 仍存在於 URL），後續任何重新渲染均不會再次呼叫，徹底防止 LIFF SDK 清除 URL 後的 fallback 問題。

### 19. 配合 Members 試算表欄位調整與移除學生證照片上傳 (v0.0.19)
- **移除學生證上傳**：根據社團實際試算表結構與要求，前端 `Register.tsx` 與 GAS 後端 `GAS.js` 均已移除「學生證照片上傳」功能與欄位寫入邏輯，簡化表單。
- **試算表欄位適配分析**：
  - 分析了社團 `Members` 試算表之 19 個中英雙語雙行欄位（如 `"姓名\nName"`、`"緊急聯絡人姓名(不能為同行者)..."` 等）。
  - 確認 `GAS.js` 的 `_fi()` 模糊匹配機制（利用 `includes` 進行子字串比對，如用 `"姓名"` 比對 `"姓名\nName"`、用 `"證明"` 比對 `"體能測驗證明..."`）可百分之百、無縫地正確定位所有欄位之列索引，無須重命名試算表欄位，架構極度強健。
  - 對於唯一不在試算表預設欄位中的 LINE `系統識別碼`，後端會利用 `getOrCreateColIdx` 機制在首次寫入時自動於試算表最右側建立，不破壞既有欄位排序。

### 18. 實作「填寫資料（註冊/更新）」多步驟 LIFF 精靈與 Google Drive 上傳 (v0.0.18)
- **資料註冊與更新 LIFF 頁面 (`Register.tsx`)**：
  - 設計 Step 1 ~ Step 4 的步驟進度條表單，包含：基本資料、學籍聯絡、留守安全與登山經驗/上傳。
  - 基本資料收集真實姓名、性別、生日、身分證字號；學籍聯絡收集在校系所、學號（在校生必填防呆）、手機、Email 與 LINE ID；留守安全收集緊急聯絡人姓名/關係/電話、特殊病史/過敏（選填）；最後上傳學生證與體能證明。
  - 防呆驗證：各步驟檢核必填欄位與格式（如 Email、手機與緊急聯絡人電話驗證），不合格則不允許進入下一步或提交。
  - 上傳機制：採用 `FileReader` 將選取之圖片/檔案轉為 base64，非同步發送至 GAS，儲存至 Google Drive 指定資料夾並產生公開連結。支援自訂檔名格式（如 `學號_姓名_學生證`）以利辨識。
  - 在送出前設計隱私同意書，點擊送出後顯示儲存遮罩，完成後透過 LIFF API 自動關閉視窗，並由機器人主動推送 LINE 註冊成功通知信。
- **GAS 後端 API 升級 (`GAS.js`)**：
  - 新增 `get_profile` 行動：搜尋 `Members` 工作表快速取得已存在社員資料，回傳給前端預帶欄位（實現舊生自動帶入、新生空白表單）。
  - 新增 `save_profile` 行動：處理前端傳入之表單欄位與 base64 檔案，透過 `DriveApp` 自動建立/覆寫檔案並設定分享權限。
  - 實作 `getOrCreateColIdx` 機制：若 `Members` 表運作中缺失特定新欄位（如「學生證照片」、「個人特殊病史或過敏」等），系統會自動於試算表最右側追加新行與標題，確保資料寫入不報錯。
- **全域路由與導覽列適配 (`App.tsx` & `App.css`)**：
  - 註冊 `/register` 路由，並在頂部解析 `liff.state` 時加入 `/register` 支援。
  - 當使用者處於 `/register` 路由時，自動隱藏底部固定導覽列（`bottom-nav-bar`），提供更純淨、無干擾的表單填寫體驗。

### 17. 實作「骨架優先」非阻塞版面渲染 & 解決登入跳轉衝突 (v0.0.17)
- **非阻塞頁面渲染 (Non-blocking Shell)**：
  - 移除了先前在 `App.tsx` 最上層的「驗證登入中...」全螢幕黑屏載入狀態。現在 app 一開啟，React Router、底部導覽列與子頁面版面（例如：繳費頁面的匯款帳戶卡與宣傳 Banner）都會**瞬間立即呈現**。
  - 對帳帳單之非同步拉取，改在項目清單區塊內以局部載入動畫（Spinner）呈現，使用者體驗大幅提升。
- **保護跳轉參數以防登入無限循環**：
  - **問題原因**：先前若在 LIFF 初始化完成前，React Router 提前載入並執行了 `/` 或 `/index.html` 的路徑重定向，會導致 LINE 登入回傳之 `?code=...` 授權參數被 React Router 的 `<Navigate>` 直接從網址列抹除。進而造成 `liff.init()` 始終判定為未登入狀態，引發重複調用 `liff.login()` 造成畫面「無限閃爍登入中」的問題。
  - **修復方案**：將 `/` 與 `/index.html` 的跳轉邏輯設定為「只有當 `liffInit.loading === false` 時才執行重導向」，在登入階段完全不變更網址列以安全保留 OAuth 憑證參數。

### 16. 實作「五步對帳工作流」繳費系統 (v0.0.16)
- **前端對帳申報 UI (`Payment.tsx`)**：
  - 設計社團指定匯款帳戶資訊卡，方便社員快速複製。
  - 動態拉取社員名下所有「未繳費」項目（包含社籍費、活動報名費、裝備租借費），提供 Checkbox 多選合併申報。
  - 新增「帳號末 5 碼」填寫防呆機制，只有當「至少勾選一項」且「輸入剛好 5 位數」時才可送出。
  - 送出成功後，利用 `liff.sendMessages()` 在聊天室中自動發送明細憑證，隨後自動關閉網頁。
- **GAS 後端處理引擎 (`gas.js`)**：
  - 新增 `submit_payment` 接收端，變更申報項目狀態為 `待確認 Checking`，防止重複送出。
  - 將每一筆申請寫入 `Payments` 試算表作為交易紀錄。
  - 動態向幹部群組推播包含一鍵審核的 Flex Message 訊息，供幹部查帳核對。
  - 串接 `admin_confirm` postback 銷帳機制，確認後自動將試算表狀態改為 `已繳費 Paid`，並向社員發送成功繳費之 LINE 推播通知。

### 15. 解析 `liff.state` 參數解決點擊繳費連結（/payment）仍進入租用頁面問題 (v0.0.15)
- **問題原因**：當使用者在 LINE 點擊 `https://liff.line.me/2009217429-zXvGeSrI/payment` 時，LINE LIFF SDK 會將目標路徑 `/payment` 包裝在 `liff.state` 查詢參數中，並將瀏覽器重定向至設定的 Endpoint URL（如 `https://your-domain.vercel.app/?liff.state=%2Fpayment`）。由於網址列的主路徑是根目錄 `/`，React Router 在網頁初始化時，會依照匹配規則 `<Route path="/" element={<Navigate to="/borrow" replace />} />` 直接把使用者強行重導向至 `/borrow`，導致 `liff.state` 被忽視，永遠只能進入器材借用。
- **修復方案**：
  - 在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中新增 `getInitialRedirectPath` 輔助函式。
  - 在 App 啟動時解析 URL 中的 `window.location.search` 與 `window.location.hash` 中的 `liff.state` 參數。若路徑指向 `/payment` 則回傳 `/payment`（否則預設為 `/borrow`）。
  - 將路由表的首頁重定向目標修改為該變數：`<Route path="/" element={<Navigate to={redirectPath} replace />} />`，完美解決了透過 LINE 專屬路徑連結開啟時的子頁面路由跳轉丟失問題。

### 14. 於預算總租金與清單項目呈現詳細試算公式 & 修復 TS6133 未使用變數錯誤 (v0.0.14)
- **試算公式明細**：
  - 在 [src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 購物車清單中，為每項選取裝備增加了動態公式文字，例如：`公式: ($100 + $20 × 3天) × 2件 = $320`。
  - 在底部費用總計區塊，若選取多個項目，會顯示整筆預約的試算拆解算式，如 `試算: (($100 + $20 × 3天) × 2件) + (($50 + $10 × 3天) × 1件) = $400`，使租金結構及計算邏輯百分之百透明。
- **修復編譯錯誤**：
  - 修正了在 `formulaString` 中宣告了 `itemPrice` 卻未使用所引發的 TypeScript 編譯錯誤（`TS6133: 'itemPrice' is declared but its value is never read`），確保專案能在嚴格模式下順暢通過本機及雲端部署建置。

### 13. 實作「超過兩天按日加價」動態計費系統（串接 Google Sheet `+1天` 欄位） (v0.0.12)
- **需求實作**：
  - **金額來源說明**：目前的金額會**完全隨著您的 Google Sheets 變動**。除了原先抓取的「2天」基本租金外，現在也已成功讀取 Google Sheet 中的「`+1天`」欄位（每日加價）。
  - **GAS 後端 API 升級**：
    - 更新 `getEquipmentsListAPI` 介面，讀取並回傳 `priceExtra` (`+1天` 欄位的值) 至前端。
    - 更新 `processMultiLoan` 訂單處理程序，不再是單純以 2 天計價。在後端寫入資料時，會自動比對 `pickupDate`（領取日期）與 `returnDate`（歸還日期）計算出實際「租借天數」，前 2 天收基本費，第 3 天起按日加收「`+1天`」的加價，計算出真正的應繳費用，並寫入 Google Sheets 中的 `應繳費用` 欄位，同步推播給幹部。
  - **React 前端計價優化**：
    - 在 [src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 裝備卡片 UI 中，除了顯示「2天基本租金」外，亦清楚標明「續租（加1天）」的每日加價金額。
    - 前端購物車與預訂單明細抽屜已整合天數計算，使用者在選取日期後，會顯示「租用天數：X 天」，且購物車單項金額與總額都會即時更新為加天數後的最終價格，做到「前後端對帳金額一致」。

### 12. 修正購物車浮動條位置重疊與行動端日期選取框位移跑版 (v0.0.11)
- **購物車浮動條阻擋問題**：
  - **問題原因**：原先的購物車底欄 `.floating-cart-bar` 設定的定位是 `bottom: 20px;`。引入底部導覽列 `.bottom-nav-bar` 後，兩者重疊在一起，導致購物車資訊被導覽列遮蔽。
  - **修復方案**：將浮動購物條的 `bottom` 改為動態計算的 `bottom: calc(76px + env(safe-area-inset-bottom, 8px));`，使其精準、完美地懸浮在導覽列上方，並保留合適的間距與高度。
- **日期欄位跑版位移**：
  - **問題原因**：由於全域環境下的 `#root` 設定了 `text-align: center;`，且 iOS 等部分行動端瀏覽器在渲染 `input[type="date"]` 時預設會視為 `inline-block`。這使得兩格日期輸入框在各自的網格單元內置中，並因為預設樣式的寬度解析異常而往中央擠壓、甚至邊界重疊；且因為缺乏 `box-sizing` 設定，部分外邊框在行動裝置上被吃掉。
  - **修復方案**：
    - 強制將日期 input 元件的樣式改為 `display: block;`，以徹底解除 `text-align: center;` 的干擾。
    - 加上 `box-sizing: border-box;` 與 `text-align: left;`，並將寬度強制鎖定於 `width: 100%;` 以符合其網格配置。
    - 加入 `-webkit-appearance: none; appearance: none;` 移除 iOS / WebKit 核心瀏覽器的原生日期邊框重設，讓日期選取框與用途下拉選單的左右邊界對齊、大小整齊，維持介面精美。

### 11. 修復點擊繳費連結（/payment）經登入跳轉後卻被誤導至器材借用（/borrow）頁面的問題 (v0.0.10)
- **問題原因**：先前在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 進行登入判斷時，調用 `liff.login()` 並未帶入引數。依據 LINE LIFF 的預設行為，未指定 `redirectUri` 的 `liff.login()` 登入完成後會強制導回 LINE Console 中設定的 Default Endpoint URL（即根目錄 `/`）。進而觸發路由重導向規則將使用者送回 `/borrow` 頁面。
- **修復方案**：
  - 將 `liff.login()` 呼叫修改為傳入當前網址：`liff.login({ redirectUri: window.location.href });`。
  - 這樣一來，不論使用者是從 LINE 的「器材借用」連結還是「繳費系統」連結點入，當在未登入狀態下跳轉至 LINE 登入後，均能精準導回原本預期的對應子路徑（如 `/payment`），避免登入完成後一律跳回 `/borrow` 的問題。

### 10. 解決 LIFF 跳轉回首頁可能出現的空白畫面跑版問題 (v0.0.9)
- **問題原因**：行動裝置 LINE LIFF 首次開啟 Endpoint URL 時，可能為 `/`、`/index.html` 或攜帶了自定義查詢字串。在先前設定的 React Router 中，未對 `/index.html` 以及其他未知路徑（如認證重導向狀態字串）進行相應的路由匹配，造成 React 無法渲染任何頁面，導致使用者在登入後看到「一片白色的空白畫面」，需要重新手動點選底部導覽列才能載入內容。
- **修復方案**：
  - 在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中新增針對 `/index.html` 的重定向路由匹配。
  - 新增萬用路由守衛 `<Route path="*" element={<Navigate to="/borrow" replace />} />`，確保不論何種網址（即使網址後面帶有 LINE 自有的暫態參數），在登入成功後都能自動且無縫地重定向回主要的 `/borrow` 租借頁面，防範任何白畫面情形。

### 9. 解決行動端與 LINE 內部點開連結無限重定向登入閃爍問題 (v0.0.8)
- **問題原因**：原先的 `liff.init()` 邏輯寫在頁面元件 `Borrow.tsx` 中，該元件被包裝在 `/borrow` 路由之下。當使用者第一次進入根路徑 `/` 時，React Router 會進行路由重導向（Navigate to `/borrow`），導致 `Borrow` 元件掛載並觸發 `liff.init()`。而 `liff.init()` 解析驗證狀態及跳轉登入時會使網頁重新載入與導向，React Router 與 LIFF 初始化流程在不同的組件生命週期中發生衝突，引發了無限跳轉登入的閃爍循環。
- **修復方案**：
  - 將 `liff.init()` 移至最頂層的 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 元件中，確保**全局只初始化一次**，且在初始化完成（與登入跳轉判定）之前，先顯示「驗證登入中...」的載入畫面，阻止 React Router 提早執行路由分發。
  - 將成功驗證的 `userId` 作為 Prop 傳遞給子頁面 [src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 與 [src/pages/Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)，移除了子頁面重複初始化的邏輯，徹底解決無限重定向與登入閃爍問題。

### 8. 引進 React Router 與頁面重構，新增繳費系統骨架 (v0.0.7)
- **重構與模組化**：
  - 安裝並整合 `react-router-dom` 路由套件。
  - 將裝備租借頁面抽離至獨立的頁面元件 [src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。
  - 新增繳費系統頁面 [src/pages/Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 作為後續對帳功能的骨架。
  - 重構 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 為純路由分發器，設定 `/borrow` 與 `/payment` 路由規則，並配置預設導向。
- **底部質感導覽列**：
  - 於 [src/App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 設計符合手機 App 質感的 `.bottom-nav-bar` 底部固定導覽 Tab 列，以利使用者流暢切換「器材借用」與「繳費對帳」頁面。
- **Vercel 部署路由修復**：
  - 於專案根目錄新增 [vercel.json](file:///Users/brianhung/Documents/OfficialLINEAccount/vercel.json)，設定將所有路由重寫至 `index.html` 處理，避免 Vercel 部署後重新整理出現 404 錯誤。

### 7. 調整計價 Banner 背景色回歸質感森林綠 (v0.0.6)
- **調整方案**：將費用試算 Banner 的背景由橘褐色漸層調整回專案原本的高質感森林綠漸層（`#10b981` 到 `#064e3b`），保持整體品牌色系統一與清爽。

### 6. 更新首頁 Banner 為「費用試算說明」計價資訊 (v0.0.5)
- **需求調整**：將首頁頂部海報 Banner 內容改為對應的「裝備租借費用計價方式」，包含社員/非社員在社團活動或個人使用時的折扣與計費基準。
- **調整方案**：
  - 更新 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 頂部 Banner 結構，以清單條列「社員/非社員於社團/個人」的對應租金（如免費、5折、全額）。
  - 下方新增備註區塊說明「2天為基本計價單位，超出按每日加價計算」。
  - 於 [src/App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 設計專屬橘褐色漸層背景 (`#d25d24` 到 `#a04015`)，與字體樣式、分隔線、高亮折扣數字，完美重現使用者提供的設計圖稿。

### 5. 修復頂部 Logo 文字換行跑版問題 (v0.0.4)
- **問題原因**：由於全域 `index.css` 為 `h1` 與 `p` 設定了較大的預設外邊距（Margin），且我們原先沒有對標誌文字容器 `.logo-text` 設定明確的 Flex 排版與對齊，導致次標題 `Gear Rental Store` 跑版並折行渲染至 🏕️ 圖示正下方。
- **修復方案**：為 `.logo-text` 容器新增 `display: flex; flex-direction: column; align-items: flex-start; text-align: left;`，並重設 `h1` 與 `p` 的 Margin 為 `0` 且設定適當的 `line-height`，確保圖示與多行標誌文字左右排列時，能完美貼合對齊且不跑版。

### 4. 解決電腦與作業系統暗黑模式下的日期欄位無法點擊/顯示問題 (v0.0.3)
- **問題原因**：由於全域 `index.css` 設定了 `color-scheme: light dark;`，當使用者的電腦作業系統（如 macOS / Windows）處於「深色/暗黑模式」時，瀏覽器會強制將日期輸入框（`<input type="date">`）的文字與行內圖示渲染成白色。然而，我們設計的淺色電商卡片輸入框背景為純白色，導致了「白底白字/白圖示」的視覺衝突，讓使用者看起來像是「無法輸入/無反應」。
- **修復方案**：在我們的主要租借容器 `.app-container` 以及日期欄位中，明確指定 `color-scheme: light;`，強制瀏覽器在任何作業系統主題下，皆以淺色網購主題正確渲染輸入框文字及日曆圖示。同時，將日期欄位游標設定為 `cursor: pointer` 並確保有足夠的點擊高度。

### 3. 修復日期無法選擇/點擊問題 (v0.0.2)
- **問題原因**：原先的購物車預訂單抽屜將 `onClick` 點擊關閉事件綁定在最外層的 overlay 包裹層，當使用者在行動裝置 (如 iOS / LINE Webview) 點擊日期輸入框彈出原生日期選擇器時，事件冒泡或焦點變動觸發了 overlay 的點擊關閉事件，導致抽屜瞬間被關閉或無法正常點擊輸入。
- **修復方案**：將背景遮罩（Backdrop）與抽屜主體（Drawer）拆分為**兄弟節點**，徹底阻斷點擊穿透與冒泡，確保在任何行動裝置與 LIFF Webview 下皆能流暢地聚焦並輸入日期。

### 1. 解決 `@line/liff` 模組遺失問題
- 手動於 `package.json` 加入最新穩定版 `@line/liff` 依賴並更新版本號。
- 透過 `pnpm install` 安裝完成，修正了 `Cannot find module '@line/liff'` 的編譯錯誤。

### 2. 介面重新設計 (UI/UX Redesign)
- **全新淺色購物風格 (Modern Light E-commerce Theme)**：淘汰原有深色陽春列表，改用乾淨優雅的微影卡片、柔和的背景色彩與極具質感的森林綠、戶外橙配色。
- **動態裝備圖示 (SVG Illustrations)**：為帳篷、睡墊、背包、登山杖與鋼盆等裝備個別繪製精美的 SVG 圖示與對應的主題漸層。
- **購物車抽屜 (Cart Drawer & Floating Bar)**：
  - 增加底部懸浮購物條，一目了然已選數量與估算金額。
  - 點選後展開右側/下方精緻的「預訂單明細」，可在預訂單中直接增減商品數量。
- **預約設定表單**：整合日期選擇器（領取與歸還）與出隊用途下拉式選單，點選結帳按鈕後即可將預約發送至 GAS 後台與 LINE 聊天室。

---

## 🚀 快速開始 (Quick Start)

### 1. 安裝相依套件 (Install Dependencies)
請確保您已安裝 `pnpm`，並在專案根目錄下執行：
```bash
pnpm install
```

### 2. 本地開發偵錯 (Local Development)
啟動 Vite 開發伺服器：
```bash
pnpm run dev
```

### 3. 建置專案 (Build Project)
打包生產環境程式碼：
```bash
pnpm run build
```

---

## ⚙️ 設定 (Configuration)
- **Vite 進入點**：`index.html`
- **主程式路徑**：
  - 邏輯控制與結構：[src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx)
  - 樣式美化：[src/App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css)
- **GAS 後端 API 串接**：已於 `App.tsx` 配置為使用最新的 Google Apps Script Web App URL。
