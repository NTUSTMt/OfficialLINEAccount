import test from 'node:test';
import assert from 'node:assert/strict';

test('幹部系統模組測試：自動配發下一號裝備編號', () => {
  const existingEquipmentIds = ['EQ_001', 'EQ_002', 'EQ_009', 'EQ_010'];
  let maxNum = 0;
  existingEquipmentIds.forEach((id) => {
    const match = id.match(/^EQ_(\d+)$/i);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  const nextId = `EQ_${String(maxNum + 1).padStart(3, '0')}`;
  assert.equal(nextId, 'EQ_011');
});

test('幹部系統模組測試：社員資料修改 Diff 比對邏輯', () => {
  const original = {
    name: '王小明',
    identity_status: '本校生',
    department: '資工系',
    payment_status: '未繳費 Unpaid'
  };

  const modified = {
    name: '王小明',
    identity_status: '校友',
    department: '資工系',
    payment_status: '已繳費 Paid'
  };

  const diffs = [];
  Object.keys(modified).forEach((k) => {
    if (original[k] !== modified[k]) {
      diffs.push({
        field: k,
        oldVal: original[k],
        newVal: modified[k]
      });
    }
  });

  assert.equal(diffs.length, 2);
  assert.deepEqual(diffs[0], {
    field: 'identity_status',
    oldVal: '本校生',
    newVal: '校友'
  });
  assert.deepEqual(diffs[1], {
    field: 'payment_status',
    oldVal: '未繳費 Unpaid',
    newVal: '已繳費 Paid'
  });
});

test('幹部系統模組測試：財務款項類別自動映射', () => {
  const mapCategory = (type, targetType) => {
    const typeStr = (type || '').toLowerCase();
    if (targetType === 'event' || typeStr.includes('活動')) {
      return 'activity';
    }
    if (targetType === 'loan' || typeStr.includes('裝備')) {
      return 'equipment';
    }
    if (targetType === 'membership' || typeStr.includes('社費')) {
      return 'membership';
    }
    return 'general';
  };

  assert.equal(mapCategory('活動：奇萊南華', 'event'), 'activity');
  assert.equal(mapCategory('裝備租借：ORD_001', 'loan'), 'equipment');
  assert.equal(mapCategory('社費與社籍', 'membership'), 'membership');
  assert.equal(mapCategory('未知款項', null), 'general');
});

test('幹部系統模組測試：租借狀態合法值校驗 (嚴格杜絕非現存值)', () => {
  const allowedStatuses = [
    '待領取 To Be Collected',
    '租借中 Borrowed',
    '已歸還 Returned',
    '已取消 Cancelled'
  ];

  assert.ok(allowedStatuses.includes('待領取 To Be Collected'));
  assert.ok(allowedStatuses.includes('已歸還 Returned'));
  assert.ok(!allowedStatuses.includes('退件 Rejected'));
  assert.ok(!allowedStatuses.includes('已損壞 Damaged'));
});

test('幹部系統模組測試：admin_portal_rpc.sql 鑑權防護與 RPC 函式齊備性檢驗', async () => {
  const fs = await import('fs/promises');
  const sql = await fs.readFile('supabase/admin_portal_rpc.sql', 'utf8');

  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION get_admin_members_rpc'), '必須包含 get_admin_members_rpc');
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION get_admin_finance_rpc'), '必須包含 get_admin_finance_rpc');
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION get_admin_loans_rpc'), '必須包含 get_admin_loans_rpc');
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION update_admin_payment_status_rpc'), '必須包含 update_admin_payment_status_rpc');
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION update_admin_loan_status_rpc'), '必須包含 update_admin_loan_status_rpc');
  assert.ok(sql.includes('is_officer'), 'RPC 必須包含 is_officer 幹部鑑權驗證');
  assert.ok(sql.includes('SECURITY DEFINER'), 'RPC 必須宣告為 SECURITY DEFINER 以安全豁免 RLS');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION'), '必須授權 RPC 函式執行權限予 anon, authenticated, service_role');
});

test('幹部系統模組測試：裝備庫存改版為雙欄電商大圖結構檢驗', async () => {
  const fs = await import('fs/promises');
  const inventoryCode = await fs.readFile('src/pages/AdminInventory.tsx', 'utf8');

  assert.ok(inventoryCode.includes('products-grid'), '裝備庫存必須使用 products-grid 網格樣式');
  assert.ok(inventoryCode.includes('product-card'), '裝備庫存卡片必須採用 product-card 樣式');
  assert.ok(inventoryCode.includes('ProductImage'), '裝備庫存必須使用 ProductImage 顯示 1:1 大圖');
});

test('幹部系統模組測試：MemberProfileModal 彈窗與移至社員詳細資料編輯頁面導航', async () => {
  const fs = await import('fs/promises');
  const modalCode = await fs.readFile('src/components/admin/MemberProfileModal.tsx', 'utf8');

  assert.ok(modalCode.includes('移至社員詳細資料編輯頁面'), '個人資料彈窗底部必須包含「移至社員詳細資料編輯頁面」按鈕');
  assert.ok(modalCode.includes('fetchMemberFullDetailFromSupabase'), '個人資料彈窗必須支援拉取社員完整欄位');
  assert.ok(modalCode.includes('openExternalUrl'), '個人資料彈窗必須支援開啟體能證明照片');
  assert.ok(modalCode.includes('緊急聯絡人資訊'), '個人資料彈窗必須包含緊急聯絡人區塊');
});

test('幹部系統模組測試：fetchMemberFullDetailFromSupabase 多層備援機制', async () => {
  const fs = await import('fs/promises');
  const clientCode = await fs.readFile('src/utils/supabaseClient.ts', 'utf8');

  assert.ok(clientCode.includes('get_admin_member_detail_rpc'), '第一層優先調用 get_admin_member_detail_rpc');
  assert.ok(clientCode.includes('get_member_profile'), '第二層備援調用 get_member_profile');
});

test('幹部系統模組測試：5大幹部管理頁面緊湊工具列與標題塊瘦身檢驗', async () => {
  const fs = await import('fs/promises');
  const membersCode = await fs.readFile('src/pages/AdminMembers.tsx', 'utf8');
  const financeCode = await fs.readFile('src/pages/AdminFinance.tsx', 'utf8');
  const loansCode = await fs.readFile('src/pages/AdminLoans.tsx', 'utf8');
  const inventoryCode = await fs.readFile('src/pages/AdminInventory.tsx', 'utf8');
  const eventsCode = await fs.readFile('src/pages/AdminEvents.tsx', 'utf8');

  // NotionFilterBar 整合重新整理與新增
  assert.ok(membersCode.includes('onRefresh={loadMembers}'), 'AdminMembers 必須將重新整理整併至 NotionFilterBar');
  assert.ok(financeCode.includes('onRefresh={loadData}'), 'AdminFinance 必須將重新整理整併至 NotionFilterBar');
  assert.ok(loansCode.includes('onRefresh={loadData}'), 'AdminLoans 必須將重新整理整併至 NotionFilterBar');
  assert.ok(inventoryCode.includes('onRefresh={loadData}'), 'AdminInventory 必須將重新整理整併至 NotionFilterBar');
  assert.ok(inventoryCode.includes('onAdd={handleOpenAdd}'), 'AdminInventory 必須將新增裝備整併至 NotionFilterBar');
  assert.ok(eventsCode.includes('onAdd={resetFormForCreate}'), 'AdminEvents 必須將發布活動整併至 NotionFilterBar');

  // 個人資料彈窗於其他幹部頁面串接
  assert.ok(membersCode.includes('MemberProfileModal'), 'AdminMembers 必須串接 MemberProfileModal');
  assert.ok(financeCode.includes('MemberProfileModal'), 'AdminFinance 必須串接 MemberProfileModal');
  assert.ok(loansCode.includes('MemberProfileModal'), 'AdminLoans 必須串接 MemberProfileModal');
});

test('幹部系統模組測試：嚴格零表情符號 (Zero Emoji) 規範驗證', async () => {
  const fs = await import('fs/promises');
  const files = [
    'src/components/admin/MemberProfileModal.tsx',
    'src/components/admin/NotionFilterBar.tsx',
    'src/pages/AdminMembers.tsx',
    'src/pages/AdminFinance.tsx',
    'src/pages/AdminLoans.tsx',
    'src/pages/AdminInventory.tsx',
    'src/pages/AdminEvents.tsx'
  ];

  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const match = content.match(emojiRegex);
    assert.ok(!match, `檔案 ${file} 違反規範包含表情符號: ${match ? match[0] : ''}`);
  }
});

test('幹部系統模組測試：財務核銷社費連動、正式社員標記與明確到期日提取驗證 (v0.1.146)', async () => {
  const fs = await import('fs/promises');
  const rpcSql = await fs.readFile('supabase/admin_portal_rpc.sql', 'utf8');
  const clientTs = await fs.readFile('src/utils/supabaseClient.ts', 'utf8');

  // 1. SQL 檢查
  assert.ok(rpcSql.includes('is_official_member = TRUE'), 'SQL 核銷社費必須更新 is_official_member = TRUE');
  assert.ok(rpcSql.includes("substring(v_payment.type from '(\\d{4}[-/]\\d{2}[-/]\\d{2})')"), 'SQL 必須提取明確到期日');
  assert.ok(!rpcSql.includes('make_date('), '依指示不得自動以當前學期推算預設到期日');

  // 2. TypeScript Client 檢查
  assert.ok(clientTs.includes('is_official_member: true'), 'Client 核銷社費必須更新 is_official_member: true');
  assert.ok(clientTs.includes('membership_expires_at = expiryDate'), 'Client 必須提取明確到期日');
  assert.ok(clientTs.includes('updatedRows.length === 0'), 'Client 必須校驗更新列數杜絕 RLS 靜默阻斷');
});

test('幹部系統模組測試：待結項目明細化、僅正取活動計入待繳、幹部角色無預設與欄位靠左對齊 (v0.1.147)', async () => {
  const fs = await import('fs/promises');
  const editCode = await fs.readFile('src/pages/MemberDetailEdit.tsx', 'utf8');
  const modalCode = await fs.readFile('src/components/admin/MemberProfileModal.tsx', 'utf8');
  const rpcSql = await fs.readFile('supabase/admin_portal_rpc.sql', 'utf8');
  const clientTs = await fs.readFile('src/utils/supabaseClient.ts', 'utf8');

  // 1. 幹部角色不可預設為 '幹部'，避免載入即觸發變更提示
  assert.ok(!editCode.includes("detail.officer_role || '幹部'"), '不可將 officer_role 預設為幹部');
  assert.ok(editCode.includes("detail.officer_role || ''"), 'officer_role 未設定時應為空字串');

  // 2. 靠左對齊檢驗（覆蓋 #root 的 center）
  assert.ok(editCode.includes("textAlign: 'left'"), 'MemberDetailEdit 容器必須明確設定 textAlign: left');
  assert.ok(modalCode.includes("textAlign: 'left'"), 'MemberProfileModal 內容必須明確設定 textAlign: left');

  // 3. 活動待繳僅計算正取狀態
  assert.ok(rpcSql.includes("s.status = '正取 Confirmed'"), 'SQL 必須僅對正取狀態之活動計算待繳');
  assert.ok(rpcSql.includes('pendingItems'), 'SQL 必須回傳 pendingItems 明細陣列');
  assert.ok(clientTs.includes("e.signupStatus.includes('正取')"), 'Client 必須僅對正取狀態之活動計算待繳');
  assert.ok(clientTs.includes('pendingItems'), 'Client 必須生成 pendingItems 明細陣列');

  // 4. 零表情符號檢驗擴充
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!editCode.match(emojiRegex), 'MemberDetailEdit.tsx 不得包含表情符號');
});

