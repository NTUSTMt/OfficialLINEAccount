import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AddPaymentDrawer.tsx exports drawer with multi-member selection and amount customization', () => {
  assert.ok(fs.existsSync('src/components/admin/AddPaymentDrawer.tsx'), 'src/components/admin/AddPaymentDrawer.tsx must exist');
  const code = fs.readFileSync('src/components/admin/AddPaymentDrawer.tsx', 'utf8');

  // Exports
  assert.match(code, /export const AddPaymentDrawer/, 'Must export AddPaymentDrawer');
  assert.match(code, /export interface AddPaymentDrawerProps/, 'Must export AddPaymentDrawerProps interface');

  // Props requirement
  assert.match(code, /isOpen\s*:\s*boolean/, 'Props must contain isOpen: boolean');
  assert.match(code, /onClose\s*:\s*\(\)\s*=>\s*void/, 'Props must contain onClose: () => void');
  assert.match(code, /events\s*:\s*AdminEvent\[\]/, 'Props must contain events: AdminEvent[]');
  assert.match(code, /members\s*:\s*AdminMemberListItem\[\]/, 'Props must contain members: AdminMemberListItem[]');
  assert.match(code, /officerUserId\s*:\s*string/, 'Props must contain officerUserId: string');
  assert.match(code, /onSuccess\?\s*:\s*\(\)\s*=>\s*void/, 'Props must contain onSuccess?: () => void');

  // Form fields
  assert.match(code, /款項名稱/, 'Must include 款項名稱 input');
  assert.match(code, /關聯活動/, 'Must include 關聯活動 select');
  assert.match(code, /無關聯特定活動/, 'Must include 無關聯特定活動 option');
  assert.match(code, /款項類別/, 'Must include 款項類別 select');
  assert.match(code, /統一金額/, 'Must include 統一金額 input');
  assert.match(code, /備註說明/, 'Must include 備註說明 input');

  // Dual modes
  assert.match(code, /從活動成員選取/, 'Must support 从活動成員選取');
  assert.match(code, /從全社名冊搜尋選取/, 'Must support 从全社名冊搜尋選取');
  assert.match(code, /全選/, 'Must have 全選 button');
  assert.match(code, /全消/, 'Must have 全消 button');

  // Selected Members Roster
  assert.match(code, /社員姓名/, 'Must have 社員姓名 column');
  assert.match(code, /應繳金額/, 'Must have 應繳金額 column');
  assert.match(code, /操作/, 'Must have 操作 column');

  // Notification checkbox
  assert.match(code, /建立後立即透過 LINE 發送繳費通知卡片 \(含回報按鈕\)/, 'Must have LINE reminder checkbox');

  // Integration
  assert.match(code, /createManualPaymentRequestsInSupabase/, 'Must call createManualPaymentRequestsInSupabase');
  assert.match(code, /notifyDispatcher/, 'Must call notifyDispatcher');
  assert.match(code, /notify_payment_reminder/, 'Must send notify_payment_reminder');
});

test('AddPaymentDrawer.tsx contains no emojis in code or comments', () => {
  if (fs.existsSync('src/components/admin/AddPaymentDrawer.tsx')) {
    const code = fs.readFileSync('src/components/admin/AddPaymentDrawer.tsx', 'utf8');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(code), 'No emojis allowed in AddPaymentDrawer.tsx');
  }
});

test('webAdmin.css contains supporting styles for AddPaymentDrawer', () => {
  const css = fs.readFileSync('src/pages/web-admin/webAdmin.css', 'utf8');
  assert.match(css, /\.wa-add-payment-drawer/, 'CSS should define .wa-add-payment-drawer');
});
