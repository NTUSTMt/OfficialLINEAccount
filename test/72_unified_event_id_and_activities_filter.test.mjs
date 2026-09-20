import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Unified Event ID and Activities Filter Unit Tests', () => {
  const rootDir = process.cwd();

  it('should ensure Supabase RPC uses E{yyMM}-{seq} unified format', () => {
    const rpcContent = fs.readFileSync(
      path.join(rootDir, 'supabase/admin_events_rpc.sql'),
      'utf8'
    );

    // 檢查是否有統一前綴定義與取號邏輯
    assert.ok(
      rpcContent.includes("to_char(NOW(), 'YYMM')"),
      'Supabase RPC should format prefix as E{yyMM}-'
    );
    assert.ok(
      rpcContent.includes("v_prefix || lpad((v_max_seq + 1)::TEXT, 2, '0')"),
      'Supabase RPC should pad sequence to two digits (e.g. 01, 02)'
    );
    // 確保不存在舊版 timestamp 取號邏輯
    assert.ok(
      !rpcContent.includes("to_char(NOW(), 'YYYYMMDD_HH24MISS')"),
      'Supabase RPC must not use timestamp-based event ID'
    );
  });

  it('should ensure GAS _handleSaveEvent uses E{yyMM}-{seq} format matching Supabase', () => {
    const gasContent = fs.readFileSync(
      path.join(rootDir, 'src/gas.js'),
      'utf8'
    );

    assert.ok(
      gasContent.includes('Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyMM")'),
      'GAS should format datePrefix as yyMM'
    );
    assert.ok(
      gasContent.includes('eventId = "E" + datePrefix + "-" + nextSeqStr;'),
      'GAS should format event ID as E{yyMM}-{nextSeqStr}'
    );
  });

  it('should correctly filter activities in sendEventList logic', () => {
    // 模擬 sendEventList 的核心過濾與標籤判定邏輯
    const filterAndProcessEvents = (sbEvents, mockNow = new Date('2026-09-20T12:00:00Z')) => {
      const parseEventDate = (dateVal, endOfDay) => {
        if (!dateVal) return null;
        const str = String(dateVal).trim();
        const m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if (m) {
          const year = parseInt(m[1], 10);
          const month = parseInt(m[2], 10) - 1;
          const day = parseInt(m[3], 10);
          return endOfDay
            ? new Date(Date.UTC(year, month, day, 23, 59, 59, 999))
            : new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        }
        return null;
      };

      const isEventExpired = (deadlineVal) => {
        if (!deadlineVal) return false;
        const d = parseEventDate(deadlineVal, true);
        return d ? mockNow.getTime() > d.getTime() : false;
      };

      const result = [];

      for (let i = 0; i < sbEvents.length; i++) {
        const ev = sbEvents[i];
        const rawStatus = String(ev.status || '').trim().toLowerCase();

        // 1. 關閉或草稿的活動不顯示
        const isClosed = rawStatus.includes('關閉') || rawStatus.includes('closed') || rawStatus.includes('draft') || rawStatus.includes('草稿');
        if (isClosed) {
          continue;
        }

        // 2. 活動結束2週以上 (> 14 天) 的活動不顯示
        const targetEndDate = parseEventDate(ev.end_date || ev.start_date, true);
        if (targetEndDate && (mockNow.getTime() - targetEndDate.getTime()) > 14 * 24 * 60 * 60 * 1000) {
          continue;
        }

        const isExpired = isEventExpired(ev.deadline);
        const isFuture = rawStatus.includes('未來') || rawStatus.includes('coming') || rawStatus.includes('future');
        const isOpen = !isFuture && !isExpired && (rawStatus.includes('開放') || rawStatus.includes('open'));

        const tagColor = isFuture ? '#FF9800' : (isOpen ? '#1DB446' : '#999999');
        const displayStatus = isFuture ? '未來開放 Coming Soon' : (isOpen ? '開放 Open' : '報名截止 Registration Closed');

        result.push({
          id: ev.id,
          title: ev.title,
          displayStatus,
          tagColor,
          isOpen,
          isExpired
        });
      }

      return result;
    };

    const mockEvents = [
      // 1. 手動關閉之活動 -> 應排除
      { id: 'E2609-01', title: '關閉的活動', status: '關閉', start_date: '2026-09-10', end_date: '2026-09-11', deadline: '2026-09-08' },
      // 2. 草稿活動 -> 應排除
      { id: 'E2609-02', title: '草稿活動', status: 'Draft', start_date: '2026-10-01', end_date: '2026-10-02', deadline: '2026-09-28' },
      // 3. 活動結束已超過 14 天 (2026-09-01 結束，相較於 2026-09-20 已過 19 天) -> 應排除
      { id: 'E2608-01', title: '太久以前的活動', status: '開放', start_date: '2026-08-30', end_date: '2026-09-01', deadline: '2026-08-25' },
      // 4. 活動結束未滿 14 天 (2026-09-15 結束，已過 5 天)，報名截止但尚未關閉 -> 應顯示，標籤「報名截止 Registration Closed」
      { id: 'E2609-03', title: '剛結束不久且已截止的活動', status: '開放', start_date: '2026-09-14', end_date: '2026-09-15', deadline: '2026-09-10' },
      // 5. 報名已截止 (deadline: 2026-09-18)，但活動下週才進行 (2026-09-25)，尚未手動關閉 -> 應顯示，標籤「報名截止 Registration Closed」
      { id: 'E2609-04', title: '報名截止但即將出隊的活動', status: '開放', start_date: '2026-09-25', end_date: '2026-09-26', deadline: '2026-09-18' },
      // 6. 正常開放中活動 (deadline: 2026-09-28) -> 應顯示，標籤「開放 Open」
      { id: 'E2609-05', title: '熱烈報名中的秋季登山', status: '開放', start_date: '2026-10-10', end_date: '2026-10-11', deadline: '2026-09-28' },
      // 7. 未來開放活動 -> 應顯示，標籤「未來開放 Coming Soon」
      { id: 'E2609-06', title: '雪山初冬跨年活動', status: '未來開放', start_date: '2026-12-31', end_date: '2027-01-02', deadline: '2026-12-15' },
    ];

    const processed = filterAndProcessEvents(mockEvents);

    // 驗證過濾數量：7 個中有 3 個排除 (關閉、草稿、結束超過14天)，保留 4 個
    assert.strictEqual(processed.length, 4, '應排除關閉、草稿與結束滿2週活動，保留4個活動');

    // 驗證剛結束且已截止活動
    assert.strictEqual(processed[0].id, 'E2609-03');
    assert.strictEqual(processed[0].displayStatus, '報名截止 Registration Closed');
    assert.strictEqual(processed[0].tagColor, '#999999');
    assert.strictEqual(processed[0].isOpen, false);

    // 驗證即將出隊但報名已截止活動
    assert.strictEqual(processed[1].id, 'E2609-04');
    assert.strictEqual(processed[1].displayStatus, '報名截止 Registration Closed');
    assert.strictEqual(processed[1].tagColor, '#999999');
    assert.strictEqual(processed[1].isOpen, false);

    // 驗證開放中活動
    assert.strictEqual(processed[2].id, 'E2609-05');
    assert.strictEqual(processed[2].displayStatus, '開放 Open');
    assert.strictEqual(processed[2].tagColor, '#1DB446');
    assert.strictEqual(processed[2].isOpen, true);

    // 驗證未來開放活動
    assert.strictEqual(processed[3].id, 'E2609-06');
    assert.strictEqual(processed[3].displayStatus, '未來開放 Coming Soon');
    assert.strictEqual(processed[3].tagColor, '#FF9800');
    assert.strictEqual(processed[3].isOpen, false);
  });
});
