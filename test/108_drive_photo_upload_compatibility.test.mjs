import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('108. Google Drive 相片上傳相容性與回傳欄位檢測 (Drive Photo Upload Compatibility)', () => {
  const rootDir = process.cwd();
  const gasWorkerPath = path.join(rootDir, 'src/gas_worker.js');
  const registerPath = path.join(rootDir, 'src/pages/Register.tsx');
  const paymentPath = path.join(rootDir, 'src/pages/Payment.tsx');
  const achievementsPath = path.join(rootDir, 'src/pages/Achievements.tsx');
  const webAdminEventsPath = path.join(rootDir, 'src/pages/web-admin/WebAdminEvents.tsx');

  it('1. gas_worker.js 必須在 _handleUploadDriveFiles 回傳 urls, uploadedUrls, imageUrl 完整欄位', () => {
    const code = fs.readFileSync(gasWorkerPath, 'utf8');
    assert.ok(code.includes('urls: uploadedUrls'), 'gas_worker.js 必須回傳 urls 陣列');
    assert.ok(code.includes('uploadedUrls: uploadedUrls'), 'gas_worker.js 必須回傳 uploadedUrls 陣列');
    assert.ok(code.includes('imageUrl:'), 'gas_worker.js 必須回傳 imageUrl 單一圖檔網址');
  });

  it('2. gas_worker.js 必須輸出 lh3.googleusercontent.com/d/ CDN 直連網址 (=s0)', () => {
    const code = fs.readFileSync(gasWorkerPath, 'utf8');
    assert.ok(
      code.includes('https://lh3.googleusercontent.com/d/') && code.includes('=s0'),
      'gas_worker.js 必須將 Drive 檔案轉為 =s0 直連格式'
    );
  });

  it('3. gas_worker.js 之 doGet 必須放行相片上傳與刪除動作', () => {
    const code = fs.readFileSync(gasWorkerPath, 'utf8');
    const doGetSection = code.substring(code.indexOf('function doGet'), code.indexOf('function doPost'));
    assert.ok(doGetSection.includes('upload_drive_file'), 'doGet 必須放行 upload_drive_file');
    assert.ok(doGetSection.includes('delete_drive_file'), 'doGet 必須放行 delete_drive_file');
  });

  it('4. 前端 Register, Payment, Achievements, WebAdminEvents 均具備容錯欄位解析', () => {
    const regCode = fs.readFileSync(registerPath, 'utf8');
    const payCode = fs.readFileSync(paymentPath, 'utf8');
    const achCode = fs.readFileSync(achievementsPath, 'utf8');
    const webEventCode = fs.readFileSync(webAdminEventsPath, 'utf8');

    assert.ok(
      regCode.includes('uploadResult.urls || uploadResult.uploadedUrls'),
      'Register.tsx 必須具備 urls / uploadedUrls 容錯'
    );
    assert.ok(
      payCode.includes('uploadResult.urls || uploadResult.uploadedUrls'),
      'Payment.tsx 必須具備 urls / uploadedUrls 容錯'
    );
    assert.ok(
      achCode.includes('uploadResult.urls || uploadResult.uploadedUrls'),
      'Achievements.tsx 必須具備 urls / uploadedUrls 容錯'
    );
    assert.ok(
      webEventCode.includes('gasData.urls || gasData.uploadedUrls'),
      'WebAdminEvents.tsx 必須具備 urls / uploadedUrls 容錯'
    );
  });
});
