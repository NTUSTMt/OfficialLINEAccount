import { assertEquals } from "std/assert/mod.ts";
import { render } from "./i18n.ts";
import { messages } from "./messages.ts";

Deno.test("messages: render outputs correct language pair", () => {
  const pair = messages.bindAdminGroupOnlyInGroup();

  assertEquals(render(pair, "zh"), "⚠️ 此指令僅能在幹部 LINE 群組內執行。");
  assertEquals(render(pair, "en"), "⚠️ This command can only be executed within an officer LINE group.");
  assertEquals(
    render(pair, null),
    "⚠️ 此指令僅能在幹部 LINE 群組內執行。\n─────────────\n⚠️ This command can only be executed within an officer LINE group."
  );
});
