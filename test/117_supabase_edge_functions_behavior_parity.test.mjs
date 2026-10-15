import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('117. Supabase Edge Functions 與 GAS 行為等價性驗證 (Behavior Parity)', () => {
  const rootDir = process.cwd();
  const sharedMessagesPath = path.join(rootDir, 'supabase/functions/_shared/messages.ts');
  const sharedDateUtilsPath = path.join(rootDir, 'supabase/functions/_shared/dateUtils.ts');
  const lineWebhookFlexPath = path.join(rootDir, 'supabase/functions/line-webhook/flexTemplates.ts');
  const lineWebhookIndexPath = path.join(rootDir, 'supabase/functions/line-webhook/index.ts');
  const notifyDispatcherIndexPath = path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts');

  const messagesCode = fs.readFileSync(sharedMessagesPath, 'utf8');
  const dateUtilsCode = fs.readFileSync(sharedDateUtilsPath, 'utf8');
  const flexTemplatesCode = fs.readFileSync(lineWebhookFlexPath, 'utf8');
  const webhookCode = fs.readFileSync(lineWebhookIndexPath, 'utf8');
  const notifyCode = fs.readFileSync(notifyDispatcherIndexPath, 'utf8');

  it('1. 訊息字典 (messages.ts) 與欄位字典 (flexTemplates.ts) 零 Emoji 規範與雙語純淨度檢驗', () => {
    // 嚴禁出現常見 Emoji 符號
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(
      emojiRegex.test(messagesCode),
      false,
      'messages.ts 必須嚴格落實零 Emoji 規範'
    );

    // 確保包含中英文對照結構
    assert.ok(messagesCode.includes('export const messages = {'), '需定義 messages 物件');
    assert.ok(messagesCode.includes('zh:') && messagesCode.includes('en:'), '需包含中英文鍵值');
    assert.ok(flexTemplatesCode.includes('FIELD_ZH_MAP'), '需定義 FIELD_ZH_MAP 欄位純淨化映射表');
    assert.ok(flexTemplatesCode.includes('FIELD_EN_MAP'), '需定義 FIELD_EN_MAP 欄位純淨化映射表');
  });

  it('2. 台灣時區 (dateUtils.ts) 與 180 天時效判定 (signup_rpc)', () => {
    // 時區必須設定為 Asia/Taipei
    assert.ok(
      dateUtilsCode.includes('Asia/Taipei'),
      '時間解析與格式化必須指定 Asia/Taipei 時區'
    );
    assert.ok(dateUtilsCode.includes('export function isEventExpired'), '需提供 isEventExpired 函式');
    assert.ok(dateUtilsCode.includes('export function formatTaipeiDate'), '需提供 formatTaipeiDate 函式');

    // 180 天經歷/體能防呆時效檢查 (signup_rpc)
    const migrationPath = path.join(rootDir, 'supabase/migrations/20261009193000_update_signup_rpc_member_event_fields.sql');
    const migrationCode = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(
      migrationCode.includes('v_days_since_update > 180.0'),
      'signup_rpc 必須包含 180 天過期判定計算'
    );
  });

  it('3. Flex 訊息模板 (flexTemplates.ts) 視覺風格、按鈕顏色與零 Emoji 檢驗', () => {
    // 零 Emoji 檢驗
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(
      emojiRegex.test(flexTemplatesCode),
      false,
      'flexTemplates.ts 必須嚴格落實零 Emoji 規範'
    );

    // 品牌色與各類狀態按鈕顏色檢驗
    assert.ok(flexTemplatesCode.includes('#059669'), '主色綠按鈕 (#059669)');
    assert.ok(flexTemplatesCode.includes('#EA580C'), '未註冊警告橘紅 (#EA580C)');
    assert.ok(flexTemplatesCode.includes('#DC2626'), '資料未完整警示紅 (#DC2626)');
    assert.ok(flexTemplatesCode.includes('#D97706'), '經歷逾期琥珀黃 (#D97706)');

    // 核心卡片建構函式存在性
    assert.ok(flexTemplatesCode.includes('export function buildSignupSuccessFlex'), '報名成功卡片');
    assert.ok(flexTemplatesCode.includes('export function buildMemberNotFoundFlex'), '查無社員資料卡片');
    assert.ok(flexTemplatesCode.includes('export function buildProfileIncompleteFlex'), '資料未完整卡片');
    assert.ok(flexTemplatesCode.includes('export function buildProfileExpiredFlex'), '經歷時效更新卡片');
    assert.ok(flexTemplatesCode.includes('export function buildMoreServicesFlex'), '更多服務功能卡片');
  });

  it('4. LINE Webhook 報名與審核邏輯 (line-webhook/index.ts) 行為等價性', () => {
    // 依據社員 preferred_language 派發單卡片
    assert.ok(
      webhookCode.includes('preferred_language') || webhookCode.includes('prefLang'),
      'line-webhook 必須讀取社員偏好語言'
    );

    // 支援 handleSignup
    assert.ok(
      webhookCode.includes('signup_rpc') || webhookCode.includes('handleSignup'),
      'line-webhook 必須處理報名邏輯'
    );
  });

  it('5. 通知派發中樞 (notify-dispatcher/index.ts) 與 GAS 派發 Actions 行為對齊', () => {
    // 驗證關鍵推播 Actions
    const requiredActions = [
      'notify_officers_loan',
      'notify_loan_status_updated',
      'notify_officers_payment',
      'notify_payment_confirmed',
      'notify_profile_saved',
      'send_event_notifications'
    ];

    for (const action of requiredActions) {
      assert.ok(
        notifyCode.includes(action),
        `notify-dispatcher 必須支援 action: ${action}`
      );
    }

    // 支援 0 Emoji
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(
      emojiRegex.test(notifyCode),
      false,
      'notify-dispatcher/index.ts 必須嚴格落實零 Emoji 規範'
    );
  });
});
