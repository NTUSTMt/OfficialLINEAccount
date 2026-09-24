import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('84. 電腦版幹部工作站認證與 JWT 簽發驗證 (Web Admin Auth & JWT)', () => {
  const edgeFnPath = path.resolve('supabase/functions/line-auth/index.ts');
  const edgeFnContent = fs.readFileSync(edgeFnPath, 'utf8');

  const webAuthPath = path.resolve('src/utils/webAuth.ts');
  const webAuthContent = fs.readFileSync(webAuthPath, 'utf8');

  it('應驗證 line-auth Edge Function 包含 LINE OAuth2 授權碼交換端點與參數', () => {
    assert.ok(
      edgeFnContent.includes('https://api.line.me/oauth2/v2.1/token'),
      '必須包含 LINE OAuth2 Token 交換 API'
    );
    assert.ok(
      edgeFnContent.includes("grant_type: 'authorization_code'"),
      '必須包含 grant_type 為 authorization_code'
    );
    assert.ok(
      edgeFnContent.includes('https://api.line.me/v2/profile'),
      '必須包含 LINE Profile API 取得 userId'
    );
  });

  it('應驗證 line-auth 簽發之 Custom JWT 規格完全符合 Supabase 鑑權規範 (8小時有效)', () => {
    assert.ok(
      edgeFnContent.includes("role: 'authenticated'"),
      'JWT payload 必須包含 role: authenticated'
    );
    assert.ok(
      edgeFnContent.includes('is_officer: isOfficer'),
      'JWT payload 必須包含 is_officer 宣告'
    );
    assert.ok(
      edgeFnContent.includes("aud: 'authenticated'"),
      'JWT payload 必須包含 aud: authenticated'
    );
    assert.ok(
      edgeFnContent.includes(".setExpirationTime('8h')"),
      'JWT 效期必須嚴格設定為 8 小時'
    );
    assert.ok(
      edgeFnContent.includes("alg: 'HS256'"),
      'JWT 簽名演算法必須為 HS256'
    );
  });

  it('應驗證 webAuth.ts 具備 CSRF 防偽驗證權杖生成與比對防護', () => {
    assert.ok(
      webAuthContent.includes('generateSecureState'),
      'webAuth.ts 必須具備安全 state 生成函式'
    );
    assert.ok(
      webAuthContent.includes('CSRF state mismatch'),
      'webAuth.ts 必須在 state 不符時阻絕授權交換'
    );
    assert.ok(
      webAuthContent.includes('sessionStorage.removeItem'),
      'webAuth.ts 必須在比對後立即銷毀暫存 state'
    );
  });

  it('應驗證 webAuth.ts 8 小時 Session 逾期偵測與安全銷毀', () => {
    assert.ok(
      webAuthContent.includes('Date.now() > session.expiresAt'),
      'webAuth.ts 必須檢驗 expiresAt 逾期'
    );
    assert.ok(
      webAuthContent.includes('8 * 60 * 60 * 1000'),
      'webAuth.ts 必須設定 8 小時有效期'
    );
  });

  it('應驗證 App.tsx 路由系統杜絕電腦端非預期 LIFF 初始化', () => {
    const appPath = path.resolve('src/App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(
      appContent.includes("path.startsWith('/admin-web')"),
      'App.tsx 必須豁免 /admin-web 觸發 liff.init'
    );
    assert.ok(
      appContent.includes("!location.pathname.startsWith('/admin-web')"),
      'App.tsx 必須在 /admin-web 隱藏手機版全域導航選單'
    );
    assert.ok(
      appContent.includes('path="/admin-web/login"'),
      'App.tsx 必須獨立註冊 /admin-web/login 登入路由杜絕重導向死鎖循環'
    );
  });

  it('應驗證 webAuth.ts 具備 React StrictMode 換票防重 (inFlightExchange) 與雙重儲存相容', () => {
    assert.ok(
      webAuthContent.includes('inFlightExchange'),
      'webAuth.ts 必須具備 inFlightExchange 快取防止 StrictMode 雙重掛載造成 CSRF mismatch'
    );
    assert.ok(
      webAuthContent.includes('localStorage.getItem'),
      'webAuth.ts 必須同時相容 localStorage 與 sessionStorage 防範狀態遺失'
    );
  });
});
