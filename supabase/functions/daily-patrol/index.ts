import { getSupabaseAdminClient } from "../_shared/supabaseClient.ts";
import { formatTaipeiDate } from "../_shared/dateUtils.ts";
import { pushAdminMessage } from "../_shared/pushAdminMessage.ts";

export async function runDailyPatrol(): Promise<{
  status: string;
  date: string;
  closedEventsCount: number;
  expiredMembersCount: number;
  overdueLoansCount: number;
  message?: string;
}> {
  const client = getSupabaseAdminClient();
  const now = new Date();
  const todayStr = formatTaipeiDate(now, "YYYY-MM-DD");
  const nowIso = now.toISOString();

  const closedEvents: string[] = [];
  const expiredMembers: string[] = [];
  const overdueLoans: string[] = [];

  // 1. 活動結束巡檢：活動結束超過一週 (7 天) 且狀態為「開放」者，自動切換為「關閉」
  // 若活動尚未結束一週（以 end_date || start_date 判定），則保留不設為關閉。
  try {
    const { data: openEvents, error: evErr } = await client
      .from("events")
      .select("id,title,deadline,status,start_date,end_date")
      .eq("status", "開放");

    if (!evErr && openEvents && openEvents.length > 0) {
      for (const evt of openEvents) {
        const targetEndDateStr = evt.end_date || evt.start_date;
        if (!targetEndDateStr) continue;

        const endD = new Date(targetEndDateStr);
        if (isNaN(endD.getTime())) continue;

        // 若結束超過 7 天 (7 * 86400000 毫秒)
        if (now.getTime() - endD.getTime() > 7 * 86400000) {
          const { error: patchErr } = await client
            .from("events")
            .update({ status: "關閉", updated_at: new Date().toISOString() })
            .eq("id", evt.id);

          if (!patchErr) {
            closedEvents.push(`• ${evt.title || evt.id} (結束日: ${targetEndDateStr})`);
          }
        }
      }
    }
  } catch (errEv) {
    console.warn("巡檢活動結束狀態異常:", errEv);
  }

  // 2. 社員社籍期滿巡檢：到期日小於今日者，轉為未繳費
  try {
    const { data: expMems, error: memErr } = await client
      .from("members")
      .select("line_user_id,name,membership_expires_at")
      .eq("payment_status", "已繳費 Paid")
      .lt("membership_expires_at", todayStr);

    if (!memErr && expMems && expMems.length > 0) {
      for (const mem of expMems) {
        const { error: patchMemErr } = await client
          .from("members")
          .update({
            payment_status: "未繳費 Unpaid",
            is_official_member: false,
            updated_at: new Date().toISOString(),
          })
          .eq("line_user_id", mem.line_user_id);

        if (!patchMemErr) {
          expiredMembers.push(`• ${mem.name || "社員"} (到期日: ${mem.membership_expires_at})`);
        }
      }
    }
  } catch (errMem) {
    console.warn("巡檢社員社籍異常:", errMem);
  }

  // 3. 裝備逾期巡檢：狀態為「使用中 Using」「租借中 Borrowed」或「待領取 To Be Collected」且歸還日小於今日
  try {
    const { data: ovLoans, error: loanErr } = await client
      .from("loans")
      .select("id,name,line_user_id,end_date,status")
      .in("status", ["使用中 Using", "租借中 Borrowed", "待領取 To Be Collected", "待領取"])
      .lt("end_date", todayStr);

    if (!loanErr && ovLoans && ovLoans.length > 0) {
      for (const ln of ovLoans) {
        let phone = "無";
        if (ln.line_user_id) {
          const { data: m } = await client
            .from("members")
            .select("phone")
            .eq("line_user_id", ln.line_user_id)
            .maybeSingle();
          if (m && m.phone) {
            phone = m.phone;
          }
        }
        overdueLoans.push(
          `• 單號 ${ln.id}：${ln.name || "借用人"} (應還日期: ${ln.end_date}，電話: ${phone})`
        );
      }
    }
  } catch (errLn) {
    console.warn("巡檢逾期裝備異常:", errLn);
  }

  // 4. 彙整報告並推播給幹部 (僅在有項目異動或逾期時才發信，杜絕洗版)
  const noticeSections: string[] = [];
  if (closedEvents.length > 0) {
    noticeSections.push(
      "【活動結束超過一週自動關閉】\n" +
        `系統已自動將下列 ${closedEvents.length} 場結束超過一週之活動狀態切換為「關閉」：\n\n` +
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
      "【裝備逾期未歸還催收提醒】\n" +
        `系統偵測到下列 ${overdueLoans.length} 筆裝備租借單已逾預計歸還日：\n\n` +
        overdueLoans.join("\n") +
        "\n\n請幹部主動與借用人聯繫確認歸還或續借狀況。"
    );
  }

  if (noticeSections.length > 0) {
    const reportSubject = `【台科登山社】系統每週自動巡檢報告 - ${todayStr}`;
    const reportBody =
      "【系統每週自動巡檢報告】\n" +
      "─────────────\n\n" +
      noticeSections.join("\n\n────────────────────\n\n") +
      `\n\n巡檢時間：${formatTaipeiDate(now, "YYYY-MM-DD HH:mm:ss")}`;

    await pushAdminMessage(reportBody, reportSubject);
  }

  return {
    status: "success",
    date: todayStr,
    closedEventsCount: closedEvents.length,
    expiredMembersCount: expiredMembers.length,
    overdueLoansCount: overdueLoans.length,
  };
}

Deno.serve(async (req: Request) => {
  // 支援 GET (pg_cron / HTTP Ping) 與 POST
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const result = await runDailyPatrol();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errString = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ status: "error", message: errString }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
