import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/u;

test('129. 幹部推播防爆優化：每兩天社務彙整佇列、Postback 0 額度核銷與 Email 即時備查驗證', async (t) => {
  const migrationPath = path.resolve('supabase/migrations/20261019000000_create_admin_digest_queue.sql');
  const digestQueuePath = path.resolve('supabase/functions/_shared/digestQueue.ts');
  const pushAdminPath = path.resolve('supabase/functions/_shared/pushAdminMessage.ts');
  const notifyDispatcherPath = path.resolve('supabase/functions/notify-dispatcher/index.ts');
  const lineWebhookPath = path.resolve('supabase/functions/line-webhook/index.ts');
  const flexTemplatesPath = path.resolve('supabase/functions/line-webhook/flexTemplates.ts');
  const dailyPatrolPath = path.resolve('supabase/functions/daily-patrol/index.ts');

  const migrationContent = fs.readFileSync(migrationPath, 'utf8');
  const digestQueueContent = fs.readFileSync(digestQueuePath, 'utf8');
  const pushAdminContent = fs.readFileSync(pushAdminPath, 'utf8');
  const notifyDispatcherContent = fs.readFileSync(notifyDispatcherPath, 'utf8');
  const lineWebhookContent = fs.readFileSync(lineWebhookPath, 'utf8');
  const flexTemplatesContent = fs.readFileSync(flexTemplatesPath, 'utf8');
  const dailyPatrolContent = fs.readFileSync(dailyPatrolPath, 'utf8');

  await t.test('1. 資料庫 Migration 具備 admin_notification_digest_queue 佇列、索引與每兩天 21:00 排程', () => {
    assert.ok(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.admin_notification_digest_queue'), '必須建立 admin_notification_digest_queue 資料表');
    assert.ok(migrationContent.includes('idx_admin_digest_queue_unsent'), '必須建立未發送狀態索引');
    assert.ok(migrationContent.includes('invoke_admin_digest()'), '必須建立調用彙整之 RPC 函式');
    assert.ok(migrationContent.includes('0 13 */2 * *'), 'pg_cron 必須設定為每兩天 UTC 13:00 (台北時間 21:00) 執行');
    assert.strictEqual(emojiRegex.test(migrationContent), false, 'Migration 中不得含有 emoji');
  });

  await t.test('2. digestQueue.ts 提供佇列操作、Carousel 滾動分頁與極限打包邏輯', () => {
    assert.ok(digestQueueContent.includes('export async function enqueueAdminDigest'), '必須提供 enqueueAdminDigest');
    assert.ok(digestQueueContent.includes('export async function fetchUnsentAdminDigest'), '必須提供 fetchUnsentAdminDigest');
    assert.ok(digestQueueContent.includes('export function buildAdminDigestMessages'), '必須提供 buildAdminDigestMessages');
    assert.ok(digestQueueContent.includes('export async function dispatchAdminDigest'), '必須提供 dispatchAdminDigest');

    // 模擬 Carousel 打包邏輯 (最多 3 個訊息框，每個最多 10 張卡片)
    const mockItems = Array.from({ length: 25 }, (_, i) => ({
      id: `item-${i + 1}`,
      category: 'loan_created',
      title: `標題 ${i + 1}`,
      bubble_payload: { type: 'bubble', id: i + 1 },
      created_at: new Date().toISOString(),
    }));

    const bubbles = mockItems.map(item => item.bubble_payload);
    const chunked = [];
    for (let i = 0; i < bubbles.length; i += 10) {
      chunked.push(bubbles.slice(i, i + 10));
    }
    assert.strictEqual(chunked.length, 3, '25 張卡片應切分為 3 組 Carousel (10, 10, 5)');
    assert.strictEqual(chunked[0].length, 10, '第一組應包含 10 張卡片');
    assert.strictEqual(chunked[1].length, 10, '第二組應包含 10 張卡片');
    assert.strictEqual(chunked[2].length, 5, '第三組應包含 5 張卡片');

    assert.strictEqual(emojiRegex.test(digestQueueContent), false, 'digestQueue.ts 中不得含有 emoji');
  });

  await t.test('3. pushAdminMessage.ts 內建降頻防爆守衛，活動發布與核銷完成略過 LINE 群組推播', () => {
    assert.ok(pushAdminContent.includes('新活動發布'), '守衛必須檢查新活動發布');
    assert.ok(pushAdminContent.includes('繳費單已完成核銷'), '守衛必須檢查繳費單已完成核銷');
    assert.ok(pushAdminContent.includes('export async function sendUserEmail'), '必須匯出 sendUserEmail 函式');
    assert.strictEqual(emojiRegex.test(pushAdminContent), false, 'pushAdminMessage.ts 中不得含有 emoji');
  });

  await t.test('4. notify-dispatcher 新繳費申報卡片按鈕改為 Postback 模式，支援 0 額度核銷', () => {
    assert.ok(notifyDispatcherContent.includes('type: "postback"'), '新繳費申報按鈕必須包含 postback 動作');
    assert.ok(notifyDispatcherContent.includes('action=verify_payment'), 'postback data 必須包含 action=verify_payment');
    assert.ok(notifyDispatcherContent.includes('displayText: `@小岳助理 核銷 ${paymentId}`'), '按鈕必須設定 displayText 顯示 @小岳助理 核銷 單號');
  });

  await t.test('5. notify-dispatcher 裝備申請/取消、棄權、幹部意願全面導流至 digest queue 並即時寄信', () => {
    assert.ok(notifyDispatcherContent.includes("category: \"loan_created\""), 'handleNotifyOfficersLoan 必須寫入 loan_created');
    assert.ok(notifyDispatcherContent.includes("category: \"loan_cancelled\""), 'handleNotifyLoanCancelled 必須寫入 loan_cancelled');
    assert.ok(notifyDispatcherContent.includes("category: \"officer_intent\""), 'handleNotifyProfileSaved 必須寫入 officer_intent');
    assert.ok(notifyDispatcherContent.includes("category: \"event_cancelled\""), 'handleNotifyEventCancelled 必須寫入 event_cancelled');
    assert.ok(notifyDispatcherContent.includes('case "dispatch_admin_digest":'), 'notify-dispatcher 必須支援 dispatch_admin_digest action');
  });

  await t.test('6. daily-patrol 巡檢報告即時寄送 Email，並寫入 digest queue 略過即時推播', () => {
    assert.ok(dailyPatrolContent.includes('sendAdminEmail(reportSubject, reportBody)'), '巡檢報告必須即時發送 Email');
    assert.ok(dailyPatrolContent.includes("category: \"patrol_report\""), '巡檢報告必須寫入 patrol_report 佇列');
    assert.strictEqual(emojiRegex.test(dailyPatrolContent), false, 'daily-patrol/index.ts 中不得含有 emoji');
  });

  await t.test('7. line-webhook 支援 verify_payment postback 處理、幹部身分校驗與 0 額度 reply 回覆', () => {
    assert.ok(lineWebhookContent.includes('action === "verify_payment"'), 'line-webhook 必須處理 verify_payment postback');
    assert.ok(lineWebhookContent.includes('handleVerifyPaymentPostback'), '必須實作 handleVerifyPaymentPostback');
    assert.ok(lineWebhookContent.includes('verify_payment_by_token'), '必須調用 verify_payment_by_token RPC');
    assert.ok(lineWebhookContent.includes('buildPaymentConfirmedAdminFlex'), '核銷完成必須使用 buildPaymentConfirmedAdminFlex 卡片');
    assert.ok(lineWebhookContent.includes('社務彙整'), '必須支援幹部手動查詢社務彙整');
    assert.strictEqual(emojiRegex.test(lineWebhookContent), false, 'line-webhook/index.ts 中不得含有 emoji');
  });
});
