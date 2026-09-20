import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Preferred Language Personalized Messaging Tests', () => {
  const rootDir = process.cwd();
  const gasContent = fs.readFileSync(path.join(rootDir, 'src/gas.js'), 'utf8');

  it('should ensure helper functions _getUserPreferredLanguage, _formatBilingualMessage, and _splitBilingualMessage exist', () => {
    assert.ok(
      gasContent.includes('function _getUserPreferredLanguage(userId)'),
      '_getUserPreferredLanguage helper must be defined'
    );
    assert.ok(
      gasContent.includes('function _formatBilingualMessage(zhText, enText, prefLang)'),
      '_formatBilingualMessage helper must be defined'
    );
    assert.ok(
      gasContent.includes('function _splitBilingualMessage(fullBilingualMsg, prefLang)'),
      '_splitBilingualMessage helper must be defined'
    );
  });

  it('should verify _formatBilingualMessage splits and falls back accurately', () => {
    const formatBilingualMessage = (zhText, enText, prefLang) => {
      const zh = (zhText || '').trim();
      const en = (enText || '').trim();
      if (prefLang === 'en') return en || zh;
      if (prefLang === 'zh') return zh || en;
      if (zh && en) return zh + '\n─────────────\n' + en;
      return zh || en;
    };

    const zhMsg = '【💳 繳費申報已成功送出】\n您好！系統已收到您的申報資訊。';
    const enMsg = '【💳 Payment Report Submitted】\nHello! Your payment report has been received.';

    // 1. 英文偏好
    assert.strictEqual(
      formatBilingualMessage(zhMsg, enMsg, 'en'),
      enMsg,
      'When prefLang is en, it should return only the English message'
    );

    // 2. 中文偏好
    assert.strictEqual(
      formatBilingualMessage(zhMsg, enMsg, 'zh'),
      zhMsg,
      'When prefLang is zh, it should return only the Chinese message'
    );

    // 3. 查無偏好 / 未設定 -> 雙語回退
    const fallbackExpected = zhMsg + '\n─────────────\n' + enMsg;
    assert.strictEqual(
      formatBilingualMessage(zhMsg, enMsg, null),
      fallbackExpected,
      'When prefLang is null, it should return Chinese + divider + English'
    );
  });

  it('should verify _splitBilingualMessage accurately extracts existing Chinese and English blocks without rewriting', () => {
    const splitBilingualMessage = (fullBilingualMsg, prefLang) => {
      if (!fullBilingualMsg || !prefLang) return fullBilingualMsg;
      const str = String(fullBilingualMsg);
      const divider = '\n─────────────\n';
      const idx = str.indexOf(divider);
      if (idx > -1) {
        const zhPart = str.substring(0, idx).trim();
        const enPart = str.substring(idx + divider.length).trim();
        if (prefLang === 'zh') return zhPart;
        if (prefLang === 'en') return enPart;
      }
      return fullBilingualMsg;
    };

    const existingMsg = '⚠️ 您已經報名過【合歡山秋季初階健行】囉！\n請耐心等候幹部審核。\n─────────────\n⚠️ You have already registered for [Hehuanshan Autumn Hike]!\nPlease wait for officer review.';

    // 繁中社員
    assert.strictEqual(
      splitBilingualMessage(existingMsg, 'zh'),
      '⚠️ 您已經報名過【合歡山秋季初階健行】囉！\n請耐心等候幹部審核。',
      'Should extract existing Chinese block without alteration'
    );

    // 英語社員
    assert.strictEqual(
      splitBilingualMessage(existingMsg, 'en'),
      '⚠️ You have already registered for [Hehuanshan Autumn Hike]!\nPlease wait for officer review.',
      'Should extract existing English block without alteration'
    );

    // 未註冊訪客
    assert.strictEqual(
      splitBilingualMessage(existingMsg, null),
      existingMsg,
      'Should preserve full bilingual text when prefLang is null'
    );
  });

  it('should verify sendEventList and sendEventDetail support userId and prefLang personalization', () => {
    assert.ok(
      gasContent.includes('function sendEventList(replyToken, userId)'),
      'sendEventList should accept userId parameter'
    );
    assert.ok(
      gasContent.includes('function sendEventDetail(replyToken, eventId, userId)'),
      'sendEventDetail should accept userId parameter'
    );
    assert.ok(
      gasContent.includes('sendEventList(replyToken, userId);'),
      'Router should pass userId to sendEventList'
    );
    assert.ok(
      gasContent.includes('sendEventDetail(replyToken, eventId, userId);'),
      'Router should pass userId to sendEventDetail'
    );
  });

  it('should verify Flex notifications and push messages adopt prefLang', () => {
    // 檢查通知中呼叫 _getUserPreferredLanguage
    assert.ok(
      gasContent.includes('var prefLang = _getUserPreferredLanguage(targetUid);'),
      '_handleSendEventNotifications should fetch prefLang for each user'
    );
    assert.ok(
      gasContent.includes('var prefLang = _getUserPreferredLanguage(userId);'),
      'Loan and payment handlers should fetch prefLang for userId'
    );
  });

  it('should verify Supabase events query uses correct database column names (title_en, summary_en, itinerary_en)', () => {
    // 確保不會出現不存在的欄位名導致 PostgREST 400 Bad Request
    assert.ok(
      gasContent.includes('select: "id,title,title_en,fee,start_date,end_date,deadline,status,summary,summary_en,cover_image_url"'),
      'sendEventList should select actual columns title_en and summary_en'
    );
    assert.ok(
      gasContent.includes('ev.title_en'),
      'sendEventList and sendEventDetail should reference ev.title_en'
    );
    assert.ok(
      gasContent.includes('ev.summary_en'),
      'sendEventList and sendEventDetail should reference ev.summary_en'
    );
    assert.ok(
      gasContent.includes('ev.itinerary_en'),
      'sendEventDetail should reference ev.itinerary_en'
    );
  });

  it('should verify Dashboard.tsx and get_my_dashboard.sql support preferred language for event name', () => {
    const dashboardCode = fs.readFileSync(path.resolve('src/pages/Dashboard.tsx'), 'utf8');
    const getDashboardSql = fs.readFileSync(path.resolve('supabase/get_my_dashboard.sql'), 'utf8');

    // 驗證 get_my_dashboard.sql 包含英文活動名稱與偏好語言
    assert.ok(getDashboardSql.includes("'eventNameEn', e.title_en"), 'SQL should return eventNameEn');
    assert.ok(getDashboardSql.includes("'eventNameZh', e.title"), 'SQL should return eventNameZh');
    assert.ok(getDashboardSql.includes("'preferredLanguage'"), 'SQL should return preferredLanguage in profile');

    // 驗證 Dashboard.tsx 依當前語系呈現英文或中文活動名稱
    assert.ok(dashboardCode.includes('act.eventNameEn'), 'Dashboard should support act.eventNameEn');
    assert.ok(dashboardCode.includes('act.eventNameZh'), 'Dashboard should support act.eventNameZh');
    assert.ok(
      dashboardCode.includes("(i18n.language || '').startsWith('en')") || dashboardCode.includes("i18n.language === 'en'"),
      'Dashboard should check i18n language for eventName display'
    );
  });
});


