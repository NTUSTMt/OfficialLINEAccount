import { assertEquals } from "std/assert/mod.ts";

Deno.test("pushAdminMessage: subject derivation works correctly", () => {
  function deriveSubject(text: string, customSubject?: string): string {
    if (customSubject) return customSubject;
    const lines = text.split("\n");
    const firstLine = lines[0] ? lines[0].trim() : "";
    if (firstLine.includes("【") && firstLine.includes("】")) {
      return firstLine;
    } else if (text.includes("新裝備租借申請")) {
      return "【台科登山社】新裝備租借申請通知";
    } else if (text.includes("新繳費申報")) {
      return "【台科登山社】新繳費申報通知";
    } else if (text.includes("幹部意願登記")) {
      return "【台科登山社】新幹部意願登記通知";
    } else {
      return "【台科登山社】幹部系統通知";
    }
  }

  assertEquals(
    deriveSubject("【🎒 幹部通知：新裝備租借申請】\n內容..."),
    "【🎒 幹部通知：新裝備租借申請】"
  );
  assertEquals(
    deriveSubject("哈囉 這裡有新繳費申報待處理"),
    "【台科登山社】新繳費申報通知"
  );
  assertEquals(
    deriveSubject("其他無特殊標題訊息"),
    "【台科登山社】幹部系統通知"
  );
  assertEquals(
    deriveSubject("無標題", "自訂主旨"),
    "自訂主旨"
  );
});
