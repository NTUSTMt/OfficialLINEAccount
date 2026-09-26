import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('裝備序號自動產生遵循 Gxxx 格式 (e.g. G006)', async () => {
  const supabaseClientCode = fs.readFileSync(
    path.join(rootDir, 'src/utils/supabaseClient.ts'),
    'utf-8'
  );

  // 驗證正規表示式匹配 ^G(\\d+)$
  assert.match(
    supabaseClientCode,
    /\^G\(\\d\+\)\$/,
    'getNextEquipmentIdFromSupabase 必須使用 ^G(\\d+)$ 識別標準裝備序號'
  );

  // 驗證產生 Gxxx 三位數格式 (padStart(3, '0'))
  assert.match(
    supabaseClientCode,
    /`G\$\{String\(nextNum\)\.padStart\(3, '0'\)\}`/,
    '裝備序號應格式化為 Gxxx (例如 G001, G006)'
  );
});

test('WebAdminInventory 完全移除裝備相片標題，並採用 wa-icon-action-btn 與固定表格版面', async () => {
  const inventoryCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/WebAdminInventory.tsx'),
    'utf-8'
  );

  // 驗證已無「裝備相片」標題
  assert.doesNotMatch(
    inventoryCode,
    /className="wa-form-section-title">裝備相片/,
    'WebAdminInventory 必須完全移除裝備相片之 section title 標題'
  );

  // 驗證操作欄位採用純圖示按鈕 wa-icon-action-btn
  assert.match(
    inventoryCode,
    /className="wa-icon-action-btn"/,
    '操作欄位必須使用無外框懸浮變色之 wa-icon-action-btn'
  );

  // 驗證支援固定版面 tableLayout: fixed 與列高調整
  assert.match(
    inventoryCode,
    /tableLayout:\s*'fixed'/,
    '表格必須設置 tableLayout: fixed 以支援精確欄寬與列高調整'
  );
  assert.match(
    inventoryCode,
    /className="wa-row-resizer"/,
    '序號欄位必須掛載 wa-row-resizer 拖曳手柄'
  );
  assert.match(
    inventoryCode,
    /rowHeights\[item\.id\]/,
    '表格資料列必須套用 rowHeights 高度'
  );
});

test('WebAdminFinance 欄位定義更新、操作欄位純鉛筆圖示、時間戳記與固定表格版面', async () => {
  const financeCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx'),
    'utf-8'
  );

  // 欄位定義包含時間戳記與通知狀態
  assert.match(
    financeCode,
    /label:\s*'時間戳記'/,
    'created_at 欄位標籤必須改名為「時間戳記」'
  );
  assert.match(
    financeCode,
    /key:\s*'notification_status',\s*label:\s*'通知狀態'/,
    'FINANCE_COLUMNS 必須新增 notification_status 通知狀態欄位'
  );
  assert.match(
    financeCode,
    /key:\s*'actions',\s*label:\s*'操作',\s*defaultWidth:\s*80/,
    'actions 操作欄位寬度必須精簡'
  );

  // 表格 tableLayout: fixed 與 wa-row-resizer
  assert.match(
    financeCode,
    /tableLayout:\s*'fixed'/,
    'WebAdminFinance 表格必須設置 tableLayout: fixed'
  );
  assert.match(
    financeCode,
    /className="wa-row-resizer"/,
    'WebAdminFinance 序號欄位必須掛載 wa-row-resizer'
  );
  assert.match(
    financeCode,
    /rowHeights\[item\.id\]/,
    'WebAdminFinance 表格資料列必須套用 rowHeights'
  );

  // 操作欄位僅顯示鉛筆圖示 wa-icon-action-btn
  assert.match(
    financeCode,
    /<button[^>]*className="wa-icon-action-btn"[\s\S]*?<Pencil size=\{13\} \/>[\s\S]*?<\/button>/,
    '操作欄位必須僅顯示純鉛筆圖示按鈕 wa-icon-action-btn，不顯示已核銷文字標籤'
  );
});

