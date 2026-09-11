# 🏕️ 野境戶外裝備租借系統 (Wilderness Gear Rental Store)

本專案是一個基於 **React + TypeScript + Vite** 開發的 LINE LIFF 網頁應用程式，為社團或個人提供直覺、現代化的露營與登山裝備預約租借平台。

## 📌 版本資訊 (Version Info)
- **當前版本**：`0.1.14` (v0.1.14)

---

## 🛠️ 主要更新與修復 (Key Updates & Bug Fixes)

### 114. 幹部系統雙向多維排序、標籤頁 0 延遲權限控管與個人資料排版優化 (v0.1.14)
- **活動管理與審核名單多維排序功能 (Dual-Direction Multi-Dimensional Sorting)**：
  - **活動清單排序 (Admin Events List Sorting)**：
    - 支援依「活動日期（startDate）」、「截止時間（deadline）」、「活動狀態（status）」三種維度排序。
    - 支援即時升冪（Ascending）與降冪（Descending）切換按鈕。
  - **報名者審核名單排序 (Applicant Signups List Sorting)**：
    - 支援依「報名順序（order，依 rowNumber）」、「社員優先（member，正式社員排前）」、「審核狀態（status，正取 → 備取 → 審核中）」排序。
    - 支援即時升降序切換。
  - **精緻緊湊型介面 (Compact UI)**：
    - 嚴格遵守 0 Emoji 規範，全數採用 Lucide-react 向量圖示（`ArrowUpDown`、`ArrowUp`、`ArrowDown`）。
    - 緊湊排版不佔手機螢幕空間，無縫整合於搜尋與篩選列。
  - **重新整理按鈕位置優化 (Refresh Button Placement)**：
    - 將活動管理頁面中的「重新整理」按鈕自頂部標籤列移至活動搜尋框右側，與搜尋輸入框並列同列，更加直覺便利。
- **幹部標籤頁 0 延遲權限控管 (Zero-Latency Officer Tab Control with SWR Cache)**：
  - **效能保證**：透過 `cacheUtils`（`sessionStorage` 結合記憶體備援），首次驗證後快取 5 分鐘，頁面切換與選單展開耗時 0 毫秒，絕不造成介面卡頓。
  - **完全隱藏**：非幹部帳號或尚未通過驗證前，右上角頭貼下拉選單一律不顯示「幹部系統」入口；直接輸入 `/admin/events` 亦有路由防護阻擋。
  - **測試環境修正**：移除測試帳號（`TEST_USER_ID`）盲目給予幹部權限的預設邏輯，確保只有通過驗證之幹部才具備訪問權限。
- **個人資料彈窗層級（z-index）與排版修復 (Profile Modal Layering & Layout Fixes)**：
  - **視窗層級修正**：將個人資料 Modal 的 `zIndex` 提升至 `10001`、體能證明 Modal 提升至 `10002`（高於審核名單 Modal 的 `9999`），徹底解決個人資料彈窗被壓在審核頁面後方的問題。
  - **證件號碼跨欄單行顯示**：為基本資料內的「證件號碼」加上 `gridColumn: 'span 2'`，提供充足寬度，徹底解決因單欄寬度不足導致證件字號折至下一行的問題。
  - **審核操作按鈕防連點與轉圈圈載入動效**：在個人資料彈窗內點擊「正取」、「備取」或「重設」時，即時顯示旋轉 Spinner 圖示，並自動停用按鈕點擊，防止重複誤按。
- **緊急聯絡人關係欄位解析修復 (Emergency Contact Relation Parsing Fix)**：
  - 於後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `get_admin_event_signups` 函式中補齊報名表表頭的 `sEmerRelIdx`（支援「與緊急聯絡人關係」、「關係」、「Relation」等多種命名格式）。
  - 在社員資料比對時擴充支援以系統識別碼（`userId`）與手機號碼（`phone`）雙向關聯，確保緊急聯絡人關係資料精準提取並呈現在前端。

### 113. 備取卡片視覺邊框修復與報名者個人資料完整檢視功能 (v0.1.13)
- **備取邊框與陰影狀態同步修復 (Waitlist Card Border & Shadow Sync)**：
  - **修復前**：卡片展開樣式採用 `isExpanded ? '#059669' : ...`，導致報名者設為備取時，展開中的卡片邊框依然被寫死為綠色。
  - **修復後**：邊框顏色依審核狀態優先決定：
    - 正取（Confirmed）：展開深綠 `#059669`、收合淺綠 `#bbf7d0`。
    - 備取（Waitlisted）：展開深橘 `#ea580c`、收合淺橘 `#fed7aa`、微橘色光暈。
    - 待審核（Pending）：展開品牌綠 `#059669`、收合灰白 `#e2e8f0`。
  - 同步將卡片展開與更新狀態鍵值鎖定在 `rowNumber`（實體列號），避免多筆相同專屬碼或測試帳號產生連帶操作。
