// test/151_loan_return_inventory_and_items_display.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve('.');

test('151.1 update_admin_loan_status_rpc 必須在歸還或取消時原子性回補 equipments.available_qty', () => {
  const migrationPath = path.join(
    rootDir,
    'supabase/migrations/20261118_fix_loan_status_rpc_inventory_restore.sql'
  );
  assert.ok(fs.existsSync(migrationPath), '必須建立 20261118_fix_loan_status_rpc_inventory_restore.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.update_admin_loan_status_rpc'), '必須更新 update_admin_loan_status_rpc');
  assert.ok(sql.includes('FOR UPDATE'), '必須鎖定 loans 紀錄防止併發重複回補');
  assert.ok(sql.includes('FROM loan_items'), '必須讀取 loan_items 明細以取得 equipment_id 與 quantity');
  assert.ok(sql.includes('available_qty = LEAST(total_qty, available_qty + v_item.quantity)'), '歸還或取消時必須將 available_qty 加回且不超過 total_qty');
  assert.ok(sql.includes('已歸還 Returned'), '必須判斷已歸還狀態以釋放庫存');
  assert.ok(sql.includes('已取消 Cancelled'), '必須判斷已取消狀態以釋放庫存');

  // 同步檢查 schema 與 admin_portal_rpc.sql 是否已對齊
  const schemaLoansSql = fs.readFileSync(path.join(rootDir, 'supabase/schema/04_equipments_and_loans.sql'), 'utf8');
  const adminPortalSql = fs.readFileSync(path.join(rootDir, 'supabase/admin_portal_rpc.sql'), 'utf8');
  assert.ok(schemaLoansSql.includes('available_qty + v_item.quantity'), '04_equipments_and_loans.sql 必須同步更新回補邏輯');
  assert.ok(adminPortalSql.includes('available_qty + v_item.quantity'), 'admin_portal_rpc.sql 必須同步更新回補邏輯');
});

test('151.2 WebAdminLoans 必須關聯查詢 loan_items 並優先於空陣列 items 顯示明細', () => {
  const loansSrc = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/WebAdminLoans.tsx'),
    'utf8'
  );

  assert.ok(
    loansSrc.includes('loan_items (') && loansSrc.includes('equipments ('),
    'WebAdminLoans 查詢 loans 時必須一併關聯 loan_items 與 equipments'
  );
  assert.ok(
    loansSrc.includes('l.loan_items.length > 0') || loansSrc.includes('rawItems'),
    'WebAdminLoans 不可因 l.items 為空陣列 [] 而忽略 l.loan_items'
  );
  assert.ok(
    loansSrc.includes('item.subtotal') && loansSrc.includes('item.rent'),
    'WebAdminLoans 必須兼容 subtotal 與 rent 欄位顯示單項租金'
  );
});

test('151.3 updateLoanStatusInSupabase 呼叫 RPC 失敗時不得靜默切換直更繞過庫存回補', () => {
  const clientSrc = fs.readFileSync(
    path.join(rootDir, 'src/utils/supabaseClient.ts'),
    'utf8'
  );

  const fnMatch = clientSrc.match(/export const updateLoanStatusInSupabase = async \([\s\S]*?\n\};/);
  assert.ok(fnMatch, '必須找到 updateLoanStatusInSupabase 函式');
  const fnBody = fnMatch[0];

  assert.ok(
    fnBody.includes("return { success: false, error:") &&
    !fnBody.includes('切換直更模式'),
    '有 officerUserId 時若 update_admin_loan_status_rpc 失敗或回傳 success: false，必須直接回報錯誤，不得靜默切換直更模式而遺漏庫存回補'
  );
});
