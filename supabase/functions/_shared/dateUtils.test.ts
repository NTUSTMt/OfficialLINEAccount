import { assertEquals } from "std/assert/mod.ts";
import { formatEventDate, formatTaipeiDate, isEventExpired } from "./dateUtils.ts";

Deno.test("dateUtils: formatTaipeiDate handles UTC and offsets", () => {
  const utcDateStr = "2026-10-08T00:00:00Z";
  const taipeiStr = formatTaipeiDate(utcDateStr, "YYYY-MM-DD HH:mm:ss");
  assertEquals(taipeiStr, "2026-10-08 08:00:00");
});

Deno.test("dateUtils: isEventExpired detects past and future dates", () => {
  const pastDate = "2020-01-01T23:59:59+08:00";
  const futureDate = "2030-01-01T23:59:59+08:00";

  assertEquals(isEventExpired(pastDate), true);
  assertEquals(isEventExpired(futureDate), false);
});

Deno.test("dateUtils: formatEventDate formats ranges correctly", () => {
  assertEquals(formatEventDate("2026-10-08", "2026-10-08"), "2026/10/08");
  assertEquals(formatEventDate("2026-10-08", "2026-10-10"), "2026/10/08 ~ 2026/10/10");
});
