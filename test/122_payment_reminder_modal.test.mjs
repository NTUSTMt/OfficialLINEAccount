import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('122. PaymentReminderModal component test', () => {
  it('PaymentReminderModal.tsx exists and exports PaymentReminderModal with single-send confirmation', () => {
    assert.ok(fs.existsSync('src/components/admin/PaymentReminderModal.tsx'), 'File must exist');
    const code = fs.readFileSync('src/components/admin/PaymentReminderModal.tsx', 'utf8');
    assert.match(code, /export const PaymentReminderModal/);
    assert.match(code, /export interface PaymentReminderModalProps/);
    assert.match(code, /notifyDispatcher/);
    assert.match(code, /notify_payment_reminder/);
  });

  it('PaymentReminderModal contains no emojis', () => {
    if (!fs.existsSync('src/components/admin/PaymentReminderModal.tsx')) {
      assert.fail('File src/components/admin/PaymentReminderModal.tsx does not exist');
    }
    const code = fs.readFileSync('src/components/admin/PaymentReminderModal.tsx', 'utf8');
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(code), false, 'Must not contain emojis');
  });

  it('handles unbound LINE account warning and disabled send button', () => {
    if (!fs.existsSync('src/components/admin/PaymentReminderModal.tsx')) {
      assert.fail('File src/components/admin/PaymentReminderModal.tsx does not exist');
    }
    const code = fs.readFileSync('src/components/admin/PaymentReminderModal.tsx', 'utf8');
    assert.match(code, /該對象未綁定 LINE 帳號，無法發送推播通知/);
    assert.match(code, /!item\.line_user_id/);
  });

  it('renders realistic Flex card preview and transparent error display', () => {
    if (!fs.existsSync('src/components/admin/PaymentReminderModal.tsx')) {
      assert.fail('File src/components/admin/PaymentReminderModal.tsx does not exist');
    }
    const code = fs.readFileSync('src/components/admin/PaymentReminderModal.tsx', 'utf8');
    assert.match(code, /前往回報匯款/);
    assert.match(code, /請儘速完成匯款並於系統回報末五碼/);
    assert.match(code, /toLocaleString\(\)/);
    assert.match(code, /!res\.success/);
  });
});
