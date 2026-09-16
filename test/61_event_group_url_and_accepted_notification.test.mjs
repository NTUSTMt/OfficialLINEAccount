import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('61. 活動專屬群組連結 (line_group_url) 與正取推播卡片一鍵入群驗證 (v0.1.132)', () => {
  const gasCode = fs.readFileSync(path.resolve('src/gas.js'), 'utf8');
  const adminRpcCode = fs.readFileSync(path.resolve('supabase/admin_events_rpc.sql'), 'utf8');
  const dashboardRpcCode = fs.readFileSync(path.resolve('supabase/get_my_dashboard.sql'), 'utf8');
  const adminFormCode = fs.readFileSync(path.resolve('src/components/admin/AdminEventForm.tsx'), 'utf8');
  const adminEventsCode = fs.readFileSync(path.resolve('src/pages/AdminEvents.tsx'), 'utf8');
  const dashboardCode = fs.readFileSync(path.resolve('src/pages/Dashboard.tsx'), 'utf8');

  test('1. 前端表單與提交檢驗：LINE 群組邀請連結格式驗證與嚴格排除 OpenChat (ti/g2/)', () => {
    const lineGroupRegex = /^https:\/\/(?:line\.me\/(?:R\/)?ti\/g\/[a-zA-Z0-9_\-]+|line\.me\/R\/ti\/g\/|line\.me\/ti\/g\/)/i;

    const validUrls = [
      'https://line.me/R/ti/g/abcdefg12345',
      'https://line.me/ti/g/hijklmn67890',
      'https://line.me/R/ti/g/xyz_123-abc'
    ];

    for (const url of validUrls) {
      assert.equal(lineGroupRegex.test(url), true, `合法網址應通過檢驗: ${url}`);
      assert.equal(url.includes('/ti/g2/'), false, `合法網址不可包含 /ti/g2/`);
    }

    const invalidUrls = [
      'https://line.me/ti/g2/openchat_id',
      'https://line.me/R/ti/g2/openchat_id',
      'https://discord.gg/outdoor',
      'http://line.me/ti/g/insecure',
      'https://facebook.com/groups/hiking'
    ];

    for (const url of invalidUrls) {
      const isValid = lineGroupRegex.test(url) && !url.includes('/ti/g2/');
      assert.equal(isValid, false, `非法網址應被阻擋: ${url}`);
    }

    // 檢查 AdminEventForm.tsx 與 AdminEvents.tsx 均包含此防護邏輯
    assert.ok(adminFormCode.includes("includes('/ti/g2/')"));
    assert.ok(adminEventsCode.includes("includes('/ti/g2/')"));
  });

  test('2. Supabase 資料庫層：events 表擴充 line_group_url 與 RPC 隱私控管', () => {
    // 檢查 admin_events_rpc.sql 結構定義
    assert.ok(adminRpcCode.includes('ALTER TABLE events ADD COLUMN IF NOT EXISTS line_group_url TEXT;'));
    assert.ok(adminRpcCode.includes("'lineGroupUrl', COALESCE(e.line_group_url, '')"));
    assert.ok(adminRpcCode.includes('line_group_url = COALESCE(EXCLUDED.line_group_url, events.line_group_url)'));

    // 檢查 get_my_dashboard.sql 嚴密隱私保護 (未正取或取消者絕對為 NULL)
    assert.ok(dashboardRpcCode.includes("'lineGroupUrl', CASE"));
    assert.ok(dashboardRpcCode.includes("WHEN s.status::text LIKE '%正取%' AND s.status::text NOT LIKE '%取消%' THEN e.line_group_url"));
    assert.ok(dashboardRpcCode.includes("ELSE NULL"));
  });

  test('3. 後端 GAS：推播前防呆攔截與正取 Flex 卡片無 Emoji 雙按鈕佈局', () => {
    // 檢查推播防呆：有正取未通知者但無群組連結時阻擋
    assert.ok(gasCode.includes('hasPendingAccepted && !targetGroupUrl'));
    assert.ok(gasCode.includes('此活動尚未設定專屬群組連結 (line_group_url)'));

    // 檢查 acceptedFlex 卡片按鈕佈局與文字 (不得有 emoji)
    assert.ok(gasCode.includes('"加入活動群組 Join Group"'));
    assert.ok(gasCode.includes('"前往繳費系統 Pay"'));
    assert.ok(gasCode.includes('uri: targetGroupUrl'));

    // 驗證按鈕文字無任何 emoji
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.equal(emojiRegex.test("加入活動群組 Join Group"), false, "加入群組按鈕不可含有 emoji");
    assert.equal(emojiRegex.test("前往繳費系統 Pay"), false, "繳費按鈕不可含有 emoji");
  });

  test('4. 前端個人中心 (Dashboard)：正取社員入群按鈕備援呈現', () => {
    // 檢查 Dashboard.tsx 包含正取判斷與 Join Group 連結按鈕
    assert.ok(dashboardCode.includes("act.reviewStatus.indexOf('正取') > -1"));
    assert.ok(dashboardCode.includes("act.lineGroupUrl"));
    assert.ok(dashboardCode.includes("加入活動群組 Join Group"));
  });

  test('5. 報名資料未完整提示：英文版完整包含缺漏欄位且杜絕暴露原始 URL 連結', () => {
    // 檢查 gas.js 與 03_Flex_Templates.js
    const flexCode = fs.readFileSync(path.resolve('gas_modules/03_Flex_Templates.js'), 'utf8');

    for (const code of [gasCode, flexCode]) {
      // 確保定義了中英缺漏欄位格式化變數
      assert.ok(code.includes('var missingFormattedZh ='));
      assert.ok(code.includes('var missingFormattedEn ='));
      // 英文部分必須包含 missingFormattedEn
      assert.ok(code.includes('missingFormattedEn +'));
      // 依使用者要求，絕對不可包含原始 LIFF 註冊連結
      assert.ok(!code.includes('👉 https://liff.line.me/2009217429-AhPRqAHg'), '不可暴露原始註冊網址');
      // 確保英文段落有完整提示
      assert.ok(code.includes('For insurance coverage and outdoor activity safety'));
      assert.ok(code.includes("Once your profile is updated, return here to sign up with one click! 🏕️"));
    }
  });
});
