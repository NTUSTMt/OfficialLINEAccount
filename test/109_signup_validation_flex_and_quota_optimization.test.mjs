import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('109. 報名資料校驗 Flex 卡片升級、零 Emoji、顏色同步與多語系適配 (Signup Flex & Color/Language Optimization)', () => {
  const rootDir = process.cwd();
  const flexTemplatesPath = path.join(rootDir, 'supabase/functions/line-webhook/flexTemplates.ts');
  const lineWebhookPath = path.join(rootDir, 'supabase/functions/line-webhook/index.ts');
  const notifyDispatcherPath = path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts');
  const messagesPath = path.join(rootDir, 'supabase/functions/_shared/messages.ts');

  it('1. flexTemplates.ts 需填寫資料卡片頂部橫條與按鈕顏色同步為 #EA580C 且 0 emoji', () => {
    const code = fs.readFileSync(flexTemplatesPath, 'utf8');
    assert.ok(code.includes('export function buildMemberNotFoundFlex'), '必須定義 buildMemberNotFoundFlex');
    assert.ok(code.includes('backgroundColor: "#EA580C"'), '頂部橫條必須為 #EA580C');
    assert.ok(code.includes('color: "#EA580C"'), '按鈕顏色必須同步為 #EA580C');
    assert.ok(!code.includes('⚠️ 報名失敗 / 需填寫資料'), '不得包含 emoji');
  });

  it('2. flexTemplates.ts 資料未完整卡片頂部與按鈕同步為 #DC2626，支援純中文與純英文映射', () => {
    const code = fs.readFileSync(flexTemplatesPath, 'utf8');
    assert.ok(code.includes('export function buildProfileIncompleteFlex'), '必須定義 buildProfileIncompleteFlex');
    assert.ok(code.includes('backgroundColor: "#DC2626"'), '頂部橫條必須為 #DC2626');
    assert.ok(code.includes('color: "#DC2626"'), '按鈕顏色必須同步為 #DC2626');
    assert.ok(code.includes('FIELD_ZH_MAP'), '必須具備純中文欄位對照');
    assert.ok(code.includes('FIELD_EN_MAP'), '必須具備純英文欄位對照');
    assert.ok(code.includes('return prefLang === "en" ? bubbleEn : bubbleZh'), '必須依語言回傳單張卡片');
  });

  it('3. flexTemplates.ts 經歷時效更新卡片頂部與按鈕同步為 #D97706', () => {
    const code = fs.readFileSync(flexTemplatesPath, 'utf8');
    assert.ok(code.includes('export function buildProfileExpiredFlex'), '必須定義 buildProfileExpiredFlex');
    assert.ok(code.includes('backgroundColor: "#D97706"'), '頂部橫條必須為 #D97706');
    assert.ok(code.includes('color: "#D97706"'), '按鈕顏色必須同步為 #D97706');
    assert.ok(code.includes('return prefLang === "en" ? bubbleEn : bubbleZh'), '必須依語言回傳單張卡片');
  });

  it('4. flexTemplates.ts 必須提供 buildSignupSuccessFlex 且 100% 採用 gas.js 文案、0 emoji', () => {
    const code = fs.readFileSync(flexTemplatesPath, 'utf8');
    assert.ok(code.includes('export function buildSignupSuccessFlex'), '必須定義 buildSignupSuccessFlex');
    assert.ok(code.includes('報名登記已送出！'), '必須包含報名登記已送出');
    assert.ok(code.includes('此階段為「報名登記與資格審核」'), '必須包含審核說明');
    assert.ok(code.includes('社團出團會依據爬山經驗與體能進行評估'), '必須包含體能經歷說明');
  });

  it('5. notify-dispatcher 與 flexTemplates 必須提供 buildLoanStatusUpdatedFlex 狀態更新卡片、0 emoji', () => {
    const code = fs.readFileSync(notifyDispatcherPath, 'utf8');
    assert.ok(code.includes('function buildLoanStatusUpdatedFlex'), 'notify-dispatcher 必須提供 buildLoanStatusUpdatedFlex');
    assert.ok(code.includes('裝備租借狀態更新通知'), '必須包含裝備租借狀態更新通知');
    assert.ok(code.includes('pushMessage(userId, [{'), '必須透過 pushMessage 發送 Flex 卡片');
  });

  it('6. line-webhook handleSignup 報名成功與資料缺失時均發送 Flex 卡片且支援多語系姓名與活動名稱', () => {
    const code = fs.readFileSync(lineWebhookPath, 'utf8');
    assert.ok(code.includes('contents: buildSignupSuccessFlex'), '報名成功必須回覆 buildSignupSuccessFlex 卡片');
    assert.ok(code.includes('result.event_title_en'), '必須支援英文活動名稱');
    assert.ok(code.includes('result.member_name'), '必須取用社員姓名');
    assert.ok(code.includes('contents: buildMemberNotFoundFlex'), 'not_found_member 必須回覆 Flex 卡片');
    assert.ok(code.includes('contents: buildProfileIncompleteFlex'), 'profile_incomplete 必須回覆 Flex 卡片');
    assert.ok(code.includes('contents: buildProfileExpiredFlex'), 'profile_expired 必須回覆 Flex 卡片');
  });

  it('7. notify-dispatcher 繳費申報已移除對個人的重複 pushMessage 以節省每月推播額度', () => {
    const code = fs.readFileSync(notifyDispatcherPath, 'utf8');
    const paymentHandler = code.substring(
      code.indexOf('async function handleNotifyOfficersPayment'),
      code.indexOf('async function handleNotifyPaymentConfirmed')
    );
    assert.ok(!paymentHandler.includes('pushMessage(userId'), 'handleNotifyOfficersPayment 不得對個人進行 pushMessage');
  });

  it('8. messages.ts 與 flexTemplates.ts 報名失敗與提醒文字與 gas.js 原版保持 100% 相同語氣且 0 emoji', () => {
    const code = fs.readFileSync(messagesPath, 'utf8');
    assert.ok(code.includes('系統找不到您的社員資料！'), '查無資料文案必須與 gas.js 一致');
    assert.ok(code.includes('為了辦理平安保險與確保戶外活動安全'), '資料不完整文案必須與 gas.js 一致');
    assert.ok(code.includes('社團出團活動將依據您的「爬山經歷」與「體能狀況」進行審查與篩選'), '時效提醒文案必須與 gas.js 一致');
    assert.ok(code.includes('請耐心等候幹部審核，或是至個人主頁查詢進度'), '重複報名文案必須與 gas.js 一致');
    assert.ok(!code.includes('🎉'), '不得含有 emoji');
  });
});
