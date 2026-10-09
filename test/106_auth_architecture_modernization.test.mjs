import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('106. 第二階段身分鑑權架構升級與 BOLA/IDOR 防護驗證 (Phase 2 Auth Modernization)', () => {
  const lineAuthSource = fs.readFileSync(path.resolve('supabase/functions/line-auth/index.ts'), 'utf8');
  const adminPortalSql = fs.readFileSync(path.resolve('supabase/admin_portal_rpc.sql'), 'utf8');
  const memberProfileSql = fs.readFileSync(path.resolve('supabase/member_profile_rpc.sql'), 'utf8');
  const dashboardSql = fs.readFileSync(path.resolve('supabase/get_my_dashboard.sql'), 'utf8');

  it('應驗證 line-auth Edge Function 支援 LIFF ID Token 驗證與簽發 Supabase Custom JWT', () => {
    assert.ok(
      lineAuthSource.includes('body.idToken') || lineAuthSource.includes('body.id_token'),
      'line-auth 必須支援 idToken 參數解析'
    );
    assert.ok(
      lineAuthSource.includes('https://api.line.me/oauth2/v2.1/verify'),
      'line-auth 必須向 LINE 端點校驗 ID Token 簽章'
    );
    assert.ok(
      lineAuthSource.includes('sub: userId') && lineAuthSource.includes("role: 'authenticated'"),
      'line-auth 必須為已驗證身分簽署 authenticated JWT'
    );
  });

  it('應驗證 admin_portal_rpc.sql 之 is_officer 支援 JWT Claim 鑑權與防身分偽冒 (Anti-Spoofing)', () => {
    assert.ok(
      adminPortalSql.includes("auth.jwt() ->> 'is_officer'"),
      'is_officer 必須直接讀取已簽章之 JWT is_officer 宣告'
    );
    assert.ok(
      adminPortalSql.includes("v_jwt_officer IS NOT TRUE"),
      '非幹部 JWT 嘗試傳入他人幹部 ID 時必須直接拒絕 (Anti-Spoofing)'
    );
  });

  it('應驗證 member_profile_rpc.sql 具備 BOLA/IDOR 跨帳號越權讀取與寫入防禦', () => {
    assert.ok(
      memberProfileSql.includes("Forbidden: Identity mismatch (禁止越權讀取他人個資)"),
      'get_member_profile 必須攔截跨帳號越權讀取'
    );
    assert.ok(
      memberProfileSql.includes("Forbidden: Identity mismatch (禁止越權修改他人資料)"),
      'save_member_profile 必須攔截跨帳號越權修改'
    );
  });

  it('應驗證 get_my_dashboard.sql 具備 BOLA/IDOR 儀表板越權防護', () => {
    assert.ok(
      dashboardSql.includes("Forbidden: Identity mismatch (禁止越權讀取他人儀表板)"),
      'get_my_dashboard 必須攔截非本人儀表板查詢'
    );
  });
});
