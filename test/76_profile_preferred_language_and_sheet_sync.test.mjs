import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('76. 社員個人資料偏好語言持久化與活動專屬試算表即時同步測試 (v0.1.175)', () => {
  const rootDir = process.cwd();

  it('1. update_admin_member_rpc 必須支援 preferred_language 且具備 NOT FOUND 防呆', () => {
    const sqlPath = path.join(rootDir, 'supabase', 'admin_portal_rpc.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    assert.ok(
      sqlContent.includes("preferred_language = COALESCE(p_data->>'preferred_language', preferred_language)"),
      'update_admin_member_rpc 必須包含 preferred_language 欄位更新'
    );

    assert.ok(
      sqlContent.includes('IF NOT FOUND THEN') &&
      sqlContent.includes("RETURN jsonb_build_object('success', false"),
      'update_admin_member_rpc 必須在更新 0 筆時回傳 success: false'
    );
  });

  it('2. supabaseClient.ts 必須精確攔截 RPC 失敗訊息且在直更模式校驗更新筆數', () => {
    const clientPath = path.join(rootDir, 'src', 'utils', 'supabaseClient.ts');
    const clientContent = fs.readFileSync(clientPath, 'utf8');

    assert.ok(
      clientContent.includes('rpcRes && rpcRes.success === false'),
      'updateMemberFullDetailInSupabase 必須校驗 rpcRes.success === false'
    );

    assert.ok(
      clientContent.includes('!data || data.length === 0'),
      'updateMemberFullDetailInSupabase 必須校驗直更模式 0 筆異動'
    );

    assert.ok(
      clientContent.includes('updatePayload.membership_expires_at = null'),
      'updateMemberFullDetailInSupabase 必須清理空日期字串以防 PostgreSQL 22007'
    );
  });

  it('3. MemberDetailEdit.tsx 儲存成功後必須呼叫 loadData 確保資料庫與畫面一致', () => {
    const editPagePath = path.join(rootDir, 'src', 'pages', 'MemberDetailEdit.tsx');
    const editContent = fs.readFileSync(editPagePath, 'utf8');

    assert.ok(
      editContent.includes('setSuccessMessage') &&
      editContent.includes('await loadData()'),
      'MemberDetailEdit 儲存後必須呼叫 await loadData() 重新載入最新資料'
    );
  });

  it('4. gas.js 必須包含 _appendToEventSpreadsheet 實現後端自動化寫入獨立專屬試算表', () => {
    const gasPath = path.join(rootDir, 'src', 'gas.js');
    const gasContent = fs.readFileSync(gasPath, 'utf8');

    assert.ok(
      gasContent.includes('function _appendToEventSpreadsheet('),
      'gas.js 必須實作 _appendToEventSpreadsheet 函式'
    );

    assert.ok(
      gasContent.includes('_syncSignupToEventSpecificSheet') &&
      gasContent.includes('_appendToEventSpreadsheet(eventId, signupData'),
      'Sync Worker 處理報名時必須調用 _appendToEventSpreadsheet'
    );
  });

  it('5. AdminEventCard 與 AdminEvents 必須實現先同步名冊後跳轉開表，杜絕時差', () => {
    const cardPath = path.join(rootDir, 'src', 'components', 'admin', 'AdminEventCard.tsx');
    const cardContent = fs.readFileSync(cardPath, 'utf8');

    const adminEventsPath = path.join(rootDir, 'src', 'pages', 'AdminEvents.tsx');
    const adminEventsContent = fs.readFileSync(adminEventsPath, 'utf8');

    assert.ok(
      cardContent.includes("isCreatingSheet ? '同步名冊中...' : '報名試算表'"),
      'AdminEventCard 必須在同步時顯示「同步名冊中...」狀態'
    );

    assert.ok(
      cardContent.includes('onCreateSheet(evt.id, true, true)'),
      'AdminEventCard 點擊報名試算表必須傳入 openAfterSync: true'
    );

    assert.ok(
      adminEventsContent.includes('openAfterSync: boolean = false') &&
      adminEventsContent.includes('window.open('),
      'AdminEvents.tsx handleCreateEventSheet 必須支援 openAfterSync 並開啟視窗'
    );
  });
});
