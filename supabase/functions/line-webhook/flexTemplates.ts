import { EventRecord, PreferredLanguage } from "../_shared/types.ts";
import { formatTaipeiDate, formatEventDate, isEventExpired } from "../_shared/dateUtils.ts";
import { isEventFuture, isEventOpen } from "../_shared/statusUtils.ts";

export function buildEventListFlex(
  events: EventRecord[],
  signupCounts: Record<string, number>,
  prefLang: PreferredLanguage
) {
  const bubbles = [];
  const now = new Date();

  for (const ev of events) {
    const rawStatus = (ev.status || "").trim().toLowerCase();
    const isClosed =
      rawStatus.includes("關閉") ||
      rawStatus.includes("closed") ||
      rawStatus.includes("draft") ||
      rawStatus.includes("草稿");

    if (isClosed) continue;

    // 結束超過 14 天不顯示
    const targetEndDateStr = ev.end_date || ev.start_date;
    if (targetEndDateStr) {
      const endD = new Date(targetEndDateStr);
      if (!isNaN(endD.getTime()) && now.getTime() - endD.getTime() > 14 * 86400000) {
        continue;
      }
    }

    const isFuture = isEventFuture(ev.status);
    const isOpen = isEventOpen(ev.status, ev.deadline);

    const eventId = ev.id || "";
    const eventNameZh = ev.title || "未命名活動";
    const eventNameEn = ev.title_en || eventNameZh;
    const hasEnglish = Boolean(ev.title_en || ev.summary_en);

    const eventName =
      prefLang === "en"
        ? eventNameEn
        : prefLang === "zh"
        ? eventNameZh
        : hasEnglish
        ? `${eventNameZh} ${eventNameEn}`
        : eventNameZh;

    const tagColor = isFuture ? "#FF9800" : isOpen ? "#1DB446" : "#999999";
    const displayStatusZh = isFuture ? "未來開放" : isOpen ? "開放" : "報名截止";
    const displayStatusEn = isFuture ? "Coming Soon" : isOpen ? "Open" : "Reg. Closed";
    const displayStatus =
      prefLang === "en"
        ? displayStatusEn
        : prefLang === "zh"
        ? displayStatusZh
        : `${displayStatusZh} ${displayStatusEn}`;

    const regCount = signupCounts[eventId] || 0;
    const regCountStrZh = `已報名：${regCount} 人`;
    const regCountStrEn = `Registered: ${regCount}`;
    const regCountDisplay =
      prefLang === "en"
        ? regCountStrEn
        : prefLang === "zh"
        ? regCountStrZh
        : `${regCountStrZh} / ${regCountStrEn}`;

    const costStrZh = ev.fee > 0 ? `$${ev.fee}` : "免費";
    const costStrEn = ev.fee > 0 ? `$${ev.fee}` : "Free";
    const costStr =
      prefLang === "en"
        ? costStrEn
        : prefLang === "zh"
        ? costStrZh
        : ev.fee > 0
        ? `$${ev.fee}`
        : "免費 Free";

    const costLabel = prefLang === "en" ? "Cost: " : prefLang === "zh" ? "費用: " : "費用 Cost: ";
    const dateLabel = prefLang === "en" ? "Event Date:" : prefLang === "zh" ? "活動時間:" : "活動時間 Event Date:";
    const deadlineLabel = prefLang === "en" ? "Sign Up Deadline:" : prefLang === "zh" ? "報名截止:" : "報名截止 Sign Up Deadline:";
    const viewBtnLabel = prefLang === "en" ? "View Details" : prefLang === "zh" ? "查看詳情" : "查看詳情 View";

    const viewDisplayText =
      prefLang === "en"
        ? `I want to view details for ${eventNameEn}`
        : prefLang === "zh"
        ? `我想查看 ${eventNameZh} 的資訊`
        : `我想查看 ${hasEnglish ? `${eventNameZh} / ${eventNameEn}` : eventNameZh} 的資訊 / I want to view details`;

    const summaryText =
      prefLang === "en"
        ? ev.summary_en || ev.summary || ""
        : prefLang === "zh"
        ? ev.summary || ""
        : hasEnglish
        ? `${ev.summary || ""}\n─────────────\n${ev.summary_en || ""}`
        : ev.summary || "";

    const dateDisplay = formatEventDate(ev.start_date, ev.end_date);
    const deadlineFormatted = formatTaipeiDate(ev.deadline, "YYYY/MM/DD");

    const bubble: Record<string, unknown> = {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            justifyContent: "space-between",
            alignItems: "center",
            contents: [
              {
                type: "text",
                text: displayStatus,
                weight: "bold",
                color: tagColor,
                size: "sm",
                flex: 0,
              },
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: "#f0f9ff",
                cornerRadius: "md",
                paddingStart: "sm",
                paddingEnd: "sm",
                paddingTop: "xs",
                paddingBottom: "xs",
                flex: 0,
                contents: [
                  {
                    type: "text",
                    text: regCountDisplay,
                    size: "xs",
                    color: "#0284c7",
                    weight: "bold",
                    flex: 0,
                  },
                ],
              },
            ],
          },
          {
            type: "text",
            text: eventName,
            weight: "bold",
            size: "xl",
            margin: "sm",
            wrap: true,
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "xs",
            contents: [
              {
                type: "text",
                text: costLabel + costStr,
                size: "sm",
                color: "#666666",
                weight: "bold",
              },
              {
                type: "text",
                text: dateLabel,
                size: "sm",
                color: "#666666",
                margin: "sm",
              },
              {
                type: "text",
                text: dateDisplay,
                size: "sm",
                color: "#1DB446",
                weight: "bold",
              },
              {
                type: "text",
                text: deadlineLabel,
                size: "sm",
                color: "#666666",
                margin: "sm",
              },
              {
                type: "text",
                text: deadlineFormatted,
                size: "sm",
                color: "#E53935",
                weight: "bold",
              },
            ],
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "text",
            text: summaryText,
            size: "sm",
            color: "#999999",
            margin: "md",
            wrap: true,
            maxLines: 3,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: viewBtnLabel,
              data: `action=view&eventId=${eventId}`,
              displayText: viewDisplayText,
            },
          },
        ],
      },
    };

    const imageUrl = (ev.cover_image_url || "").trim();
    if (imageUrl.startsWith("http") && !imageUrl.includes("drive.google.com")) {
      bubble.hero = {
        type: "image",
        url: imageUrl,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
      };
    }

    bubbles.push(bubble);
  }

  return bubbles;
}

