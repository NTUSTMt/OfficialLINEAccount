import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('147. 活動報名取消與重新報名 enum 修正', () => {
  const rootDir = process.cwd();
  const migrationPath = path.join(rootDir, 'supabase/migrations/20261104020000_fix_event_signup_cancelled_enum.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('1. 取消報名只能寫入合法的已取消 Cancelled enum', () => {
    assert.ok(sql.includes('FUNCTION public.cancel_event_signup_rpc'), '必須包含取消報名 RPC');
    assert.ok(sql.includes("status = '已取消 Cancelled'::event_signup_status_enum"), '取消報名必須寫入合法 enum');
    assert.strictEqual(sql.includes("status = CASE WHEN v_signup.payment_status"), false, '不得依付款狀態寫入不存在的退款 enum');
    assert.ok(sql.includes('【已繳費待退款】'), '退款資訊必須改記錄於 notes');
  });

  it('2. 重新報名只需判斷合法的已取消 Cancelled 狀態', () => {
    assert.ok(sql.includes('FUNCTION public.signup_rpc'), '必須包含報名 RPC');
    assert.ok(sql.includes("v_existing_signup.status <> '已取消 Cancelled'::event_signup_status_enum"), '重新報名必須允許合法取消狀態');
    assert.strictEqual(sql.includes('已取消 (待退款)'), false, '資料庫 RPC 不得再引用不存在的退款 enum');
  });
});
