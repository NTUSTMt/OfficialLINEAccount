import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('107. 惡意檔案上傳防禦與儲存型 XSS 阻絕測試 (File Upload & Stored XSS Defense)', () => {
  it('1. validateImageUploadFile 必須嚴格拒絕 SVG 檔案以防止 XML 嵌入式 XSS 攻擊', async () => {
    const { validateImageUploadFile } = await import('../src/utils/image.ts');

    // SVG MIME 類型拒絕
    const svgMimeFile = { name: 'safe_photo.jpg', type: 'image/svg+xml', size: 1024 };
    const resMime = validateImageUploadFile(svgMimeFile);
    assert.strictEqual(resMime.valid, false, '必須拒絕 image/svg+xml 檔案');
    assert.ok(resMime.error?.includes('image/svg+xml'), '錯誤訊息必須明確指出不支援 image/svg+xml');

    // SVG 副檔名拒絕 (哪怕偽造 MIME)
    const svgExtFile = { name: 'payload.svg', type: 'image/png', size: 1024 };
    const resExt = validateImageUploadFile(svgExtFile);
    assert.strictEqual(resExt.valid, false, '必須拒絕 .svg 副檔名檔案');
    assert.ok(resExt.error?.includes('.svg'), '錯誤訊息必須明確指出拒絕 .svg');
  });

  it('2. validateImageUploadFile 必須嚴格拒絕 HTML, JS, PHP, EXE 等可執行與腳本副檔名', async () => {
    const { validateImageUploadFile } = await import('../src/utils/image.ts');

    const dangerousFiles = [
      { name: 'exploit.html', type: 'image/jpeg', size: 1024 },
      { name: 'exploit.htm', type: 'image/png', size: 1024 },
      { name: 'script.js', type: 'image/jpeg', size: 1024 },
      { name: 'shell.php', type: 'image/jpeg', size: 1024 },
      { name: 'malware.exe', type: 'image/jpeg', size: 1024 },
      { name: 'script.sh', type: 'image/jpeg', size: 1024 }
    ];

    for (const f of dangerousFiles) {
      const res = validateImageUploadFile(f);
      assert.strictEqual(res.valid, false, `副檔名 ${f.name} 必須被拒絕`);
      assert.ok(res.error?.includes('禁止上傳此副檔名檔案'), `錯誤訊息必須指明禁止副檔名: ${res.error}`);
    }
  });

  it('3. validateImageUploadFile 必須嚴格限制檔案大小不得超過 10MB', async () => {
    const { validateImageUploadFile } = await import('../src/utils/image.ts');

    const oversizedFile = { name: 'giant_photo.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 };
    const resOver = validateImageUploadFile(oversizedFile);
    assert.strictEqual(resOver.valid, false, '超過 10MB 的檔案必須被拒絕');
    assert.ok(resOver.error?.includes('超出限制'), '錯誤訊息需包含大小限制提示');

    const validSizeFile = { name: 'normal_photo.jpg', type: 'image/jpeg', size: 4 * 1024 * 1024 };
    const resValid = validateImageUploadFile(validSizeFile);
    assert.strictEqual(resValid.valid, true, '合規大小的合法圖片必須允許通過');
  });

  it('4. validateImageUploadFile 必須允許常規合法照片格式 (JPEG, PNG, WebP, GIF, HEIC)', async () => {
    const { validateImageUploadFile } = await import('../src/utils/image.ts');

    const validFiles = [
      { name: 'fitness_proof.jpg', type: 'image/jpeg', size: 2048 },
      { name: 'fitness_proof.png', type: 'image/png', size: 2048 },
      { name: 'receipt.webp', type: 'image/webp', size: 2048 },
      { name: 'summit.gif', type: 'image/gif', size: 2048 },
      { name: 'iphone_photo.heic', type: 'image/heic', size: 2048 }
    ];

    for (const f of validFiles) {
      const res = validateImageUploadFile(f);
      assert.strictEqual(res.valid, true, `合法檔案 ${f.name} 應通過驗證`);
      assert.strictEqual(res.error, undefined);
    }
  });

  it('5. sanitizeUrl 必須嚴格阻絕 javascript: 與 data:text/html 等 XSS 惡意連結協定', async () => {
    const { sanitizeUrl } = await import('../src/utils/image.ts');

    assert.strictEqual(sanitizeUrl('javascript:alert(document.cookie)'), undefined, '必須阻斷 javascript: 偽協定');
    assert.strictEqual(sanitizeUrl('JAVASCRIPT:alert(1)'), undefined, '必須阻斷大寫 JAVASCRIPT: 偽協定');
    assert.strictEqual(sanitizeUrl('vbscript:msgbox(1)'), undefined, '必須阻斷 vbscript: 偽協定');
    assert.strictEqual(sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), undefined, '必須阻斷 data:text/html 偽協定');

    // 正常協定必須通過
    assert.strictEqual(sanitizeUrl('https://lh3.googleusercontent.com/d/123'), 'https://lh3.googleusercontent.com/d/123');
    assert.strictEqual(sanitizeUrl('line://ti/p/@test'), 'line://ti/p/@test');
    assert.strictEqual(sanitizeUrl('mailto:club@ntust.edu.tw'), 'mailto:club@ntust.edu.tw');
    assert.strictEqual(sanitizeUrl('tel:+886912345678'), 'tel:+886912345678');
  });

  it('6. 前端所有上傳點 (Register, Payment, Achievements, WebAdminEvents, WebAdminInventory, AdminEvents, AdminInventory) 均已導入 validateImageUploadFile', () => {
    const filesToCheck = [
      'src/pages/Register.tsx',
      'src/pages/Payment.tsx',
      'src/pages/Achievements.tsx',
      'src/pages/web-admin/WebAdminEvents.tsx',
      'src/pages/web-admin/WebAdminInventory.tsx',
      'src/pages/AdminEvents.tsx',
      'src/pages/AdminInventory.tsx'
    ];

    for (const fileRel of filesToCheck) {
      const content = fs.readFileSync(path.join(rootDir, fileRel), 'utf8');
      assert.ok(
        content.includes('validateImageUploadFile'),
        `${fileRel} 必須導入並調用 validateImageUploadFile 進行檔案格式與安全性檢查`
      );
    }
  });
});