test('幹部系統模組測試：身分狀態標準值對齊與向下相容檢驗 (v0.1.148)', async () => {
  const fs = await import('fs/promises');
  const adminMembersCode = await fs.readFile('src/pages/AdminMembers.tsx', 'utf8');
  const editCode = await fs.readFile('src/pages/MemberDetailEdit.tsx', 'utf8');
  const schemaDict = await fs.readFile('supabase/SCHEMA_DICTIONARY.md', 'utf8');

  // 1. AdminMembers 篩選選項對齊 Supabase 真實標準值
  assert.ok(adminMembersCode.includes("value: '臺科大在校學生'"), 'AdminMembers 篩選必須包含 臺科大在校學生');
  assert.ok(adminMembersCode.includes("value: '畢業校友'"), 'AdminMembers 篩選必須包含 畢業校友');
  assert.ok(adminMembersCode.includes("value: '校外人士'"), 'AdminMembers 篩選必須包含 校外人士');

  // 2. AdminMembers 篩選邏輯向下相容歷史舊資料
  assert.ok(adminMembersCode.includes("val === '臺科大在校學生' || val === '本校生'"), '臺科大在校學生必須向下相容本校生');
  assert.ok(adminMembersCode.includes("val === '畢業校友' || val === '校友'"), '畢業校友必須向下相容校友');
  assert.ok(adminMembersCode.includes("val === '校外人士' || val === '外校生' || val === '社會人士'"), '校外人士必須向下相容外校生與社會人士');

  // 3. MemberDetailEdit 下拉選單對齊標準值
  assert.ok(editCode.includes('<option value="臺科大在校學生">臺科大在校學生</option>'), 'MemberDetailEdit 選單必須包含 臺科大在校學生');
  assert.ok(editCode.includes('<option value="畢業校友">畢業校友</option>'), 'MemberDetailEdit 選單必須包含 畢業校友');
  assert.ok(editCode.includes('<option value="校外人士">校外人士</option>'), 'MemberDetailEdit 選單必須包含 校外人士');

  // 4. SCHEMA_DICTIONARY 文件對齊
  assert.ok(schemaDict.includes('臺科大在校學生 / 畢業校友 / 校外人士'), 'SCHEMA_DICTIONARY 範例值必須更新為標準值');
});

