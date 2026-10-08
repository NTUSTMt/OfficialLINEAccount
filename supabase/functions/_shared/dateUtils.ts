const TAIPEI_TIMEZONE = "Asia/Taipei";

export function formatTaipeiDate(
  dateInput: string | number | Date,
  format = "YYYY-MM-DD"
): string {
  if (!dateInput) return "";

  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TAIPEI_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const YYYY = map.year || "1970";
  const MM = map.month || "01";
  const DD = map.day || "01";
  const HH = map.hour || "00";
  const mm = map.minute || "00";
  const ss = map.second || "00";

  return format
    .replace("YYYY", YYYY)
    .replace("MM", MM)
    .replace("DD", DD)
    .replace("HH", HH)
    .replace("mm", mm)
    .replace("ss", ss);
}

export function parseTaipeiDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  let cleaned = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    cleaned = `${cleaned}T23:59:59+08:00`;
  } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(cleaned)) {
    cleaned = `${cleaned.replace(/\//g, "-")}T23:59:59+08:00`;
  } else if (cleaned.endsWith("23:59:59Z")) {
    cleaned = cleaned.replace(/23:59:59Z$/, "23:59:59+08:00");
  }

  const parsed = new Date(cleaned);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function isEventExpired(deadlineInput: string | Date | null | undefined): boolean {
  if (!deadlineInput) return false;

  let deadlineDate: Date | null = null;
  if (deadlineInput instanceof Date) {
    deadlineDate = deadlineInput;
  } else {
    deadlineDate = parseTaipeiDate(deadlineInput);
  }

  if (!deadlineDate || isNaN(deadlineDate.getTime())) {
    return false;
  }

  return Date.now() > deadlineDate.getTime();
}

export function formatEventDate(
  startDateStr: string | null | undefined,
  endDateStr: string | null | undefined
): string {
  if (!startDateStr && !endDateStr) return "日期未定 TBD";
  if (startDateStr && !endDateStr) return formatTaipeiDate(startDateStr, "YYYY/MM/DD");
  if (!startDateStr && endDateStr) return formatTaipeiDate(endDateStr, "YYYY/MM/DD");

  const startFormatted = formatTaipeiDate(startDateStr!, "YYYY/MM/DD");
  const endFormatted = formatTaipeiDate(endDateStr!, "YYYY/MM/DD");

  if (startFormatted === endFormatted) {
    return startFormatted;
  }
  return `${startFormatted} ~ ${endFormatted}`;
}

export function generateSignupId(): string {
  const now = new Date();
  const timestamp = formatTaipeiDate(now, "MMDDHHmmss");
  return `S${timestamp}`;
}
