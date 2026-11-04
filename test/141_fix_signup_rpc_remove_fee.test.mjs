import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('141. 修復 signup_rpc 移除 event_signups 表中不存在之 fee 欄位驗證', () => {
  const rootDir = process.cwd();
  const migrationPath = path.join(rootDir, 'supabase/migrations/20261103_fix_signup_rpc_remove_fee_column.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('1. signup_rpc 的 INSERT 語句不得包含 fee 欄位', () => {
    assert.ok(sql.includes('FUNCTION public.signup_rpc'), '必須包含 signup_rpc 函式定義');
    
    // 提取 INSERT INTO 區塊
    const insertBlock = sql.substring(sql.indexOf('INSERT INTO public.event_signups'), sql.indexOf('VALUES ('));
    assert.strictEqual(
      insertBlock.includes('fee'),
      false,
      'event_signups 資料表無 fee 欄位，INSERT 欄位清單絕不可包含 fee'
    );
  });

  it('2. signup_rpc 必須完整寫入 name, line_id, notification_status, is_official_member_snapshot', () => {
    const insertBlock = sql.substring(sql.indexOf('INSERT INTO public.event_signups'), sql.indexOf('VALUES ('));
    assert.ok(insertBlock.includes('name'), '必須包含 name 欄位');
    assert.ok(insertBlock.includes('line_id'), '必須包含 line_id 欄位');
    assert.ok(insertBlock.includes('notification_status'), '必須包含 notification_status 欄位');
    assert.ok(insertBlock.includes('is_official_member_snapshot'), '必須包含 is_official_member_snapshot 欄位');
  });

  it('3. signup_rpc 回傳 JSON 必須相容 LINE Webhook 規範', () => {
    assert.ok(sql.includes("'status', 'ok'"), "成功回傳 status 必須包含 'ok'");
    assert.ok(sql.includes("'spreadsheet_id', v_event.spreadsheet_id"), '必須回傳 spreadsheet_id 供非同步試算表同步');
    assert.ok(sql.includes("'fee', v_fee"), '必須回傳 fee 供推播計算');
    assert.ok(sql.includes("'is_official_member', v_is_official"), '必須回傳 is_official_member 供身分識別');
  });

  it('4. 嚴格落實無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(sql), false, 'Migration SQL 代碼不得包含 Emoji');
  });

  it('5. 最新修正不得再讀取 events 不存在的 member_fee 欄位', () => {
    const latestMigrationPath = path.join(rootDir, 'supabase/migrations/20261104000000_fix_signup_rpc_member_fee_reference.sql');
    const latestSql = fs.readFileSync(latestMigrationPath, 'utf8');

    assert.strictEqual(latestSql.includes('v_event.member_fee'), false, 'signup_rpc 不得引用不存在的 member_fee 欄位');
    assert.ok(latestSql.includes("v_fee := COALESCE(v_event.fee, 0)"), 'signup_rpc 必須從 events.fee 取得活動費用');
  });
});
