import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('115. 繳費申報個人 Flex 卡片化、推播多軌鑑權與幹部真實 LINE 頭貼修復驗證套件', () => {
  it('1. Payment.tsx: 一般有金額繳費申報完成後必須透過 liff.sendMessages 發送 type: flex 卡片收據', () => {
    const paymentSrc = fs.readFileSync(
      path.join(rootDir, 'src/pages/Payment.tsx'),
      'utf8'
    );

    assert.ok(
      paymentSrc.includes('paymentReceiptFlexMessage') &&
        paymentSrc.includes('await liff.sendMessages([paymentReceiptFlexMessage as any]);'),
      'Payment.tsx 必須透過 liff.sendMessages 發送 paymentReceiptFlexMessage Flex 卡片'
    );
    assert.ok(
      paymentSrc.includes("const titleText = isEn ? 'Payment Submitted' : '繳費申報完成';"),
      'Payment.tsx 必須支援中英雙語標題'
    );
    assert.strictEqual(
      paymentSrc.includes("type: 'text',\n                text: msgText"),
      false,
      'Payment.tsx 一般繳費申報不得再發送純文字收據'
    );
  });

  it('2. api.ts 與 notify-dispatcher: 必須支援 idToken、accessToken、customJwt 與 verifyToken 多軌鑑權', () => {
    const apiSrc = fs.readFileSync(
      path.join(rootDir, 'src/utils/api.ts'),
      'utf8'
    );
    const lineClientSrc = fs.readFileSync(
      path.join(rootDir, 'supabase/functions/_shared/lineClient.ts'),
      'utf8'
    );
    const notifySrc = fs.readFileSync(
      path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts'),
      'utf8'
    );

    assert.ok(
      apiSrc.includes('export const getAccessToken') &&
        apiSrc.includes('export const getCustomJwt') &&
        apiSrc.includes('x-line-access-token'),
      'src/utils/api.ts notifyDispatcher 必須同時傳遞 accessToken 與 customJwt'
    );

    assert.ok(
      lineClientSrc.includes('export async function verifyLineAccessToken') &&
        lineClientSrc.includes('export async function verifyCustomJwt'),
      'lineClient.ts 必須提供 verifyLineAccessToken 與 verifyCustomJwt'
    );

    assert.ok(
      notifySrc.includes('verifyCustomJwt') &&
        notifySrc.includes('verifyLineIdToken') &&
        notifySrc.includes('verifyLineAccessToken') &&
        notifySrc.includes('hasPaymentVerifyToken'),
      'notify-dispatcher/index.ts 必須支援 Custom JWT、LINE ID Token、LINE Access Token 與繳費 verifyToken 多軌驗證'
    );
  });

  it('3. line-webhook: sendOfficerMenu 必須透過 getLineUserProfile 取得幹部真實 LINE 頭貼並排除舊預設圖', () => {
    const lineClientSrc = fs.readFileSync(
      path.join(rootDir, 'supabase/functions/_shared/lineClient.ts'),
      'utf8'
    );
    const webhookSrc = fs.readFileSync(
      path.join(rootDir, 'supabase/functions/line-webhook/index.ts'),
      'utf8'
    );

    assert.ok(
      lineClientSrc.includes('export async function getLineUserProfile'),
      'lineClient.ts 必須提供 getLineUserProfile 查詢 LINE 官方 Profile API'
    );
    assert.ok(
      webhookSrc.includes('getLineUserProfile(uid)') &&
        webhookSrc.includes('!rawPhotoUrl.includes("ysnp.gov.tw")'),
      'line-webhook/index.ts sendOfficerMenu 必須呼叫 getLineUserProfile 並過濾 ysnp.gov.tw 預設圖'
    );
  });
});
