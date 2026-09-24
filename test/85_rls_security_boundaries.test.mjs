import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('85. 資料庫 RLS 權限邊界與資安遷移防護驗證 (RLS Security Boundaries)', () => {
  const securitySqlPath = path.resolve('supabase/desktop_admin_security.sql');
  const securitySql = fs.readFileSync(securitySqlPath, 'utf8');

  const rollbackSqlPath = path.resolve('supabase/rollback_desktop_admin_security.sql');
  const rollbackSql = fs.readFileSync(rollbackSqlPath, 'utf8');

  const baseSchemaPath = path.resolve('supabase/schema.sql');
  const baseSchema = fs.readFileSync(baseSchemaPath, 'utf8');

  it('應驗證 desktop_admin_security.sql 建立 audit_logs 表且啟用 RLS 政策', () => {
    assert.ok(
      securitySql.includes('CREATE TABLE IF NOT EXISTS audit_logs'),
      '必須建立 audit_logs 表'
    );
    assert.ok(
      securitySql.includes('ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;'),
      'audit_logs 必須啟用 RLS'
    );
    assert.ok(
      securitySql.includes('CREATE POLICY "Service role full access audit" ON audit_logs'),
      'audit_logs 必須允許 service_role 完全存取'
    );
    assert.ok(
      securitySql.includes('CREATE POLICY "Authenticated insert audit" ON audit_logs'),
      'audit_logs 必須允許 authenticated 寫入日誌'
    );
    assert.ok(
      securitySql.includes('CREATE POLICY "Officers read audit" ON audit_logs'),
      'audit_logs 僅限幹部可讀取'
    );
  });

  it('應驗證 members 表嚴格防護個資：幹部讀取全部，一般社員僅限自身', () => {
    assert.ok(
      securitySql.includes('CREATE POLICY "Officers can read all members" ON members'),
      '必須包含幹部讀取全體社員政策'
    );
    assert.ok(
      securitySql.includes("(auth.jwt() ->> 'is_officer')::boolean = true"),
      '幹部判定必須取自 JWT is_officer claim 杜絕偽造'
    );
    assert.ok(
      securitySql.includes('CREATE POLICY "Members can read own data" ON members'),
      '必須包含社員讀取自身資料政策'
    );
    assert.ok(
      securitySql.includes("line_user_id = auth.jwt() ->> 'sub'"),
      '社員自身比對必須強制綁定 JWT sub 欄位'
    );
  });

  it('應驗證 event_signups, loans, payments 表之 RLS 權限對稱防護', () => {
    assert.ok(
      securitySql.includes('CREATE POLICY "Officers can manage all signups" ON event_signups'),
      'event_signups 必須配置幹部完整管理政策'
    );
    assert.ok(
      securitySql.includes('CREATE POLICY "Officers can manage all loans" ON loans'),
      'loans 必須配置幹部完整管理政策'
    );
    assert.ok(
      securitySql.includes('CREATE POLICY "Officers can manage all payments" ON payments'),
      'payments 必須配置幹部完整管理政策'
    );
    assert.ok(
      securitySql.includes('CREATE POLICY "Members can read own payments" ON payments'),
      'payments 必須配置社員僅可讀取自身繳費紀錄'
    );
  });

  it('應驗證 rollback_desktop_admin_security.sql 提供一鍵完整回滾能力', () => {
    assert.ok(
      rollbackSql.includes('DROP POLICY IF EXISTS "Officers can read all members" ON members;'),
      '回滾腳本必須移除幹部 members 政策'
    );
    assert.ok(
      rollbackSql.includes('DROP POLICY IF EXISTS "Officers can manage all payments" ON payments;'),
      '回滾腳本必須移除 payments 政策'
    );
    assert.ok(
      rollbackSql.includes('DROP TABLE IF EXISTS audit_logs CASCADE;'),
      '回滾腳本必須支援乾淨移除 audit_logs 表'
    );
  });

  it('應驗證既有公開讀取政策保持完整 (保證手機 LIFF 裝備與活動清單秒開)', () => {
    assert.ok(
      baseSchema.includes('CREATE POLICY "Public read equipments" ON equipments'),
      'equipments 必須維持公開讀取政策'
    );
    assert.ok(
      baseSchema.includes('CREATE POLICY "Public read events" ON events'),
      'events 必須維持公開讀取非草稿活動政策'
    );
  });
});