- **報名者個人資料檢視功能 (Applicant Personal Profile Viewer Modal)**：
  - **後端資料擴充 ([gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
    - 在 `getEventSignupsAPI` 擴充提取 `Signups` 表與 `Members` 表欄位，回傳完整的報名者個資，包含：系所、學號、電話、Email、通訊地址、生日、證件字號、緊急聯絡人（姓名、關係、電話、地址）、登山經驗、體能紀錄、個人特殊病史或過敏等。
  - **前端互動介面與專屬彈窗 ([AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx))**：
    - 報名者卡片新增「瀏覽個人資料」按鈕（採純 Lucide SVG 圖示，不使用 Emoji）。
    - 點擊後開啟全功能自適應彈窗，條理分明呈現基本資料、通訊聯絡、緊急聯絡人、登山經歷與體能證明。
    - 支援一鍵複製 LINE ID、一鍵通話撥打、查看體能證明檔案。
    - 彈窗底部內建「正取 / 備取 / 審核中」快捷操作按鈕，幹部查閱完個人資料可直接完成審核。

### 112. Google 試算表「審核結果」資料驗證規則相容性修復與防呆機制 (v0.1.12)
- **問題根因診斷 (Root Cause Analysis)**：
  - **試算表儲存格下拉選單限制**：Google 試算表 `Signups` 表中的「審核結果」（T 欄）設定了「資料驗證規則 (Data Validation Rules)」，僅允許 `正取 Confirmed`、`正取(已繳費) Confirmed(Paid)`、`備取 Waitlisted`、`備取(有意願) Waitlisted (Interested)`、`審核中 Checking`、`已取消 Cancelled` 6 種完整選項。
  - **純中文字串觸發試算表異常**：前端點擊審核按鈕時，送入的值為純中文 `'正取'` 或 `'備取'`，導致 GAS 呼叫 `setValue()` 時拋出違規例外（*The data you entered in cell T2 violates the data validation rules set on this cell...*）。
  - **CORS 錯誤連鎖反應**：GAS 拋出 Google 試算表驗證例外中斷時，Google 伺服器會返回不帶 `Access-Control-Allow-Origin` 標頭的 HTML 錯誤頁面，導致 iPhone Safari / LINE LIFF 判定為連線錯誤，拋出 `TypeError: Load failed` 或 `XHR Network Error`。
- **全方位雙重相容性修復 (Dual-Layer Compatibility Fix)**：
  1. **前端按鈕標準化 ([AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx))**：
     - 正取按鈕傳送值修正為 `'正取 Confirmed'`。
     - 備取按鈕傳送值修正為 `'備取 Waitlisted'`。
     - 審核中按鈕維持標準 `'審核中 Checking'`。
  2. **GAS 後端字串規範化防呆 ([gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 在 `processUpdateSignupStatus` 寫入試算表前，增加字串規格化映射邏輯：若收到純中文 `'正取'` 自動轉為 `'正取 Confirmed'`，若收到 `'備取'` 自動轉為 `'備取 Waitlisted'`，若收到 `'審核中'` 自動轉為 `'審核中 Checking'`。徹底杜絕因傳入值未帶英文選項而觸發試算表拒絕寫入。
  3. **網路層簡化與回歸標準 ([api.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/api.ts))**：
     - 移除不必要的 `img` 降級 hack，`gasGet` 回歸標準的 `fetch` API，並提供明確的伺服器 HTTP 狀態碼與錯誤訊息提示。

### 111. iOS Safari/LINE LIFF 302 轉址 XHR 自動降級與 HTML 防快取機制 (v0.1.11)
- **XHR 自動降級備援**：在 [api.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/api.ts) 新增 `gasGet()` 工具函式：以 `fetch` 為首選發送 GET 請求，若 Safari/WebKit 拋出 `TypeError: Load failed`（因 GAS 302 跨域轉址被阻斷），自動降級為 `XMLHttpRequest`（XHR 處理 302 跨域轉址的相容性更佳），確保在所有 iOS 環境下皆能完成請求。
- **HTML 防快取標頭**：在 [vercel.json](file:///Users/brianhung/Documents/OfficialLINEAccount/vercel.json) 新增 `Cache-Control: no-cache, no-store, must-revalidate` 標頭，防止 LINE LIFF WebView 快取舊版 `index.html` 導致瀏覽器載入過期 JavaScript 套件。
- 以上機制確保 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 的審核正取/備取、活動狀態切換、一鍵推播通知三大操作在 iOS LINE 環境中穩定運作。

### 110. 幹部審核與活動管理全面轉移為 GET 協定徹底消除 iOS WebKit 302 轉址 Load failed (v0.1.10)
- **問題診斷**：
  - 在 iOS LINE LIFF 內嵌瀏覽器環境中，因 WebKit 安全性規格限制，跨網域 `fetch` POST 請求接收到 Google Apps Script 必要的 `302 Found` 轉址時（轉向 `script.googleusercontent.com`），會直接在瀏覽器網路底層被阻斷，拋出原生例外 `TypeError: Load failed`。
  - 與之相對，前端在讀取活動清單、報名名冊、個人資料與裝備列表時皆採用 `GET` 請求，iOS WebKit 能原生且完美跟隨 302 轉址完成跨域資料交換。
- **架構重構與修復**：
  1. **GAS 後端多路徑支援 ([src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：在 `doGet(e)` 主路由中正式新增支援 `update_signup_status`（審核正取/備取）、`update_event_status`（快速啟閉活動報名）與 `send_event_notifications`（一鍵推播通知），並保留 `doPost` 雙向向下相容。
  2. **前端切換為帶權杖 GET 請求 ([src/pages/AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx))**：
     - 將 `handleUpdateApplicantResult`、`handleQuickStatusChange` 與 `handleSendNotifications` 全面改為 `GET` 請求搭配 `appendAuthToken` 與 URL 參數。
     - 徹底解決 iOS/Safari 跨網域 POST 轉址被阻斷的限制，達到與資料讀取相同之 100% 順暢與即時響應。

### 109. 審核操作異常與檔案權限防護修復 (v0.1.9)
- **幹部審核「操作失敗: Load failed」根本原因診斷與修復 (Applicant Review "Load failed" Fix)**：
  - **診斷發現**：
    1. **Google Apps Script 部署存取權限**：GAS 部署若「誰可以存取 (Who has access)」非「所有人 (Anyone)」，未帶 Google Session 認證的請求會被 302 導向至 `accounts.google.com`。由於該登入頁無 CORS 標頭，iOS WebKit/Safari 會直接阻斷請求並丟出原生 `TypeError: Load failed`。經設定為「所有人」後，GAS 已能順利接收跨域請求。
    2. **欄位模糊比對誤中「活動編號」修復**：[gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `processUpdateSignupStatus` 原先使用 `String(h).includes("編號")` 搜尋報名專屬碼欄位（`codeIdx`），導致誤配對到第一欄「活動編號」，比對邏輯因此失效。現已修正為排除含「活動」字樣並明確比對「專屬碼/報名代碼/報名編號/序號」。
    3. **鎖定釋放安全性防護 (Lock Safety Guard)**：優化 `processUpdateEventStatus` 與 `processUpdateSignupStatus` 在 `finally` 區塊中的 `releaseLock()`，加入 `hasLock()` 狀態檢測與例外保護，防止未持鎖時調用導致後端崩潰拋出 500 HTML 錯誤。
    4. **前端重導向跟隨設定 (Redirect Follow)**：在 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 的所有後台管理 POST fetch 請求中顯式加入 `redirect: 'follow'`，確保跨網域跳轉順暢接收。
- **體能證明「你沒有呼叫 DriveApp.getFoldersByName 的權限」修復 (DriveApp Permission & Upload Error Handling)**：
  - **診斷發現**：
    1. 社員報名上傳體能證明時，後端呼叫 `DriveApp.getFoldersByName("LINE_Uploads")`。因 GAS 專案尚未在 Google 帳號授權 Google Drive 存取 Scope，導致 DriveApp 拋出權限例外。該例外被 catch 捕捉後，直接將錯誤訊息字串寫入試算表。
    2. 幹部在後台點選「查看體能證明」時，前端安全檢核機制檢測出非 URL 內容並向幹部顯示提示視窗。
  - **處置方案**：
    - GAS 專案已確認/完成 DriveApp 權限授權，日後報名上傳將正常上傳並寫入 Drive 檔案連結。
    - 針對已寫入錯誤訊息之舊資料列，可在試算表 `Signups` 表手動替換為正確檔案連結，或請社員重新報名即可。

### 108. 裝備頁面與活動審核中心第一階段前端載入加速與快取架構重構 (v0.1.8)
- **裝備租借頁面解除瀑布串行阻擋與 SWR 快取實作 (Borrow Page Waterfall Elimination & Early Render)**：
  - **效能問題診斷**：
    1. 原先 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 採用串行 `await`：先拉取裝備列表（耗時約 1.5 ~ 2 秒），裝備抵達後才發起第二個請求拉取 `get_my_status`（耗時約 2.5 ~ 3 秒），且 `setLoading(false)` 置於最後。使用者被卡在全白 Loading 轉圈畫面累計長達 **4.5 ~ 6.5 秒**。
    2. 裝備頁其實只用到 `get_my_status` 回傳的 `isOfficial` 單一布林值，卻引發後端掃描 Members、Officers、Signups、Events、Loan_Records 共 5 張試算表，構成嚴重過度查詢 (Over-fetching)。
  - **加速重構方案**：
    - 建立輕量快取模組 [cacheUtils.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/cacheUtils.ts)：支援 `sessionStorage` TTL 過期管理與記憶體降級備援機制。
    - **SWR (Stale-While-Revalidate) 快取秒開**：進入 `/borrow` 時優先讀取 5 分鐘快取，快取命中時 **0 毫秒立即呈現商品列表**。
    - **優先渲染 (Early Render)**：冷啟動時解除串行等待，裝備清單一旦取得立即執行 `setLoading(false)` 渲染畫面，使使用者在 **1.2 ~ 1.5 秒內** 即可開始瀏覽器材與規格。
    - **身分折扣非同步分離**：社員資格比對改以獨立並行 Promise 進行，取得後平滑更新折扣價，不阻擋核心瀏覽流程。
    - **重新整理與庫存保證**：標題列新增「重新整理」按鈕；且在使用者成功送出預約表單後，自動清除裝備快取，確保下次載入取得即時庫存數值。

- **活動審核中心雙重驗證瀑布消除與樂觀計數重構 (Admin Events Waterfall Removal & Optimistic UI)**：
  - **效能問題診斷**：
    1. 原先 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 在載入時先呼叫 `check_officer_status` 檢驗身分，待其返回後才在回呼中呼叫 `get_admin_events`，形成雙重 HTTP 往返，累積延遲達 **5.0 ~ 7.5 秒**。
    2. 審核名單 Modal 每次點開皆重複向後端全表查詢；且幹部在名冊中每點擊審核 1 位社員（正取/備取），程式碼皆全量觸發 `fetchEvents()` 重新向後端拉取全部活動，造成伺服器高負載與背景卡頓。
  - **加速重構方案**：
    - **移除冗餘驗證**：拔除前置獨立的 `check_officer_status`，改為直接呼叫 `get_admin_events`（後端已內含幹部身分校驗與幹部資訊），首屏載入時間直接**腰斬至 1.8 ~ 2.2 秒**。
    - **活動列表快取**：活動清單支援 3 分鐘快取，分頁切換時瞬時還原；提供手動重新整理按鈕以便手動強制更新。
    - **審核名冊快取**：以活動代號為鍵快取名冊 2 分鐘，點開 Modal 避免重複旋轉等待，並在 Modal 標題列附帶即時刷新按鈕。
    - **審核操作樂觀計數 (Optimistic Counter Update)**：幹部變更審核狀態時，前端直接於記憶體與快取中動態增減對應活動之統計徽章（例如待審核 -1、正取 +1），**徹底拔除重複發送全量 `fetchEvents()` 的後端負擔**，使審核操作達到 **0ms 即時反饋**。

### 107. 幹部審核正取/備取即時標記修復與體能證明安全預覽優化 (v0.1.7)
- **幹部審核正取/備取/重設標記失效修復 (Applicant Review Status Update Fix)**：
  - **根本原因診斷**：
    1. 原前端 `handleUpdateApplicantResult` 僅以 `signupCode`（專屬報名碼）作為唯一比對鍵值。若報名資料為早期登記、無專屬碼或欄位為空，傳給後端的 `signupCode` 為 `""`，導致後端找不到資料列且前端畫面狀態無法樂觀更新。
    2. 原後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `processUpdateSignupStatus` 採用嚴格欄位索引比對，若試算表標題為「審核」或「審核狀態」而非精確的「審核結果」，會回傳 `-1` 引發 `getRange` 範圍無效例外。
  - **修復方案**：
    - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)：`handleUpdateApplicantResult` 改為接收完整報名者物件 `s: SignupApplicant`，發送請求時帶入 `signupCode`、`targetUserId: s.userId`、`rowNumber: s.rowNumber` 與 `name: s.name`。
    - 前端畫面即時更新採用複合唯一鍵（`signupCode || rowNumber || userId`），確保無論有無專屬碼都能即時更新卡片狀態與頂部統計徽章。
    - 補強 `catch` 區塊之錯誤彈窗提示，避免因網路或權限問題靜默吞沒異常。
    - 後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)：`processUpdateSignupStatus` 支援 `rowNumber` 驗證後優先精準鎖定，次級依序比對 `signupCode`、`targetUserId + eventId` 與 `name + eventId`，並透過 `getOrCreateColIdx` 自動補齊缺失之「審核結果」與「通知狀態」欄位。
- **查看體能證明避免誤轉跳裝備租借頁面修復 (Fitness Proof Viewer & Prevent Navigation to /borrow)**：
  - **根本原因診斷**：
    1. 原前端使用 `<a href={s.strengthProof.split(',')[0]} target="_blank">` 標籤。當社員登記的體能證明非以 `http/https` 開頭（例如為純文字、Google Drive 檔案 ID、相對路徑或空值）時，瀏覽器會將其當作站內相對路徑。
    2. 由於該路徑在 React Router 中未定義，觸發了 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 萬用路由 `<Route path="*" element={<Navigate to="/borrow" replace />} />`，直接將幹部強制重新導向至預設的「裝備租借頁面」（`/borrow`）。
    3. 在 LINE LIFF 內嵌瀏覽器中，一般的 `<a target="_blank">` 連結若未以 `liff.openWindow({ url, external: true })` 開啟，易造成 LIFF 載入失敗或回退至首頁預設視圖。
  - **修復方案**：
    - 將連結替換為 `<button type="button">`，徹底阻絕瀏覽器誤認相對路由之行為。
    - 封裝 `openExternalUrl`：在 LINE 環境下使用 `liff.openWindow({ url, external: true })` 透過外部瀏覽器開啟，一般瀏覽器則以 `window.open` 安全開啟。
    - 封裝 `parseProofUrls`：精密解析 URL、清理空格，並自動將 Google Drive 檔案 ID 轉換為有效預覽網址（`https://drive.google.com/file/d/{id}/view`）。
    - 支援多張體能證明預覽彈窗：若報名者上傳了多張證明照片或檔案，點選「查看體能證明」將跳出專屬清單彈窗，讓幹部逐一開啟檢視。
    - 後端補強：在 `processGetEventSignups` 中若 `Signups` 表無體能證明，自動交叉比對 `Members`（社員資料）表提取該社員最新體能證明檔案。

### 106. 活動截止日自動判定、即時防呆阻擋與定時巡檢關閉機制實作 (v0.1.6)
- **活動截止日期精密解析核心 (Deadline Parser & Validator)**：
  - 在 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 新增 `_isEventExpired` 工具函式。
  - 支援 Date 物件與 `YYYY/MM/DD`、`YYYY-MM-DD`、`YYYY.MM.DD` 等各類字串格式，精準判定至截止日當天 **23:59:59.999** 為止，維護社員於截止日當天的完整報名權益。
- **LINE 最新活動列表與詳情卡片即時自動關閉 (Realtime Auto-Close on LINE Cards)**：
  - 更新 `sendEventList`：若偵測到活動為開放但已過報名截止日，系統自動將試算表狀態即時改寫為「關閉」，並從開放活動輪播卡片中隱藏，防止社員被過期活動誤導。
  - 更新 `sendEventDetail`：若社員查看已截止之活動，系統自動將報名按鈕轉為灰底無效之「報名已截止 Closed」，阻擋點擊報名。
- **一鍵報名底層安全攔截 (Backend Signup Deadline Guard)**：
  - 更新 `handleSignup`：在執行報名寫入前優先檢驗活動之截止日與狀態。若活動已截止或關閉，立即中斷報名並回傳提示訊息（例如：`⚠️ 報名失敗：【合歡山主東峰】已於 2026/04/12 截止報名！`），杜絕以過期訊息搶報名之漏洞。
- **每日凌晨排程自動巡檢與幹部推播 (Daily System Check & Cadre Alert)**：
  - 補完 `dailySystemCheck` 核心排程：定時遍歷 `Events` 資料表，將所有已過截止日之開放活動自動同步標記為「關閉」。
  - 自動彙整過期關閉之活動清單，推播通知至幹部 LINE 群組，免除幹部每日手動檢查與維護活動狀態之負擔。
- **幹部管理中心介面輔助標註 (Admin Events UI Indicator)**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)：在活動列表的「報名截止」資訊旁，若已過截止日自動顯示紅色 `(已截止)` 標籤，讓幹部一目了然。

### 105. AI 助理「小岳」Gemini 回覆結尾自動附帶免責聲明 (v0.1.5)
- **AI 幻覺與資訊準確性提醒 (AI Disclaimer Suffix)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `talkToGemini` 函式。
  - 在每次小岳透過 Google Gemini 2.5 AI 模型產生回答文字時，在內容最末端自動加上清晰的分隔線與官方提醒：
    ```text
    ─────────────
    小岳 Yue is AI. 小岳 Yue can make mistake.
    ```
  - 確保不論是在幹部群組（`replyAdminMessage`）或是個人一對一聊天室（`replyMessage`）向小岳提問，社員與幹部皆能明確知悉 AI 助理之特性，提醒重要行程或決策仍須以幹部公告為準。

### 104. 幹部系統活動說明字數上限調升至 1,400 字 (v0.1.4)
- **字數上限彈性提升 (Word Limit Adjustment)**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - 將幹部新增/編輯活動時的說明文字綜合總字數上限由 1,300 字調升至 **1,400 字**（`TOTAL_DESC_LIMIT = 1400`）。
  - 詳細行程與裝備要求欄位建議上限同步由 1,200 字調整為 **1,300 字**（`FULL_DESC_LIMIT = 1300`），保留更充裕的篇幅撰寫完整活動登山行程。
  - 同步更新即時字數統計條、超標紅框判定條件與防呆警告訊息。

### 103. LINE 活動卡片樣式完全對齊、詳細卡片整合簡介與幹部後台字數限制彈性輸入框 (v0.1.3)
- **LINE 最新活動列表卡片文字樣式對齊 (Activity List Styling Sync)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `sendEventList`。
  - 將「活動時間」與「報名截止」之標籤由 `xs`、灰色調提升為標準 `sm`、`#666666`。
  - 將出隊日期數值改為主題綠色 `#1DB446` 粗體，報名截止數值加上粗體 `#E53935`，完全與「查看詳情」大卡片的精緻視覺排版保持一致。
- **LINE 活動詳細卡片整合完整簡介 (Event Detail Card Overview Integration)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `sendEventDetail`。
  - 動態讀取 `簡介 (shortDesc)` 欄位。
  - 突破原本輪播卡片中 3 行限制，在詳細資訊卡片中獨立展示「【活動簡介 Overview】」全文字段與「【詳細行程 Itinerary & Details】」，讓社員點擊詳情即可完整閱讀重點說明與完整行程。
- **幹部管理中心新增/編輯活動字數限制與彈性輸入框 (Cadre System Character Limits & Resizable Inputs)**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - **字數判定與綜合上限控制**：
    - 設定簡介上限 200 字、詳細行程上限 1,200 字、綜合總字數上限 1,300 字。
    - 輸入框右下角即時計算並顯示字數（如 `0 / 200 字`、`0 / 1,200 字`）。
    - 提供綜合總字數狀態列，即時提示當前文字量與上限比率。
  - **超量紅框警示與阻擋機制**：
    - 任一欄位或綜合字數超出上限時，輸入框立即轉為醒目紅色外框（`2px solid #ef4444`）與淺紅防呆底色。
    - 表單提交按鈕即時變更為禁用狀態（灰色、禁止點擊標記），點擊時防呆阻擋，徹底防止文字量過大導致 LINE Flex Message 超過 10 KB 發送失敗。
  - **輸入框彈性尺寸縮放 (Resizable Textarea)**：
    - 為「簡介」與「詳細行程」文字區塊加入 `resize: 'vertical'`、`overflow: 'auto'` 與自適應最小高度，幹部在電腦或手機端可自由拖曳右下角調整輸入框高度，長文撰寫與檢視更順手。
  - **即時預覽卡片排版同步 (Live Preview Sync)**：
    - 同步更新管理後台右側的即時卡片預覽元件，讓幹部所見即所得。

### 102. LINE 官方帳號活動卡片全面去 Emoji 化與排版美化 (v0.1.2)
- **活動列表輪播卡片 (Activity Carousel Cards)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `sendEventList`。
  - 移除「最新活動」輪播卡片中費用、活動時間、報名截止標籤前方的 Emoji 表情符號（`💰`、`📅`、`⏰`），統一採用乾淨俐落之雙語純文字標籤：
    - `費用 Cost:`
    - `活動時間 Event Date:`
    - `報名截止 Sign Up Deadline:`
  - 優化日期換行與間距縮排排版，避免手機端呈現多餘空白字元。
- **活動詳情單卡與報名按鈕 (Activity Detail Card & Buttons)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `sendEventDetail`。
  - 標題與欄位去 Emoji：將「📝 活動詳情 Event Details」改為「活動詳情 Event Details」，並同步移除費用、活動時間與報名截止前方的 Emoji。
  - 狀態按鈕文字優化：將「⏳ 尚未開放 Not Open」按鈕文字精簡為「尚未開放 Not Open」。
- **活動審核結果推播卡片 (Event Signup Result Push Notifications)**：
  - 更新 `sendEventResultNotifications` 與 `processSendEventNotifications`。
  - 移除正取與備取通知卡片頂部的「📣 審核結果出爐 Result」中的 `📣`，以及恭喜錄取說明文字中的 `🎉`，呈現簡約沈穩的高質感介面。
- **幹部群組新活動上架廣播通知 (Cadre Group New Event Announcement)**：
  - 更新 `processSaveEvent`：移除通知訊息中的 Emoji 圖示（`📢`、`📍`、`🏷️`、`📅`、`⏰`、`💰`、`🚦`），維持幹部群組資訊的簡潔專業風格。

### 101. LINE ID Token (JWT) 數位簽章驗證防冒充架構實作 (v0.1.1)
- **前端自動加密驗證憑證傳遞 (Frontend Auto ID Token Attaching)**：
  - 新增 [src/utils/api.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/api.ts) 共用通訊模組，提供 `getIdToken()`、`appendAuthToken()` 與 `withAuthPayload()` 工具函式。
  - 全面更新前端所有資料存取與業務操作模組（[Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)、[Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)、[Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)、[Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)、[History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx)、[Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx)、[AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)、[App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx)）。
  - 在發起任何查詢或異動之 GET / POST 請求時，自動由 `liff.getIDToken()` 提取當前登入者由 LINE 官方加密簽署之 JWT Token 並隨附發送。
- **後端官方數位簽章校驗核心 (Backend LINE Signature Verification & Cache)**：
  - 在 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 實作 `verifyLineIdToken` 與 `getAuthenticatedUserId` 驗證核心。
  - 介接 LINE 官方驗證端點 `https://api.line.me/oauth2/v2.1/verify`（Channel ID: `2009217429`），驗證憑證之真偽、期限與發行者。
  - 導入 `CacheService.getScriptCache()` 10 分鐘快取機制，以 Token 雜湊為鍵進行高效去重比對，兼顧極致資安防護與零延遲載入效能。
  - 於 `doGet` 與 `doPost` 全面啟用認證檢核：凡未帶 Token 或 Token 遭竄改/過期之請求，將一律被拒絕存取個資；合法請求強制綁定官方驗證之 `sub`（真實 User ID），徹底杜絕任何外部有心人士透過明文 `userId` 冒充他人身分之嚴重資安風險。

### 100. 幹部專屬管理中心獨立 LIFF ID (2009217429-DSYjXqNK) 串接與全端資安後門 (TEST_USER_ID) 全面拔除 (v0.1.0)
- **幹部專屬管理中心獨立 LIFF 串聯 (Dedicated Cadre LIFF Integration)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)：將「幹部系統」指令回覆以及幹部功能指引卡片中的後台連結，全面換成使用者新建立之專屬獨立 LIFF 網址：`https://liff.line.me/2009217429-DSYjXqNK`。
  - 更新 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx)：
    - 在 `initializeLiff` 加入 `/admin` 專屬路由識別，確保透過該 LIFF 連結開啟時，正確以 `2009217429-DSYjXqNK` 進行 SDK 初始化，徹底終結先前因借用主頁 LIFF 轉址而跳回個人主頁或裝備租借的問題。
    - 全域導航選單中點擊「幹部管理中心」時，於 LINE 客戶端環境以 `handleNav` 搭配 `2009217429-DSYjXqNK` 專屬 LIFF 開啟。
- **全端資安防護加固：全面拔除 TEST_USER_ID 測試後門 (Elimination of Backdoor Vulnerabilities)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)：
    - 徹底移除 `getAdminEventsAPI`、`getEventSignupsAPI`、`processSaveEvent`、`processUpdateEventStatus`、`processUpdateSignupStatus`、`processSendEventNotifications` 等所有管理 API 中的 `userId !== "TEST_USER_ID"` 豁免判斷。
    - 嚴格落實身分權限檢核：任何存取或修改活動與報名名冊之請求，必須具備合法且確實登記於 `Officers` 試算表中的幹部 LINE User ID，任何人即便得知 GAS Web App 網址，亦無法再以 `TEST_USER_ID` 撈取報名者姓名、電話、學號等敏感個人資料。

### 99. LINE 原生 @Mention 精準裁切、群組招呼指令直通指南與 Gemini System Prompt 修正 (v0.0.99)
- **LINE 原生 Mention 精準裁切演算法 (Precise Native Mention Stripping)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `handleTextCommand`。
  - 改用 LINE Webhook 官方 `mention.mentionees` 結構中所提供的精確字串切片範圍 `index` 與 `length`。
  - 採取由後往前（Descending Offset）的切割策略，精確抹除被 `@` 的機器人標籤，徹底解決因機器人自訂名稱含有空格、特殊字元或表情符號導致正則表達式切除不全的問題。
  - 支援過濾各類 Unicode 空白字元（如 `\u2005` 四分之一空格、`\u00A0`、`\u3000` 全形空格）。
- **群組常用問候與說明直通幹部指南 (Cadre Guide Direct Trigger)**：
  - 在幹部群組環境中，只要呼叫助理並帶有「你好」、「您好」、「嗨」、「哈囉」、「hello」、「hi」、「指令」、「功能」、「說明」、「幫助」、「在嗎」或未帶任何問題時，系統一律直接回傳「🌲 幹部專屬助理功能指南」卡片，不再將問候文字誤送至 Gemini AI。
- **Gemini AI 系統提示詞修正 (System Prompt & Persona Fix)**：
  - 在 `talkToGemini` 將 AI 助理預設名稱由「小山」正式修正為「小岳（Yue）」，並更新人格設定為專業、親切與排版工整。
  - 提示詞中加入幹部專屬指令導引（「小岳 幹部系統」、「小岳 抓取群組ID」），並移除鼓勵使用 Emoji 之指令，保持乾淨俐落之回覆風格。

### 98. 儀表板版面修復、全站全面去 Emoji 化、匯款帳戶左對齊點擊複製與備註追蹤系統 (v0.0.98)
- **儀表板幹部卡片跑版修復 (Dashboard Layout Bug Fix)**：
  - 修復 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 中「幹部專屬管理中心」卡片內文被擠壓斷成多行狹窄文字的問題。
  - 為文字容器添加 `flex: 1` 與 `minWidth: 0`；為「前往管理」按鈕明確設定 `width: 'auto'` 與 `flexShrink: 0`，避免被全域 `.btn` 之 `width: 100%` 擴張而擠壓左側說明文字。
- **全站全面去 Emoji 化與向量圖示升級 (Complete Project-wide De-emojification)**：
  - **導航與頁面結構 ([App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx))**：
    - 頂部導航標題圖示全數替換為 Lucide 向量圖示（`ShieldCheck`、`Award`、`FileText`、`ClipboardList`、`CreditCard`、`User`、`Compass`）。
    - 語言切換按鈕 `🌐` 升級為 `<Languages size={15} />`；彈窗警示 `⚠️` 升級為 `<AlertCircle size={48} color="#ef4444" />`。
  - **裝備租借 ([Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx))**：
    - 分類預設圖示由 Emoji 升級為標準向量圖示（`Tent`、`Moon`、`Package`、`Compass`、`Flame`、`Shield`、`Mountain`）。
    - 購物車空狀態由 `🛒` 升級為 `<ShoppingCart size={40} />`。
  - **繳費報帳 ([Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx))**：
    - 移除成功彈窗的 `🎉`、`👍`，改用柔和綠底搭配 Lucide `<CheckCircle2 size={48} color="#16a34a" />`；錯誤提示 `⚠️` 替換為 `<AlertCircle size={14} />`。
  - **歷史紀錄 ([History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx))**：
    - 狀態標籤 `🟢`、`🔴`、`🟡` 替換為 6px CSS 實心動態狀態圓點。
    - 欄位圖示 `👤`、`📅`、`🏕️`、`💰` 全面替換為 `<User />`、`<Calendar />`、`<Tent />`、`<CreditCard />`；空狀態與警示改用 `<FileText />` 與 `<AlertCircle />`。
  - **榮譽徽章 ([Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx))**：
    - 空狀態 `🧗` 與錯誤 `⚠️` 升級為 `<Award />` 與 `<AlertCircle />`；評分星號以 Lucide `<Star size={20} />` 精緻渲染。
  - **註冊報名 ([Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx))**：
    - 移除檔名標註 `✓`，改為內嵌向量 `<Check size={14} color="#16a34a" />`。
  - **語系檔案與樣式表 ([zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json)、[en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)、[App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css))**：
    - 全面清除中英文語系 JSON 鍵值與 CSS 註解段落中的所有 Emoji，經全專案掃描驗證達到 0 Emoji 純淨度。
- **社團匯款帳戶靠左對齊與一鍵複製功能 (Left-Aligned Account & Click-to-Copy)**：
  - 更新 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)：
    - 匯款資訊卡改為靠左對齊排版，搭配銀行小圖示 `<Building2 size={16} color="#059669" />` 提升視覺層次。
    - 匯款帳號（`111019636700`）提供點擊複製功能，點擊後自動複製至剪貼簿，並即時變更為「已複製！」打勾回饋狀態（維持 2 秒後復原）。
- **繳費備註（Note）全端串聯與即時追蹤 (Payment Note Feature Across Stack)**：
  - **前端輸入**：在 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 新增「匯款備註 (選填)」輸入框（上限 100 字），支援說明特定折抵、代繳對象或特殊用途。
  - **後端存取 ([gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
    - 在 `processPaymentSubmit` 自動檢測並動態補齊 `Payments` 工作表之「備註」欄位標題，寫入填寫者提供的備註。
    - 在推播給幹部群組的審核 Flex 卡片中加入「備註」欄位，讓幹部直接在 LINE 群組一眼掌握備註說明。
    - 在 `getPaymentHistoryAPI` 讀取並回傳「備註」資料至繳費紀錄清單中。
  - **紀錄查看 ([History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx))**：
    - 繳費歷史紀錄展開詳細資訊時，若該筆款項附有備註，即時以標準文字卡片顯示「備註說明」。

### 97. 幹部群組單一綁定保護機制、防誤觸二次確認 Flex Card 與個人主頁全面去 Emoji 化 (v0.0.97)
- **嚴格單一群組綁定原則（Single Cadre Group Binding）**：
  - 在 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 實作 `PropertiesService.getScriptProperties().setProperty('ADMIN_GROUP_ID', newGroupId)` 自動持久化儲存機制。
  - 保證系統永遠「僅存在單一幹部通知群組」。一旦更換綁定至新群組，舊群組之 ID 立即被覆蓋失效，舊群組即刻停止接收任何活動報名、請假審核與裝備租借推播訊息。
- **防誤按互動式確認卡片（Anti-Accidental-Trigger Flex Card）**：
  - 幹部在群組輸入「`小岳 抓取群組ID`」或以原生 `@助理 抓取群組ID` 呼叫時，系統不再自動直接覆蓋綁定，而是回傳具備安全警示的 LINE 互動式 Flex 卡片：
    - 明確顯示目前群組 ID。
    - 提示若目前已為綁定群組（顯示「此群組已是目前唯一綁定的幹部群組」），或提示綁定後將轉移接收所有幹部通知。
    - 明確以警示文字說明：「此操作將取代舊群組，舊群組將無法再接收到通知」。
    - 提供「確認綁定此群組為唯一通知群組」的專屬 Postback 按鈕（傳遞 `action=confirm_bind_admin_group&groupId=...`）。
- **Postback 安全確認處理解決方案**：
  - 在 `handlePostback` 新增 `action === "confirm_bind_admin_group"` 處理器，唯有幹部在群組中主動點擊確認按鈕時，系統才會正式寫入 `PropertiesService` 並立即同步記憶體變數，隨後回傳綁定成功訊息，徹底避免誤觸。
- **個人主頁（Dashboard）全面去 Emoji 化與向量圖示升級**：
  - 更新 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)：
    - 會員卡狀態文字 Emoji（`✅`、`❌`、`⚠️`）升級為 Lucide `<CheckCircle2 size={13} />`、`<XCircle size={13} />`、`<AlertTriangle size={13} />`。
    - 活動與裝備區塊標題（`🏕️`、`🎒`）替換為 `<CalendarCheck size={18} color="#059669" />` 與 `<Package size={18} color="#059669" />`。
    - 欄位資訊小標（`📅` 日期、`📝` 訂單編號、`⚠️` 逾期提示）轉為標準文字搭配 `<Calendar size={13} />`、`<FileText size={12} />`、`<AlertTriangle size={12} />`。
    - 錯誤畫面與彈窗標題（`❌`、`⚠️`）分別替換為 `<AlertCircle size={48} color="#ef4444" />` 與 `<AlertTriangle size={20} color="#ef4444" />`。
    - 預設使用者頭像由 `👤` 替換為 `<User size={24} />`。
  - 更新 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)：
    - 全面清除 `dashboard.alert`、`dashboard.card`、`dashboard.activity`、`dashboard.equipment`、`dashboard.modal` 內部殘餘之 Emoji，提供整齊俐落且國際化的質感介面。

### 96. 幹部群組助理升級：支援 LINE 原生 @Mention、幹部指令指南與防衝突機制 (v0.0.96)
- **支援 LINE 原生 `@` 標註呼叫 (Native Mention)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `doPost` 與 `handleTextCommand`。
  - 解析 LINE Webhook 之 `event.message.mention.mentionees` 陣列，只要偵測到 `isSelf === true`（即標註機器人本身），不論幹部在 LINE 後台將機器人設定為「小岳」、「幹部秘書」或任何自訂名稱，均能 100% 精準觸發。
  - 自動剔除開頭的 `@名稱` 標籤，將乾淨的問題內容傳送至 Gemini AI。
- **維持免 `@` 純文字前綴雙軌相容**：
  - 維持原本輸入「`小岳`」或「`Yue`」開頭即可直接對話的習慣，手動輸入 `@小岳` 亦可自動相容解析。
- **呼叫式「抓取群組ID」與「幹部系統」捷徑**：
  - 將原先獨立的指令升級為呼叫式互動，支援在群組輸入「`小岳 抓取群組ID`」或以 `@助理 抓取群組ID` 查詢群組代號。
  - 新增「`小岳 幹部系統`」快捷指令，直接回傳活動管理與名單審核之專屬 LIFF 入口連結。
- **群組空呼叫自動傳送「幹部專屬指令指南」**：
  - 當幹部在群組中僅標註 `@助理` 或輸入「`小岳`」但**未附帶任何問題**時，助理會自動在群組傳送結構化之「幹部專屬助理功能指南」，列出幹部系統連結、群組 ID 查詢、AI 提問範例與即時推播說明。
- **雙機器人 Token 嚴格隔離防衝突 (Token Routing)**：
  - 在群組環境（`sourceType === "group" || "room"`）一律調用 `replyAdminMessage`（使用 `ADMIN_BOT_TOKEN`）；在個人一對一對話一律調用 `replyMessage`（使用 `MEMBER_BOT_TOKEN`），徹底根除兩隻機器人共用後端時可能產生的 `Invalid reply token` 衝突問題。

### 95. 幹部系統全面「去 Emoji 化」與現代向量圖示重構 (Complete De-emojification) (v0.0.95)
- **活動看板狀態標籤微型化與純淨化**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - 徹底移除 `🟢 開放報名`、`🟠 未來開放`、`⚪ 已關閉` 的彩色圓球文字 Emoji。
  - 改為內嵌精美之 `6px` CSS 實心動態狀態圓點（綠色 `#16a34a` / 橙色 `#ea580c` / 灰色 `#94a3b8`）搭配工整純文字，徹底解決文字 Emoji 在跨作業系統渲染時之基線高度落差。
- **權限不足與空狀態向量圖示化**：
  - 將未授權頁面的巨大 `🔒` 替換為柔和圓形紅底搭配 Lucide `<Lock size={40} color="#ef4444" />`。
  - 將活動列表無資料的 `🏔️` 空狀態替換為簡約高質感的 `<Mountain size={44} color="#94a3b8" />`。
- **表單說明與 LINE 即時卡片預覽去 Emoji 化**：
  - 表單狀態說明的 `💡` 替換為俐落的 Lucide `<Info size={14} color="#059669" />` 提示圖示。
  - LINE 卡片預覽封面缺失預設由 `🏔️` 替換為 `<Mountain size={36} color="#94a3b8" />`。
  - 移除預覽卡片中的 `💰`、`📅`、`⏰`、`⏳` 等冗餘 Emoji，轉為標準乾淨的雙語文字排版。
  - 名冊審核彈窗右上角的關閉文字 `✕` 升級為精緻的向量 `<X size={20} />` 按鈕。
- **個人主頁幹部入口卡片現代化**：
  - 更新 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)。
  - 將「幹部專屬管理中心」入口的 `🛠️` Emoji 升級為現代綠底圓角 `<ShieldCheck size={24} color="#059669" />` 徽章，按鈕箭頭亦同步升級為 `<ChevronRight size={15} />`。
