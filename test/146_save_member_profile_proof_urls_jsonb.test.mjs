import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('146. save_member_profile proof_urls JSONB 型別修正', () => {
  const rootDir = process.cwd();
  const migrationPath = path.join(rootDir, 'supabase/migrations/20261104010000_fix_save_member_profile_proof_urls_jsonb.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('1. proof_urls 必須直接寫入 JSONB 陣列，不得轉成 text[]', () => {
    assert.ok(sql.includes('FUNCTION public.save_member_profile'), '必須包含 save_member_profile 函式定義');
    assert.ok(sql.includes("WHEN jsonb_typeof(p_data->'proof_urls') = 'array' THEN p_data->'proof_urls'"), 'proof_urls 必須保留 JSONB 陣列');
    assert.strictEqual(sql.includes('ARRAY(SELECT jsonb_array_elements_text(p_data->\'proof_urls\'))'), false, '不得將 proof_urls 轉成 text[]');
  });

  it('2. 必須保留本人身分驗證與 JSONB 欄位更新行為', () => {
    assert.ok(sql.includes("v_jwt_sub := auth.jwt() ->> 'sub'"), '必須檢查 caller JWT 身分');
    assert.ok(sql.includes('禁止越權修改他人個人資料'), '必須拒絕越權修改');
    assert.ok(sql.includes("WHEN p_data ? 'proof_urls' THEN EXCLUDED.proof_urls"), '必須支援新社員建立與既有社員照片更新');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.save_member_profile(TEXT, JSONB)'), '必須保留前端 RPC 執行權限');
  });
});