export function buildEventDetailFlex(
  ev: EventRecord,
  regCount: number,
  prefLang: PreferredLanguage
) {
  const eventNameZh = ev.title || "未命名活動";
  const eventNameEn = ev.title_en || eventNameZh;
  const hasEnglish = Boolean(ev.title_en || ev.summary_en || ev.itinerary_en);

  const eventName =
    prefLang === "en"
      ? eventNameEn
      : prefLang === "zh"
      ? eventNameZh
      : hasEnglish
      ? `${eventNameZh}\n${eventNameEn}`
      : ev.title;

  const isFuture = isEventFuture(ev.status);
  const isOpen = isEventOpen(ev.status, ev.deadline);
  const isExpired = isEventExpired(ev.deadline);

  const costStr =
    ev.fee > 0
      ? `$${ev.fee}`
      : prefLang === "en"
      ? "Free"
      : prefLang === "zh"
      ? "免費"
      : "免費 Free";

  const dateDisplay = formatEventDate(ev.start_date, ev.end_date);
  const deadlineFormatted = formatTaipeiDate(ev.deadline, "YYYY/MM/DD");

  const costLabel = prefLang === "en" ? "Cost: " : prefLang === "zh" ? "費用: " : "費用 Cost: ";
  const dateLabel = prefLang === "en" ? "Event Date: " : prefLang === "zh" ? "活動時間: " : "活動時間 Event Date: ";
  const deadlineLabel = prefLang === "en" ? "Sign Up Deadline: " : prefLang === "zh" ? "報名截止: " : "報名截止 Deadline: ";

  const titleTag = prefLang === "en" ? "【Title】" : prefLang === "zh" ? "【名稱】" : "【名稱 Title】";
  const summaryTag = prefLang === "en" ? "【Summary】" : prefLang === "zh" ? "【簡介】" : "【簡介 Summary】";
  const itineraryTag = prefLang === "en" ? "【Detailed Itinerary】" : prefLang === "zh" ? "【詳細行程】" : "【詳細行程 Detailed Itinerary】";

  const regCountStrZh = `已報名：${regCount} 人`;
  const regCountStrEn = `Registered: ${regCount}`;
  const regCountDisplay =
    prefLang === "en"
      ? regCountStrEn
      : prefLang === "zh"
      ? regCountStrZh
      : `${regCountStrZh} / ${regCountStrEn}`;

  const summaryZh = ev.summary || "尚無簡介";
  const summaryEn = ev.summary_en || ev.summary || "No summary";
  const summaryContent =
    prefLang === "en"
      ? summaryEn
      : prefLang === "zh"
      ? summaryZh
      : hasEnglish
      ? `${summaryZh}\n─────────────\n${summaryEn}`
      : summaryZh;

  const fullDescZh = ev.itinerary || "尚無詳細行程";
  const fullDescEn = ev.itinerary_en || ev.itinerary || "No detailed itinerary";
  const fullDescContent =
    prefLang === "en"
      ? fullDescEn
      : prefLang === "zh"
      ? fullDescZh
      : hasEnglish
      ? `${fullDescZh}\n─────────────\n${fullDescEn}`
      : fullDescZh;

  let buttonBox: Record<string, unknown>;
  if (isOpen) {
    const signupBtnLabel = prefLang === "en" ? "Sign Up" : prefLang === "zh" ? "一鍵報名" : "一鍵報名 Sign Up";
    const signupDisplayText =
      prefLang === "en"
        ? `Sign up for: ${eventNameEn}`
        : prefLang === "zh"
        ? `我要報名：${eventNameZh}`
        : `我要報名 Sign up for: ${hasEnglish ? eventNameEn : eventNameZh}`;

    buttonBox = {
      type: "button",
      style: "primary",
      color: "#1DB446",
      action: {
        type: "postback",
        label: signupBtnLabel,
        data: `action=signup&eventId=${ev.id}`,
        displayText: signupDisplayText,
      },
    };
  } else {
    const closedLabelZh = isFuture ? "即將開放" : isExpired ? "報名已截止" : "尚未開放";
    const closedLabelEn = isFuture ? "Coming Soon" : isExpired ? "Closed" : "Not Open";
    const closedLabel =
      prefLang === "en"
        ? closedLabelEn
        : prefLang === "zh"
        ? closedLabelZh
        : isFuture
        ? "即將開放 Coming Soon"
        : isExpired
        ? "報名已截止 Closed"
        : "尚未開放 Not Open";

    buttonBox = {
      type: "button",
      style: "secondary",
      color: "#CCCCCC",
      action: {
        type: "message",
        label: closedLabel,
        text: `${prefLang === "en" ? eventNameEn : eventNameZh} ${closedLabel}`,
      },
    };
  }

  const bubble: Record<string, unknown> = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          justifyContent: "space-between",
          alignItems: "center",
          contents: [
            {
              type: "text",
              text: titleTag,
              weight: "bold",
              size: "sm",
              color: "#1DB446",
              flex: 0,
            },
            {
              type: "box",
              layout: "horizontal",
              backgroundColor: "#f0f9ff",
              cornerRadius: "md",
              paddingStart: "sm",
              paddingEnd: "sm",
              paddingTop: "xs",
              paddingBottom: "xs",
              flex: 0,
              contents: [
                {
                  type: "text",
                  text: regCountDisplay,
                  size: "xs",
                  color: "#0284c7",
                  weight: "bold",
                  flex: 0,
                },
              ],
            },
          ],
        },
        {
          type: "text",
          text: eventName,
          weight: "bold",
          size: "lg",
          wrap: true,
          margin: "xs",
        },
        {
          type: "text",
          text: summaryTag,
          weight: "bold",
          size: "sm",
          color: "#1DB446",
          margin: "lg",
        },
        {
          type: "text",
          text: summaryContent,
          size: "sm",
          color: "#555555",
          wrap: true,
          margin: "xs",
        },
        {
          type: "text",
          text: itineraryTag,
          weight: "bold",
          size: "sm",
          color: "#1DB446",
          margin: "lg",
        },
        {
          type: "text",
          text: fullDescContent,
          size: "sm",
          color: "#555555",
          wrap: true,
          margin: "xs",
        },
        {
          type: "box",
          layout: "vertical",
          margin: "xl",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: costLabel + costStr,
              size: "sm",
              color: "#666666",
              weight: "bold",
            },
            {
              type: "text",
              text: dateLabel + dateDisplay,
              size: "sm",
              color: "#1DB446",
              weight: "bold",
            },
            {
              type: "text",
              text: deadlineLabel + deadlineFormatted,
              size: "sm",
              color: "#E53935",
              weight: "bold",
            },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [buttonBox],
    },
  };

  const imageUrl = (ev.cover_image_url || "").trim();
  if (imageUrl.startsWith("http") && !imageUrl.includes("drive.google.com")) {
    bubble.hero = {
      type: "image",
      url: imageUrl,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    };
  }

  return bubble;
}