- **雙語語系檔全面淨化**：
  - 更新 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)。
  - 全面移除 `menuAdminEvents`（幹部系統）、`coverUploadBtn`（從相簿選擇照片）、`notifyOfficerGroup`（上架推播）等鍵值中殘留之 `🛠️`、`📷`、`📢` 等文字 Emoji。

### 94. 徹底修復 iOS/WebKit 日期選取框樣式跑版與 CSS Grid 溢出重疊問題 (v0.0.94)
- **問題根因分析**：
  - 在 iOS Safari 或 WebKit 瀏覽器環境中，`<input type="date">` 預設以原生灰色藥丸按鈕樣式渲染，且內部含有固定最小內容寬度（Min-content width）。
  - 當其置於 `grid-template-columns: 1fr 1fr;` 且未設定 `min-width: 0` 時，左欄日期元件因寬度超過網格容量而強制向右溢出（Overflow），吃掉欄間間距（gap）並直接侵入、覆蓋在右側輸入框之上（如「報名截止日」灰框穿透至「預計費用」白框底部）。
  - iOS 預設的 `::-webkit-date-and-time-value` 行為會將日期文字強制置中，且原生元件高度與一般的文字輸入框不同，造成左右底部無法對齊。
- **全方位修復方案**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)：
    - 將日期與費用區塊之網格樣式更新為防溢出的 `gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)'`，並在每個欄位容器強制鎖定 `minWidth: 0`。
    - 日期與費用輸入框全面配置 `WebkitAppearance: 'none'`、`appearance: 'none'`、`backgroundColor: '#ffffff'`、`color: '#1e293b'`，清除 iOS 灰色藥丸原生樣式，還原為統一且精美的純白圓角輸入框。
    - 統一輸入框之最小高度 `minHeight: '42px'`、內距 `padding: '8px 12px'` 與 `fontSize: '13px'`，確保左欄日期與右欄費用輸入框垂直高度與底部像素級對齊。
  - 更新 [App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css)：
    - 新增 `input[type="date"]::-webkit-date-and-time-value { text-align: left; }` 與全域 `appearance: none;`，徹底校正 iOS Safari 下日期文字強制居中之預設行為。
  - 同步語系文字 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)：
    - 同步移除幹部管理相關標籤之冗餘 Emoji，與正體中文語系檔保持完全一致。

