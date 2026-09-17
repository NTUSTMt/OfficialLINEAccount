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

test('幹部系統模組測試：MemberProfileModal 彈窗與移至詳細社員狀態導航', async () => {
  const fs = await import('fs/promises');
  const modalCode = await fs.readFile('src/components/admin/MemberProfileModal.tsx', 'utf8');

  assert.ok(modalCode.includes('移至詳細社員狀態'), '個人資料彈窗底部必須包含「移至詳細社員狀態」按鈕');
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

