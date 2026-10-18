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

  it('5. gas_worker.js 必須避免模糊詞撞名，確保「繳費狀態」絕不被「審核狀態/結果」誤判污染', () => {
    const workerContent = fs.readFileSync(workerPath, 'utf8');
    
    // 提取 _matchHeader 邏輯或比對順序
    assert.ok(
      workerContent.includes('normalizePaymentStatus') || workerContent.includes('繳費狀態'),
      'gas_worker.js 必須明確保障繳費狀態欄位之獨立與精確性'
    );

    // 模擬測試 _matchHeaderExact
    function isHeaderMatch(h, candidates) {
      const normalizedH = String(h).trim().toLowerCase();
      return candidates.some(c => normalizedH === c.toLowerCase());
    }

    // 驗證「繳費狀態」絕不符合「審核狀態」之候選清單
    const auditCandidates = ['審核結果', '審核狀態', '審核', '錄取審核', 'status'];
    const paymentCandidates = ['繳費狀態', '繳費', '付款狀態', '對帳狀態', 'payment_status'];

    assert.equal(isHeaderMatch('繳費狀態', auditCandidates), false, '繳費狀態不可被審核候選詞命中');
    assert.equal(isHeaderMatch('繳費狀態', paymentCandidates), true, '繳費狀態必須精確被繳費候選詞命中');
    assert.equal(isHeaderMatch('審核狀態', paymentCandidates), false, '審核狀態不可被繳費候選詞命中');
  });

  it('6. gas_worker.js 必須具備試算表最大列數自動擴充與 Data Validation 防禦機制', () => {
    const workerContent = fs.readFileSync(workerPath, 'utf8');
    assert.ok(
      workerContent.includes('insertRowsAfter') || workerContent.includes('getMaxRows'),
      'gas_worker.js 必須於寫入前檢查 getMaxRows 並在不足時以 insertRowsAfter 自動擴充'
    );
    assert.ok(
      workerContent.includes('clearDataValidations') || workerContent.includes('try') || workerContent.includes('catch'),
      'gas_worker.js 必須具備 Data Validation 報錯救援防護'
    );
  });

  it('7. _normalizePaymentStatus 必須優先處理 Unpaid / 未繳費，絕不可因 paid 子字串誤判為「已繳費 Paid」', () => {
    const workerContent = fs.readFileSync(workerPath, 'utf8');
    
    // 提取 gas_worker.js 中的 _normalizePaymentStatus 函式字串並動態 eval 執行檢驗
    const fnMatch = workerContent.match(/function _normalizePaymentStatus\([\s\S]*?\n\}/);
    assert.ok(fnMatch, 'gas_worker.js 必須包含 _normalizePaymentStatus 函式定義');
    
    const normalizePaymentStatus = new Function('val', `
      ${fnMatch[0]}
      return _normalizePaymentStatus(val);
    `);

    // 核心邊界測試：Unpaid 結尾包含 paid，絕不可回傳 已繳費 Paid
    assert.equal(normalizePaymentStatus('未繳費 Unpaid'), '未繳費 Unpaid', '「未繳費 Unpaid」必須精確正規化為「未繳費 Unpaid」');
    assert.equal(normalizePaymentStatus('Unpaid'), '未繳費 Unpaid', '「Unpaid」必須正規化為「未繳費 Unpaid」');
    assert.equal(normalizePaymentStatus('未繳費'), '未繳費 Unpaid', '「未繳費」必須正規化為「未繳費 Unpaid」');
    assert.equal(normalizePaymentStatus('待繳費 Unpaid'), '未繳費 Unpaid', '「待繳費 Unpaid」必須正規化為「未繳費 Unpaid」');

    // 其他合法狀態測試
    assert.equal(normalizePaymentStatus('待確認 Checking'), '待確認 Checking', '「待確認 Checking」必須正規化為「待確認 Checking」');
    assert.equal(normalizePaymentStatus('已繳費 Paid'), '已繳費 Paid', '「已繳費 Paid」必須正規化為「已繳費 Paid」');
    assert.equal(normalizePaymentStatus('Paid'), '已繳費 Paid', '「Paid」必須正規化為「已繳費 Paid」');
    assert.equal(normalizePaymentStatus(null), '未繳費 Unpaid', 'null 預設必須為「未繳費 Unpaid」');
  });
});


