// test/152_fix_submit_equipment_loan_rpc_price_columns.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve('.');

const stripSqlComments = (sql) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');

test('152.1 遷移檔必須重建 submit_equipment_loan_rpc，完全移除 member_price_per_day 與 non_member_price_per_day 並以 price_2day / price_extra_day 計費', () => {
  const migrationPath = path.join(
    rootDir,
    'supabase/migrations/20261119_fix_submit_equipment_loan_rpc_price_columns.sql'
  );
  assert.ok(
    fs.existsSync(migrationPath),
    '必須建立 supabase/migrations/20261119_fix_submit_equipment_loan_rpc_price_columns.sql'
  );

  const rawSql = fs.readFileSync(migrationPath, 'utf8');
  const codeSql = stripSqlComments(rawSql);

  assert.ok(
    codeSql.includes('CREATE OR REPLACE FUNCTION public.submit_equipment_loan_rpc'),
    '必須包含 CREATE OR REPLACE FUNCTION public.submit_equipment_loan_rpc'
  );
  assert.ok(
    codeSql.includes('SET search_path = public'),
    'SECURITY DEFINER 函式必須固定 SET search_path = public'
  );
  assert.strictEqual(
    codeSql.includes('member_price_per_day'),
    false,
    '函式定義主體不得包含已移除欄位 member_price_per_day'
  );
  assert.strictEqual(
    codeSql.includes('non_member_price_per_day'),
    false,
    '函式定義主體不得包含已移除欄位 non_member_price_per_day'
  );
  assert.ok(
    codeSql.includes('COALESCE(price_2day, 0)'),
    '必須使用 COALESCE(price_2day, 0) 取得基本2天租金'
  );
  assert.ok(
    codeSql.includes('COALESCE(price_extra_day, 0)'),
    '必須使用 COALESCE(price_extra_day, 0) 取得續租每日租金'
  );
  assert.ok(
    codeSql.includes('FOR UPDATE'),
    '查詢裝備庫存時必須使用 FOR UPDATE 悲觀鎖定'
  );
  assert.ok(
    codeSql.includes('is_borrowable'),
    '必須校驗裝備 is_borrowable 是否開放借用'
  );
  assert.ok(
    codeSql.includes('is_official_member_snapshot'),
    '寫入 loans 時必須記錄 is_official_member_snapshot'
  );
  assert.ok(
    codeSql.includes('total_fee'),
    '寫入 loans 時必須記錄 total_fee'
  );
  assert.ok(
    codeSql.includes('items'),
    '寫入 loans 時必須記錄 items JSON 陣列快照'
  );
});

