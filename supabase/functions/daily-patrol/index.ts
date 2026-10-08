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

  // 1. 活動截止巡檢：超過報名截止日且狀態為「開放」，自動切換為「關閉」
  try {
    const { data: expEvents, error: evErr } = await client
      .from("events")
      .select("id,title,deadline,status")
      .eq("status", "開放")
      .lt("deadline", nowIso);

    if (!evErr && expEvents && expEvents.length > 0) {
      for (const evt of expEvents) {
        const { error: patchErr } = await client
          .from("events")
          .update({ status: "關閉", updated_at: new Date().toISOString() })
          .eq("id", evt.id);

        if (!patchErr) {
          closedEvents.push(`• ${evt.title || evt.id} (截止日: ${evt.deadline})`);
        }
      }
    }
  } catch (errEv) {
    console.warn("巡檢活動截止異常:", errEv);
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

  if (noticeSections.length > 0) {
    const reportSubject = `【台科登山社】系統每日自動巡檢報告 - ${todayStr}`;
    const reportBody =
      "【系統每日自動巡檢報告】\n" +
      "─────────────\n\n" +
      noticeSections.join("\n\n────────────────────\n\n") +
      `\n\n⚡ 巡檢時間：${formatTaipeiDate(now, "YYYY-MM-DD HH:mm:ss")}`;

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