export function buildMoreServicesFlex() {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "聯絡與支援 Support",
          weight: "bold",
          color: "#0367D3",
          size: "sm",
        },
        {
          type: "text",
          text: "幫助中心 Help Center",
          weight: "bold",
          size: "xl",
          margin: "md",
        },
        {
          type: "text",
          text: "聯絡社團幹部 Contact Officers",
          size: "xs",
          color: "#999999",
          margin: "sm",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "社員使用指南 Member Guide",
            text: "使用指南",
          },
        },
        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "小岳說明 AI Guide",
            text: "小岳說明 AI Guide",
          },
        },
        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "幹部是誰 Officers",
            text: "幹部是誰 Officers",
          },
        },
        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "意見回饋 Feedback",
            text: "意見回饋 Feedback",
          },
        },
      ],
    },
  };
}

export function buildOfficerMenuFlex(
  officers: Array<{ name: string; role: string; responsibilities: string; photo_url?: string | null }>
) {
  const bubbles = [];
  for (const off of officers.slice(0, 10)) {
    const bubble: Record<string, unknown> = {
      type: "bubble",
      size: "micro",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: off.role || "幹部 Officer",
            weight: "bold",
            color: "#0367D3",
            size: "sm",
          },
          {
            type: "text",
            text: off.name,
            weight: "bold",
            size: "xl",
            margin: "sm",
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "text",
            text: "負責業務 Responsibilities",
            size: "xxs",
            color: "#999999",
            margin: "md",
          },
          {
            type: "text",
            text: off.responsibilities || "協助社團各項事務與出隊帶領 Assist with club affairs",
            size: "xs",
            color: "#333333",
            wrap: true,
            margin: "xs",
          },
        ],
      },
    };

    if (off.photo_url && (off.photo_url.startsWith("http://") || off.photo_url.startsWith("https://"))) {
      bubble.hero = {
        type: "image",
        url: off.photo_url,
        size: "full",
        aspectRatio: "1:1",
        aspectMode: "cover",
      };
    }
    bubbles.push(bubble);
  }

  return bubbles;
}