test('WebAdminFinance 具備款項說明固定標籤格式、裝備借用滑出與多欄同級並列', async () => {
  const financeCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx'),
    'utf-8'
  );

  // 款項說明固定標籤格式
  assert.match(
    financeCode,
    /wa-tag-activity/,
    '款項說明必須具備 ［活動］ 綠色標籤 wa-tag-activity'
  );
  assert.match(
    financeCode,
    /wa-tag-membership/,
    '款項說明必須具備 ［社費］ 黃色標籤 wa-tag-membership'
  );
  assert.match(
    financeCode,
    /wa-tag-equipment/,
    '款項說明必須具備 ［裝備］ 藍色標籤 wa-tag-equipment'
  );

  // 點擊裝備滑出側邊租借抽屜
  assert.match(
    financeCode,
    /handleOpenLoanDrawer/,
    '點擊裝備租借款項必須調用 handleOpenLoanDrawer'
  );

  // 三欄同級並列架構
  assert.match(
    financeCode,
    /sideLoanItem\s*&&\s*\(\s*<div className="wa-drawer-side-loan"/,
    'wa-drawer-backdrop 必須支援左側同級裝備借用單面板 wa-drawer-side-loan'
  );
  assert.match(
    financeCode,
    /<MemberProfileModal[^>]*mode="inline"/,
    'wa-drawer-backdrop 必須支援中間同級個人詳細資料面板 MemberProfileModal inline 模式'
  );
  assert.match(
    financeCode,
    /<div className="wa-drawer-panel"/,
    'wa-drawer-backdrop 必須保留最右側財務對帳編輯面板'
  );
  assert.match(
    financeCode,
    /<div className="wa-drawer-side-loan"[\s\S]*?<div className="wa-drawer-footer">[\s\S]*?儲存租借狀態[\s\S]*?<\/div>\s*<\/div>/,
    '側邊裝備借用抽屜必須擁有獨立置底的 wa-drawer-footer 與儲存租借狀態按鈕'
  );
});

test('WebAdminFinance 備註顯示對調修正、排序選單與一鍵發送通知', async () => {
  const financeCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx'),
    'utf-8'
  );

  // 備註對調校正：唯讀區顯示「申請人申報備註」，輸入框顯示「幹部核銷內部備註」
  assert.match(
    financeCode,
    /申請人申報備註：<\/span>\s*<div[^>]*>\s*\{editingItem\.notes\}/,
    '唯讀區塊必須顯示申請人申報備註 (editingItem.notes)'
  );
  assert.match(
    financeCode,
    /幹部核銷內部備註[\s\S]*?<textarea[\s\S]*?value=\{drawerNotes\}/,
    '編輯輸入框必須綁定幹部核銷內部備註 (drawerNotes)'
  );

  // 工具列排序方式下拉選單
  assert.match(
    financeCode,
    /title="排序方式"/,
    '工具列必須提供排序方式下拉選單'
  );
  assert.match(
    financeCode,
    /時間戳記：新到舊/,
    '排序方式必須包含時間戳記排序選項'
  );

  // 工具列一鍵發送通知按鈕
  assert.match(
    financeCode,
    /onClick=\{handleBatchNotify\}/,
    '工具列必須具備一鍵發送通知按鈕'
  );
  assert.match(
    financeCode,
    /<span>一鍵發送通知<\/span>/,
    '按鈕文字必須包含一鍵發送通知'
  );
});

test('MemberEditDrawer 個人歷史紀錄重構與展開卡片', async () => {
  const drawerCode = fs.readFileSync(
    path.join(rootDir, 'src/components/admin/MemberEditDrawer.tsx'),
    'utf-8'
  );

  // 標題改為個人歷史紀錄
  assert.match(
    drawerCode,
    /個人歷史紀錄/,
    '抽屜標題與按鈕必須命名為「個人歷史紀錄」'
  );

  // 頂部個人基本資訊小卡
  assert.match(
    drawerCode,
    /wa-record-avatar/,
    '個人歷史紀錄頂部必須包含個人基本資料小卡與頭像'
  );

  // 搜尋與篩選列 NotionFilterBar
  assert.match(
    drawerCode,
    /<NotionFilterBar/,
    '個人歷史紀錄必須整合 NotionFilterBar 搜尋與篩選工具列'
  );

  // 卡片向下展開狀態
  assert.match(
    drawerCode,
    /expandedIds/,
    '歷史紀錄卡片必須支援向下展開更多詳細資訊'
  );
});