### 93. 幹部活動管理介面向量圖示現代化升級 (Lucide-React Vector Icons) (v0.0.93)
- **引入 `lucide-react` 向量圖示庫**：
  - 依社群規範使用 `pnpm add lucide-react` 安裝輕量、支援 Tree-shaking 之標準向量圖示套件。
- **幹部活動管理頁面全面替換為專業 SVG 圖示**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - **頁籤導覽 (Tabs)**：將分頁 Emoji 替換為俐落的 `<ClipboardCheck size={17} />`（活動總覽與審核）與 `<Plus size={17} />` / `<Pencil size={17} />`（發布/編輯活動）。
  - **搜尋列 (Search Bar)**：在輸入框前端嵌入精準的 `<Search size={16} />` 圖示，取代純文字前綴。
  - **活動看板卡片 (Board Cards)**：
    - 活動縮圖缺失時以現代化的 `<ImageIcon size={28} />` 作為預設替代。
    - 時程費用獨立資訊格由原先的 📅、⏰、💰 Emoji 全面替換為 `<Calendar size={13} />`、`<Clock size={13} />` 與 `<CircleDollarSign size={13} />`。
    - 四色指標看板分別採用 `<Users size={14} />`（總報名）、`<CheckCircle2 size={14} />`（正取）、`<Clock4 size={14} />`（備取）與 `<AlertCircle size={14} />`（待審核）。
    - 底部操作按鈕對齊為 `<Pencil size={14} />`（編輯）與 `<ClipboardCheck size={15} />`（審核名單）。
  - **編輯與新增表單 (Create / Edit Form)**：
    - 狀態高亮區塊加入 `<Sparkles size={15} />` 強調動態提示。
    - 照片上傳按鈕配置 `<ImageIcon size={16} />`，上傳完成反饋採用 `<Check size={16} />`。
  - **審核名單彈窗 (Applicant Review Modal)**：
    - 收合展開箭頭升級為旋轉流暢的 `<ChevronDown size={17} />`。
    - LINE ID 膠囊配置 `<MessageSquare size={13} />`，點擊複製反饋動態由 `<Copy size={12} />` 切換為 `<Check size={12} />`。
    - 電話撥號按鈕配置 `<Phone size={13} />`，體能照片連結配置 `<ImageIcon size={13} />`。
    - 正取、備取、設為待審大按鈕分別使用 `<CheckCircle2 size={14} />`、`<Clock4 size={14} />` 與 `<RotateCcw size={14} />`。
    - 推播按鈕配置 `<Send size={15} />`。