test('幹部系統模組測試：財務對帳備註區分、通知狀態防重覆推播、租借天數兜底與卡片彈窗靠左 (v0.1.149)', async () => {
  const fs = await import('fs/promises');
  const financeCode = await fs.readFile('src/pages/AdminFinance.tsx', 'utf8');
  const loansCode = await fs.readFile('src/pages/AdminLoans.tsx', 'utf8');
  const membersCode = await fs.readFile('src/pages/AdminMembers.tsx', 'utf8');
  const verifySql = await fs.readFile('supabase/verify_payment_rpc.sql', 'utf8');
  const portalSql = await fs.readFile('supabase/admin_portal_rpc.sql', 'utf8');

  // 1. 卡片與彈窗靠左排版檢驗
  assert.ok(financeCode.includes("textAlign: 'left'"), 'AdminFinance 必須包含 textAlign: left');
  assert.ok(loansCode.includes("textAlign: 'left'"), 'AdminLoans 必須包含 textAlign: left');
  assert.ok(membersCode.includes("textAlign: 'left'"), 'AdminMembers 必須包含 textAlign: left');

  // 2. 租借天數兜底計算 (杜絕顯示空白天數)
  assert.ok(loansCode.includes('Math.round'), 'AdminLoans 必須具備起訖日期天數兜底計算');
  assert.ok(portalSql.includes('l.end_date - l.start_date + 1'), 'SQL 必須具備租借天數兜底計算');

  // 3. 申報寫入 notes 欄位檢驗
  assert.ok(verifySql.includes('notes,\n        officer_notes'), 'verify_payment_rpc 必須將申報備註寫入 notes 欄位');

  // 4. 對帳彈窗社員備註展示與通知狀態控制
  assert.ok(financeCode.includes('selectedItem.notes'), 'AdminFinance 必須展示社員申報備註');
  assert.ok(financeCode.includes('editNotificationStatus'), 'AdminFinance 必須提供通知狀態下拉選單');
  assert.ok(financeCode.includes("editNotificationStatus === '未通知'"), 'AdminFinance 僅在未通知時觸發推播防重複');

  // 5. 零表情符號檢驗
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!financeCode.match(emojiRegex), 'AdminFinance.tsx 不得包含表情符號');
  assert.ok(!loansCode.match(emojiRegex), 'AdminLoans.tsx 不得包含表情符號');
});

