import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('59. 活動截止時間時區、過期狀態與試算表欄位同步驗證 (v0.1.124)', () => {
  const flexCode = fs.readFileSync(path.resolve('gas_modules/03_Flex_Templates.js'), 'utf8');
  const syncCode = fs.readFileSync(path.resolve('gas_modules/05_Sync_Worker.js'), 'utf8');
  const authCode = fs.readFileSync(path.resolve('gas_modules/01_Config_Auth.js'), 'utf8');
  const rpcCode = fs.readFileSync(path.resolve('supabase/admin_events_rpc.sql'), 'utf8');

  test('1. _formatEventDate 日期格式化：台灣時區 9/22 截止日絕對不可跳至 9/23', () => {
    // 在測試環境模擬 GAS 環境函式
    const fnMatch = flexCode.match(/function _formatEventDate\(dateVal\) \{([\s\S]*?)\n\}/);
    assert.ok(fnMatch, '必須定義 _formatEventDate');
    const formatEventDate = new Function('dateVal', fnMatch[1]);

    // 測試帶 +08:00 時區的台北時間 23:59:59
    assert.equal(formatEventDate('2026-09-22T23:59:59+08:00'), '2026/09/22');
    // 測試純日期
    assert.equal(formatEventDate('2026-09-22'), '2026/09/22');
    // 測試歷史舊資料 23:59:59Z（UTC 23:59:59 容錯還原為當天 9/22）
    assert.equal(formatEventDate('2026-09-22T23:59:59Z'), '2026/09/22');
  });

  test('2. _isEventExpired 截止過期比對：過去時間回傳 true、未來時間回傳 false', () => {
    const fnMatch = flexCode.match(/function _isEventExpired\(deadlineVal\) \{([\s\S]*?)\n\}/);
    assert.ok(fnMatch, '必須定義 _isEventExpired');
    const isEventExpired = new Function('deadlineVal', fnMatch[1]);

    // 過去時間
    assert.equal(isEventExpired('2020-01-01T23:59:59+08:00'), true);
    assert.equal(isEventExpired('2020-01-01'), true);
    assert.equal(isEventExpired('2020-01-01T23:59:59Z'), true);

    // 未來時間
    assert.equal(isEventExpired('2099-12-31T23:59:59+08:00'), false);
    assert.equal(isEventExpired('2099-12-31'), false);
    assert.equal(isEventExpired('2099-12-31T23:59:59Z'), false);
  });

  test('3. _findHeaderCol 結合 _getGlobalColumnAliases：純中文表頭與英文表頭皆能精確定位', () => {
    const fnAliasesMatch = authCode.match(/function _getGlobalColumnAliases\(englishName\) \{([\s\S]*?)\n\}/);
    const fnFindColMatch = authCode.match(/function _findColByEnglishName\(headers, colName\) \{([\s\S]*?)\n\}/);
    const fnFiMatch = authCode.match(/function _fi\(headers, keyword\) \{([\s\S]*?)\n\}/);
    const fnFindHeaderMatch = authCode.match(/function _findHeaderCol\(headers, englishName, aliases\) \{([\s\S]*?)\n\}/);

    assert.ok(fnAliasesMatch && fnFindColMatch && fnFiMatch && fnFindHeaderMatch);

    const testScope = new Function(`
      ${fnAliasesMatch[0]}
      ${fnFindColMatch[0]}
      ${fnFiMatch[0]}
      ${fnFindHeaderMatch[0]}
      return { _findHeaderCol };
    `)();

    const chineseHeaders = ['系統識別碼', '姓名', '聯絡電話', '報名截止日', '繳費狀態'];
    assert.equal(testScope._findHeaderCol(chineseHeaders, 'line_user_id'), 0);
    assert.equal(testScope._findHeaderCol(chineseHeaders, 'name'), 1);
    assert.equal(testScope._findHeaderCol(chineseHeaders, 'phone'), 2);
    assert.equal(testScope._findHeaderCol(chineseHeaders, 'deadline'), 3);
    assert.equal(testScope._findHeaderCol(chineseHeaders, 'payment_status'), 4);

    const englishHeaders = ['id', 'name', 'phone', 'deadline'];
    assert.equal(testScope._findHeaderCol(englishHeaders, 'id'), 0);
    assert.equal(testScope._findHeaderCol(englishHeaders, 'name'), 1);
  });

  test('4. _syncSignupToSheet allowedCols 必須包含 name, line_id, is_official_member_snapshot, cancel_reason', () => {
    assert.ok(syncCode.includes('"name"'), 'allowedCols 必須包含 name');
    assert.ok(syncCode.includes('"line_id"'), 'allowedCols 必須包含 line_id');
    assert.ok(syncCode.includes('"is_official_member_snapshot"'), 'allowedCols 必須包含 is_official_member_snapshot');
    assert.ok(syncCode.includes('"cancel_reason"'), 'allowedCols 必須包含 cancel_reason');
  });

  test('5. 每日定時巡檢查詢 URL 欄位名稱對齊 Supabase Schema', () => {
    assert.ok(syncCode.includes('select=id,title,deadline'), 'events 查詢必須是 title 而非 name');
    assert.ok(!syncCode.includes('select=id,name,deadline'), 'events 查詢不可包含不存在的 name 欄位');
    assert.ok(syncCode.includes('membership_expires_at'), 'members 查詢必須使用正確的 membership_expires_at 欄位');
  });

  test('6. Supabase admin_events_rpc.sql 截止日儲存與查詢時區標註防呆', () => {
    assert.ok(rpcCode.includes("AT TIME ZONE 'Asia/Taipei'"), 'get_admin_events_rpc 必須在台北時區格式化 deadline');
    assert.ok(rpcCode.includes("23:59:59+08"), 'save_admin_event_rpc 必須加上 +08 台灣時區');
  });
});
