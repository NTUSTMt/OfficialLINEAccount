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

  it('4. webAuth.ts 與 WebAdminLogin.tsx: 支援從 LIFF_URLS 解析公開 Channel ID 並直接顯示登入啟動錯誤', () => {
    const webAuthSrc = fs.readFileSync(
      path.join(rootDir, 'src/utils/webAuth.ts'),
      'utf8'
    );
    const webLoginSrc = fs.readFileSync(
      path.join(rootDir, 'src/pages/web-admin/WebAdminLogin.tsx'),
      'utf8'
    );

    assert.ok(
      webAuthSrc.includes('export const resolveLineChannelId') &&
        webAuthSrc.includes('LIFF_URLS.ADMIN_EVENTS'),
      'webAuth.ts 必須具備 resolveLineChannelId 並支援由 LIFF_URLS 解析預設 Channel ID'
    );

    assert.ok(
      webLoginSrc.includes('setLoginError') &&
        webLoginSrc.includes('LINE 登入啟動失敗'),
      'WebAdminLogin.tsx 必須捕捉 initiateLineLogin 例外並於錯誤橫幅直接顯示原因'
    );
  });

  it('5. notify-dispatcher: buildPaymentVerifiedPersonalFlex 必須支援 isEn 中英兩版個人核銷通知 Flex 卡片', () => {
    const notifySrc = fs.readFileSync(
      path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts'),
      'utf8'
    );

    assert.ok(
      notifySrc.includes('isEn?: boolean;') &&
        notifySrc.includes('const titleText = isEn ? "Payment Confirmed" : "繳費核銷完成";') &&
        notifySrc.includes('const labelName = isEn ? "Member:" : "申報社員：";') &&
        notifySrc.includes('const labelId = isEn ? "Payment ID:" : "繳費單號：";'),
      'buildPaymentVerifiedPersonalFlex 必須依 isEn 切換中英文標題與欄位標籤'
    );

    assert.ok(
      notifySrc.includes('Payment Confirmed: ${items} (NT$ ${amount})'),
      'handleNotifyPaymentConfirmed 必須依 isEn 切換個人推播 altPersonalText'
    );
  });

  it('6. Borrow.tsx: 裝備租借申請送出後必須依社員語系發送中英兩版 Flex 卡片確認訊息', () => {
    const borrowSrc = fs.readFileSync(
      path.join(rootDir, 'src/pages/Borrow.tsx'),
      'utf8'
    );

    assert.ok(
      borrowSrc.includes('loanOrderFlexMessage') &&
        borrowSrc.includes('await liff.sendMessages([loanOrderFlexMessage as any]);'),
      'Borrow.tsx 必須透過 liff.sendMessages 發送 loanOrderFlexMessage Flex 卡片'
    );
    assert.ok(
      borrowSrc.includes("isEn ? 'Equipment Loan Order Submitted' : '我的裝備租借預訂單'"),
      'Borrow.tsx 確認卡片必須依 isEn 切換中英文標題'
    );
  });

  it('7. line-webhook: handleConfirmWaitlist 必須查詢 title,title_en 並依 prefLang 切換活動名稱', () => {
    const webhookSrc = fs.readFileSync(
      path.join(rootDir, 'supabase/functions/line-webhook/index.ts'),
      'utf8'
    );

    assert.ok(
      webhookSrc.includes('.select("title,title_en")') &&
        webhookSrc.includes('prefLang === "en" ? (event.title_en || event.title || "Event") : (event.title || "活動")'),
      'handleConfirmWaitlist 必須讀取 title_en 並依 prefLang 切換活動名稱顯示'
    );
  });

  it('8. notify-dispatcher, flexTemplates 與 WebAdminLoans.tsx: 裝備租借狀態更新卡片必須格式化純英/純中狀態值且電腦版後台同步觸發推播', () => {
    const notifySrc = fs.readFileSync(
      path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts'),
      'utf8'
    );
    const flexSrc = fs.readFileSync(
      path.join(rootDir, 'supabase/functions/line-webhook/flexTemplates.ts'),
      'utf8'
    );
    const webLoansSrc = fs.readFileSync(
      path.join(rootDir, 'src/pages/web-admin/WebAdminLoans.tsx'),
      'utf8'
    );

    assert.ok(
      notifySrc.includes('statusMapEn') &&
        notifySrc.includes('statusTextEn') &&
        notifySrc.includes('statusTextZh'),
      'notify-dispatcher buildLoanStatusUpdatedFlex 必須將狀態值格式化為純英文與純中文'
    );
    assert.ok(
      flexSrc.includes('statusMapEn') &&
        flexSrc.includes('statusTextEn') &&
        flexSrc.includes('statusTextZh'),
      'flexTemplates buildLoanStatusUpdatedFlex 必須將狀態值格式化為純英文與純中文'
    );
    assert.ok(
      webLoansSrc.includes("notifyDispatcher('notify_loan_status_updated'"),
      'WebAdminLoans.tsx 儲存狀態成功後必須呼叫 notifyDispatcher 發送 notify_loan_status_updated'
    );
  });
});

