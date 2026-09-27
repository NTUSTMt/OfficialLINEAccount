import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('useAdvancedTable.ts 與 WebAdminRoster.tsx 欄寬拖曳閉包安全保護，杜絕 mouseup 異步空指標白屏 (v0.1.241)', async () => {
  const useAdvancedTableCode = fs.readFileSync(
    path.join(rootDir, 'src/components/admin/useAdvancedTable.ts'),
    'utf-8'
  );
  const rosterCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/WebAdminRoster.tsx'),
    'utf-8'
  );

  // 1. useAdvancedTable: 閉包宣告 targetKey，且 setColumnWidths 中不可存在 resizingRef.current!.key
  assert.match(
    useAdvancedTableCode,
    /const targetKey = key;/,
    'useAdvancedTable 必須宣告 targetKey 閉包區域變數'
  );
  assert.doesNotMatch(
    useAdvancedTableCode,
    /resizingRef\.current!\.key/,
    'useAdvancedTable 不得在非同步 updater 中存取 resizingRef.current!.key'
  );

  // 2. WebAdminRoster: 閉包宣告 targetKey，且 setColumnWidths 中不可存在 resizingRef.current!.key
  assert.match(
    rosterCode,
    /const targetKey = key;/,
    'WebAdminRoster 必須宣告 targetKey 閉包區域變數'
  );
  assert.doesNotMatch(
    rosterCode,
    /resizingRef\.current!\.key/,
    'WebAdminRoster 不得在非同步 updater 中存取 resizingRef.current!.key'
  );
});