export function buildAiGuideFlex(prefLang: PreferredLanguage) {
  const isEn = prefLang === "en";
  const title = isEn ? "Yue AI Assistant Guide" : "小岳 (Yue) AI 客服使用指南";
  const subtitle = isEn ? "NTUST Hiking Club Smart Assistant" : "台科登山社智慧助理";
  const secTitle = isEn ? "How to Use in Chat" : "個人聊天室使用方式";
  const desc1 = isEn ? "• Start your question with \"Yue\" or \"小岳\"." : "• 請輸入「小岳」或「Yue」開頭加上問題即可。";
  const desc2 = isEn ? "• Examples: \"Yue How high is Yushan?\", \"Yue How to choose a sleeping bag?\"" : "• 例如：「小岳 玉山有多高？」、「Yue 登山睡袋怎麼挑選？」";
  const desc3 = isEn ? "• Note: Messages without the prefix will be handled directly by club officers." : "• 提醒：若未加上「小岳」或「Yue」，訊息將保留給幹部親自回覆。";
  const bottomTip = isEn ? "To join hikes, rent gear, or check your dashboard, please use the Rich Menu below." : "若需報名活動、租借裝備或查看個人訂單，歡迎直接點擊下方圖文選單。";

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#059669",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: title,
          weight: "bold",
          size: "md",
          color: "#FFFFFF",
          wrap: true,
        },
        {
          type: "text",
          text: subtitle,
          size: "xs",
          color: "#A7F3D0",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: secTitle,
              weight: "bold",
              size: "sm",
              color: "#047857",
            },
            {
              type: "text",
              text: desc1,
              size: "xs",
              color: "#374151",
              wrap: true,
            },
            {
              type: "text",
              text: desc2,
              size: "xs",
              color: "#6B7280",
              wrap: true,
            },
            {
              type: "text",
              text: desc3,
              size: "xs",
              color: "#9CA3AF",
              wrap: true,
            },
          ],
        },
        {
          type: "separator",
        },
        {
          type: "text",
          text: bottomTip,
          size: "xs",
          color: "#6B7280",
          wrap: true,
        },
      ],
    },
  };
}

