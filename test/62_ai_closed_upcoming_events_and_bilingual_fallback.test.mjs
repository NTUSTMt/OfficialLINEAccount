import test from 'node:test';
import assert from 'node:assert/strict';

// 模擬 _filterEventsForAiContext 邏輯 (完全對齊 gas_modules/04_Ai_Gemini.js)
function _filterEventsForAiContext(eventsList, todayStr) {
  if (!Array.isArray(eventsList) || eventsList.length === 0) return [];
  if (!todayStr) {
    todayStr = '2026-09-17';
  }

  return eventsList.filter(function(ev) {
    if (!ev) return false;
    var st = (ev.status || "").trim();
    var isOpen = (st === "開放" || st === "開放中" || st === "Open");
    var sDate = (ev.start_date || "").slice(0, 10);
    var eDate = (ev.end_date || ev.start_date || "").slice(0, 10);

    // 1. 若為開放中活動，無論日期均納入
    if (isOpen) return true;

    // 2. 若為關閉／截止活動：僅允許「尚未結束」之活動（即尚未出隊，或出隊進行中）
    var isUpcomingOrOngoing = (eDate >= todayStr || sDate >= todayStr);
    if (isUpcomingOrOngoing) {
      return true;
    }

    // 3. 其他關閉的歷史過期活動一律排除
    return false;
  });
}

function _formatEventsForAiContext(eventsList, todayStr) {
  var validEvents = _filterEventsForAiContext(eventsList, todayStr);
  if (validEvents.length === 0) {
    return "目前無開放報名或近期即將開始的活動資料。";
  }
  return validEvents.map(function(ev) {
    var title = ev.title || "";
    var fee = ev.fee || 0;
    var start = ev.start_date || "";
    var end = ev.end_date || start;
    var desc = ev.summary || "";
    var itin = ev.itinerary ? (" 行程概要：" + ev.itinerary) : "";
    var st = (ev.status || "").trim();
    var isOpen = (st === "開放" || st === "開放中" || st === "Open");
    var statusLabel = isOpen ?
      "開放報名中 (Registration Open)" :
      "報名已截止/關閉 (Registration Closed，但活動尚未開始出隊)";
    var dateDisplay = start + (end && end !== start ? " ~ " + end : "");
    return "• " + title + " 【" + statusLabel + "】 (活動日期：" + dateDisplay + "，費用：$" + fee + ")：" + desc + itin;
  }).join("\n\n");
}

// 模擬 Webhook 中對 _handleGeminiChat 結果的處理與雙語透明錯誤訊息生成
function _simulateLineBotAiReply(aiRes, geminiApiKeyConfigured) {
  if (!geminiApiKeyConfigured) {
    var noKeyMsg = "小岳目前連線稍微忙碌（原因：GEMINI_API_KEY 未設定），請稍後再試，或直接在此留言洽詢社團幹部喔！🏔️\n\n" +
      "─────────────\n" +
      "Yue is currently busy or unavailable (Reason: GEMINI_API_KEY Not Configured). Please try again later, or leave a message here for club officers! 🏔️";
    return noKeyMsg;
  }

  var replyContent = (aiRes && typeof aiRes === "object" && aiRes.reply) ?
    aiRes.reply :
    (typeof aiRes === "string" ? aiRes : null);

  if (replyContent) {
    return replyContent;
  } else {
    var errReason = (aiRes && typeof aiRes === "object" && aiRes.error) ?
      aiRes.error :
      "連線逾時或模型無回應 (Timeout or No Response)";
    var fallbackMsg = "小岳目前連線稍微忙碌（原因：" + errReason + "），請稍後再試，或直接在此留言洽詢社團幹部喔！🏔️\n\n" +
      "─────────────\n" +
      "Yue is currently busy or unavailable (Reason: " + errReason + "). Please try again later, or leave a message here for club officers! 🏔️";
    return fallbackMsg;
  }
}

