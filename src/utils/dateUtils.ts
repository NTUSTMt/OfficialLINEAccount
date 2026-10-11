/**
 * 台灣時區 (Asia/Taipei, UTC+8) 日期與時間工具函式
 * 確保全系統報名截止時間在輸入、顯示、儲存與過期比對上皆以台灣時間為準。
 */

/**
 * 將任何日期/時間字串或 Date 物件轉換為台灣時間 (Asia/Taipei)
 */
export function getTaiwanDateParts(input?: string | Date | null): {
  year: string;
  month: string;
  day: string;
  hours: string;
  minutes: string;
  seconds: string;
  timestamp: number;
} | null {
  if (!input) return null;

  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else {
    const raw = String(input).trim();
    if (!raw) return null;

    // 若字串不含時區偏移 (無 +、-、Z、GMT、UTC)，視為台灣時間 (UTC+8)
    const hasTz = /([+-]\d{2}(:?\d{2})?|Z)$/i.test(raw);
    if (!hasTz) {
      const clean = raw.replace(/\//g, '-');
      if (clean.includes('T') || clean.includes(' ')) {
        const parts = clean.split(/[T ]/);
        const datePart = parts[0];
        const timePart = parts[1] || '23:59:00';
        const secPart = timePart.includes(':') ? (timePart.split(':').length === 2 ? `${timePart}:00` : timePart) : `${timePart}:00:00`;
        d = new Date(`${datePart}T${secPart}+08:00`);
      } else {
        // 純日期字串預設為當天 23:59:59 台灣時間
        d = new Date(`${clean}T23:59:59+08:00`);
      }
    } else {
      d = new Date(raw.replace(' ', 'T'));
    }
  }

  if (isNaN(d.getTime())) return null;

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(d);
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }

    return {
      year: map.year || '0000',
      month: map.month || '00',
      day: map.day || '00',
      hours: map.hour || '00',
      minutes: map.minute || '00',
      seconds: map.second || '00',
      timestamp: d.getTime()
    };
  } catch {
    // 降級容錯 (若環境不支援時區格式化)
    const utcTime = d.getTime();
    const twTime = new Date(utcTime + 8 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      year: String(twTime.getUTCFullYear()),
      month: pad(twTime.getUTCMonth() + 1),
      day: pad(twTime.getUTCDate()),
      hours: pad(twTime.getUTCHours()),
      minutes: pad(twTime.getUTCMinutes()),
      seconds: pad(twTime.getUTCSeconds()),
      timestamp: d.getTime()
    };
  }
}

/**
 * 解析截止時間字串，拆解為適合表單使用的台灣日期 (YYYY-MM-DD) 與時間 (HH:mm)
 */
export function parseTaiwanDeadline(deadlineStr?: string | null): {
  date: string;
  time: string;
  timestamp: number | null;
} {
  if (!deadlineStr || !String(deadlineStr).trim()) {
    return { date: '', time: '23:59', timestamp: null };
  }

  const parts = getTaiwanDateParts(deadlineStr);
  if (!parts) {
    return { date: '', time: '23:59', timestamp: null };
  }

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hours}:${parts.minutes}`,
    timestamp: parts.timestamp
  };
}

/**
 * 格式化為台灣時間字串 (例如 "2026/10/20 18:00" 或 "2026/10/20")
 */
export function formatTaiwanDateTime(input?: string | Date | null, includeTime: boolean = true): string {
  if (!input) return '';
  const parts = getTaiwanDateParts(input);
  if (!parts) return String(input).split('T')[0] || '';

  const dateStr = `${parts.year}/${parts.month}/${parts.day}`;
  if (!includeTime) return dateStr;
  return `${dateStr} ${parts.hours}:${parts.minutes}`;
}

/**
 * 將前端輸入的日期與時間結合成標準台灣時間 ISO 字串 (+08:00)
 */
export function buildTaiwanIsoString(dateStr: string, timeStr?: string): string {
  const cleanDate = dateStr.trim().replace(/\//g, '-');
  if (!cleanDate) return '';

  let cleanTime = (timeStr || '').trim();
  if (!cleanTime) cleanTime = '23:59';
  if (cleanTime.split(':').length === 2) {
    cleanTime = `${cleanTime}:00`;
  }

  return `${cleanDate}T${cleanTime}+08:00`;
}

/**
 * 判定該截止時間是否已逾期 (以台灣時間為準)
 */
export function isTaiwanDeadlinePassed(deadlineStr?: string | null, nowMs: number = Date.now()): boolean {
  if (!deadlineStr || !String(deadlineStr).trim()) return false;
  const parts = getTaiwanDateParts(deadlineStr);
  if (!parts) return false;
  return nowMs > parts.timestamp;
}