test('152.2 本地基準架構檔與 RPC 定義檔皆不得殘留 member_price_per_day / non_member_price_per_day 且須對齊最新 submit_equipment_loan_rpc', () => {
  const targetFiles = [
    'supabase/schema/04_equipments_and_loans.sql',
    'supabase/schema/00_master_schema.sql',
    'supabase/fix_equipment_loan_rpc.sql',
    'supabase/equipment_loan_rpc.sql'
  ];

  for (const relPath of targetFiles) {
    const fullPath = path.join(rootDir, relPath);
    const rawSql = fs.readFileSync(fullPath, 'utf8');
    const codeSql = stripSqlComments(rawSql);

    assert.strictEqual(
      codeSql.includes('member_price_per_day'),
      false,
      `${relPath} 不得殘留已移除欄位 member_price_per_day`
    );
    assert.strictEqual(
      codeSql.includes('non_member_price_per_day'),
      false,
      `${relPath} 不得殘留已移除欄位 non_member_price_per_day`
    );

    const fnMatch = codeSql.match(
      /CREATE OR REPLACE FUNCTION\s+(?:public\.)?submit_equipment_loan_rpc\s*\([\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    assert.ok(fnMatch, `${relPath} 必須包含 submit_equipment_loan_rpc 函式定義`);
    const fnBody = fnMatch[0];

    assert.ok(
      fnBody.includes('SET search_path = public'),
      `${relPath} 的 submit_equipment_loan_rpc 必須包含 SET search_path = public`
    );
    assert.ok(
      fnBody.includes('is_borrowable'),
      `${relPath} 的 submit_equipment_loan_rpc 必須校驗 is_borrowable`
    );
    assert.ok(
      fnBody.includes('v_member.is_official_member IS TRUE AND'),
      `${relPath} 的 submit_equipment_loan_rpc 必須使用 AND 檢查社員資格與有效期限`
    );
    assert.ok(
      fnBody.includes('v_items_snapshot'),
      `${relPath} 的 submit_equipment_loan_rpc 必須建立 v_items_snapshot JSON 陣列寫入 loans.items`
    );
  }
});

test('152.3 驗證 submit_equipment_loan_rpc 社員資格有效期判斷、計費規則契約與零 Emoji 規範', () => {
  const sqlFiles = [
    'supabase/migrations/20261119_fix_submit_equipment_loan_rpc_price_columns.sql',
    'supabase/schema/04_equipments_and_loans.sql',
    'supabase/schema/00_master_schema.sql',
    'supabase/fix_equipment_loan_rpc.sql',
    'supabase/equipment_loan_rpc.sql'
  ];

  for (const relPath of sqlFiles) {
    const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    const fnMatch = stripSqlComments(content).match(
      /CREATE OR REPLACE FUNCTION\s+(?:public\.)?submit_equipment_loan_rpc\s*\([\s\S]*?\$\$[\s\S]*?\$\$;/
    );
    assert.ok(fnMatch, `${relPath} 必須包含 submit_equipment_loan_rpc 定義`);
    const fnBody = fnMatch[0];

    assert.strictEqual(
      /v_member\.is_official_member\s+IS\s+TRUE\s+OR\b/i.test(fnBody),
      false,
      `${relPath} 不得使用 OR 判斷社員有效期限（避免過期社員仍享 5 折）`
    );
    assert.ok(
      /v_member\.is_official_member\s+IS\s+TRUE\s+AND\s*\(\s*v_member\.membership_expires_at\s+IS\s+NULL\s+OR\s+v_member\.membership_expires_at\s*>=\s*CURRENT_DATE\s*\)/i.test(
        fnBody
      ),
      `${relPath} 必須以 AND 同時驗證 is_official_member 與 membership_expires_at`
    );
    assert.ok(
      fnBody.includes("v_purpose = '社團出隊'") &&
        fnBody.includes('v_unit_price := 0;') &&
        fnBody.includes('ROUND(v_item_base * 0.5)') &&
        fnBody.includes("'已繳費 Paid'::payment_status_enum") &&
        fnBody.includes("'未繳費 Unpaid'::payment_status_enum"),
      `${relPath} 必須實作完整的社團免租、社員 5 折、非社員原價與對應繳費狀態規則`
    );
  }

  const clientSrc = fs.readFileSync(
    path.join(rootDir, 'src/utils/supabaseClient.ts'),
    'utf8'
  );
  const fnMatch = clientSrc.match(
    /export const submitEquipmentLoanToSupabase = async \([\s\S]*?\n\};/
  );
  assert.ok(fnMatch, '必須存在 submitEquipmentLoanToSupabase 公開介面');
  assert.ok(
    fnMatch[0].includes("supabase.rpc('submit_equipment_loan_rpc'") &&
      fnMatch[0].includes('return { success: false, message: error.message }') &&
      fnMatch[0].includes("return { success: false, message: data?.message || '申請失敗' }"),
    'submitEquipmentLoanToSupabase 必須透明回傳資料庫錯誤原因'
  );

  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  for (const relPath of [...sqlFiles, 'test/152_fix_submit_equipment_loan_rpc_price_columns.test.mjs']) {
    const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    assert.strictEqual(
      emojiRegex.test(content),
      false,
      `${relPath} 不得包含任何 Emoji 字元`
    );
  }
});