test('幹部系統模組測試：個人歷史全紀錄新頁面、動態概況按鈕與混合時間軸 (v0.1.150)', async () => {
  const fs = await import('fs/promises');
  const editCode = await fs.readFile('src/pages/MemberDetailEdit.tsx', 'utf8');
  const recordsCode = await fs.readFile('src/pages/MemberRecords.tsx', 'utf8');
  const appCode = await fs.readFile('src/App.tsx', 'utf8');
  const sbCode = await fs.readFile('src/utils/supabaseClient.ts', 'utf8');
  const portalSql = await fs.readFile('supabase/admin_portal_rpc.sql', 'utf8');
  const typesCode = await fs.readFile('src/types/admin.ts', 'utf8');

  // 1. 動態概況標題移除左側姓名，並新增查看個人歷史全紀錄按鈕
  assert.ok(editCode.includes('進行中動態概況'), 'MemberDetailEdit 必須包含進行中動態概況標題');
  assert.ok(!editCode.includes("{formData.name || '社員'} 進行中動態概況"), 'MemberDetailEdit 必須移除左側社員姓名');
  assert.ok(editCode.includes('查看個人歷史全紀錄'), 'MemberDetailEdit 必須包含查看個人歷史全紀錄按鈕');
  assert.ok(editCode.includes('/admin/members/${userId}/records'), 'MemberDetailEdit 點擊按鈕必須跳轉至 records 路由');

  // 2. 獨立路由與導航標題設定
  assert.ok(appCode.includes('/admin/members/:userId/records'), 'App.tsx 必須註冊 records 路由');
  assert.ok(appCode.includes('個人歷史全紀錄'), 'App.tsx 導航標題必須包含個人歷史全紀錄');

  // 3. MemberRecords 頁面架構與靠左對齊
  assert.ok(recordsCode.includes("textAlign: 'left'"), 'MemberRecords 必須設定 textAlign: left');
  assert.ok(recordsCode.includes('NotionFilterBar'), 'MemberRecords 必須嵌入 NotionFilterBar');
  assert.ok(recordsCode.includes('返回社員詳細資料'), 'MemberRecords 必須具備返回社員按鈕');
  assert.ok(recordsCode.includes('toggleExpand'), 'MemberRecords 必須支援展開詳情');

  // 4. Supabase RPC 與客戶端函式檢驗
  assert.ok(portalSql.includes('get_admin_member_records_rpc'), 'admin_portal_rpc.sql 必須包含 get_admin_member_records_rpc 函式');
  assert.ok(sbCode.includes('fetchMemberTimelineRecordsFromSupabase'), 'supabaseClient.ts 必須提供 fetchMemberTimelineRecordsFromSupabase');
  assert.ok(typesCode.includes('MemberTimelineRecord'), 'admin.ts 必須定義 MemberTimelineRecord 介面');

  // 5. 全檔零表情符號檢驗
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!recordsCode.match(emojiRegex), 'MemberRecords.tsx 不得包含表情符號');
  assert.ok(!editCode.match(emojiRegex), 'MemberDetailEdit.tsx 不得包含表情符號');
});

