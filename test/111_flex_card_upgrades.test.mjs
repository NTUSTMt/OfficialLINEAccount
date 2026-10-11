import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

test('111. LINE 訊息卡片化與冗餘通知清理驗證 (Flex Card Upgrades & Notification Cleanup)', async (t) => {
  const lineWebhookPath = path.join(projectRoot, 'supabase/functions/line-webhook/index.ts');
  const flexTemplatesPath = path.join(projectRoot, 'supabase/functions/line-webhook/flexTemplates.ts');
  const notifyDispatcherPath = path.join(projectRoot, 'supabase/functions/notify-dispatcher/index.ts');
  const achievementsPath = path.join(projectRoot, 'src/pages/Achievements.tsx');

  const lineWebhookCode = fs.readFileSync(lineWebhookPath, 'utf8');
  const flexTemplatesCode = fs.readFileSync(flexTemplatesPath, 'utf8');
  const notifyDispatcherCode = fs.readFileSync(notifyDispatcherPath, 'utf8');
  const achievementsCode = fs.readFileSync(achievementsPath, 'utf8');

  const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;

  await t.test('1. flexTemplates.ts 提供 4 款新 Flex 卡片且 0 emoji', () => {
    assert.ok(flexTemplatesCode.includes('export function buildEventClosedFlex('), '必須包含 buildEventClosedFlex');
    assert.ok(flexTemplatesCode.includes('export function buildWaitlistConfirmedFlex('), '必須包含 buildWaitlistConfirmedFlex');
    assert.ok(flexTemplatesCode.includes('export function buildWaitlistFailedFlex('), '必須包含 buildWaitlistFailedFlex');
    assert.ok(flexTemplatesCode.includes('export function buildAdminAssistantGuideFlex('), '必須包含 buildAdminAssistantGuideFlex');

    // 檢查卡片定義段落中不得包含 emoji
    const closedSnippet = flexTemplatesCode.slice(flexTemplatesCode.indexOf('buildEventClosedFlex'));
    assert.strictEqual(emojiRegex.test(closedSnippet), false, '新增卡片中不得包含任何 emoji');
  });

  await t.test('2. line-webhook/index.ts 已移除個資填寫文字回覆且接入 Flex 卡片', () => {
    assert.strictEqual(lineWebhookCode.includes('handleMemberProfileNoticeReply'), false, '必須移除 handleMemberProfileNoticeReply');
    assert.strictEqual(lineWebhookCode.includes('我已完成個人資料填寫'), false, '不得再攔截我已完成個人資料填寫');
    assert.strictEqual(lineWebhookCode.includes('我已更新個人資料'), false, '不得再攔截我已更新個人資料');

    assert.ok(lineWebhookCode.includes('buildEventClosedFlex('), 'handleSignup closed 狀態必須發送 buildEventClosedFlex');
    assert.ok(lineWebhookCode.includes('buildWaitlistConfirmedFlex('), 'handleConfirmWaitlist 必須發送 buildWaitlistConfirmedFlex');
    assert.ok(lineWebhookCode.includes('buildWaitlistFailedFlex('), 'handleConfirmWaitlist 失敗必須發送 buildWaitlistFailedFlex');
    assert.ok(lineWebhookCode.includes('buildAdminAssistantGuideFlex()'), '幹部助理指引必須發送 buildAdminAssistantGuideFlex');
  });

  await t.test('3. notify-dispatcher/index.ts 已移除心得推播處理', () => {
    assert.strictEqual(notifyDispatcherCode.includes('handleNotifyReflectionSubmitted'), false, '必須移除 handleNotifyReflectionSubmitted');
    assert.strictEqual(notifyDispatcherCode.includes('case "notify_reflection_submitted":'), false, '路由中必須移除 notify_reflection_submitted');
  });

  await t.test('4. notify-dispatcher/index.ts 包含 5 款新增/更新之 Flex 卡片建構函式且 0 emoji', () => {
    assert.ok(notifyDispatcherCode.includes('buildLoanCancelledAdminFlex('), '必須包含 buildLoanCancelledAdminFlex');
    assert.ok(notifyDispatcherCode.includes('buildPaymentVerifiedPersonalFlex('), '必須包含 buildPaymentVerifiedPersonalFlex');
    assert.ok(notifyDispatcherCode.includes('buildPaymentConfirmedAdminFlex('), '必須包含 buildPaymentConfirmedAdminFlex');
    assert.ok(notifyDispatcherCode.includes('buildOfficerIntentAdminFlex('), '必須包含 buildOfficerIntentAdminFlex');
    assert.ok(notifyDispatcherCode.includes('buildEventCancelledAdminFlex('), '必須包含 buildEventCancelledAdminFlex');

    const flexSnippets = notifyDispatcherCode.slice(notifyDispatcherCode.indexOf('buildLoanCancelledAdminFlex'));
    assert.strictEqual(emojiRegex.test(flexSnippets), false, 'notify-dispatcher Flex 卡片定義中不得含有 emoji');
  });

  await t.test('5. notify-dispatcher/index.ts 裝備取消、繳費核銷、新幹部意願與正取取消均已接入 Flex 卡片', () => {
    assert.ok(notifyDispatcherCode.includes('buildLoanCancelledAdminFlex({'), 'handleNotifyOfficersLoanCancelled 必須調用 buildLoanCancelledAdminFlex');
    assert.ok(notifyDispatcherCode.includes('buildPaymentVerifiedPersonalFlex({'), 'handleNotifyPaymentConfirmed 個人推播必須調用 buildPaymentVerifiedPersonalFlex');
    assert.ok(notifyDispatcherCode.includes('buildPaymentConfirmedAdminFlex({'), 'handleNotifyPaymentConfirmed 幹部推播必須調用 buildPaymentConfirmedAdminFlex');
    assert.ok(notifyDispatcherCode.includes('buildOfficerIntentAdminFlex({'), 'handleNotifyOfficerIntent 必須調用 buildOfficerIntentAdminFlex');
    assert.ok(notifyDispatcherCode.includes('buildEventCancelledAdminFlex({'), 'handleNotifyEventCancelled 必須調用 buildEventCancelledAdminFlex');
  });

  await t.test('6. Achievements.tsx 已不再呼叫 notify_reflection_submitted', () => {
    assert.strictEqual(achievementsCode.includes('notify_reflection_submitted'), false, 'Achievements.tsx 不得再包含 notify_reflection_submitted');
    assert.strictEqual(achievementsCode.includes('notifyDispatcher'), false, 'Achievements.tsx 不得再 import 或呼叫 notifyDispatcher');
  });
});
