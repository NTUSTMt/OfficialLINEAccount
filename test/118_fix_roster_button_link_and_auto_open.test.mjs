import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('118. 幹部群組活動名冊按鈕與自動彈出名冊視窗檢驗 (Fix Cadre Roster Button Link and Auto-open)', () => {
  const rootDir = process.cwd();
  const notifyDispatcherPath = path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts');
  const flexTemplatesPath = path.join(rootDir, 'supabase/functions/line-webhook/flexTemplates.ts');
  const sharedMessagesPath = path.join(rootDir, 'supabase/functions/_shared/messages.ts');
  const adminEventsPath = path.join(rootDir, 'src/pages/AdminEvents.tsx');

  const notifyCode = fs.readFileSync(notifyDispatcherPath, 'utf8');
  const flexCode = fs.readFileSync(flexTemplatesPath, 'utf8');
  const messagesCode = fs.readFileSync(sharedMessagesPath, 'utf8');
  const adminEventsCode = fs.readFileSync(adminEventsPath, 'utf8');

  it('1. notify-dispatcher 正取取消通知應指向幹部專屬 LIFF (DSYjXqNK) 並攜帶 eventId 參數', () => {
    // 驗證 buildEventCancelledAdminFlex 實作
    assert.ok(
      notifyCode.includes('DSYjXqNK?liff.state='),
      'notify-dispatcher 必須使用幹部專屬 LIFF ID (DSYjXqNK)'
    );
    assert.ok(
      notifyCode.includes('/admin/events?eventId='),
      '目標路由必須指向 /admin/events 並攜帶 eventId 參數'
    );
    assert.strictEqual(
      notifyCode.includes('-jvj3ydDT?liff.state=%2Fadmin'),
      false,
      'notify-dispatcher 中嚴禁殘留使用 -jvj3ydDT 導向 /admin 的錯誤連結'
    );
  });

  it('2. notify-dispatcher 全體幹部通知連結 (裝備、財務、社員、活動) 皆應校正為 DSYjXqNK', () => {
    // 裝備租借審核
    assert.ok(
      notifyCode.includes('${liffChannelId}-DSYjXqNK?liff.state=%2Fadmin%2Floans') ||
      notifyCode.includes('${getLiffChannelId()}-DSYjXqNK?liff.state=%2Fadmin%2Floans'),
      '裝備租借審核必須使用幹部專屬 LIFF'
    );
    // 財務核銷
    assert.ok(
      notifyCode.includes('${getLiffChannelId()}-DSYjXqNK?liff.state=%2Fadmin%2Ffinance'),
      '財務核銷必須使用幹部專屬 LIFF'
    );
    // 社員名冊 / 幹部意願
    assert.ok(
      notifyCode.includes('${getLiffChannelId()}-DSYjXqNK?liff.state=%2Fadmin%2Fmembers'),
      '社員名冊必須使用幹部專屬 LIFF'
    );
  });

  it('3. flexTemplates.ts 與 messages.ts 幹部入口連結應校正為 DSYjXqNK', () => {
    assert.ok(
      flexCode.includes('2009217429-DSYjXqNK?liff.state=%2Fadmin%2Fevents'),
      'buildAdminAssistantGuideFlex 必須使用 2009217429-DSYjXqNK'
    );
    assert.strictEqual(
      flexCode.includes('2009217429-jvj3ydDT?liff.state=%2Fadmin%2Fevents'),
      false,
      'flexTemplates.ts 不得殘留 jvj3ydDT 指向 /admin/events'
    );

    assert.ok(
      messagesCode.includes('2009217429-DSYjXqNK?liff.state=%2Fadmin%2Fevents'),
      'messages.ts 幹部指引訊息必須使用 2009217429-DSYjXqNK'
    );
    assert.strictEqual(
      messagesCode.includes('2009217429-jvj3ydDT?liff.state=%2Fadmin%2Fevents'),
      false,
      'messages.ts 不得殘留 jvj3ydDT 指向 /admin/events'
    );
  });

  it('4. AdminEvents.tsx 支援提取 eventId 並於載入後自動開啟審核名冊視窗', () => {
    // 檢查 useSearchParams 與 eventId 提取
    assert.ok(
      adminEventsCode.includes('useSearchParams'),
      'AdminEvents 必須引用 useSearchParams'
    );
    assert.ok(
      adminEventsCode.includes('searchParams.get(\'eventId\')') ||
      adminEventsCode.includes('searchParams.get("eventId")'),
      'AdminEvents 必須提取 eventId 參數'
    );

    // 檢查自動開啟與 Ref 防重複觸發機制
    assert.ok(
      adminEventsCode.includes('hasAutoOpenedRef'),
      'AdminEvents 必須使用 hasAutoOpenedRef 防重複觸發'
    );
    assert.ok(
      adminEventsCode.includes('handleOpenSignupsModal(targetEvent)'),
      '比對到目標活動後應自動呼叫 handleOpenSignupsModal'
    );
  });

  it('5. 全檔案零 Emoji 檢驗 (Zero Emoji Rule Compliance)', () => {
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(notifyCode), false, 'notify-dispatcher 必須遵守零 Emoji 規範');
    assert.strictEqual(emojiRegex.test(flexCode), false, 'flexTemplates 必須遵守零 Emoji 規範');
    assert.strictEqual(emojiRegex.test(messagesCode), false, 'messages.ts 必須遵守零 Emoji 規範');
    assert.strictEqual(emojiRegex.test(adminEventsCode), false, 'AdminEvents.tsx 必須遵守零 Emoji 規範');
  });
});
