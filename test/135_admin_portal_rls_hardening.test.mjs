import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('135. Admin Portal 寬鬆 RLS 策略清除驗證', () => {
  const rootDir = process.cwd();
  const rpcPath = path.join(rootDir, 'supabase/admin_portal_rpc.sql');
  const migrationPath = path.join(rootDir, 'supabase/migrations/20261023_security_remediation_p3.sql');
  const rpcSql = fs.readFileSync(rpcPath, 'utf8');
  const migExists = fs.existsSync(migrationPath);
  const migSql = migExists ? fs.readFileSync(migrationPath, 'utf8') : '';

  it('1. admin_portal_rpc.sql 不得包含 Allow anon 寬鬆策略之建立語句', () => {
    assert.strictEqual(
      rpcSql.includes('CREATE POLICY "Allow anon read members"'),
      false,
      '禁止 Allow anon read members'
    );
    assert.strictEqual(
      rpcSql.includes('CREATE POLICY "Allow anon update members"'),
      false,
      '禁止 Allow anon update members'
    );
    assert.strictEqual(
      rpcSql.includes('CREATE POLICY "Allow anon read payments"'),
      false,
      '禁止 Allow anon read payments'
    );
    assert.strictEqual(
      rpcSql.includes('CREATE POLICY "Allow anon read loans"'),
      false,
      '禁止 Allow anon read loans'
    );
  });

  it('2. migration 腳本必須包含明確的 DROP POLICY 清理陳述式', () => {
    assert.ok(migExists, '必須存在 migration 腳本');
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon read members" ON members;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon update members" ON members;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon read payments" ON payments;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon update payments" ON payments;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon insert payments" ON payments;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon read loans" ON loans;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon update loans" ON loans;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon insert loans" ON loans;'));
  });
});
