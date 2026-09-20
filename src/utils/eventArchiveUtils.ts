import type { AdminEvent, SignupApplicant } from '../types/event';

/**
 * 解析日期字串為西元年、月、日
 */
export function parseDateParts(dateStr?: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const clean = String(dateStr).trim();
  if (!clean || clean === '未填' || clean === '無') return null;

  // 支援 YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, YYYY-M-D
  const match = clean.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})/);
  if (match) {
    return {
      year: parseInt(match[1], 10),
      month: parseInt(match[2], 10),
      day: parseInt(match[3], 10)
    };
  }

  // 嘗試原生 Date 解析
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate()
    };
  }

  return null;
}

/**
 * 判斷活動是否已完全結束滿特定天數（預設 14 天 / 兩週）
 * 優先使用 endDate（活動結束日），若無則回退 startDate（活動出隊日）
 * 判定標準為該日 23:59:59 加上 threshold 天數
 */
export function isEventArchived(
  evt: AdminEvent,
  daysThreshold: number = 14,
  nowMs: number = Date.now()
): boolean {
  const targetDateStr = evt.endDate || evt.startDate;
  const parts = parseDateParts(targetDateStr);
  if (!parts) return false;

  // 當天 23:59:59.999 的時間戳記
  const endOfDayMs = new Date(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999).getTime();
  const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000;

  return nowMs > (endOfDayMs + thresholdMs);
}

/**
 * 取得活動舉辦年份字串（供篩選列分組使用）
 */
export function getEventYear(evt: AdminEvent): string {
  const parts = parseDateParts(evt.startDate || evt.endDate);
  return parts ? String(parts.year) : '其他年份';
}

/**
 * 依正備取規則排序報名人員：
 * 1. 正取 (Confirmed) 在前
 * 2. 備取 (Waitlisted) 次之
 * 3. 審核中/其他在後
 * 同狀態下按報名序號 (rowNumber) 升冪排序
 */
export function sortApplicantsConfirmedFirst(applicants: SignupApplicant[]): SignupApplicant[] {
  const getWeight = (resultStr: string): number => {
    const s = (resultStr || '').toLowerCase();
    if (s.includes('正取') || s.includes('confirmed')) return 1;
    if (s.includes('備取') || s.includes('waitlist')) return 2;
    if (s.includes('審核') || s.includes('check') || s.includes('pending')) return 3;
    return 4;
  };

  return [...applicants].sort((a, b) => {
    const weightA = getWeight(a.reviewResult);
    const weightB = getWeight(b.reviewResult);
    if (weightA !== weightB) {
      return weightA - weightB;
    }
    return (a.rowNumber || 0) - (b.rowNumber || 0);
  });
}
