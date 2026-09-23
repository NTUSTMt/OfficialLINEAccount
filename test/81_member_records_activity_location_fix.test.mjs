import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Member Records Activity Location Fix Tests', () => {
  const rootDir = process.cwd();

  it('should verify get_admin_member_records_rpc does not reference non-existent location column', () => {
    const migrationSql = fs.readFileSync(
      path.join(rootDir, 'supabase/fix_member_records_location_rpc.sql'),
      'utf8'
    );
    const portalSql = fs.readFileSync(
      path.join(rootDir, 'supabase/admin_portal_rpc.sql'),
      'utf8'
    );

    assert.ok(
      !migrationSql.includes('e.location'),
      'fix_member_records_location_rpc.sql must not reference e.location'
    );
    assert.ok(
      !portalSql.includes("'location', e.location"),
      'admin_portal_rpc.sql must not reference e.location in get_admin_member_records_rpc'
    );
    assert.ok(
      migrationSql.includes('get_admin_member_records_rpc'),
      'migration script must contain get_admin_member_records_rpc'
    );
  });

  it('should verify supabaseClient.ts fallback query does not request location column', () => {
    const sbContent = fs.readFileSync(
      path.join(rootDir, 'src/utils/supabaseClient.ts'),
      'utf8'
    );

    // 擷取 fetchMemberTimelineRecordsFromSupabase 區塊
    const startIndex = sbContent.indexOf('fetchMemberTimelineRecordsFromSupabase');
    assert.ok(startIndex > -1, 'supabaseClient must have fetchMemberTimelineRecordsFromSupabase');
    const funcContent = sbContent.substring(startIndex, startIndex + 3000);

    assert.ok(
      !funcContent.includes('location'),
      'fetchMemberTimelineRecordsFromSupabase must not request non-existent location column'
    );
  });

  it('should verify MemberRecords.tsx status badge mapping supports 備取 and 審核中', () => {
    const recordsContent = fs.readFileSync(
      path.join(rootDir, 'src/pages/MemberRecords.tsx'),
      'utf8'
    );

    assert.ok(
      recordsContent.includes("status.includes('備取')"),
      'MemberRecords should style 備取 with amber badge'
    );
    assert.ok(
      recordsContent.includes("status.includes('審核中')"),
      'MemberRecords should style 審核中 with amber badge'
    );
  });

  it('should verify zero emoji in modified files', () => {
    const recordsContent = fs.readFileSync(
      path.join(rootDir, 'src/pages/MemberRecords.tsx'),
      'utf8'
    );
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(recordsContent), 'MemberRecords.tsx must not contain emoji');
  });
});
