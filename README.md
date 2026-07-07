# 🏕️ 野境戶外裝備租借系統 (Wilderness Gear Rental Store)

本專案是一個基於 **React + TypeScript + Vite** 開發的 LINE LIFF 網頁應用程式，為社團或個人提供直覺、現代化的露營與登山裝備預約租借平台。

## 📌 版本資訊 (Version Info)
- **當前版本**：`0.0.36` (v0.0.36)

---

## 🛠️ 主要更新與修復 (Key Updates & Bug Fixes)

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
- **預約設定表單**：整合日期選擇器（領取與歸還）與出團用途下拉式選單，點選結帳按鈕後即可將預約發送至 GAS 後台與 LINE 聊天室。

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