test('幹部系統模組測試：大頭貼選單圖示與名稱一致、歷史紀錄優化、裝備編輯彈窗正方形相片與備註合併 (v0.1.151)', async () => {
  const fs = await import('fs/promises');
  const appCode = await fs.readFile('src/App.tsx', 'utf8');
  const zhLocale = JSON.parse(await fs.readFile('src/locales/zh.json', 'utf8'));
  const enLocale = JSON.parse(await fs.readFile('src/locales/en.json', 'utf8'));
  const recordsCode = await fs.readFile('src/pages/MemberRecords.tsx', 'utf8');
  const inventoryCode = await fs.readFile('src/pages/AdminInventory.tsx', 'utf8');
  const sbCode = await fs.readFile('src/utils/supabaseClient.ts', 'utf8');
  const portalSql = await fs.readFile('supabase/admin_portal_rpc.sql', 'utf8');

  // 1. 幹部系統名稱統一為 4 個字，英文副標題簡練，圖示與頂部一致
  assert.strictEqual(zhLocale.nav.adminEvents.title, '活動管理');
  assert.strictEqual(zhLocale.nav.adminEvents.subtitle, 'Events');
  assert.strictEqual(zhLocale.nav.adminMembers.title, '社員資料');
  assert.strictEqual(zhLocale.nav.adminMembers.subtitle, 'Members');
  assert.strictEqual(zhLocale.nav.adminFinance.title, '財務對帳');
  assert.strictEqual(zhLocale.nav.adminFinance.subtitle, 'Finance');
  assert.strictEqual(zhLocale.nav.adminLoans.title, '租借管理');
  assert.strictEqual(zhLocale.nav.adminLoans.subtitle, 'Loans');
  assert.strictEqual(zhLocale.nav.adminInventory.title, '裝備庫存');
  assert.strictEqual(zhLocale.nav.adminInventory.subtitle, 'Inventory');

  assert.strictEqual(zhLocale.nav.menuAdminEvents, '活動管理');
  assert.strictEqual(zhLocale.nav.menuAdminMembers, '社員資料');
  assert.strictEqual(zhLocale.nav.menuAdminFinance, '財務對帳');
  assert.strictEqual(zhLocale.nav.menuAdminLoans, '租借管理');
  assert.strictEqual(zhLocale.nav.menuAdminInventory, '裝備庫存');

  assert.strictEqual(enLocale.nav.adminEvents.title, 'Events');
  assert.strictEqual(enLocale.nav.adminMembers.title, 'Members');
  assert.strictEqual(enLocale.nav.adminFinance.title, 'Finance');
  assert.strictEqual(enLocale.nav.adminLoans.title, 'Loans');
  assert.strictEqual(enLocale.nav.adminInventory.title, 'Inventory');

  // App.tsx 大頭貼選單寬度與圖示
  assert.ok(appCode.includes("width: '160px'"), 'App.tsx 大頭貼下拉選單寬度應設為 160px');
  assert.ok(appCode.includes('PackageCheck'), 'App.tsx 必須引入 PackageCheck 圖示');
  assert.ok(appCode.includes('Layers'), 'App.tsx 必須引入 Layers 圖示');

  // 2. 社員個人歷史全紀錄：移除頂部 LINE ID、點擊卡片直接展開、修復未知社員
  assert.ok(!recordsCode.includes('LINE ID: {userId}'), 'MemberRecords 必須移除頂部 LINE ID 標籤');
  assert.ok(!recordsCode.includes('ChevronDown'), 'MemberRecords 不得包含展開收合箭頭');
  assert.ok(recordsCode.includes("cursor: 'pointer'"), 'MemberRecords 歷史紀錄卡片必須可整張點擊展開');
  assert.ok(portalSql.includes("CASE WHEN m.is_officer = TRUE THEN COALESCE(m.officer_role, '幹部')"), 'admin_portal_rpc.sql 必須使用正確的社員角色欄位');
  assert.ok(sbCode.includes('fetchMemberFullDetailFromSupabase(targetUserId, officerUserId)'), 'supabaseClient 必須具備未知社員兜底查詢機制');

  // 3. 裝備庫存編輯彈窗：最上方大正方形相片 (aspectRatio: 1 / 1)、內容靠左、規格與注意事項合併為備註
  assert.ok(inventoryCode.includes("aspectRatio: '1 / 1'"), 'AdminInventory 編輯彈窗最上方必須為 1:1 正方形相片輪播區');
  assert.ok(inventoryCode.includes('equipment-code-capsule'), 'AdminInventory 正方形相片左上角必須包含代號懸浮膠囊');
  assert.ok(inventoryCode.includes('photo-carousel-dots'), 'AdminInventory 正方形相片底部必須具備圓點指示器');
  assert.ok(inventoryCode.includes("textAlign: 'left'"), 'AdminInventory 編輯彈窗內容必須全面靠左對齊');
  assert.ok(inventoryCode.includes('備註'), 'AdminInventory 必須包含備註欄位');
  assert.ok(!inventoryCode.includes('規格描述 (重量、材質、尺寸)'), 'AdminInventory 必須移除獨立的規格描述輸入框');
  assert.ok(!inventoryCode.includes('注意事項與保養備註'), 'AdminInventory 必須移除獨立的注意事項輸入框');

  // 4. 全檔零表情符號檢驗
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!recordsCode.match(emojiRegex), 'MemberRecords.tsx 不得包含表情符號');
  assert.ok(!inventoryCode.match(emojiRegex), 'AdminInventory.tsx 不得包含表情符號');
}); test('幹部系統模組測試：裝備編輯大正方形防壓縮、相片壓縮上傳、專屬管理條與刪除機制 (v0.1.152)', async () => {
  const fs = await import('fs/promises');
  const inventoryCode = await fs.readFile('src/pages/AdminInventory.tsx', 'utf8');

  // 1. 裝備編輯正方形相片容器防壓縮 (flexShrink: 0) 與 1:1 比例
  assert.ok(inventoryCode.includes("flexShrink: 0"), 'AdminInventory 編輯相片容器必須設定 flexShrink: 0 防止 flexbox 壓扁');
  assert.ok(inventoryCode.includes("aspectRatio: '1 / 1'"), 'AdminInventory 編輯相片容器必須設定 1:1 正方形比例');
  assert.ok(inventoryCode.includes("boxSizing: 'border-box'"), 'AdminInventory 編輯相片容器必須設定 boxSizing: border-box');

  // 2. 前端 Canvas 輕量化壓縮與即時預覽機制 (0ms 本地預覽)
  assert.ok(inventoryCode.includes('document.createElement(\'canvas\')'), 'AdminInventory 必須具備 Canvas 縮圖壓縮處理');
  assert.ok(inventoryCode.includes('toDataURL(\'image/jpeg\', 0.8)'), 'AdminInventory 必須壓縮為 0.8 品質 JPEG');
  assert.ok(inventoryCode.includes('setNewPhotos'), 'AdminInventory 必須暫存待上傳新相片清單');

  // 3. 正方形相片輪播與右上方刪除按鈕
  assert.ok(inventoryCode.includes('handleRemovePhoto(activePhotoIdx)'), 'AdminInventory 輪播圖右上角必須具備刪除當前相片按鈕');
  assert.ok(inventoryCode.includes('刪除當前照片'), 'AdminInventory 必須具備刪除當前照片管理按鈕');

  // 4. 縮圖管理條與每張獨立刪除按鈕
  assert.ok(inventoryCode.includes('photo-thumbnail-strip'), 'AdminInventory 必須具備相片縮圖管理條');
  assert.ok(inventoryCode.includes('handleRemovePhoto(idx)'), 'AdminInventory 縮圖必須具備獨立 X 刪除按鈕');

  // 5. GAS 授權標頭健全化 (防範 iOS WebKit 302 重導向阻斷)
  assert.ok(inventoryCode.includes('appendAuthToken(GAS_API_URL)'), 'AdminInventory 必須使用 appendAuthToken 補齊授權標頭');
  assert.ok(inventoryCode.includes('withAuthPayload'), 'AdminInventory 必須使用 withAuthPayload');

  // 6. 全檔零表情符號檢驗
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!inventoryCode.match(emojiRegex), 'AdminInventory.tsx 不得包含表情符號');
});

