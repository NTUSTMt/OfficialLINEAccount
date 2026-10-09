import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('109. 報名資料校驗 Flex 卡片升級與推播額度零浪費檢測 (Signup Flex & Quota Optimization)', () => {
  const rootDir = process.cwd();
  const flexTemplatesPath = path.join(rootDir, 'supabase/functions/line-webhook/flexTemplates.ts');
  const lineWebhookPath = path.join(rootDir, 'supabase/functions/line-webhook/index.ts');
  const notifyDispatcherPath = path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts');
  const messagesPath = path.join(rootDir, 'supabase/functions/_shared/messages.ts');

  it('1. flexTemplates.ts 必須提供 buildMemberNotFoundFlex 左右滑動雙語 Carousel', () => {
    const code = fs.readFileSync(flexTemplatesPath, 'utf8');
    assert.ok(code.includes('export function buildMemberNotFoundFlex'), '必須定義 buildMemberNotFoundFlex');
    assert.ok(code.includes('type: "carousel"'), '必須採用 Carousel 雙語兩張滑動卡片');
    assert.ok(code.includes('https://liff.line.me/2009217429-AhPRqAHg'), '必須附帶一鍵填寫資料 LIFF 連結');
  });

  it('2. flexTemplates.ts 必須提供 buildProfileIncompleteFlex 缺漏欄位清單與補齊按鈕', () => {
    const code = fs.readFileSync(flexTemplatesPath, 'utf8');
    assert.ok(code.includes('export function buildProfileIncompleteFlex'), '必須定義 buildProfileIncompleteFlex');
    assert.ok(code.includes('FIELD_EN_MAP'), '必須具備中英欄位對照轉換');
  });

  it('3. flexTemplates.ts 必須提供 buildProfileExpiredFlex 經歷時效更新提醒卡片', () => {
    const code = fs.readFileSync(flexTemplatesPath, 'utf8');
    assert.ok(code.includes('export function buildProfileExpiredFlex'), '必須定義 buildProfileExpiredFlex');
    assert.ok(code.includes('2009217429-jvj3ydDT'), '必須導向 Dashboard 更新體能經歷');
  });

  it('4. line-webhook handleSignup 遇到資料缺失時必須發送 Flex 卡片', () => {
    const code = fs.readFileSync(lineWebhookPath, 'utf8');
    assert.ok(code.includes('contents: buildMemberNotFoundFlex'), 'not_found_member 必須回覆 Flex 卡片');
    assert.ok(code.includes('contents: buildProfileIncompleteFlex'), 'profile_incomplete 必須回覆 Flex 卡片');
    assert.ok(code.includes('contents: buildProfileExpiredFlex'), 'profile_expired 必須回覆 Flex 卡片');
  });

  it('5. notify-dispatcher 新租借與新繳費申報必須使用 Flex 卡片發送給幹部群組', () => {
    const code = fs.readFileSync(notifyDispatcherPath, 'utf8');
    assert.ok(code.includes('flexContents: loanFlex'), '租借申請必須發送 loanFlex 卡片');
    assert.ok(code.includes('flexContents: paymentFlex'), '繳費申報必須發送 paymentFlex 卡片');
  });

  it('6. notify-dispatcher 繳費申報已移除對個人的重複 pushMessage 以節省每月推播額度', () => {
    const code = fs.readFileSync(notifyDispatcherPath, 'utf8');
    const paymentHandler = code.substring(
      code.indexOf('async function handleNotifyOfficersPayment'),
      code.indexOf('async function handleNotifyPaymentConfirmed')
    );
    assert.ok(!paymentHandler.includes('pushMessage(userId'), 'handleNotifyOfficersPayment 不得對個人進行 pushMessage');
  });

  it('7. messages.ts 報名失敗與提醒文字與 gas.js 原版保持 100% 相同語氣與字句', () => {
    const code = fs.readFileSync(messagesPath, 'utf8');
    assert.ok(code.includes('系統找不到您的社員資料！'), '查無資料文案必須與 gas.js 一致');
    assert.ok(code.includes('為了辦理平安保險與確保戶外活動安全'), '資料不完整文案必須與 gas.js 一致');
    assert.ok(code.includes('社團出團活動將依據您的「爬山經歷」與「體能狀況」進行審查與篩選'), '時效提醒文案必須與 gas.js 一致');
    assert.ok(code.includes('請耐心等候幹部審核，或是至個人主頁查詢進度'), '重複報名文案必須與 gas.js 一致');
  });
});
