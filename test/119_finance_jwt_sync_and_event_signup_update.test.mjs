import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('119. 電腦版財務管理 JWT 同步與活動報名紀錄 RLS 寫入修復檢驗', () => {
  const rootDir = process.cwd();
  const supabaseClientPath = path.join(rootDir, 'src/utils/supabaseClient.ts');
  const webAuthPath = path.join(rootDir, 'src/utils/webAuth.ts');
  const webAdminLayoutPath = path.join(rootDir, 'src/pages/web-admin/WebAdminLayout.tsx');
  const webAdminFinancePath = path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx');

  const supabaseClientCode = fs.readFileSync(supabaseClientPath, 'utf8');
  const webAuthCode = fs.readFileSync(webAuthPath, 'utf8');
  const webAdminLayoutCode = fs.readFileSync(webAdminLayoutPath, 'utf8');
  const webAdminFinanceCode = fs.readFileSync(webAdminFinancePath, 'utf8');

  it('1. getSupabaseAuthToken 應支援 fallback 至 web_admin_session 之 jwt', () => {
    assert.ok(
      supabaseClientCode.includes("sessionStorage.getItem('web_admin_session')"),
      'getSupabaseAuthToken 必須檢查 web_admin_session'
    );
    assert.ok(
      supabaseClientCode.includes('session.jwt'),
      'getSupabaseAuthToken 必須解析 web_admin_session 之 jwt'
    );
  });

  it('2. webAuth.ts 換票成功與登出時應同步 setSupabaseAuthToken', () => {
    assert.ok(
      webAuthCode.includes('setSupabaseAuthToken(session.jwt)'),
      'exchangeLineCodeForSession 成功時必須同步 setSupabaseAuthToken(session.jwt)'
    );
    assert.ok(
      webAuthCode.includes('setSupabaseAuthToken(null)'),
      'webLogout 必須清空 setSupabaseAuthToken(null)'
    );
  });

  it('3. WebAdminLayout.tsx 載入驗證幹部身分時應確保 setSupabaseAuthToken(currentSession.jwt)', () => {
    assert.ok(
      webAdminLayoutCode.includes('setSupabaseAuthToken(currentSession.jwt)'),
      'WebAdminLayout 必須在驗證幹部身分後設定 Supabase Auth Token'
    );
  });

  it('4. updatePaymentAndLinkedStatusInSupabase 介面應支援 client 參數與 notes 欄位寫入', () => {
    assert.ok(
      supabaseClientCode.includes('client?: SupabaseClient;'),
      'updatePaymentAndLinkedStatusInSupabase 參數必須支援 client'
    );
    assert.ok(
      supabaseClientCode.includes('const sb = params.client || supabase;'),
      'updatePaymentAndLinkedStatusInSupabase 必須優先採用 params.client'
    );
    assert.ok(
      supabaseClientCode.includes('notes: params.notes'),
      'event_signups 更新欄位必須支援 notes'
    );
  });

  it('5. WebAdminFinance.tsx 四處核銷更新呼叫皆應注入 client', () => {
    // 1. handleVerifyItem
    const verifyItemIndex = webAdminFinanceCode.indexOf('handleVerifyItem = async');
    assert.ok(verifyItemIndex !== -1, '必須存在 handleVerifyItem');
    const verifyBlock = webAdminFinanceCode.slice(verifyItemIndex, verifyItemIndex + 1500);
    assert.ok(verifyBlock.includes('client'), 'handleVerifyItem 必須傳入 client');

    // 2. handleBatchVerify
    const batchVerifyIndex = webAdminFinanceCode.indexOf('handleBatchVerify = async');
    assert.ok(batchVerifyIndex !== -1, '必須存在 handleBatchVerify');
    const batchVerifyBlock = webAdminFinanceCode.slice(batchVerifyIndex, batchVerifyIndex + 1500);
    assert.ok(batchVerifyBlock.includes('client'), 'handleBatchVerify 必須傳入 client');

    // 3. handleBatchNotify
    const batchNotifyIndex = webAdminFinanceCode.indexOf('handleBatchNotify = async');
    assert.ok(batchNotifyIndex !== -1, '必須存在 handleBatchNotify');
    const batchNotifyBlock = webAdminFinanceCode.slice(batchNotifyIndex, batchNotifyIndex + 2500);
    assert.ok(batchNotifyBlock.includes('client'), 'handleBatchNotify 必須傳入 client');

    // 4. handleSaveDrawer
    const saveDrawerIndex = webAdminFinanceCode.indexOf('handleSaveDrawer = async');
    assert.ok(saveDrawerIndex !== -1, '必須存在 handleSaveDrawer');
    const saveDrawerBlock = webAdminFinanceCode.slice(saveDrawerIndex, saveDrawerIndex + 2500);
    assert.ok(saveDrawerBlock.includes('client'), 'handleSaveDrawer 必須傳入 client');
  });
});