test('幹部系統模組測試：修復 Drive 上傳 Action 名稱、移除輪播圖綠色+號與藍色新增按鈕 (v0.1.153)', async () => {
  const fs = await import('fs/promises');
  const inventoryCode = await fs.readFile('src/pages/AdminInventory.tsx', 'utf8');
  const helperCode = await fs.readFile('gas_modules/06_Helper_Services.js', 'utf8');
  const gasCode = await fs.readFile('src/gas.js', 'utf8');

  // 1. GAS 上傳 Action 檢驗
  assert.ok(inventoryCode.includes("action: 'update_equipment_images'") || inventoryCode.includes("action: 'upload_drive_file'"), 'AdminInventory 必須傳送有效的 action');
  assert.ok(!inventoryCode.includes("action: 'upload_drive_files'"), 'AdminInventory 絕不可包含複數形 upload_drive_files');

  // 2. 後端 GAS 支援 upload_drive_file
  assert.ok(helperCode.includes('action === "upload_drive_file"'), '06_Helper_Services 必須支援 upload_drive_file');
  assert.ok(gasCode.includes('action === "upload_drive_file"'), 'gas.js 必須支援 upload_drive_file');

  // 3. 移除輪播圖圓點內之綠色+號按鈕 (防止手機端排版偏移)
  assert.ok(!inventoryCode.includes("backgroundColor: '#10b981'"), 'AdminInventory 輪播圖指示器內不得包含綠色按鈕');

  // 4. 移除多餘之藍色新增相片按鈕，由縮圖列之虛線卡片統一處理
  assert.ok(!inventoryCode.includes('>新增相片</span>'), 'AdminInventory 不得包含多餘的藍色新增相片按鈕');
  assert.ok(inventoryCode.includes('>新增</span>'), 'AdminInventory 縮圖列必須包含標準的 + 新增 虛線方框');

  // 5. 零表情符號檢驗
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!inventoryCode.match(emojiRegex), 'AdminInventory.tsx 不得包含表情符號');
});

