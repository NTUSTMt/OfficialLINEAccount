import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('118. notify_payment_reminder and Flex card template', () => {
  const code = fs.readFileSync('supabase/functions/notify-dispatcher/index.ts', 'utf8');

  it('notify-dispatcher index.ts contains notify_payment_reminder case and handler', () => {
    assert.match(code, /case\s+"notify_payment_reminder":/);
    assert.match(code, /handleNotifyPaymentReminder/);
    assert.match(code, /前往回報匯款/);
  });

  it('contains payment reminder fields and zero emoji in handler', () => {
    // Zero emoji check
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(
      emojiRegex.test(code),
      false,
      'notify-dispatcher/index.ts must not contain emojis'
    );
    assert.match(code, /title/);
    assert.match(code, /amount/);
    assert.match(code, /dueDate/);
    assert.match(code, /notes/);
    assert.match(code, /bankInfo/);
    assert.match(code, /actionUrl/);
  });
});
