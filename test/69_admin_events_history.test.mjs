import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDateParts,
  isEventArchived,
  getEventYear,
  sortApplicantsConfirmedFirst
} from '../src/utils/eventArchiveUtils.ts';

describe('69. 活動管理重新設計與歷史活動歸檔功能測試 (AdminEvents & AdminEventsHistory)', () => {
  const BASE_NOW = new Date(2026, 8, 20, 12, 0, 0).getTime(); // 2026/09/20 12:00:00

  test('1. parseDateParts 日期解析器相容性測試', () => {
    // 支援 YYYY/MM/DD
    assert.deepEqual(parseDateParts('2026/09/01'), { year: 2026, month: 9, day: 1 });
    // 支援 YYYY-MM-DD
    assert.deepEqual(parseDateParts('2026-08-15'), { year: 2026, month: 8, day: 15 });
    // 支援 YYYY.MM.DD
    assert.deepEqual(parseDateParts('2025.12.31'), { year: 2025, month: 12, day: 31 });
    // 無效或空字串
    assert.equal(parseDateParts(''), null);
    assert.equal(parseDateParts('未填'), null);
    assert.equal(parseDateParts(undefined), null);
  });

  test('2. isEventArchived 歷史活動歸檔判定邏輯（結束滿 14 天）', () => {
    // 基準日 2026/09/20
    // 活動 A: 結束於 2026/09/01 (結束距今 19 天 > 14 天) -> 應歸檔
    const eventOld = {
      id: 'EVT_OLD',
      name: '雪山主東峰',
      startDate: '2026/08/30',
      endDate: '2026/09/01',
      deadline: '2026/08/20',
      cost: '2000',
      status: '關閉',
      shortDesc: '',
      fullDesc: '',
      imageUrl: '',
      stats: { total: 10, accepted: 8, waitlisted: 2, pending: 0 }
    };
    assert.equal(isEventArchived(eventOld, 14, BASE_NOW), true);

    // 活動 B: 結束於 2026/09/10 (結束距今 10 天 < 14 天) -> 進行中/未滿兩週，不歸檔
    const eventRecent = {
      id: 'EVT_RECENT',
      name: '合歡北西下華岡',
      startDate: '2026/09/08',
      endDate: '2026/09/10',
      deadline: '2026/09/01',
      cost: '1500',
      status: '關閉',
      shortDesc: '',
      fullDesc: '',
      imageUrl: '',
      stats: { total: 12, accepted: 10, waitlisted: 2, pending: 0 }
    };
    assert.equal(isEventArchived(eventRecent, 14, BASE_NOW), false);

    // 活動 C: 未來活動 2026/10/01 -> 絕不歸檔
    const eventFuture = {
      id: 'EVT_FUTURE',
      name: '玉山主峰單攻',
      startDate: '2026/10/01',
      endDate: '2026/10/02',
      deadline: '2026/09/25',
      cost: '2500',
      status: '開放',
      shortDesc: '',
      fullDesc: '',
      imageUrl: '',
      stats: { total: 5, accepted: 5, waitlisted: 0, pending: 0 }
    };
    assert.equal(isEventArchived(eventFuture, 14, BASE_NOW), false);

    // 活動 D: 無 endDate，自動回退使用 startDate 判定
    const eventNoEndDate = {
      id: 'EVT_SINGLE_DAY',
      name: '金面山夜爬',
      startDate: '2026/08/10',
      endDate: '',
      deadline: '2026/08/08',
      cost: '100',
      status: '關閉',
      shortDesc: '',
      fullDesc: '',
      imageUrl: '',
      stats: { total: 8, accepted: 8, waitlisted: 0, pending: 0 }
    };
    assert.equal(isEventArchived(eventNoEndDate, 14, BASE_NOW), true);
  });

  test('3. getEventYear 取得出隊年份', () => {
    const evt2026 = { startDate: '2026/05/20', endDate: '2026/05/22' };
    assert.equal(getEventYear(evt2026), '2026');

    const evt2025 = { startDate: '2025-11-10', endDate: '2025-11-12' };
    assert.equal(getEventYear(evt2025), '2025');

    const evtNone = { startDate: '', endDate: '' };
    assert.equal(getEventYear(evtNone), '其他年份');
  });

  test('4. sortApplicantsConfirmedFirst 報名人員正備取優先排序', () => {
    const mockApplicants = [
      { rowNumber: 1, name: '山友甲', reviewResult: '審核中 Checking' },
      { rowNumber: 2, name: '山友乙', reviewResult: '備取 Waitlisted' },
      { rowNumber: 3, name: '山友丙', reviewResult: '正取 Confirmed' },
      { rowNumber: 4, name: '山友丁', reviewResult: '正取 Confirmed' },
      { rowNumber: 5, name: '山友戊', reviewResult: '備取 Waitlisted' },
      { rowNumber: 6, name: '山友己', reviewResult: '未錄取' }
    ];

    const sorted = sortApplicantsConfirmedFirst(mockApplicants);

    // 順序應為：正取 (3, 4) -> 備取 (2, 5) -> 審核中/未錄取 (1, 6)
    assert.equal(sorted[0].name, '山友丙');
    assert.equal(sorted[1].name, '山友丁');
    assert.equal(sorted[2].name, '山友乙');
    assert.equal(sorted[3].name, '山友戊');
    assert.equal(sorted[4].name, '山友甲');
    assert.equal(sorted[5].name, '山友己');
  });

  test('5. 活動管理主頁與歷史活動頁之資料隔離驗證', () => {
    const allEvents = [
      { id: 'E1', name: '老活動(歸檔)', endDate: '2026/08/01', startDate: '2026/07/31' },
      { id: 'E2', name: '近期活動(主頁)', endDate: '2026/09/15', startDate: '2026/09/14' },
      { id: 'E3', name: '未來活動(主頁)', endDate: '2026/10/10', startDate: '2026/10/08' }
    ];

    const activeList = allEvents.filter((evt) => !isEventArchived(evt, 14, BASE_NOW));
    const historyList = allEvents.filter((evt) => isEventArchived(evt, 14, BASE_NOW));

    // 主頁僅保留進行中與近期活動
    assert.equal(activeList.length, 2);
    assert.deepEqual(activeList.map((e) => e.id), ['E2', 'E3']);

    // 歷史歸檔頁僅保留超過兩週之活動
    assert.equal(historyList.length, 1);
    assert.deepEqual(historyList.map((e) => e.id), ['E1']);
  });
});