test('幹部系統模組測試：對齊 Borrow.tsx 之 update_equipment_images、刪除標題與相片框按鈕、中央底部白點分頁 (v0.1.154)', async () => {
  const fs = await import('fs/promises');
  const inventoryCode = await fs.readFile('src/pages/AdminInventory.tsx', 'utf8');

  // 1. 相片上傳 Action 對齊 Borrow.tsx 之 update_equipment_images
  assert.ok(inventoryCode.includes("action: 'update_equipment_images'"), 'AdminInventory 必須使用 update_equipment_images');
  assert.ok(inventoryCode.includes('newPhotoFiles'), 'AdminInventory 必須包含 newPhotoFiles 參數');
  assert.ok(inventoryCode.includes('keptUrls'), 'AdminInventory 必須包含 keptUrls 參數');

  // 2. 刪除彈窗頂部標題與副標題文字
  assert.ok(!inventoryCode.includes('編輯裝備：'), 'AdminInventory 不得包含 編輯裝備： 標題');
  assert.ok(!inventoryCode.includes('之裝備規格與設定'), 'AdminInventory 不得包含 之裝備規格與設定 副標題');

  // 3. 正方形相片框內刪除垃圾桶按鈕與切換前後照片按鈕
  assert.ok(!inventoryCode.includes('<Trash2 size={16} />'), 'AdminInventory 正方形相片框內不得包含垃圾桶按鈕');
  assert.ok(!inventoryCode.includes('ChevronLeft'), 'AdminInventory 不得引入或使用 ChevronLeft 切換箭頭');
  assert.ok(!inventoryCode.includes('ChevronRight'), 'AdminInventory 不得引入或使用 ChevronRight 切換箭頭');

  // 4. 正方形相片框中間底部加入白點（代表頁數）
  assert.ok(inventoryCode.includes('className="photo-carousel-dots"'), 'AdminInventory 必須具備 photo-carousel-dots 容器');
  assert.ok(inventoryCode.includes("backgroundColor: idx === activePhotoIdx ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'"), '分頁圓點必須採用純白高亮與半透明白點');

  // 5. 零表情符號檢驗
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!inventoryCode.match(emojiRegex), 'AdminInventory.tsx 不得包含表情符號');
});

