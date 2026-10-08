import { assertEquals } from "std/assert/mod.ts";
import { isEventClosed, isEventFuture, isEventOpen } from "./statusUtils.ts";

Deno.test("statusUtils: identifies open, future and closed events", () => {
  assertEquals(isEventFuture("未來 Coming Soon"), true);
  assertEquals(isEventClosed("已截止 Closed"), true);
  assertEquals(isEventClosed("已結束 Finished"), true);
  assertEquals(isEventOpen("報名中 Open", "2030-01-01T23:59:59+08:00"), true);
  assertEquals(isEventOpen("報名中 Open", "2020-01-01T23:59:59+08:00"), false);
});
