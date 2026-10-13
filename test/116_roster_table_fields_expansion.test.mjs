import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('116. 報名名冊表格擴充國籍、身分證字號/護照號碼與取消原因驗證套件', () => {
  it('1. WebAdminRoster.tsx: MemberInfo 與 SignupRow 介面必須定義 nationality 與 cancel_reason', () => {
    const src = fs.readFileSync(
      path.join(rootDir, 'src/pages/web-admin/WebAdminRoster.tsx'),
      'utf8'
    );

    assert.ok(
      src.includes('nationality?: string;') &&
        src.includes('cancel_reason?: string;'),
      'WebAdminRoster.tsx 必須在型別中包含 nationality 與 cancel_reason'
    );
  });

  it('2. WebAdminRoster.tsx: ALL_COLUMNS 必須包含國籍、身分證字號 / 護照號碼與取消原因欄位', () => {
    const src = fs.readFileSync(
      path.join(rootDir, 'src/pages/web-admin/WebAdminRoster.tsx'),
      'utf8'
    );

    assert.ok(
      src.includes("key: 'nationality'") &&
        src.includes("label: '國籍'") &&
        src.includes("getNationalityLabel(r.members?.nationality, 'zh')"),
      'ALL_COLUMNS 必須包含國籍欄位並使用 getNationalityLabel 格式化'
    );

    assert.ok(
      src.includes("key: 'id_card'") &&
        src.includes("label: '身分證字號 / 護照號碼'"),
      'ALL_COLUMNS 的 id_card 標籤必須為「身分證字號 / 護照號碼」'
    );

    assert.ok(
      src.includes("key: 'cancel_reason'") &&
        src.includes("label: '取消原因'"),
      'ALL_COLUMNS 必須包含取消原因欄位'
    );
  });

  it('3. WebAdminRoster.tsx: loadSignups 查詢必須選取 cancel_reason，且搜尋關鍵字支援國籍與取消原因檢索', () => {
    const src = fs.readFileSync(
      path.join(rootDir, 'src/pages/web-admin/WebAdminRoster.tsx'),
      'utf8'
    );

    assert.ok(
      src.includes('cancel_reason,') &&
        src.includes('(m.nationality || \'\').toLowerCase().includes(searchKeyword.toLowerCase())') &&
        src.includes('(s.cancel_reason || \'\').toLowerCase().includes(searchKeyword.toLowerCase())'),
      'loadSignups 必須選取 cancel_reason 且 filteredSignups 關鍵字比對必須包含國籍與取消原因'
    );
  });

  it('4. event.ts 與 supabaseClient.ts: SignupApplicant 型別與名冊載入函式必須支援 nationality 與 cancelReason', () => {
    const eventTypesSrc = fs.readFileSync(
      path.join(rootDir, 'src/types/event.ts'),
      'utf8'
    );
    const clientSrc = fs.readFileSync(
      path.join(rootDir, 'src/utils/supabaseClient.ts'),
      'utf8'
    );

    assert.ok(
      eventTypesSrc.includes('nationality?: string;') &&
        eventTypesSrc.includes('cancelReason?: string;'),
      'SignupApplicant 介面必須包含 nationality 與 cancelReason'
    );

    assert.ok(
      clientSrc.includes('nationality: item.nationality || \'\',') &&
        clientSrc.includes('cancelReason: item.cancelReason || item.cancel_reason || \'\','),
      'fetchAdminEventSignupsFromSupabase 必須映射 nationality 與 cancelReason'
    );
  });

  it('5. ApplicantModals.tsx: 手機版個資彈窗必須顯示國籍、身分證字號 / 護照號碼與取消原因', () => {
    const modalSrc = fs.readFileSync(
      path.join(rootDir, 'src/components/admin/ApplicantModals.tsx'),
      'utf8'
    );

    assert.ok(
      modalSrc.includes('國籍：') &&
        modalSrc.includes('getNationalityLabel(profileModalApplicant.nationality, \'zh\')'),
      'ApplicantModals.tsx 必須顯示國籍'
    );

    assert.ok(
      modalSrc.includes('身分證字號 / 護照號碼：'),
      'ApplicantModals.tsx 證件號碼標籤必須為「身分證字號 / 護照號碼：」'
    );

    assert.ok(
      modalSrc.includes('profileModalApplicant.cancelReason') &&
        modalSrc.includes('取消原因：'),
      'ApplicantModals.tsx 必須在有取消原因時顯示取消原因'
    );
  });
});
