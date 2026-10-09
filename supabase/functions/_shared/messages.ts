import { BilingualText } from "./types.ts";

export const messages = {
  bindAdminGroupSuccess: (groupId: string): BilingualText => ({
    zh: `✅ 已成功將此群組設定為【幹部管理推播群組】！\n(群組 ID: ${groupId})\n未來所有裝備租借、繳費申報與新幹部意願將自動推播至此！`,
    en: `✅ Successfully configured this group as the [Admin Notification Group]!\n(Group ID: ${groupId})\nFuture loan requests, payment claims, and officer intents will be pushed here!`,
  }),

  bindAdminGroupOnlyInGroup: (): BilingualText => ({
    zh: "⚠️ 此指令僅能在幹部 LINE 群組內執行。",
    en: "⚠️ This command can only be executed within an officer LINE group.",
  }),

  adminAssistantCard: (): BilingualText => ({
    zh:
      "🌲 幹部專屬助理「小岳助理」在此！\n" +
      "─────────────\n" +
      "目前在幹部群組中支援以下功能與指令：\n\n" +
      "🛠️ 【幹部系統】\n" +
      "• 輸入「@小岳助理 幹部系統」或點擊下方連結進入後台：\n" +
      "👉 https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fadmin%2Fevents\n\n" +
      "💡 幹部小提醒：\n" +
      "若需要綁定此群組接收通知，請輸入「@小岳助理 綁定幹部群組」！\n" +
      "若有其他問題，也可以隨時在群組 @小岳助理 詢問登山社相關庶務！",
    en:
      "🌲 Officer Assistant 'Yue Assistant' is here!\n" +
      "─────────────\n" +
      "Supported commands in officer group:\n\n" +
      "🛠️ [Officer Portal]\n" +
      "• Type '@小岳助理 幹部系統' or tap link to enter portal:\n" +
      "👉 https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fadmin%2Fevents\n\n" +
      "💡 Note:\n" +
      "To bind this group for alerts, type '@小岳助理 綁定幹部群組'!\n" +
      "Feel free to tag @小岳助理 for club management queries!",
  }),

  welcomeAi: (): BilingualText => ({
    zh:
      "您好！我是台科登山社 AI 助理「小岳 (Yue)」🏔️\n" +
      "請問有什麼我可以為您解答的嗎？\n\n" +
      "💡 提問範例 / Example Queries：\n" +
      "• 小岳 玉山有多高？\n" +
      "• Yue 登山睡袋怎麼挑選？\n" +
      "• Yue Which Baiyue peak is recommended for beginners?\n\n" +
      "─────────────\n" +
      "Hi! I'm the club's AI Assistant Yue. Type '小岳' or 'Yue' followed by your question!\n" +
      "（若為特定個案或需幹部處理之行政事務，請直接留言，幹部將會親自回覆您！）",
    en:
      "Hello! I am NTUST Hiking Club AI Assistant Yue 🏔️\n" +
      "How may I assist you today?\n\n" +
      "💡 Example Queries:\n" +
      "• Yue How high is Yushan?\n" +
      "• Yue How to choose a sleeping bag?\n" +
      "• Yue Which Baiyue peak is recommended for beginners?\n\n" +
      "(For specific administrative issues, please leave a message and our officers will reply directly!)",
  }),

  geminiBusyFallback: (errReason: string): BilingualText => ({
    zh: `小岳目前連線稍微忙碌（原因：${errReason}），請稍後再試，或直接在此留言洽詢社團幹部喔！🏔️`,
    en: `Yue is currently busy or unavailable (Reason: ${errReason}). Please try again later, or leave a message here for club officers! 🏔️`,
  }),

  geminiNoKey: (): BilingualText => ({
    zh: "小岳目前連線稍微忙碌（原因：GEMINI_API_KEY 未設定），請稍後再試，或直接在此留言洽詢社團幹部喔！🏔️",
    en: "Yue is currently busy or unavailable (Reason: GEMINI_API_KEY Not Configured). Please try again later, or leave a message here for club officers! 🏔️",
  }),

  noScheduledEvents: (): BilingualText => ({
    zh: "目前這學期還沒有排定的活動喔！敬請期待幹部們的規劃 🏔️",
    en: "There are currently no scheduled events for this semester! Stay tuned 🏔️",
  }),

  signupEventClosed: (title?: string, deadline?: string): BilingualText => ({
    zh: `⚠️ 報名失敗：【${title || "該活動"}】已於 ${deadline || "日前"} 截止報名！\n感謝您的熱情關注，請期待下一次的精彩活動！🏕️`,
    en: `⚠️ Registration Closed: [${title || "Event"}] registration is closed.`,
  }),

  signupEventNotFound: (eventId?: string): BilingualText => ({
    zh: `⚠️ 報名失敗：查無活動代號【${eventId || "未知"}】，請確認活動代號是否正確！`,
    en: `⚠️ Event not found for code: ${eventId || "unknown"}`,
  }),

  signupMemberNotFound: (liffUrl?: string): BilingualText => ({
    zh:
      "⚠️ 報名失敗：系統找不到您的社員資料！\n" +
      "請先點選單中的「填寫資料」完成註冊後再報名。\n" +
      (liffUrl ? `👉 ${liffUrl}` : ""),
    en:
      "⚠️ Registration Failed: Member profile not found!\n" +
      "Please click 'Register' in the menu to complete your profile first.\n" +
      (liffUrl ? `👉 ${liffUrl}` : ""),
  }),

  signupProfileIncomplete: (missingFieldsStr: string, liffUrl?: string): BilingualText => ({
    zh:
      "⚠️ 報名失敗：您的個人資料尚不完整！\n\n" +
      "為了辦理平安保險與確保戶外活動安全，請先點擊選單的「填寫資料」，補齊以下必填資訊：\n\n" +
      `${missingFieldsStr}\n\n` +
      "完成資料更新後，再回來點擊一鍵報名喔！🏕️\n" +
      (liffUrl ? `👉 ${liffUrl}` : ""),
    en:
      "⚠️ Registration Failed: Incomplete member profile!\n\n" +
      "For insurance coverage and outdoor activity safety, please click 'Register' in the menu to complete the following required fields:\n\n" +
      `${missingFieldsStr}\n\n` +
      "Once your profile is updated, return here to sign up with one click! 🏕️\n" +
      (liffUrl ? `👉 ${liffUrl}` : ""),
  }),

  signupProfileExpired: (reason: string, liffUrl?: string): BilingualText => ({
    zh:
      `⚠️ 報名提醒：${reason}！\n\n` +
      "社團出團活動將依據您的「爬山經歷」與「體能狀況」進行審查與篩選。為了維護出隊安全並增加您的錄取機會，若近期有更豐富的登山紀錄或更佳的體能表現，請先前往更新個人資料後，再回到此處報名活動喔！\n\n" +
      "👉 立即前往更新個人資料：\n" +
      (liffUrl || "https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fdashboard"),
    en:
      `⚠️ Registration Notice: ${reason}!\n\n` +
      "Club outings evaluate applications based on your hiking experience and fitness status. To ensure safety and boost your admission chances, please update your profile with your latest records before signing up!\n\n" +
      "👉 Update Your Profile Now:\n" +
      (liffUrl || "https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fdashboard"),
  }),

  signupDuplicate: (title: string): BilingualText => ({
    zh: `⚠️ 您已經報名過【${title}】囉！\n請耐心等候幹部審核，或是至個人主頁查詢進度。`,
    en: `⚠️ You have already registered for [${title}]!\nPlease wait for officer review.`,
  }),

  signupSuccessReceipt: (
    title: string,
    signupId: string,
    fee: number,
    isOfficial: boolean,
    frontendUrl: string
  ): BilingualText => ({
    zh:
      `🎉 恭喜！您已成功送出【${title}】活動報名！\n\n` +
      `📋 報名專屬碼：${signupId}\n` +
      `💰 活動預估費用：$${fee} 元 (${isOfficial ? "社員價" : "非社員價"})\n` +
      "📊 目前審核狀態：審核中 Checking\n\n" +
      "💡 幹部審核通過後將會發送通知，請隨時留意社團訊息與個人中心！\n" +
      `👉 ${frontendUrl}/dashboard`,
    en:
      `🎉 Congratulations! Your registration for [${title}] has been submitted!\n\n` +
      `📋 Registration Code: ${signupId}\n` +
      `💰 Estimated Fee: $${fee} NTD (${isOfficial ? "Member Rate" : "Non-Member Rate"})\n` +
      "📊 Status: Checking\n\n" +
      "💡 You will be notified once reviewed by officers. Check your status anytime:\n" +
      `👉 ${frontendUrl}/dashboard`,
  }),

  signupSystemBusy: (errDetail: string): BilingualText => ({
    zh: `❌ 報名系統目前忙碌中，請稍後再試。（原因：${errDetail}）`,
    en: `❌ Registration system is busy, please try again later. (Reason: ${errDetail})`,
  }),

  waitlistConfirmed: (title: string): BilingualText => ({
    zh: `✅ 已收到您對【${title}】的備取意願！若有正取名額釋出，幹部將優先依序為您遞補並發送通知！`,
    en: `✅ Received your waitlist confirmation for [${title}]! If a confirmed spot opens up, officers will prioritize you!`,
  }),

  waitlistFailed: (errDetail: string): BilingualText => ({
    zh: `⚠️ 更新備取意願失敗（原因：${errDetail}），請直接在社團群組或個人中心確認。`,
    en: `⚠️ Failed to update waitlist interest (Reason: ${errDetail}). Please check directly in dashboard or contact officers.`,
  }),
};
