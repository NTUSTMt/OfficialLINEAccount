# 🏕️ 野境戶外裝備租借系統 (Wilderness Gear Rental Store)

本專案是一個基於 **React + TypeScript + Vite** 開發的 LINE LIFF 網頁應用程式，為社團或個人提供直覺、現代化的露營與登山裝備預約租借平台。

## 📌 版本資訊 (Version Info)
- **當前版本**：`0.0.19` (v0.0.19)

---

## 🛠️ 主要更新與修復 (Key Updates & Bug Fixes)

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