export function buildMemberGuideFlex(prefLang: PreferredLanguage) {
  const isEn = prefLang === "en";
  const title = isEn ? "Member Guide" : "台科登山社 社員使用指南";
  const subtitle = isEn ? "NTUST Hiking Club System Manual" : "官方帳號與系統操作指引";
  const navTitle = isEn ? "3 Navigation Methods" : "三大頁面切換途徑";
  const nav1 = isEn ? "1. Bottom Rich Menu: 6 main buttons in the LINE chat window." : "1. 底部圖文選單 (Rich Menu)：聊天室下方 6 大常駐按鈕。";
  const nav2 = isEn ? "2. Top-Right Profile Menu: Tap your avatar on any webpage to switch pages." : "2. 網頁頂部頭貼選單：點擊右上角 LINE 頭像即可快速切換。";
  const nav3 = isEn ? "3. In-Page Shortcuts: Quick jump to payment for pending dues, or submit hike reflections after trips." : "3. 頁面內捷徑：未繳費項目一鍵前往繳費，出隊完一鍵填寫心得。";

  const featTitle = isEn ? "6 Core Features" : "六大核心功能";
  const feat1 = isEn ? "• Profile: Complete mandatory fields before joining hikes or renting gear." : "• 個人資料：首次使用請務必補齊必填欄位。";
  const feat2 = isEn ? "• Events: Browse upcoming hikes and sign up online." : "• 最新活動：瀏覽活動詳情與登記報名。";
  const feat3 = isEn ? "• Gear Loan: 50% discount for club members." : "• 裝備租借：社員專屬租金 5 折優惠！";
  const feat4 = isEn ? "• Payment: Multi-item consolidated payment declaration with bank last 5 digits." : "• 繳費申報：多筆費用合併申報，填寫末五碼。";
  const feat5 = isEn ? "• Dashboard: Real-time track your signups, gear bookings, and pending fees." : "• 個人主頁：掌握活動審核、借裝進度與待繳費用。";
  const feat6 = isEn ? "• Reflections & Badges: Collect footprints and share your hiking reflections." : "• 成就與心得：累積出隊足跡並填寫回饋。";

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#059669",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: title,
          weight: "bold",
          size: "md",
          color: "#FFFFFF",
          wrap: true,
        },
        {
          type: "text",
          text: subtitle,
          size: "xs",
          color: "#A7F3D0",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: navTitle,
              weight: "bold",
              size: "sm",
              color: "#047857",
            },
            {
              type: "text",
              text: nav1,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: nav2,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: nav3,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
          ],
        },
        {
          type: "separator",
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: featTitle,
              weight: "bold",
              size: "sm",
              color: "#047857",
            },
            {
              type: "text",
              text: feat1,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: feat2,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: feat3,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: feat4,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: feat5,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: feat6,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
          ],
        },
      ],
    },
  };
}

export function buildFeedbackFlex(prefLang: PreferredLanguage) {
  const isEn = prefLang === "en";
  const title = isEn ? "Feedback & Suggestions" : "意見回饋與建議";
  const subtitle = isEn ? "NTUST Hiking Club User Feedback" : "台科登山社使用者回饋";
  const desc1 = isEn
    ? "Whether you have suggestions for the club, event ideas, questions, or bug reports (screenshots supported), we would love to hear from you!"
    : "無論是想對社團說的話、活動建議、問題詢問，還是回報系統錯誤 (可附截圖)，都歡迎透過表單告訴我們！";
  const desc2 = isEn
    ? "After receiving your feedback, our club officers will review and follow up as soon as possible."
    : "收到您的回饋後，幹部會盡快查看並處理。";
  const btnLabel = isEn ? "Open Feedback Form" : "開啟回饋表單";
  const googleFormUrl = "https://forms.gle/bCT7fjVP3bSrReF96";

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#059669",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: title,
          weight: "bold",
          size: "md",
          color: "#FFFFFF",
          wrap: true,
        },
        {
          type: "text",
          text: subtitle,
          size: "xs",
          color: "#A7F3D0",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: desc1,
          size: "sm",
          color: "#374151",
          wrap: true,
        },
        {
          type: "text",
          text: desc2,
          size: "xs",
          color: "#6B7280",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: {
            type: "uri",
            label: btnLabel,
            uri: googleFormUrl,
          },
        },
      ],
    },
  };
}