test('62. 小岳 AI 活動讀取過濾與雙語透明錯誤提示驗證', async (t) => {
  const TODAY = '2026-09-17';

  await t.test('1. 活動過濾：開放中活動必須納入', () => {
    const mockEvents = [
      { id: 'E1', title: '玉山主峰單攻', status: '開放', start_date: '2026-10-01', end_date: '2026-10-02' }
    ];
    const filtered = _filterEventsForAiContext(mockEvents, TODAY);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].title, '玉山主峰單攻');
  });

  await t.test('2. 活動過濾：報名截止但尚未開始出隊之關閉活動必須納入', () => {
    const mockEvents = [
      { id: 'E2', title: '雪山主東峰三日', status: '關閉', start_date: '2026-09-25', end_date: '2026-09-27' },
      { id: 'E3', title: '奇萊南華迎曦', status: '關閉', start_date: '2026-09-17', end_date: '2026-09-18' } // 今天出發
    ];
    const filtered = _filterEventsForAiContext(mockEvents, TODAY);
    assert.strictEqual(filtered.length, 2);
    assert.strictEqual(filtered[0].title, '雪山主東峰三日');
    assert.strictEqual(filtered[1].title, '奇萊南華迎曦');
  });

  await t.test('3. 活動過濾：歷史已結束之關閉活動必須嚴格排除', () => {
    const mockEvents = [
      { id: 'E4', title: '合歡西北下華岡 (去年)', status: '關閉', start_date: '2025-08-10', end_date: '2025-08-11' },
      { id: 'E5', title: '北大武山秋季隊 (上週已結束)', status: '關閉', start_date: '2026-09-01', end_date: '2026-09-03' },
      { id: 'E6', title: '嘉明湖日出 (未來活動但關閉)', status: '關閉', start_date: '2026-11-15', end_date: '2026-11-17' }
    ];
    const filtered = _filterEventsForAiContext(mockEvents, TODAY);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].title, '嘉明湖日出 (未來活動但關閉)');
  });

  await t.test('4. 上下文文字格式化：標籤精準區分開放報名與已截止但未開始', () => {
    const mockEvents = [
      { id: 'E1', title: '水漾森林露營', fee: 1500, status: '開放', start_date: '2026-10-10', end_date: '2026-10-11', summary: '夢幻水漾湖泊露營體驗', itinerary: 'D1 仁亭登山口-水漾營地' },
      { id: 'E2', title: '南湖大山五日', fee: 4000, status: '關閉', start_date: '2026-09-30', end_date: '2026-10-04', summary: '帝王之山探訪', itinerary: 'D1 勝光登山口' }
    ];
    const context = _formatEventsForAiContext(mockEvents, TODAY);
    assert.ok(context.includes('【開放報名中 (Registration Open)】'));
    assert.ok(context.includes('【報名已截止/關閉 (Registration Closed，但活動尚未開始出隊)】'));
    assert.ok(context.includes('水漾森林露營'));
    assert.ok(context.includes('南湖大山五日'));
  });

  await t.test('5. 雙語透明錯誤提示：當 API 回應 503 時，印出具體代碼與中英雙語對照', () => {
    const aiRes = { success: false, error: 'HTTP 503: No capacity available' };
    const reply = _simulateLineBotAiReply(aiRes, true);

    // 必須包含中文
    assert.ok(reply.includes('小岳目前連線稍微忙碌'));
    assert.ok(reply.includes('原因：HTTP 503: No capacity available'));

    // 必須包含英文
    assert.ok(reply.includes('Yue is currently busy or unavailable'));
    assert.ok(reply.includes('Reason: HTTP 503: No capacity available'));
    assert.ok(reply.includes('Please try again later'));
  });

  await t.test('6. 雙語透明錯誤提示：當 GEMINI_API_KEY 未設定時，印出具體提示與雙語對照', () => {
    const reply = _simulateLineBotAiReply(null, false);

    assert.ok(reply.includes('GEMINI_API_KEY 未設定'));
    assert.ok(reply.includes('GEMINI_API_KEY Not Configured'));
    assert.ok(reply.includes('Yue is currently busy or unavailable'));
  });

  await t.test('7. 正常成功時直接輸出 AI 回覆', () => {
    const aiRes = { success: true, reply: '玉山主峰海拔 3952 公尺，是台灣第一高峰！🏔️' };
    const reply = _simulateLineBotAiReply(aiRes, true);

    assert.strictEqual(reply, '玉山主峰海拔 3952 公尺，是台灣第一高峰！🏔️');
  });
});
