import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('108. 前端純 Supabase 架構與 GAS 唯讀降級備援全面移除驗證 (v0.1.282)', () => {
  const rootDir = process.cwd();

  it('1. App.tsx 必須徹底移除 GAS get_profile 與 check_officer_status 備援', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src', 'App.tsx'), 'utf8');
    assert.ok(!code.includes('action=get_profile'), 'App.tsx 不得含有 GAS get_profile');
    assert.ok(!code.includes('action=check_officer_status'), 'App.tsx 不得含有 GAS check_officer_status');
    assert.ok(!code.includes('GAS_API_URL'), 'App.tsx 不得引入 GAS_API_URL');
  });

  it('2. Dashboard.tsx 必須徹底移除 GAS get_my_status 備援', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'Dashboard.tsx'), 'utf8');
    assert.ok(!code.includes('action=get_my_status'), 'Dashboard.tsx 不得含有 GAS get_my_status');
    assert.ok(!code.includes('GAS_API_URL'), 'Dashboard.tsx 不得引入 GAS_API_URL');
  });

  it('3. Register.tsx 載入個資不得 fallback 至 GAS，且通知改用 notifyDispatcher', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'Register.tsx'), 'utf8');
    assert.ok(!code.includes('action=get_profile'), 'Register.tsx 不得含有 GAS get_profile');
    assert.ok(code.includes("notifyDispatcher('notify_profile_saved'"), 'Register.tsx 必須透過 notifyDispatcher 發送推播');
  });

  it('4. Borrow.tsx 裝備清單與身分查詢不得 fallback 至 GAS，且推播改用 notifyDispatcher', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'Borrow.tsx'), 'utf8');
    assert.ok(!code.includes('action=get_my_status'), 'Borrow.tsx 不得含有 GAS get_my_status');
    assert.ok(!code.includes('GAS_API_URL'), 'Borrow.tsx 不得引入 GAS_API_URL');
    assert.ok(code.includes("notifyDispatcher('notify_officers_loan'"), 'Borrow.tsx 必須透過 notifyDispatcher 發送推播');
  });

  it('5. Payment.tsx 未繳清單不得 fallback 至 GAS，且推播改用 notifyDispatcher', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'Payment.tsx'), 'utf8');
    assert.ok(!code.includes('action=get_unpaid'), 'Payment.tsx 不得含有 GAS get_unpaid');
    assert.ok(code.includes("notifyDispatcher('notify_officers_payment'"), 'Payment.tsx 必須透過 notifyDispatcher 發送推播');
  });

  it('6. History.tsx 繳費歷史不得 fallback 至 GAS', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'History.tsx'), 'utf8');
    assert.ok(!code.includes('action=get_payment_history'), 'History.tsx 不得含有 GAS get_payment_history');
    assert.ok(!code.includes('GAS_API_URL'), 'History.tsx 不得引入 GAS_API_URL');
  });

  it('7. Achievements.tsx 歷史活動不得 fallback 至 GAS，且心得推播改用 notifyDispatcher', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'Achievements.tsx'), 'utf8');
    assert.ok(!code.includes('action=get_past_activities'), 'Achievements.tsx 不得含有 GAS get_past_activities');
    assert.ok(code.includes("notifyDispatcher('notify_reflection_submitted'"), 'Achievements.tsx 必須透過 notifyDispatcher 發送推播');
  });

  it('8. AdminEvents.tsx 與 AdminEventsHistory.tsx 必須徹底移除 GAS 活動清單與名冊備援', () => {
    const eventsCode = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'AdminEvents.tsx'), 'utf8');
    const historyCode = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'AdminEventsHistory.tsx'), 'utf8');
    assert.ok(!eventsCode.includes('action=get_admin_events'), 'AdminEvents.tsx 不得含有 GAS get_admin_events');
    assert.ok(!eventsCode.includes('action=get_event_signups'), 'AdminEvents.tsx 不得含有 GAS get_event_signups');
    assert.ok(!historyCode.includes('action=get_admin_events'), 'AdminEventsHistory.tsx 不得含有 GAS get_admin_events');
    assert.ok(!historyCode.includes('action=get_event_signups'), 'AdminEventsHistory.tsx 不得含有 GAS get_event_signups');
  });

  it('9. 財務與借還審核推播均已改走 notifyDispatcher', () => {
    const loansCode = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'AdminLoans.tsx'), 'utf8');
    const financeCode = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'AdminFinance.tsx'), 'utf8');
    const confirmCode = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'ConfirmPayment.tsx'), 'utf8');
    const webFinanceCode = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'web-admin', 'WebAdminFinance.tsx'), 'utf8');
    const webRosterCode = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'web-admin', 'WebAdminRoster.tsx'), 'utf8');

    assert.ok(loansCode.includes("notifyDispatcher('notify_loan_status_updated'"), 'AdminLoans.tsx 使用 notifyDispatcher');
    assert.ok(financeCode.includes("notifyDispatcher('notify_payment_confirmed'"), 'AdminFinance.tsx 使用 notifyDispatcher');
    assert.ok(confirmCode.includes("notifyDispatcher('notify_payment_confirmed'"), 'ConfirmPayment.tsx 使用 notifyDispatcher');
    assert.ok(webFinanceCode.includes("notifyDispatcher('notify_payment_confirmed'"), 'WebAdminFinance.tsx 使用 notifyDispatcher');
    assert.ok(webRosterCode.includes("notifyDispatcher('send_event_notifications'"), 'WebAdminRoster.tsx 使用 notifyDispatcher');
  });
});
