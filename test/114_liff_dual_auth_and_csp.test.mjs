import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('114. LIFF 雙軌鑑權、CSP 白名單與競態條件防禦驗證套件', () => {
  it('1. vercel.json: CSP connect-src 必須涵蓋 LINE LIFF 網域與 Google Apps Script', () => {
    const vercelConfig = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8')
    );
    const globalHeaderRule = (vercelConfig.headers || []).find((h) => h.source === '/(.*)');
    assert.ok(globalHeaderRule, 'vercel.json 必須包含全局路徑 /(.*) 標頭規則');
    const cspHeader = (globalHeaderRule.headers || []).find((h) => h.key === 'Content-Security-Policy');
    assert.ok(cspHeader, 'vercel.json 必須包含 Content-Security-Policy 標頭');
    const cspValue = cspHeader.value;

    assert.ok(cspValue.includes('https://*.line.me'), 'CSP 必須包含 https://*.line.me');
    assert.ok(cspValue.includes('https://*.line-apps.com'), 'CSP 必須包含 https://*.line-apps.com');
    assert.ok(cspValue.includes('https://*.line-scdn.net'), 'CSP 必須包含 https://*.line-scdn.net');
    assert.ok(cspValue.includes('https://script.google.com'), 'CSP 必須包含 https://script.google.com');
    assert.ok(cspValue.includes('https://script.googleusercontent.com'), 'CSP 必須包含 https://script.googleusercontent.com');
  });

  it('2. line-auth: 必須支援 accessToken 與 LINE Profile API 雙軌驗證', () => {
    const lineAuthSrc = fs.readFileSync(
      path.join(rootDir, 'supabase/functions/line-auth/index.ts'),
      'utf8'
    );

    assert.ok(
      lineAuthSrc.includes('accessToken') && lineAuthSrc.includes('https://api.line.me/v2/profile'),
      'line-auth 必須支援 accessToken 與 LINE Profile API 驗證'
    );
    assert.ok(
      lineAuthSrc.includes('idToken'),
      'line-auth 必須保留 idToken 驗證支援'
    );
  });

  it('3. App.tsx: 必須同時傳遞 idToken 與 accessToken 給 line-auth，並為 ProfileCheck 及 Dashboard 注入 jwtReady 守衛', () => {
    const appSrc = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');

    assert.ok(
      appSrc.includes('const accessToken = liff.getAccessToken();'),
      'App.tsx 必須獲取 liff.getAccessToken()'
    );
    assert.ok(
      appSrc.includes('accessToken: accessToken || undefined'),
      'App.tsx 呼叫 line-auth 時必須帶入 accessToken'
    );
    assert.ok(
      appSrc.includes('ProfileCheck({ userId, jwtReady, children }'),
      'ProfileCheck 必須接收 jwtReady 參數'
    );
    assert.ok(
      appSrc.includes('<ProfileCheck userId={liffInit.userId} jwtReady={liffInit.jwtReady}>'),
      'App.tsx 路由中 ProfileCheck 必須綁定 jwtReady'
    );
    assert.ok(
      appSrc.includes('<Dashboard userId={liffInit.userId} jwtReady={liffInit.jwtReady} />'),
      'App.tsx 路由中 Dashboard 必須綁定 jwtReady'
    );
  });

  it('4. Dashboard.tsx: 必須等待 jwtReady 就緒後才執行 fetchDashboardFromSupabase', () => {
    const dashSrc = fs.readFileSync(path.join(rootDir, 'src/pages/Dashboard.tsx'), 'utf8');

    assert.ok(
      dashSrc.includes('Dashboard({ userId, jwtReady }'),
      'Dashboard 組件簽章必須接收 jwtReady'
    );
    assert.ok(
      dashSrc.includes('if (jwtReady === false)'),
      'Dashboard 必須包含 jwtReady 等待判斷'
    );
  });
});
