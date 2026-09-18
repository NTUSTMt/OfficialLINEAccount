import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('財務對帳重構測試：admin_portal_rpc.sql 正名待繳費狀態與通知解耦', async () => {
  const sql = await fs.readFile('supabase/admin_portal_rpc.sql', 'utf8');

  // 1. get_admin_finance_rpc 活動報名第 3 區段絕不能使用 s.notification_status
  assert.ok(
    !sql.includes("COALESCE(s.notification_status, '未通知') AS notification_status"),
    '活動報名第 3 區段不得將 s.notification_status 作為財務 notification_status'
  );
  assert.ok(
    sql.includes("'未通知' AS notification_status"),
    '活動報名與裝備第 2、3 區段必須解耦為固定「未通知」'
  );

  // 2. get_admin_finance_rpc 未申報款項之 status 正名為「待繳費 Unpaid」
  assert.ok(
    sql.includes("CASE WHEN s.payment_status = '待確認 Checking' THEN '待確認 Checking' ELSE '待繳費 Unpaid' END AS status"),
    '未填報之活動正取款項必須判斷為「待繳費 Unpaid」或「待確認 Checking」'
  );
  assert.ok(
    sql.includes("CASE WHEN l.payment_status = '待確認 Checking' THEN '待確認 Checking' ELSE '待繳費 Unpaid' END AS status"),
    '未填報之裝備租借款項必須判斷為「待繳費 Unpaid」或「待確認 Checking」'
  );

  // 3. update_admin_payment_status_rpc 支援待繳費對應至未繳費 enum
  assert.ok(
    sql.includes("WHEN p_status = '待繳費 Unpaid' THEN '未繳費 Unpaid'::payment_status_enum"),
    'update_admin_payment_status_rpc 必須支援將待繳費映射至未繳費 enum'
  );
});

test('財務對帳重構測試：前端型別定義支援待繳費 Unpaid', async () => {
  const typesCode = await fs.readFile('src/types/admin.ts', 'utf8');
  assert.ok(
    typesCode.includes("status: '待繳費 Unpaid' | '待確認 Checking' | '已核銷 Confirmed';"),
    'AdminFinanceItem.status 必須包含「待繳費 Unpaid」'
  );
});

test('財務對帳重構測試：AdminFinance.tsx 介面篩選、徽章與彈窗控制', async () => {
  const financeCode = await fs.readFile('src/pages/AdminFinance.tsx', 'utf8');

  // 1. 狀態篩選器包含「待繳費 Unpaid」
  assert.ok(
    financeCode.includes("{ value: '待繳費 Unpaid', label: '待繳費 Unpaid' }"),
    '財務狀態篩選器必須包含「待繳費 Unpaid」選項'
  );

  // 2. 卡片徽章樣式支援紅色待繳費標籤
  assert.ok(
    financeCode.includes("it.status === '待繳費 Unpaid' ? '#fef2f2'"),
    '待繳費項目背景必須呈現淺紅色提示'
  );
  assert.ok(
    financeCode.includes("it.status === '待繳費 Unpaid' ? '#dc2626'"),
    '待繳費項目文字必須呈現紅色警示'
  );

  // 3. 彈窗下拉選單包含待繳費選項
  assert.ok(
    financeCode.includes('<option value="待繳費 Unpaid">待繳費 Unpaid</option>'),
    '彈窗狀態選單必須包含「待繳費 Unpaid」'
  );
});

test('財務對帳重構測試：supabaseClient.ts 狀態解析與備援相容', async () => {
  const clientCode = await fs.readFile('src/utils/supabaseClient.ts', 'utf8');

  // 1. fetchFinanceItemsFromSupabase 支援解析待繳費狀態
  assert.ok(
    clientCode.includes("it.status === '待繳費 Unpaid'"),
    'fetchFinanceItemsFromSupabase 必須保留待繳費狀態'
  );

  // 2. updatePaymentAndLinkedStatusInSupabase 支援待繳費映射
  assert.ok(
    clientCode.includes("params.newStatus === '待繳費 Unpaid'") && clientCode.includes("'未繳費 Unpaid'"),
    'updatePaymentAndLinkedStatusInSupabase 必須將待繳費映射為未繳費'
  );

  // 3. 備援查詢補充活動報名且通知狀態固定未通知
  assert.ok(
    clientCode.includes("sourceType: 'event_signup'"),
    '直查備援機制必須支援 event_signup 補充'
  );
});
