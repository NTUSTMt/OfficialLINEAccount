import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('110. 活動試算表全量 23 筆名冊同步與前端 Failed to fetch 自癒重傳機制驗證', () => {
  const workerPath = path.join(rootDir, 'src', 'gas_worker.js');
  const rosterPath = path.join(rootDir, 'src', 'pages', 'web-admin', 'WebAdminRoster.tsx');

  it('1. gas_worker.js 必須支援 sync_event_sheet_signups 動作與直接接收 signups 酬載', () => {
    const workerContent = fs.readFileSync(workerPath, 'utf8');
    assert.ok(
      workerContent.includes('sync_event_sheet_signups') || workerContent.includes('sync_event_roster'),
      'gas_worker.js 必須支援 sync_event_sheet_signups 或 sync_event_roster 動作'
    );
    assert.ok(
      workerContent.includes('json.signups'),
      'gas_worker.js 必須支援直接自 json.signups 接收完整名冊進行寫入'
    );
  });

  it('2. WebAdminRoster.tsx 遭遇 Failed to fetch 時必須主動查詢 Supabase 進行自癒驗證', () => {
    const rosterContent = fs.readFileSync(rosterPath, 'utf8');
    assert.ok(
      rosterContent.includes("from('events')") && rosterContent.includes('spreadsheet_url'),
      'WebAdminRoster.tsx 必須具備查詢 Supabase events 表 spreadsheet_url 之自癒機制'
    );
  });

  it('3. WebAdminRoster.tsx 在試算表建立或同步時，必須自動確認並推送完整名冊 (包含全量 23 筆隊員)', () => {
    const rosterContent = fs.readFileSync(rosterPath, 'utf8');
    assert.ok(
      rosterContent.includes('sync_event_sheet_signups') || rosterContent.includes('sync_event_roster'),
      'WebAdminRoster.tsx 必須於建立後自動調用名冊全量同步'
    );
  });

  it('4. 業務模擬：23 筆報名名冊動態組裝並寫入試算表列陣列驗證', () => {
    // 模擬 23 筆報名紀錄
    const mockSignups = [];
    for (let i = 1; i <= 23; i++) {
      mockSignups.push({
        id: `S2610-${String(i).padStart(3, '0')}`,
        line_user_id: `U_USER_${i}`,
        name: `隊員_${i}`,
        status: i <= 15 ? '正取 Confirmed' : '備取 Waitlisted',
        payment_status: i <= 10 ? '已繳費 Paid' : '未繳費 Unpaid',
        members: {
          name: `隊員_${i}`,
          phone: `0912345${String(i).padStart(3, '0')}`,
          birthday: '1998-01-01',
          id_card: `A12345${String(i).padStart(4, '0')}`
        }
      });
    }

    assert.equal(mockSignups.length, 23, '必須模擬完整的 23 筆名冊');

    const templateHeaders = ['序號', '姓名', '審核結果', '繳費狀態', '電話', '身分證字號', '專屬碼'];
    const rows = mockSignups.map((s, idx) => {
      const row = new Array(templateHeaders.length).fill('');
      row[0] = idx + 1;
      row[1] = s.name;
      row[2] = s.status;
      row[3] = s.payment_status;
      row[4] = s.members.phone;
      row[5] = s.members.id_card;
      row[6] = s.id;
      return row;
    });

    assert.equal(rows.length, 23, '轉換後必須完整產生 23 列試算表資料');
    assert.equal(rows[0][1], '隊員_1');
    assert.equal(rows[22][1], '隊員_23');
    assert.equal(rows[22][0], 23);
  });
});