test('WebAdminFinance 姓名膠囊溢出截斷、款項說明單行不換行與活動格式一致化 (v0.1.221)', async () => {
  const cssCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/webAdmin.css'),
    'utf-8'
  );
  const financeCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx'),
    'utf-8'
  );
  const portalRpcCode = fs.readFileSync(
    path.join(rootDir, 'supabase/admin_portal_rpc.sql'),
    'utf-8'
  );
  const consistentRpcCode = fs.readFileSync(
    path.join(rootDir, 'supabase/fix_admin_finance_consistent_type_rpc.sql'),
    'utf-8'
  );
  const syncWorkerCode = fs.readFileSync(
    path.join(rootDir, 'gas_modules/05_Sync_Worker.js'),
    'utf-8'
  );
  const gasCode = fs.readFileSync(
    path.join(rootDir, 'src/gas.js'),
    'utf-8'
  );

  // 1. 姓名膠囊 CSS 截斷保護
  assert.match(
    cssCode,
    /\.wa-name-capsule-btn\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?overflow:\s*hidden;/i,
    'wa-name-capsule-btn 必須具備 max-width: 100% 與 overflow: hidden'
  );
  assert.match(
    cssCode,
    /\.wa-name-capsule-btn\s+span\s*\{[\s\S]*?text-overflow:\s*ellipsis;/i,
    'wa-name-capsule-btn span 必須具備 text-overflow: ellipsis 省略截斷'
  );

  // 2. 表格申請人 td 欄寬限制與 hover title
  assert.match(
    financeCode,
    /case 'applicant':[\s\S]*?maxWidth:\s*columnWidths\['applicant'\][\s\S]*?overflow:\s*'hidden'/,
    '申請人欄位 td 必須具備 maxWidth 與 overflow: hidden'
  );

  // 3. 款項說明單行不折行 flexWrap: nowrap
  assert.match(
    financeCode,
    /flexWrap:\s*'nowrap',\s*whiteSpace:\s*'nowrap'/,
    'renderPaymentType 必須採用 flexWrap: nowrap 與 whiteSpace: nowrap'
  );

  // 4. 活動項目字串純化標準化
  assert.match(
    financeCode,
    /replace\(\/\^\[\^\\w\\u4e00-\\u9fa5（\(\]\*活動\[：:\\s\]\*\//,
    'renderPaymentType 必須過濾活動前綴'
  );
  assert.match(
    financeCode,
    /replace\(\/\^活動費用\\s\*\\\(\(\.\*\?\)\\\)\$\//,
    'renderPaymentType 必須過濾「活動費用 (...)」前綴與外層括號'
  );

  // 5. 後端 RPC 格式統一
  assert.match(
    portalRpcCode,
    /'🔸 活動：'\s*\|\|\s*e\.title\s+AS\s+type/,
    'admin_portal_rpc.sql 必須產生一致的 🔸 活動： 格式'
  );
  assert.match(
    consistentRpcCode,
    /'🔸 活動：'\s*\|\|\s*e\.title\s+AS\s+type/,
    'fix_admin_finance_consistent_type_rpc.sql 必須產生一致的 🔸 活動： 格式'
  );

  // 6. GAS Schema 包含 notes
  assert.match(
    syncWorkerCode,
    /"payments":\s*\[[\s\S]*?"notes"[\s\S]*?"officer_notes"/,
    'gas_modules/05_Sync_Worker.js 的 payments 欄位必須包含 notes'
  );
  assert.match(
    gasCode,
    /"payments":\s*\[[\s\S]*?"notes"[\s\S]*?"officer_notes"/,
    'src/gas.js 的 payments 欄位必須包含 notes'
  );
});

test('個人歷史紀錄抽屜與 NotionFilterBar 支援 popoverMode 電腦端懸浮氣泡選單', async () => {
  const notionFilterCode = fs.readFileSync(
    path.join(rootDir, 'src/components/admin/NotionFilterBar.tsx'),
    'utf-8'
  );
  const memberEditDrawerCode = fs.readFileSync(
    path.join(rootDir, 'src/components/admin/MemberEditDrawer.tsx'),
    'utf-8'
  );

  // 1. NotionFilterBar 支援 popoverMode 屬性與預設值
  assert.match(
    notionFilterCode,
    /popoverMode\?: boolean;/,
    'NotionFilterBarProps 必須宣告 popoverMode 屬性'
  );
  assert.match(
    notionFilterCode,
    /popoverMode = false/,
    'NotionFilterBar 必須設定 popoverMode 預設值為 false 確保手機版相容性'
  );

  // 2. NotionFilterBar 懸浮氣泡選單結構
  assert.match(
    notionFilterCode,
    /popoverMode && isFilterOpen && \(/,
    'NotionFilterBar 必須渲染篩選器懸浮氣泡選單'
  );
  assert.match(
    notionFilterCode,
    /popoverMode && isSortOpen && \(/,
    'NotionFilterBar 必須渲染排序器懸浮氣泡選單'
  );
  assert.match(
    notionFilterCode,
    /isFilterOpen && !popoverMode && \(/,
    'NotionFilterBar 底部抽屜僅在非 popoverMode 時渲染'
  );
  assert.match(
    notionFilterCode,
    /isSortOpen && !popoverMode && sortOptions\.length > 0 && onSortChange && \(/,
    'NotionFilterBar 排序抽屜僅在非 popoverMode 時渲染'
  );

  // 3. MemberEditDrawer 啟用 popoverMode
  assert.match(
    memberEditDrawerCode,
    /<NotionFilterBar[\s\S]*?popoverMode=\{true\}[\s\S]*?\/>/,
    'MemberEditDrawer 個人歷史紀錄工具列必須傳入 popoverMode={true}'
  );
});