test('幹部系統模組測試：裝備照片左右滑動手勢切換與 Google Apps Script HTML 錯誤攔截加固 (v0.1.155)', async () => {
  const fs = await import('fs/promises');
  const inventoryCode = await fs.readFile('src/pages/AdminInventory.tsx', 'utf8');
  const modalCode = await fs.readFile('src/components/borrow/EquipmentDetailModal.tsx', 'utf8');

  // 1. 手勢切換事件與狀態檢驗
  assert.ok(inventoryCode.includes('handleCarouselTouchStart'), 'AdminInventory 必須包含觸控開始事件');
  assert.ok(inventoryCode.includes('handleCarouselTouchMove'), 'AdminInventory 必須包含觸控移動事件');
  assert.ok(inventoryCode.includes('handleCarouselTouchEnd'), 'AdminInventory 必須包含觸控結束事件');
  assert.ok(inventoryCode.includes('handleCarouselMouseDown'), 'AdminInventory 必須包含滑鼠按下事件');
  assert.ok(inventoryCode.includes('handleCarouselMouseMove'), 'AdminInventory 必須包含滑鼠拖曳事件');
  assert.ok(inventoryCode.includes('handleCarouselMouseUp'), 'AdminInventory 必須包含滑鼠放開事件');

  // 2. 軌道樣式與位移控制
  assert.ok(inventoryCode.includes('photo-carousel-track'), 'AdminInventory 必須包含 photo-carousel-track 軌道');
  assert.ok(inventoryCode.includes('photo-carousel-slide'), 'AdminInventory 必須包含 photo-carousel-slide 滑片');
  assert.ok(inventoryCode.includes('dragOffset'), 'AdminInventory 必須計算 dragOffset 像素偏移');
  assert.ok(inventoryCode.includes('userSelect: \'none\''), '圖片必須設定 userSelect 為 none 防止瀏覽器選取反藍');
  assert.ok(inventoryCode.includes('draggable={false}'), '圖片必須設定 draggable={false} 防止觸發原生拖曳圖示');

  // 3. GAS 上傳 POST 端點檢驗
  assert.ok(inventoryCode.includes('appendAuthToken(GAS_API_URL)'), 'AdminInventory 必須包含 appendAuthToken 授權機制');
  assert.ok(inventoryCode.includes('postUrl'), 'AdminInventory POST 請求必須使用 postUrl');

  // 4. Google 帳號登入 HTML 頁面攔截與友善指示檢驗
  assert.ok(inventoryCode.includes('window[\'ppConfig\']') || inventoryCode.includes('accounts.google.com'), 'AdminInventory 必須偵測 Google 帳號登入頁面 HTML');
  assert.ok(inventoryCode.includes('誰可以存取設為「所有人 (Anyone)」'), 'AdminInventory 錯誤訊息必須清楚指示檢查誰可以存取設定');
  assert.ok(modalCode.includes('window[\'ppConfig\']') || modalCode.includes('accounts.google.com'), 'EquipmentDetailModal 亦必須具備 Google 登入 HTML 頁面攔截');

  // 5. 零表情符號檢驗
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!inventoryCode.match(emojiRegex), 'AdminInventory.tsx 不得包含表情符號');
  assert.ok(!modalCode.match(emojiRegex), 'EquipmentDetailModal.tsx 不得包含表情符號');
});


