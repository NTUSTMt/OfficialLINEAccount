import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('134. Supabase RPC 身分鑑權與 IDOR 防護加固驗證', () => {
  const rootDir = process.cwd();
  const migrationPath = path.join(rootDir, 'supabase/migrations/20261023_security_remediation_p3.sql');
  const migrationExists = fs.existsSync(migrationPath);

  it('0. 必須建立 20261023_security_remediation_p3.sql 遷移腳本', () => {
    assert.ok(migrationExists, '必須建立 20261023_security_remediation_p3.sql 遷移腳本');
  });

  if (!migrationExists) {
    return;
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('1. save_member_profile 必須校驗 caller 身分與 p_line_user_id 一致性', () => {
    assert.ok(sql.includes('FUNCTION save_member_profile'), '必須包含 save_member_profile 定義');
    assert.ok(
      sql.includes("auth.jwt() ->> 'sub'") || sql.includes("current_setting('request.jwt.claim.sub'"),
      'save_member_profile 必須讀取 caller JWT sub'
    );
    assert.ok(
      sql.includes('禁止越權修改他人個人資料') || sql.includes('Forbidden'),
      'save_member_profile 必須包含越權拒絕邏輯'
    );
  });

  it('2. cancel_event_signup_rpc 必須拒絕匿名與缺失 JWT 呼叫', () => {
    assert.ok(sql.includes('FUNCTION cancel_event_signup_rpc'), '必須包含 cancel_event_signup_rpc 定義');
    assert.ok(
      sql.includes('缺少有效身分憑證') || sql.includes('Unauthorized'),
      'cancel_event_signup_rpc 必須在 v_jwt_sub 為空時拒絕'
    );
  });

  it('3. cancel_equipment_loan_rpc 必須拒絕匿名與缺失 JWT 呼叫', () => {
    assert.ok(sql.includes('FUNCTION cancel_equipment_loan_rpc'), '必須包含 cancel_equipment_loan_rpc 定義');
    assert.ok(
      sql.includes('缺少有效身分憑證') || sql.includes('Unauthorized'),
      'cancel_equipment_loan_rpc 必須在 v_jwt_sub 為空時拒絕'
    );
  });

  it('4. signup_rpc 必須檢查 caller 身分', () => {
    assert.ok(
      sql.includes('FUNCTION signup_rpc') || sql.includes('FUNCTION public.signup_rpc'),
      '必須包含 signup_rpc 定義'
    );
    assert.ok(
      sql.includes("auth.jwt() ->> 'sub'") || sql.includes('service_role'),
      'signup_rpc 必須驗證 caller 身分'
    );
  });

  it('5. save_reflection_rpc 必須檢查 caller 身分', () => {
    assert.ok(
      sql.includes('FUNCTION save_reflection_rpc') || sql.includes('FUNCTION public.save_reflection_rpc'),
      '必須包含 save_reflection_rpc 定義'
    );
    assert.ok(
      sql.includes("auth.jwt() ->> 'sub'") || sql.includes('service_role'),
      'save_reflection_rpc 必須驗證 caller 身分'
    );
  });

  it('6. SQL 腳本無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(sql), false, 'SQL 腳本不得包含任何 Emoji');
  });
});