test('webAdmin.css 徽章、下拉選單與表格儲存格防溢出與截斷樣式 (v0.1.241)', async () => {
  const cssCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/webAdmin.css'),
    'utf-8'
  );

  // 1. web-admin-badge 具備 max-width, overflow, text-overflow, box-sizing
  assert.match(cssCode, /\.web-admin-badge\s*\{[\s\S]*?max-width:\s*100%;/i);
  assert.match(cssCode, /\.web-admin-badge\s*\{[\s\S]*?overflow:\s*hidden;/i);
  assert.match(cssCode, /\.web-admin-badge\s*\{[\s\S]*?text-overflow:\s*ellipsis;/i);
  assert.match(cssCode, /\.web-admin-badge\s*\{[\s\S]*?box-sizing:\s*border-box;/i);

  // 2. wa-table-select 具備 width, max-width, overflow, text-overflow, box-sizing
  assert.match(cssCode, /\.wa-table-select\s*\{[\s\S]*?width:\s*100%;/i);
  assert.match(cssCode, /\.wa-table-select\s*\{[\s\S]*?max-width:\s*100%;/i);
  assert.match(cssCode, /\.wa-table-select\s*\{[\s\S]*?overflow:\s*hidden;/i);
  assert.match(cssCode, /\.wa-table-select\s*\{[\s\S]*?text-overflow:\s*ellipsis;/i);
  assert.match(cssCode, /\.wa-table-select\s*\{[\s\S]*?box-sizing:\s*border-box;/i);

  // 3. .web-admin-table td 具備 box-sizing: border-box 與 overflow: hidden
  assert.match(cssCode, /\.web-admin-table\s+td\s*\{[\s\S]*?box-sizing:\s*border-box;/i);
  assert.match(cssCode, /\.web-admin-table\s+td\s*\{[\s\S]*?overflow:\s*hidden;/i);
});

test('WebAdminFinance 與 WebAdminInventory 表格嚴格基底樣式 baseTdStyle 與寬度限制 (v0.1.241)', async () => {
  const financeCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx'),
    'utf-8'
  );
  const inventoryCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/WebAdminInventory.tsx'),
    'utf-8'
  );

  // 1. WebAdminFinance baseTdStyle 宣告與屬性
  assert.match(
    financeCode,
    /const baseTdStyle:\s*React\.CSSProperties\s*=\s*\{[\s\S]*?width:\s*`\$\{width\}px`,[\s\S]*?minWidth:\s*`\$\{width\}px`,[\s\S]*?maxWidth:\s*`\$\{width\}px`,[\s\S]*?boxSizing:\s*'border-box',[\s\S]*?overflow:\s*'hidden'/i,
    'WebAdminFinance 必須定義包含 width, minWidth, maxWidth, boxSizing, overflow 的 baseTdStyle'
  );

  // 2. WebAdminInventory baseTdStyle 宣告與屬性
  assert.match(
    inventoryCode,
    /const baseTdStyle:\s*React\.CSSProperties\s*=\s*\{[\s\S]*?width:\s*`\$\{width\}px`,[\s\S]*?minWidth:\s*`\$\{width\}px`,[\s\S]*?maxWidth:\s*`\$\{width\}px`,[\s\S]*?boxSizing:\s*'border-box',[\s\S]*?overflow:\s*'hidden'/i,
    'WebAdminInventory 必須定義包含 width, minWidth, maxWidth, boxSizing, overflow 的 baseTdStyle'
  );
});

test('驗證 v0.1.242: actions 欄寬縮小、名冊 baseTdStyle、登山格式自適應、個資大圖置中與破冰機制', async () => {
  const financeCode = fs.readFileSync(path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx'), 'utf-8');
  const inventoryCode = fs.readFileSync(path.join(rootDir, 'src/pages/web-admin/WebAdminInventory.tsx'), 'utf-8');
  const rosterCode = fs.readFileSync(path.join(rootDir, 'src/pages/web-admin/WebAdminRoster.tsx'), 'utf-8');
  const modalCode = fs.readFileSync(path.join(rootDir, 'src/components/admin/MemberProfileModal.tsx'), 'utf-8');
  const registerCode = fs.readFileSync(path.join(rootDir, 'src/pages/Register.tsx'), 'utf-8');

  // 1. actions 欄位寬度改為 50 / 44
  assert.match(financeCode, /key:\s*'actions',\s*label:\s*'操作',\s*defaultWidth:\s*50,\s*minWidth:\s*44/);
  assert.match(inventoryCode, /key:\s*'actions',\s*label:\s*'操作',\s*defaultWidth:\s*50,\s*minWidth:\s*44/);

  // 2. 財務對帳抽屜中包含 wa-drawer-side-preview 左側同級大圖預覽
  assert.match(financeCode, /className="wa-drawer-side-preview"/);
  assert.match(financeCode, /匯款單據 \/ 證明照片預覽/);

  // 3. WebAdminRoster 包含 baseTdStyle，且 status select 不再寫死 minWidth: 140
  assert.match(rosterCode, /const baseTdStyle:\s*React\.CSSProperties/);
  assert.doesNotMatch(rosterCode, /col\.key === 'status'[\s\S]*?minWidth:\s*140/);

  // 4. MemberProfileModal 移除深藍色標題列與折疊，移除緊急留守附加資訊，欄位標籤自適應寬度
  assert.doesNotMatch(modalCode, /隊員資料 \(臺灣登山申請格式\)/);
  assert.doesNotMatch(modalCode, /緊急留守附加資訊/);
  assert.match(modalCode, /minWidth:\s*'fit-content'/);
  assert.match(modalCode, /alignSelf:\s*'center'/);
  assert.match(modalCode, /avatarUrl && !avatarImgError/);

  // 5. Register.tsx 包含 LIFF sendMessages 破冰發話
  assert.match(registerCode, /liff\.sendMessages\(/);
  assert.match(registerCode, /我已完成個人資料填寫/);
});

test('驗證 v0.1.243: MemberProfileModal 登山申請格式與結構化區塊設置 flexShrink: 0 防截斷', async () => {
  const modalCode = fs.readFileSync(path.join(rootDir, 'src/components/admin/MemberProfileModal.tsx'), 'utf-8');

  // wa-mountain-permit-card 必須設置 flexShrink: 0
  assert.match(
    modalCode,
    /className="wa-mountain-permit-card"[\s\S]*?flexShrink:\s*0/,
    'wa-mountain-permit-card 必須包含 flexShrink: 0 避免在 Flexbox 中被壓縮截斷'
  );

  // renderDesktopOtherSections 必須包含 flexShrink: 0
  assert.match(
    modalCode,
    /const renderDesktopOtherSections\s*=\s*\(\)\s*=>\s*\{[\s\S]*?flexShrink:\s*0/,
    'renderDesktopOtherSections 外層容器必須包含 flexShrink: 0'
  );

  // innerContent 標題欄與底部按鈕容器也必須包含 flexShrink: 0
  assert.match(
    modalCode,
    /\{\/\* 標題欄 \*\/\}[\s\S]*?flexShrink:\s*0/,
    'innerContent 標題欄必須包含 flexShrink: 0'
  );
  assert.match(
    modalCode,
    /\{\/\* 底部按鈕：開啟詳細資料編輯頁面 \*\/\}[\s\S]*?flexShrink:\s*0/,
    '底部按鈕外層容器必須包含 flexShrink: 0'
  );
});

test('驗證 v0.1.244: 國籍 Supabase 直更補底、請選擇與其他中英文獨立、國旗與母語格式', async () => {
  const supabaseClientCode = fs.readFileSync(path.join(rootDir, 'src/utils/supabaseClient.ts'), 'utf-8');
  const registerCode = fs.readFileSync(path.join(rootDir, 'src/pages/Register.tsx'), 'utf-8');
  const zhJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/locales/zh.json'), 'utf-8'));
  const enJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/locales/en.json'), 'utf-8'));
  const sqlCode = fs.readFileSync(path.join(rootDir, 'supabase/fix_save_member_profile_nationality.sql'), 'utf-8');

  // 1. supabaseClient.ts directUpdatePayload 必須包含 nationality 直更
  assert.match(
    supabaseClientCode,
    /const directUpdatePayload:\s*Record<string,\s*any>\s*=\s*\{[\s\S]*?nationality:\s*\(formData\.nationality \|\| ''\)\.trim\(\)/,
    'supabaseClient.ts 必須在 directUpdatePayload 中包含 nationality 直更'
  );

  // 2. Register.tsx nationality 預設值為空字串，且選單具備請選擇 disabled option
  assert.match(
    registerCode,
    /nationality:\s*'',/,
    'Register.tsx 初始狀態 nationality 必須為空字串，不可寫死中華民國'
  );
  assert.match(
    registerCode,
    /<option value="" disabled>\s*\{t\('register\.step1\.nationalityDefault'/,
    'Register.tsx 必須具備請選擇 disabled option'
  );

  // 3. 中英文語系獨立，絕不混合顯示
  assert.equal(zhJson.register.step1.nationalityLabel, '國籍');
  assert.equal(zhJson.register.step1.nationalityDefault, '請選擇');
  assert.equal(zhJson.register.step1.nationalityOther, '其他 (自行輸入)');
  assert.equal(enJson.register.step1.nationalityLabel, 'Nationality');
  assert.equal(enJson.register.step1.nationalityDefault, 'Please Select');
  assert.equal(enJson.register.step1.nationalityOther, 'Other (Please specify)');

  // 4. SQL 遷移包含 nationality
  assert.match(sqlCode, /nationality,\s*line_id/);
  assert.match(sqlCode, /nationality\s*=\s*COALESCE\(EXCLUDED\.nationality,\s*members\.nationality\)/);
});