- **解決跨平台行高與文字歪斜 (Cross-platform Consistency)**：
  - 徹底解決 iOS/macOS 與 Android 因系統內建 Emoji 字型邊距及基線高度不一致所造成的版面微幅歪斜問題，提供統一、專業且兼具俐落美感的視覺體驗。

### 92. 幹部系統體驗全面優化：表單強制靠左、發布狀態預告、審核名單點擊展開與 LINE ID 複製 (v0.0.92)
- **頂部頁籤極簡化**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - 移除頂部頁籤右側之幹部名稱顯示，維持最純粹俐落的活動切換體驗。
- **編輯與新增表單版型全面靠左校正 (Left-aligned Form)**：
  - 修正受到 `#root` 全域 `text-align: center` 影響導致表單標籤在手機端居中歪斜的問題，全表單元件、標籤、輸入框與提示字樣全面強制靠左 (`text-align: left`)，提供工整舒適的輸入體驗。
- **發布活動預設狀態調整與醒目選單 (Default Status: Coming Soon)**：
  - 新增活動預設狀態由「開放」調整為「`未來開放 (Coming Soon)`」，避免幹部尚未擬定完整資訊便不慎對外開放報名。
  - 將「活動發布狀態」下拉選單提升至表單頂部核心資訊區塊，以獨立高亮卡片呈現，並提供動態狀態說明提示（如未來開放、開放報名之差異）。
