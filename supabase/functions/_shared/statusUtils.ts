import { isEventExpired } from "./dateUtils.ts";
import { PreferredLanguage } from "./types.ts";

export function isEventFuture(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("未來") || s.includes("coming") || s.includes("future");
}

export function isEventClosed(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s.includes("關閉") ||
    s.includes("closed") ||
    s.includes("draft") ||
    s.includes("草稿") ||
    s.includes("已截止") ||
    s.includes("已結束") ||
    s.includes("finished")
  );
}

export function isEventOpen(
  status: string | null | undefined,
  deadline: string | Date | null | undefined
): boolean {
  if (!status) return false;
  if (isEventFuture(status)) return false;
  if (isEventClosed(status)) return false;
  if (isEventExpired(deadline)) return false;

  const s = status.toLowerCase();
  return s.includes("開放") || s.includes("open") || s.includes("報名中");
}

export function isSignupCancelled(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("取消") || s.includes("cancel");
}

export function formatSignupStatus(
  status: string,
  prefLang: PreferredLanguage
): string {
  const map: Record<string, { zh: string; en: string }> = {
    "正取 Confirmed": { zh: "正取", en: "Confirmed" },
    "正取（已繳費）Confirmed (Paid)": { zh: "正取（已繳費）", en: "Confirmed (Paid)" },
    "備取 Waitlisted": { zh: "備取", en: "Waitlisted" },
    "備取（有意願）Waitlisted (Interested)": { zh: "備取（有意願）", en: "Waitlisted (Interested)" },
    "審核中 Checking": { zh: "審核中", en: "Checking" },
    "已取消 Cancelled": { zh: "已取消", en: "Cancelled" },
  };

  const found = map[status];
  if (!found) return status;

  if (prefLang === "zh") return found.zh;
  if (prefLang === "en") return found.en;
  return status;
}
