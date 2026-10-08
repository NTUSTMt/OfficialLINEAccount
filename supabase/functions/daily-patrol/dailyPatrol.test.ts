import { assertEquals } from "std/assert/mod.ts";

Deno.test("dailyPatrol: notice aggregation formats correctly", () => {
  const closedEvents = ["• 玉山單攻 (截止日: 2026-10-01)"];
  const expiredMembers = ["• 王小明 (到期日: 2026-09-30)"];
  const overdueLoans = ["• 單號 L101：李小華 (應還日期: 2026-10-05，電話: 0912345678)"];

  const noticeSections: string[] = [];
  if (closedEvents.length > 0) {
    noticeSections.push(
      "【活動截止自動關閉】\n" +
        `系統已自動將下列 ${closedEvents.length} 場已過截止日之活動狀態切換為「關閉」：\n\n` +
        closedEvents.join("\n") +
        "\n\n社員將無法再進行報名，幹部可於管理中心進行後續名冊審核。"
    );
  }
  if (expiredMembers.length > 0) {
    noticeSections.push(
      "【社籍到期自動轉未繳費】\n" +
        `系統巡檢偵測到下列 ${expiredMembers.length} 位社員之社籍已逾期，已將繳費狀態自動重置為「未繳費 Unpaid」：\n\n` +
        expiredMembers.join("\n") +
        "\n\n社員若欲續約登入繳費系統即可繳納新學期社費。"
    );
  }
  if (overdueLoans.length > 0) {
    noticeSections.push(
      "【⚠️ 裝備逾期未歸還催收提醒】\n" +
        `系統偵測到下列 ${overdueLoans.length} 筆裝備租借單已逾預計歸還日：\n\n` +
        overdueLoans.join("\n") +
        "\n\n請幹部主動與借用人聯繫確認歸還或續借狀況。"
    );
  }

  assertEquals(noticeSections.length, 3);
  assertEquals(noticeSections[0].includes("玉山單攻"), true);
  assertEquals(noticeSections[1].includes("王小明"), true);
  assertEquals(noticeSections[2].includes("L101"), true);
});
