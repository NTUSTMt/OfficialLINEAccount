import type { ScheduleFeedItem } from '../types/schedule';

export type DayHighlightKind = 'holiday' | 'break' | 'exam';

export interface DayHighlightInfo {
  kind: DayHighlightKind;
  label: string;
}

export interface ScheduleConflictItem {
  id: string;
  typeLabel: string;
  title: string;
  dateRange: string;
}

const EXAM_REGEX = /期中考|期末考|期中評量|期末評量|考試週/i;
const HOLIDAY_REGEX =
  /放假|補假|國慶|元旦|春節|除夕|和平紀念|清明|兒童節|民族掃墓|端午|中秋|教師節|開國紀念|連假|調整放假|勞動節|光復|行憲/i;
const WORKDAY_EXCLUDE_REGEX = /補班|補行上班|補課/i;
const SPECIAL_BREAK_EVENT_REGEX = /運動會|校慶/i;

function parseExplicitEndDateFromTitle(title: string, startKey: string): string | null {
  if (!startKey) return null;
  const match = title.match(/(?:至|到|~|～)\s*(\d{1,2})\s*(?:月|\/)\s*(\d{1,2})\s*日?/);
  if (!match) return null;
  const endMonth = Number(match[1]);
  const endDay = Number(match[2]);
  if (endMonth < 1 || endMonth > 12 || endDay < 1 || endDay > 31) return null;
  const [startYear, startMonth] = startKey.split('-').map(Number);
  const endYear = endMonth < startMonth ? startYear + 1 : startYear;
  return `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
}

function formatExamLabel(title: string): string {
  if (/期中考|期中評量/.test(title)) return '期中考週';
  if (/期末考|期末評量/.test(title)) return '期末考週';
  return title;
}

const PRIORITY: Record<DayHighlightKind, number> = {
  holiday: 3,
  exam: 2,
  break: 1,
};

/**
 * 將 ISO 或 YYYY-MM-DD 轉為 YYYY-MM-DD（台灣/本地日曆）
 */
export function toLocalDateKey(isoOrDate?: string | null): string {
  if (!isoOrDate) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalDateKey(dt.toISOString());
}

function formatDateObjKey(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function paintRange(
  map: Map<string, DayHighlightInfo>,
  startKey: string,
  endKey: string,
  info: DayHighlightInfo,
  maxDays = 90,
): void {
  if (!startKey || !endKey || endKey < startKey) return;
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  let steps = 0;
  while (cur <= end && steps < maxDays) {
    const key = formatDateObjKey(cur);
    const existing = map.get(key);
    if (!existing || PRIORITY[info.kind] >= PRIORITY[existing.kind]) {
      map.set(key, info);
    }
    cur.setDate(cur.getDate() + 1);
    steps++;
  }
}

function isLocalMidnight(isoOrDate?: string | null): boolean {
  if (!isoOrDate) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return true;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
}

/**
 * 取得行程的「包含式」結束日期 (YYYY-MM-DD)
 * Google Calendar / ICS 全天事件的 end_time 為隔日 00:00（排他），需自動減一天避免單日事件被畫成兩天
 */
export function getInclusiveEndDateKey(
  item: Pick<ScheduleFeedItem, 'start_time' | 'end_time'> & {
    source_type?: string;
    is_all_day?: boolean;
  },
): string {
  const startKey = toLocalDateKey(item.start_time);
  const rawEndKey = toLocalDateKey(item.end_time || item.start_time);
  if (!startKey) return '';
  let endKey = rawEndKey || startKey;
  const isExternalCalendar = !item.source_type || item.source_type === 'school' || item.source_type === 'club_calendar';
  if (
    isExternalCalendar &&
    item.end_time &&
    endKey > startKey &&
    (item.is_all_day || isLocalMidnight(item.end_time))
  ) {
    endKey = addDaysToKey(endKey, -1);
  }
  return endKey;
}

/**
 * 解析學校校曆項目 (.ics) 產生每日底色對應表（國定假日、寒暑假/運動會、期中期末考週）
 */
export function computeScheduleDayHighlights(
  feedItems: ScheduleFeedItem[],
): Map<string, DayHighlightInfo> {
  const map = new Map<string, DayHighlightInfo>();
  const schoolItems = feedItems.filter((item) => item.source_type === 'school');

  // 1. 直接標記單日/跨日關鍵字事件
  for (const item of schoolItems) {
    const title = item.title || '';
    const startKey = toLocalDateKey(item.start_time);
    const endKey = getInclusiveEndDateKey(item);

    if (EXAM_REGEX.test(title)) {
      const explicitEnd = parseExplicitEndDateFromTitle(title, startKey);
      const examEndKey = explicitEnd && explicitEnd > endKey ? explicitEnd : endKey;
      paintRange(map, startKey, examEndKey, { kind: 'exam', label: formatExamLabel(title) });
    }
    if (HOLIDAY_REGEX.test(title) && !WORKDAY_EXCLUDE_REGEX.test(title)) {
      paintRange(map, startKey, endKey, { kind: 'holiday', label: title });
    } else if (
      !EXAM_REGEX.test(title) &&
      (SPECIAL_BREAK_EVENT_REGEX.test(title) || /寒假|暑假/.test(title))
    ) {
      paintRange(map, startKey, endKey, { kind: 'break', label: title });
    }
  }

  // 2. 偵測「寒假開始～結束 / 開學」與「暑假開始～結束 / 開學」區間
  const sortedSchool = [...schoolItems].sort((a, b) =>
    toLocalDateKey(a.start_time).localeCompare(toLocalDateKey(b.start_time)),
  );

  const pairBreakRanges = (startRegex: RegExp, endRegex: RegExp, label: string) => {
    for (let i = 0; i < sortedSchool.length; i++) {
      const startItem = sortedSchool[i];
      if (!startRegex.test(startItem.title || '')) continue;
      const startKey = toLocalDateKey(startItem.start_time);
      for (let j = i + 1; j < sortedSchool.length; j++) {
        const endItem = sortedSchool[j];
        if (!endRegex.test(endItem.title || '')) continue;
        const endKey = toLocalDateKey(endItem.start_time);
        if (endKey > startKey) {
          paintRange(map, startKey, endKey, { kind: 'break', label }, 95);
          break;
        }
      }
    }
  };

  pairBreakRanges(/寒假開始|寒假起/i, /寒假結束|寒假迄|第[2二]學期.*開學|開學日/i, '寒假期間');
  pairBreakRanges(/暑假開始|暑假起/i, /暑假結束|暑假迄|第[1一]學期.*開學|開學日/i, '暑假期間');

  return map;
}

/**
 * 取得指定日期的最終底色資訊（含週六日自動判斷）
 */
export function getDayHighlight(
  dateKey: string,
  dateObj: Date,
  highlightMap: Map<string, DayHighlightInfo>,
): DayHighlightInfo | null {
  const fromSchool = highlightMap.get(dateKey);
  const dayOfWeek = dateObj.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (fromSchool) {
    return fromSchool;
  }
  if (isWeekend) {
    return { kind: 'holiday', label: '週末例假日' };
  }
  return null;
}

/**
 * 檢查指定出隊日期區間是否與現有社團活動、社團日曆或學校考週重疊
 */
export function detectScheduleConflicts(
  startDate: string,
  endDate: string,
  feedItems: ScheduleFeedItem[],
  excludeEventId?: string | null,
): ScheduleConflictItem[] {
  if (!startDate) return [];
  const effectiveEnd = endDate && endDate >= startDate ? endDate : startDate;
  const conflicts: ScheduleConflictItem[] = [];
  const seenIds = new Set<string>();

  for (const item of feedItems) {
    if (excludeEventId && item.details?.event_id === excludeEventId) {
      continue;
    }

    const isEvent = item.source_type === 'event';
    const isClubCal = item.source_type === 'club_calendar';
    const isExam = item.source_type === 'school' && EXAM_REGEX.test(item.title || '');

    if (!isEvent && !isClubCal && !isExam) {
      continue;
    }

    const itemStart = toLocalDateKey(item.start_time);
    let itemEnd = getInclusiveEndDateKey(item);
    if (!itemStart) continue;
    if (isExam) {
      const explicitEnd = parseExplicitEndDateFromTitle(item.title || '', itemStart);
      if (explicitEnd && explicitEnd > itemEnd) {
        itemEnd = explicitEnd;
      }
    }

    if (itemStart <= effectiveEnd && itemEnd >= startDate) {
      const dedupKey = `${item.source_type}-${item.item_id}`;
      if (seenIds.has(dedupKey)) continue;
      seenIds.add(dedupKey);

      const typeLabel = isEvent
        ? '社團活動'
        : isClubCal
          ? '社團日曆'
          : '學校考試';

      conflicts.push({
        id: dedupKey,
        typeLabel,
        title: item.title,
        dateRange: itemStart === itemEnd ? itemStart : `${itemStart} ~ ${itemEnd}`,
      });
    }
  }

  return conflicts;
}
