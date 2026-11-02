import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('137. Vercel 安全標頭 HSTS 驗證', () => {
  const rootDir = process.cwd();
  const vercelPath = path.join(rootDir, 'vercel.json');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));

  it('1. vercel.json 必須在全站 headers 中包含 Strict-Transport-Security', () => {
    const globalHeaderRule = vercelConfig.headers.find((h) => h.source === '/(.*)');
    assert.ok(globalHeaderRule, '必須有針對全站 /(.*) 的標頭規則');

    const hsts = globalHeaderRule.headers.find((header) => header.key === 'Strict-Transport-Security');
    assert.ok(hsts, '必須設定 Strict-Transport-Security');
    assert.ok(hsts.value.includes('max-age=63072000'), 'max-age 必須至少兩年');
    assert.ok(hsts.value.includes('includeSubDomains'), '必須包含 includeSubDomains');
    assert.ok(hsts.value.includes('preload'), '必須包含 preload');
  });
});