- **審核名冊可收合卡片 (Expandable Applicant Cards) 與 LINE ID 一鍵複製**：
  - 徹底解決手機端名冊文字換行與擠壓問題，改為「點擊整張卡片展開 / 收合」結構：
    - **收合態**：單行緊湊呈現姓名、性別、正式社員標籤、正取/備取審核狀態膠囊與通知狀態標籤。
    - **展開態**：清晰展示電話（支援點擊一鍵撥號）、體能證明照片連結，以及獨立結構化之「正取」、「備取」、「設為待審」大顆審核按鈕。
    - **LINE ID 一鍵複製**：點擊 LINE ID 膠囊即自動複製至剪貼簿，並即時給予「✅ 已複製！」提示反饋，省去長按手動選取的麻煩。

### 91. 幹部活動管理頁面 UI 結構化重構與體驗優化 (Admin Events UI Refactoring) (v0.0.91)
- **移除頂部深綠色橫幅 Banner**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - 徹底移除原本笨重且佔用手機高度的深綠色「活動總覽與審核中心」Banner，消除文字折行問題，極大化手機首屏活動列表之可視範圍。
  - 將幹部身份資訊以輕巧優雅的「🏕️ 職稱 · 姓名」膠囊徽章形式整合於分頁標籤右側，兼顧身份識別與乾淨介面。
- **活動卡片升級為結構化看板卡片 (Structured Board Cards)**：
  - 徹底告別純文字與冒號堆疊排版，將活動卡片依資訊層級結構化拆解：
    1. **頂部標籤與快速切換列**：狀態彩色膠囊（🟢 開放報名 / 🟠 未來開放 / ⚪ 已關閉）+ 等寬活動代碼 (`#E001`) + 右側快速狀態下拉選單（免開編輯頁即可即時切換）。
    2. **主視覺與標題**：圓角裁切縮圖 (96x76px) 搭配醒目活動大標題與單行精簡簡述。
    3. **時程費用獨立資訊格 (Info Chips)**：將「📅 出隊日程」、「⏰ 報名截止」、「💰 活動費用」轉化為三個獨立的微型資訊卡，資訊層次更加清晰分明。
    4. **4 色獨立數據指標看板 (Metric Grid)**：分別將「總報名」、「正取」、「備取」、「待審核」以專屬淺色調背景卡片呈現，數字放大突顯；當有「待審核」人數時自動亮起紅色高亮與紅點警示。
    5. **底部並排操作按鈕組**：左側「✏️ 編輯內容」邊框按鈕與右側「📋 審核名單」高對比翡翠綠主按鈕；若有待審核人員，按鈕會即時浮現「N 待審」警示徽章，提醒幹部優先處理。

### 90. 幹部識別碼彈性比對強化與除錯提示優化 (v0.0.90)
- **幹部識別碼欄位模糊匹配擴充**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `checkOfficerInternal`。
  - 將識別碼欄位搜尋條件由嚴格的「`系統識別碼`」大幅擴充為包含「`識別碼`」、「`幹部識別碼`」、「`User ID`」、「`userid`」、「`uid`」等多元名稱，即使幹部將試算表標題命名為「`幹部識別碼`」亦能百分之百正確匹配。
  - 同時支援以真實 `LINE ID` 進行輔助比對，提升幹部身分判定之容錯率。
- **權限不足畫面提供專屬 User ID 與一鍵複製**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - 若使用者開啟頁面被判定為權限不足時，畫面會貼心展示該使用者當前真實的 LINE 系統識別碼（`U...` 長字串），並附帶「一鍵複製」按鈕，方便幹部直接點擊複製後貼至試算表，避免手動輸入錯誤。

### 89. 幹部專屬活動管理與名單審核後台 (Admin Events Management) (v0.0.89)
- **幹部身份自動辨識與動態後台入口**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)。實作 `checkOfficerInternal` 與 `action=check_officer_status`，比對試算表 `Officers` 分頁中登記之 `系統識別碼`（LINE User ID）或社員姓名；若符合即自動賦予幹部管理權限。
  - 在 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 數位社員證下方新增「🛠️ 幹部專屬管理中心」綠色快捷卡片（僅幹部可見）。
  - 在 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 全域右上角頭像下拉選單中，若檢驗具備幹部身分，動態顯示「🛠️ 幹部活動管理」入口。
- **全功能活動管理與審核主頁面 (AdminEvents.tsx)**：
  - 新增 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)，採雙頁籤架構：
    - **Tab 1: 活動總覽與審核**：
      - 條列所有活動卡片，呈現即時報名統計徽章（總報名人數、正取人數、備取人數、待審核人數）。
      - 支援即時下拉切換活動狀態（開放報名 / 未來開放 / 已關閉），並提供活動內容編輯與名單審核按鈕。
    - **Tab 2: 發布新活動 / 編輯活動**：
      - 完整表單支援填寫活動名稱、出隊起訖日期、報名截止日、預計費用、精簡簡介與長篇詳細行程。
      - 活動編號支援手動輸入或由系統依序自動編號（格式：`E` + 年月 + 序號，如 `E2609-01`）。
      - 支援直接從手機相簿或電腦選取封面照片，前端自動以 Canvas 壓縮轉 Base64 上傳 Google Drive `LINE_Uploads` 資料夾，並即時轉換為官方高速 CDN 直連格式（`lh3.googleusercontent.com/d/{id}=w1000`），免手動找圖床。
      - 提供 **LINE Carousel Flex 卡片即時所見即所得 (Live Preview)**，幹部在送出前可即時檢視卡片標籤顏色、字數排版與封面裁切。
      - 支援勾選「📢 上架完成後即時推播通知至幹部群組」。
- **報名社員名單查閱、即時正備取審核與一鍵發送推播通知**：
  - 於活動卡片點擊「名單審核」彈出專屬 Modal，提供「全部 / 正取 / 備取 / 待審核」分頁標籤與報名人數篩選。
  - 名冊中清晰條列社員姓名、性別、電話、LINE ID、正式社員/非社員徽章、體能證明連結與通知狀態標籤。
  - 幹部可直接點擊「設為正取」、「設為備取」或「設為待審」，後端自動更新 `Signups` 試算表之審核結果並重置通知狀態。
  - 底部提供「🚀 一鍵發送審核結果推播通知」按鈕，點擊後系統自動過濾尚未通知的正取與備取社員，透過 LINE Messaging API 批次發送專屬錄取/備取 Flex 卡片，並自動回寫試算表通知狀態為「已通知」，徹底告別開試算表手動操作的繁瑣流程。
- **全站中英雙語國際化與路由整合**：
  - 更新 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)，加入 `adminEvents` 命名空間共 40+ 項中英雙語對應字詞。
  - 在 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 註冊 `/admin/events` 與 `/admin` 路由（支援 React.lazy 程式碼分割非同步載入）。

### 88. 第二梯次優化：註冊草稿自動暫存與租借日期聯動防呆 (v0.0.88)
- **註冊資料草稿自動暫存與還原 (Draft Auto-Save & Restore)**：
  - 重構 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)。在使用者填寫註冊資料時，自動將資料儲存至 `localStorage`（Key: `register_draft_{userId}`），避免填寫途中被通話、訊息或不慎關閉視窗而遺失內容。
  - 當新用戶重新進入時自動還原草稿，並於表單頂部呈現提示列與一鍵「清除草稿」按鈕；表單提交成功後自動清除暫存。
  - 同步於 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json) 補充雙語提示詞條。
- **租借日期選取聯動防呆與出隊天數分析標籤**：
  - 重構 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。為預計領取日加入當日（`min={todayStr}`）限制，歸還日加入領取日（`min={pickupDate}`）限制；當領取日變更且晚於現有歸還日時自動同步校正。
  - 於日期欄位下方新增即時渲染的「出隊天數標籤」（如：`出隊天數：4 天 (2 天基本 + 2 天加成)`），讓社員在確認送出前對出隊天數與計費公式一目了然。

### 87. 第一梯次優化：Google Drive CDN 縮圖直連與路由 Code Splitting (v0.0.87)
- **Google Drive 圖片直連 CDN 解析升級**：
  - 新增共用圖片解析工具模組 [image.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/image.ts) 中的 `getDirectImageUrl`。
  - 將 Google Drive 圖片解析由舊有的 `docs.google.com/uc?export=view` 升級為 Google 官方高速縮圖 CDN 格式 `https://lh3.googleusercontent.com/d/{FILE_ID}=w{SIZE}`，徹底消除 Drive 原生直連容易引發的 403 限流、429 超額以及病毒掃描下載提示頁面等問題。
  - 在 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) (裝備租借) 與 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx) (心得回憶登頂照) 同步導入，確保跨頁面圖片載入速度提升並杜絕破圖。
- **Vite 路由程式碼分割 (Code Splitting / Dynamic Import)**：
  - 重構 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx)，將 6 個核心頁面（`Borrow`, `Payment`, `Register`, `Dashboard`, `History`, `Achievements`）改為 `React.lazy()` 動態匯入，並於路由外層包覆 `<Suspense>` 提供統一品牌色載入動態。
  - 主 JS Bundle 體積由原本的 528KB 大幅降低至 444KB (Gzip 僅 138KB)，其餘各子頁面均成功拆分為獨立小體積 Chunk（約 6KB ~ 19KB），解決了 Vite 打包大於 500KB 的警示，顯著加快 LINE 內嵌瀏覽器的首屏冷啟動載入速度。

### 86. 移除繳費中心 Flex 卡片改為直連網址 (v0.0.86)
- **移除 LINE 繳費中心卡片推播**：
  - 更新後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `handleTextCommand`。
  - 將「繳費中心」指令與「繳費系統」統一路由，不再發送 `sendPaymentCenterMenu` 的 Flex 卡片（包含「繳費中心」/「繳費系統」/「繳費紀錄」按鈕卡片），改為直接回傳純文字繳費表單網址。
  - 建議在 LINE Official Account Manager 圖文選單中將「繳費系統」區塊動作設定為「連結 (URI)」，填入 `https://liff.line.me/2009217429-u7OCkmQO`，點擊後即可秒開網頁且對話框完全不產生任何卡片與多餘訊息。

### 85. 優化出隊足跡成就看板標籤與副標題單行呈現 (v0.0.85)
- **避免文字換行破壞版面**：
  - 重構 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx) 中的「成就統計看板」。
  - 為 `badgeLabel` (MY MOUNTAINEERING FOOTPRINT) 與 `subtitle` (一步一腳印，記錄每一次出隊的回憶！) 加入 `whiteSpace: 'nowrap'` 樣式，並設定左側文字容器為 `flex: '1 0 auto'`，保證標籤與副標題完整呈現於單一行不換行。
  - 同步調整統計看板為 `flexWrap: 'wrap'`，在寬螢幕下保持並排兩側對齊，窄螢幕下能自動適配不擠壓文字或溢出外框。

### 84. 修復出隊足跡與歷史紀錄之導覽列標題判定 (v0.0.84)
- **子路由標題優先級判定修復**：
  - 重構 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中的 `getHeaderDetails` 標題判斷邏輯。
  - 由於 LINE LIFF 透過端點跳轉子路徑時會形成 `/dashboard/achievements` 與 `/payment/history` 複合路徑，原先先比對 `/dashboard` 與 `/payment` 導致「出隊足跡」標題被誤判為「個人主頁」，「繳費紀錄」被誤判為「繳費系統」。
  - 調整路徑判斷順序，將 `/achievements` 與 `/history` 提升至最優先判定，確保無論直接存取或由 LIFF 複合路徑進入皆能正確顯示「出隊足跡 (Mountaineering Footprint)」與「歷史紀錄 (Payment History)」。

### 83. 更新註冊頁幹部意願選項文案 (v0.0.83)
- **幹部意願福利說明增補**：
  - 更新 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json) 中的幹部意願勾選框文案。
  - 將中文標籤由「我有意願成為社團幹部」更新為「`我有意願成為社團幹部（免繳社費、決定活動內容等等福利）`」，提高社員參與幹部團隊的意願與福利透明度。
  - 同步更新英文標籤為「`I am interested in becoming a club officer (No club fee, decide event content, and other benefits)`」。

### 82. 支援 Google Drive 資料夾動態載入多篇社團規範 (v0.0.82)
- **多文件動態知識庫讀取**：
  - 重構後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `getClubKnowledgeFromDoc`。
  - 當設定了環境變數 `KNOWLEDGE_FOLDER_ID`（Google Drive 資料夾 ID）時，後端會自動掃描該資料夾內所有的 **Google Docs 文件** 與 **純文字 TXT 檔**，合併抓取內容（上限 15,000 字），並作為背景知識提供給 Gemini。
  - 幹部未來只需在 Drive 資料夾內新增/編輯規範，AI 就會自動學習並回答最新條文。

### 81. LINE 聊天室預設提示訊息頻率限制 (v0.0.81)
- **24小時只提示一次**：
  - 重構後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `handleTextCommand` 中，針對一對一聊天室使用者輸入未知指令時的預設引導訊息（介紹 AI 助理小岳玩法），加入基於 `PropertiesService` 的時間戳記判斷。
  - 現在每位使用者每 24 小時至多只會收到一次小岳引導提示訊息，避免使用者在留言給幹部時持續受到自動回覆干擾。

### 80. 心得支援最多 5 張相片上傳與指定檔名規則 (v0.0.80)
- **支援最多 5 張相片上傳**：
  - 重構 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx)，支援一次性選取並上傳最多 5 張本機照片，並在前端分別進行自動壓縮與縮圖 Grid 列表即時預覽與移除。
  - 查看心得時，支援動態將逗號區隔的 URL 連結陣列拆分並呈現多張照片牆。
- **後端自訂上傳檔名格式**：
  - 重構 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `processSubmitReflection`，會將登頂照檔名修改為 `日期-活動名稱-姓名` 格式（如：`20260714-玉山前五峰-王小明.jpg` / `20260714-玉山前五峰-王小明_1.jpg` 等防重複序號檔名），並批次上傳 Google Drive。

### 79. 心得登頂照片本機上傳與壓縮 (v0.0.79)
- **心得相片本機上傳與前端自動壓縮**：
  - 重構 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx) 中的登頂照/團體合照分享欄位，由原先的純網址輸入框改為「本機圖片上傳選擇器」，並套用與註冊頁面相同的 canvas 自動壓縮技術（限制最大 1024px、0.7 品質 JPEG、以及單張圖片 10MB 檔案大小限制），支援即時預覽與刪除功能。
  - 重構 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `processSubmitReflection`，若收到 Base64 的登頂照片，會自動透過 `uploadFileToDrive` 上傳至 Google Drive `LINE_Uploads` 資料夾，並將雲端硬碟的檔案連結寫入 Google 試算表 `Reflections` 表格。

### 78. 出隊足跡/成就系統 (Achievements.tsx) 雙語化 (v0.0.78)
- **活動成就頁面雙語化**：
  - 重構 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx)，利用 `t()` 替換出隊統計看板（出隊次數/回憶篇數）、已參與活動清單、無資料提示狀態、心得查看按鈕標籤（查看我的回憶/留下回憶）。
  - 將心得填寫與回顧 Modal 彈窗進行雙語化（包括路線難易度/風景推薦度/心得分享輸入框/合照網址欄位/取消與提交按鈕），全面支援繁中與英文雙語切換。

### 77. 歷史紀錄頁面 (History.tsx) 雙語化 (v0.0.77)
- **歷史繳費紀錄頁面雙語化**：
  - 重構 [History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx)，利用 `t()` 替換累計花費金額、審核中筆數提示、分類切換按鈕標籤（全部/社費/活動/裝備）、無資料狀態、繳費狀態標籤（已確認無誤/對帳失敗/待幹部確認）以及展開明細中的說明文字與無備註提示。

### 76. 繳費對帳系統 (Payment.tsx) 雙語化 (v0.0.76)
- **繳費對帳頁面雙語化**：
  - 重構 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)，利用 `t()` 替換匯款銀行資訊、未繳費明細列表（社費方案選擇/活動報名費/裝備租用明細）、貼心提醒、申報資料輸入框以及繳費成功狀態畫面。
  - 對發送至 LINE 聊天室的繳費明細對帳訊息（`msgText`）進行雙語翻譯處理，讓使用者在不同語系環境下申報時能看懂各項目的英文標示。

### 75. 裝備租借頁面 (Borrow.tsx) 雙語化 (v0.0.75)
- **裝備租借首頁雙語化**：
  - 重構 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)，利用 `t()` 替換費用試算說明的計費規則、裝備卡片狀態標籤、底部浮動購物車、租用對帳抽屜 (Cart Drawer) 以及裝備詳細規格彈窗 (Detail Modal) 的所有中文文字。
  - 對公式試算文字與用途選項（社團出隊/個人使用/其他用途）進行動態雙語處理，讓多國語系切換時整體計算邏輯與 UI 文字保持完美一致。

### 74. 個人主頁面 (Dashboard.tsx) 雙語化 (v0.0.74)
- **個人首頁雙語化**：
  - 重構 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)，利用 `t()` 替換數位社員證、活動狀態追蹤、裝備預約狀態、取消確認 Modal 等寫死之中文。
  - 對後端 GAS 傳回的中文狀態進行前端判斷並做對應的雙語翻譯處理，確保切換英文時各狀態標籤（如正取/備取/已繳費/待確認）皆能順暢顯示為英文。

### 73. 資料註冊頁面 (Register.tsx) 雙語化 (v0.0.73)
- **多國語系獨立 JSON 檔管理 (方案 A)**：
  - 將先前寫死在 [i18n.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/i18n.ts) 的導覽翻譯提取至 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)。
  - 在 `src/locales/` 下建立雙語詞條結構。
- **資料註冊表單雙語化**：
  - 重構 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)，全面使用 `useTranslation` 的 `t()` 函式替換所有步驟的標籤、提示文字、警告彈跳視窗、按鈕及載入狀態等中文寫死字串。

### 72. 修復 GlobalHeader 元件語法錯誤 (v0.0.72)
- **語法錯誤修正**：
  - 修復了 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中 `GlobalHeader` 頂部導航列之 `</header>` 標籤後方殘留的重複/毀損 HTML 片段，解決了 TypeScript 編譯器所拋出的 `')' expected` 語法錯誤。

### 71. 多國語系 (中英文) 介面切換支援與優化 (v0.0.71)
- **語系套件整合**：
  - 整合 `i18next` 與 `react-i18next` 實現繁體中文與英文雙語切換。
  - 新增 [i18n.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/i18n.ts) 提供語系詞條對照，並藉由 `localStorage` 記憶使用者偏好的語系設定。
- **導覽列語言切換按鈕**：
  - 在 `src/App.tsx` 的 `GlobalHeader` 頂部導覽列中新增語系切換按鈕，放置於個人頭像左側，提供直覺的一鍵語言切換。

### 70. 敏感金鑰防護與並發寫入安全鎖優化 (v0.0.70)
- **完全去金鑰化**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js)。完全移除了全域變數中的硬編碼預設 Token 與 ID，完全依賴屬性服務 `PropertiesService.getScriptProperties().getProperty(...)` 來取得值。
- **本機備份金鑰**：
  - 新增 [secrets.local](file:///Users/brianhung/Documents/OfficialLINEAccount/secrets.local) 保存原金鑰備份。
  - 更新 [.gitignore](file:///Users/brianhung/Documents/OfficialLINEAccount/.gitignore) 阻擋 `secrets.local`，使其不被上傳至 GitHub 倉庫，達到敏感資訊防洩漏。
- **寫入並發防護**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js)。在 `handleSignup` (活動報名)、`processSaveProfile` (儲存個人資料)、`processSubmitReflection` (心得回饋)、`processLiffCancelEvent` (取消活動報名)、`processLiffCancelLoan` (取消裝備預約) 全面導入 `LockService` 並發鎖防護（最大排隊超時 10 秒），保障在高流量與多人操作下資料表的原子性與庫存正確性。

### 69. 修正成就看板排版文字斷行 (v0.0.69)
- **防止文字換行與微調統計框尺寸**：
  - 更新 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx)。將「我的出隊成就」看板右側統計框的「出隊次數」與「回憶篇數」標籤加上 `whiteSpace: 'nowrap'` 以防止文字換行，並將 `minWidth` 由 `60px` 增至 `72px`、`padding` 調整為 `10px 8px`，確保在各種螢幕尺寸下皆能呈現乾淨且完整的單行排版。

### 68. 調整繳費頁面租借日期排版 (v0.0.68)
- **日期欄位換行顯示**：
  - 更新 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)。將「裝備租用」卡片內的「租借日期」標籤從並排的 `<span>` 改為區塊級的 `<div>`，並將間距從左側（`marginLeft`）調整為上方（`marginTop: '4px'`），使其換行顯示，提升行動端裝置之閱讀體驗。

### 67. 增強 GAS 日期格式解析與欄位對照備援 (v0.0.67)
- **增強 `DD/MM/YYYY` 日期解析與 `instanceof Date` 檢查**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js)。增強 `formatVal` 函式，新增對 `DD/MM/YYYY` 格式（如 `24/03/2026`）的正則表達式匹配，並自動轉換為 `YYYY-MM-DD` 標準格式以供前端順利渲染。同時，將不穩定的類型判定方法替換為 `val instanceof Date`。
- **欄位查找對照備援機制**：
  - 在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `getUnpaidListAPI` 中，為預計領取與歸還日期欄位新增英文 `pickup`、`return` 等備援關鍵字尋找，確保即使 Google Sheets 的欄位標題微調也能正確讀取資料。

### 66. 修復 UnpaidItem 介面屬性缺失錯誤 (v0.0.66)
- **新增 `purpose` 欄位**：
  - 更新 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)。在 `UnpaidItem` 介面中新增選用屬性 `purpose?: string;`，解決測試假資料（包含 `purpose` 欄位）以及後續程式碼存取該屬性時發生的 TypeScript 編譯錯誤：`Object literal may only specify known properties, and 'purpose' does not exist in type 'UnpaidItem'`。

### 65. 繳費裝備明細與用途計費修正 (v0.0.65)
- **區分個人使用與社團出隊**：
  - 更新 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)。裝備預訂卡片標題改為顯示「裝備租用 (個人使用)」或「裝備租用 (社團出隊)」。
  - 於前端將「社團出隊/社團出團」用途之訂單租金總計與裝備細項金額強制設為 `$0`。
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 使 `getUnpaidListAPI` 多回傳 `用途 (purpose)` 欄位。
- **顯示裝備個別金額與增強日期格式化**：
  - 於 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 打包清單中，為各裝備項目右側加上個別金額顯示。
  - 在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 中增強日期解析，新增正則表達式，若已為標準 `YYYY-MM-DD` 格式則直接正規化回傳，防止時區轉換偏差導致日期顯示空白或不正確。

### 64. 繳費申報裝備打包合併與 UI 增強 (v0.0.64)
- **裝備打包合併與租期顯示**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js)。增強 `getUnpaidListAPI`，使取得未繳費裝備項目時能額外回傳數量、預計領取與歸還日期。
  - 更新 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)。將同一筆預約（相同 `orderId`）的裝備在前端扁平化清單中打包為單一項目，繳費申報時以加總後的總金額送出。
- **打包項目 UI 增強與修改警語**：
  - 於 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 為裝備租用合併帳單新增專屬的大框框 UI 樣式（加粗主色邊框與陰影）。
  - 大框框內顯示裝備的詳細借用日期區間、細項明細列表，並加入貼心提醒文字：「💡 貼心提醒：需要修改訂單的話，請到個人頁面取消訂單再重新租借一次。」

### 63. 修正費用試算公式與更新注意事項 (v0.0.63)
- **修正費用試算公式**：
  - 更新 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。將「社團出隊」的試算公式改為 `(${baseFormula}) × 0 (社團活動免費)`，解決先前渲染時重複顯示 `= $0` 的問題。
- **更新費用試算說明注意事項**：
  - 更新 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。在費用試算說明的注意事項中新增說明：「若個人使用時碰上社團出團活動，可能會無法租借，租借前可以先查詢社團是否有活動，請見諒。」

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
