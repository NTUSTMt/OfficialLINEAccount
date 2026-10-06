// ==============================================================================
// 🎨 台科登山社社團系統 GAS 模組 3：LINE Flex Message 樣板與展示 (03_Flex_Templates.js)
// ==============================================================================

/**
 * 輔助函式：判定活動報名截止日是否已過 (當天 23:59:59 截止)
 */
function _isEventExpired(deadlineVal) {
  if (!deadlineVal) return false;
  try {
    var now = new Date();
    if (deadlineVal instanceof Date) {
      var d = new Date(deadlineVal.getTime());
      if (d.getHours() === 0 && d.getMinutes() === 0) {
        d.setHours(23, 59, 59, 999);
      }
      return now.getTime() > d.getTime();
    }
    var str = String(deadlineVal).trim();
    if (!str) return false;

    // 容錯歷史舊資料 23:59:59Z (原意為台北時間 23:59:59)
    if (str.indexOf("23:59:59Z") > -1) {
      var datePartOld = str.split("T")[0];
      var pOld = datePartOld.split("-");
      if (pOld.length >= 3) {
        var tpeOldDeadline = new Date(parseInt(pOld[0], 10), parseInt(pOld[1], 10) - 1, parseInt(pOld[2], 10), 23, 59, 59, 999);
        return now.getTime() > tpeOldDeadline.getTime();
      }
    }

    if (str.includes("T")) {
      var isoDate = new Date(str);
      if (!isNaN(isoDate.getTime())) {
        return now.getTime() > isoDate.getTime();
      }
    }

    var cleanStr = str.replace(/[\/\.]/g, "-");
    var datePart = cleanStr.split("T")[0].split(" ")[0];
    var parts = datePart.split("-");
    if (parts.length >= 3) {
      var year = parseInt(parts[0], 10);
      var month = parseInt(parts[1], 10) - 1;
      var day = parseInt(parts[2], 10);
      var deadlineDate = new Date(year, month, day, 23, 59, 59, 999);
      return now.getTime() > deadlineDate.getTime();
    }
  } catch (e) {
    console.error("解析活動截止日期失敗:", deadlineVal, e);
  }
  return false;
}

/**
 * 輔助函式：解析活動日期字串或 Date 物件
 * @param {string|Date} dateVal - 日期字串或 Date 物件
 * @param {boolean} endOfDay - 若為 true，設定為當日 23:59:59.999
 * @returns {Date|null}
 */
function _parseEventDate(dateVal, endOfDay) {
  if (!dateVal) return null;
  try {
    if (dateVal instanceof Date) {
      var d = new Date(dateVal.getTime());
      if (endOfDay) d.setHours(23, 59, 59, 999);
      return d;
    }
    var str = String(dateVal).trim();
    if (!str) return null;

    // 容錯歷史舊資料 23:59:59Z (原意為台北時間 23:59:59)
    if (str.indexOf("23:59:59Z") > -1) {
      var datePartOld = str.split("T")[0];
      var pOld = datePartOld.split("-");
      if (pOld.length >= 3) {
        return new Date(parseInt(pOld[0], 10), parseInt(pOld[1], 10) - 1, parseInt(pOld[2], 10), 23, 59, 59, 999);
      }
    }

    var cleanStr = str.replace(/[\/\.]/g, "-");
    var datePart = cleanStr.split("T")[0].split(" ")[0];
    var parts = datePart.split("-");
    if (parts.length >= 3) {
      var year = parseInt(parts[0], 10);
      var month = parseInt(parts[1], 10) - 1;
      var day = parseInt(parts[2], 10);
      if (endOfDay) {
        return new Date(year, month, day, 23, 59, 59, 999);
      } else {
        return new Date(year, month, day, 0, 0, 0, 0);
      }
    }

    var isoDate = new Date(str);
    if (!isNaN(isoDate.getTime())) {
      if (endOfDay) isoDate.setHours(23, 59, 59, 999);
      return isoDate;
    }
  } catch (e) {
    console.error("解析活動日期失敗:", dateVal, e);
  }
  return null;
}

/**
 * 輔助函式：日期字串格式化 (依台灣時區轉換為 YYYY/MM/DD)
 */
function _formatEventDate(dateVal) {
  if (!dateVal) return "";
  var str = String(dateVal).trim();
  try {
    var dateMatch = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    // 若時間剛好為 23:59:59Z (歷史舊 Bug 造成 UTC 23:59:59)，將其當作當天，避免跨日跳到隔天
    if (str.indexOf("23:59:59Z") > -1 && dateMatch) {
      var pad = function(n) { return String(n).length < 2 ? '0' + n : String(n); };
      return dateMatch[1] + '/' + pad(dateMatch[2]) + '/' + pad(dateMatch[3]);
    }
    if (typeof Utilities !== "undefined" && Utilities.formatDate) {
      var d = (dateVal instanceof Date) ? dateVal : new Date(str);
      if (!isNaN(d.getTime())) {
        return Utilities.formatDate(d, "Asia/Taipei", "yyyy/MM/dd");
      }
    }
  } catch (e) {}

  var m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) {
    var padFn = function(n) { return String(n).length < 2 ? '0' + n : String(n); };
    return m[1] + '/' + padFn(m[2]) + '/' + padFn(m[3]);
  }
  return str.replace(/-/g, "/").substring(0, 10);
}

/**
 * 產生最新活動卡片輪播 (100% 直連 Supabase events 表，絕不讀取主試算表)
 */
function sendEventList(replyToken, userId) {
  var prefLang = _getUserPreferredLanguage(userId);
  var sbEvents = _supabaseGet("events", {
    select: "id,title,title_en,fee,start_date,end_date,deadline,status,summary,summary_en,cover_image_url",
    order: "start_date.desc"
  });

  if (!sbEvents || !Array.isArray(sbEvents) || sbEvents.length === 0) {
    var emptyMsgZh = "目前這學期還沒有排定的活動喔！";
    var emptyMsgEn = "There are no scheduled activities for this semester yet!";
    _replyMessage(replyToken, _formatBilingualMessage(emptyMsgZh, emptyMsgEn, prefLang));
    return;
  }

  // 批次查詢 event_signups 表統計各活動已報名人數 (排除已取消者)
  var eventIds = [];
  for (var k = 0; k < sbEvents.length; k++) {
    if (sbEvents[k] && sbEvents[k].id) {
      eventIds.push(sbEvents[k].id);
    }
  }

  var signupCounts = {};
  if (eventIds.length > 0) {
    var signups = _supabaseGet("event_signups", {
      select: "event_id,status",
      event_id: "in.(" + eventIds.join(",") + ")"
    });
    if (signups && Array.isArray(signups)) {
      for (var s = 0; s < signups.length; s++) {
        var su = signups[s];
        var sStatus = String(su.status || "").trim().toLowerCase();
        if (sStatus.indexOf("取消") === -1 && sStatus.indexOf("cancel") === -1) {
          var eid = su.event_id;
          signupCounts[eid] = (signupCounts[eid] || 0) + 1;
        }
      }
    }
  }

  var bubbles = [];
  var now = new Date();

  for (var i = 0; i < sbEvents.length; i++) {
    var ev = sbEvents[i];
    var rawStatus = String(ev.status || "").trim().toLowerCase();

    // 1. 關閉或草稿的活動不需要顯示出來 (排除「關閉」、「closed」、「draft」、「草稿」)
    var isClosed = rawStatus.indexOf("關閉") > -1 || rawStatus.indexOf("closed") > -1 || rawStatus.indexOf("draft") > -1 || rawStatus.indexOf("草稿") > -1;
    if (isClosed) {
      continue;
    }

    // 2. 活動結束2週以上 (超過 14 天) 的活動不需要出現 (以 end_date || start_date 判定)
    var targetEndDate = _parseEventDate(ev.end_date || ev.start_date, true);
    if (targetEndDate && (now.getTime() - targetEndDate.getTime()) > 14 * 24 * 60 * 60 * 1000) {
      continue;
    }

    var deadlineStr = ev.deadline || "";
    var isExpired = _isEventExpired(deadlineStr);

    // 3. 判斷是否為未來開放或開放
    var isFuture = rawStatus.indexOf("未來") > -1 || rawStatus.indexOf("coming") > -1 || rawStatus.indexOf("future") > -1;
    var isOpen = !isFuture && !isExpired && (rawStatus.indexOf("開放") > -1 || rawStatus.indexOf("open") > -1);

    var eventId = ev.id || "";
    var eventNameZh = ev.title || "未命名活動";
    var eventNameEn = ev.title_en || ev.name_en || eventNameZh;
    var hasEnglish = Boolean(ev.title_en || ev.summary_en || ev.name_en);
    var eventName = (prefLang === "en") ? eventNameEn : (prefLang === "zh" ? eventNameZh : (hasEnglish ? (eventNameZh + " " + eventNameEn) : eventNameZh));

    var tagColor = isFuture ? "#FF9800" : (isOpen ? "#1DB446" : "#999999");
    var displayStatusZh = isFuture ? "未來開放" : (isOpen ? "開放" : "報名截止");
    var displayStatusEn = isFuture ? "Coming Soon" : (isOpen ? "Open" : "Reg. Closed");
    var displayStatus = (prefLang === "en") ? displayStatusEn : (prefLang === "zh" ? displayStatusZh : (displayStatusZh + " " + displayStatusEn));

    var regCount = signupCounts[eventId] || 0;
    var regCountStrZh = "已報名：" + regCount + " 人";
    var regCountStrEn = "Registered: " + regCount;
    var regCountDisplay = (prefLang === "en")
      ? regCountStrEn
      : (prefLang === "zh"
          ? regCountStrZh
          : (regCountStrZh + " / " + regCountStrEn));

    var costStrZh = (ev.fee !== undefined && ev.fee !== null && ev.fee > 0) ? "$" + ev.fee : "免費";
    var costStrEn = (ev.fee !== undefined && ev.fee !== null && ev.fee > 0) ? "$" + ev.fee : "Free";
    var costStr = (prefLang === "en") ? costStrEn : (prefLang === "zh" ? costStrZh : ((ev.fee !== undefined && ev.fee !== null && ev.fee > 0) ? "$" + ev.fee : "免費 Free"));

    var costLabel = (prefLang === "en") ? "Cost: " : (prefLang === "zh" ? "費用: " : "費用 Cost: ");
    var dateLabel = (prefLang === "en") ? "Event Date:" : (prefLang === "zh" ? "活動時間:" : "活動時間 Event Date:");
    var deadlineLabel = (prefLang === "en") ? "Sign Up Deadline:" : (prefLang === "zh" ? "報名截止:" : "報名截止 Sign Up Deadline:");
    var viewBtnLabel = (prefLang === "en") ? "View Details" : (prefLang === "zh" ? "查看詳情" : "查看詳情 View");
    var viewDisplayText = (prefLang === "en")
      ? ("I want to view details for " + eventNameEn)
      : (prefLang === "zh"
          ? ("我想查看 " + eventNameZh + " 的資訊")
          : ("我想查看 " + (hasEnglish ? (eventNameZh + " / " + eventNameEn) : eventNameZh) + " 的資訊 / I want to view details"));

    var summaryText = (prefLang === "en")
      ? (ev.summary_en || ev.short_desc_en || ev.summary || "")
      : (prefLang === "zh"
          ? (ev.summary || "")
          : (hasEnglish ? _formatBilingualMessage(ev.summary, ev.summary_en, null) : (ev.summary || "")));

    var startFormatted = _formatEventDate(ev.start_date);
    var endFormatted = _formatEventDate(ev.end_date);
    var deadlineFormatted = _formatEventDate(ev.deadline);

    var dateDisplay = startFormatted;
    if (endFormatted && endFormatted !== startFormatted) {
      dateDisplay += " ~ " + endFormatted;
    }

    var bubble = {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [{
          "type": "box",
          "layout": "horizontal",
          "justifyContent": "space-between",
          "alignItems": "center",
          "contents": [{
            "type": "text",
            "text": displayStatus,
            "weight": "bold",
            "color": tagColor,
            "size": "sm",
            "flex": 0
          }, {
            "type": "box",
            "layout": "horizontal",
            "backgroundColor": "#f0f9ff",
            "cornerRadius": "md",
            "paddingStart": "sm",
            "paddingEnd": "sm",
            "paddingTop": "xs",
            "paddingBottom": "xs",
            "flex": 0,
            "contents": [{
              "type": "text",
              "text": regCountDisplay,
              "size": "xs",
              "color": "#0284c7",
              "weight": "bold",
              "flex": 0
            }]
          }]
        }, {
          "type": "text",
          "text": eventName,
          "weight": "bold",
          "size": "xl",
          "margin": "sm",
          "wrap": true
        }, {
          "type": "box",
          "layout": "vertical",
          "margin": "md",
          "spacing": "xs",
          "contents": [{
            "type": "text",
            "text": costLabel + costStr,
            "size": "sm",
            "color": "#666666",
            "weight": "bold"
          }, {
            "type": "text",
            "text": dateLabel,
            "size": "sm",
            "color": "#666666",
            "margin": "sm"
          }, {
            "type": "text",
            "text": dateDisplay,
            "size": "sm",
            "color": "#1DB446",
            "weight": "bold"
          }, {
            "type": "text",
            "text": deadlineLabel,
            "size": "sm",
            "color": "#666666",
            "margin": "sm"
          }, {
            "type": "text",
            "text": deadlineFormatted,
            "size": "sm",
            "color": "#E53935",
            "weight": "bold"
          }]
        }, {
          "type": "separator",
          "margin": "md"
        }, {
          "type": "text",
          "text": summaryText,
          "size": "sm",
          "color": "#999999",
          "margin": "md",
          "wrap": true,
          "maxLines": 3
        }]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "contents": [{
          "type": "button",
          "style": "secondary",
          "action": {
            "type": "postback",
            "label": viewBtnLabel,
            "data": "action=view&eventId=" + eventId,
            "displayText": viewDisplayText
          }
        }]
      }
    };

    var imageUrl = String(ev.cover_image_url || "").trim();
    if (imageUrl && imageUrl.startsWith("http") && !imageUrl.includes("drive.google.com")) {
      bubble.hero = {
        "type": "image",
        "url": imageUrl,
        "size": "full",
        "aspectRatio": "20:13",
        "aspectMode": "cover"
      };
    }
    bubbles.push(bubble);
  }

  if (bubbles.length === 0) {
    var noEventsZh = "目前這學期還沒有排定的活動喔！";
    var noEventsEn = "There are no scheduled activities for this semester yet!";
    _replyMessage(replyToken, _formatBilingualMessage(noEventsZh, noEventsEn, prefLang));
  } else {
    var flexTitle = (prefLang === "en") ? "Event List" : (prefLang === "zh" ? "請查看本學期活動列表" : "請查看本學期活動列表 / Event List");
    _replyFlexMessage(replyToken, flexTitle, {
      "type": "carousel",
      "contents": bubbles
    });
  }
}

/**
 * 產生單一活動詳細資訊卡片 (100% 直連 Supabase events 表，絕不讀取主試算表)
 */
function sendEventDetail(replyToken, eventId, userId) {
  var prefLang = _getUserPreferredLanguage(userId);
  if (!eventId) {
    var notFoundZh = "找不到該活動的詳細資訊！";
    var notFoundEn = "Event details not found!";
    _replyMessage(replyToken, _formatBilingualMessage(notFoundZh, notFoundEn, prefLang));
    return;
  }

  var sbList = _supabaseGet("events", { id: "eq." + String(eventId).trim() });
  if (!sbList || !Array.isArray(sbList) || sbList.length === 0) {
    var notFoundZh2 = "找不到該活動的詳細資訊！";
    var notFoundEn2 = "Event details not found!";
    _replyMessage(replyToken, _formatBilingualMessage(notFoundZh2, notFoundEn2, prefLang));
    return;
  }

  var ev = sbList[0];
  var eventNameZh = ev.title || "未命名活動";
  var eventNameEn = ev.title_en || ev.name_en || eventNameZh;
  var hasEnglish = Boolean(ev.title_en || ev.summary_en || ev.itinerary_en || ev.name_en);

  var eventName = (prefLang === "en")
    ? eventNameEn
    : (prefLang === "zh"
        ? eventNameZh
        : (hasEnglish ? (eventNameZh + "\n" + eventNameEn) : (ev.title || "未命名活動 (Untitled Event)")));

  var rawStatus = String(ev.status || "").trim().toLowerCase();
  var deadlineStr = ev.deadline || "";
  var isExpired = _isEventExpired(deadlineStr);

  var isFuture = rawStatus.indexOf("未來") > -1 || rawStatus.indexOf("coming") > -1 || rawStatus.indexOf("future") > -1;
  var isOpen = !isFuture && !isExpired && (rawStatus.indexOf("開放") > -1 || rawStatus.indexOf("open") > -1);

  var costStr = (ev.fee !== undefined && ev.fee !== null && ev.fee > 0)
    ? "$" + ev.fee
    : ((prefLang === "en") ? "Free" : (prefLang === "zh" ? "免費" : "免費 Free"));
  var startFormatted = _formatEventDate(ev.start_date);
  var endFormatted = _formatEventDate(ev.end_date);
  var deadlineFormatted = _formatEventDate(ev.deadline);

  var dateDisplay = startFormatted;
  if (endFormatted && endFormatted !== startFormatted) {
    dateDisplay += " ~ " + endFormatted;
  }

  var costLabel = (prefLang === "en") ? "Cost: " : (prefLang === "zh" ? "費用: " : "費用 Cost: ");
  var dateLabel = (prefLang === "en") ? "Event Date: " : (prefLang === "zh" ? "活動時間: " : "活動時間 Event Date: ");
  var deadlineLabel = (prefLang === "en") ? "Sign Up Deadline: " : (prefLang === "zh" ? "報名截止: " : "報名截止 Deadline: ");

  var titleTag = (prefLang === "en") ? "【Title】" : (prefLang === "zh" ? "【名稱】" : (hasEnglish ? "【名稱 Title】" : "【名稱】"));
  var summaryTag = (prefLang === "en") ? "【Summary】" : (prefLang === "zh" ? "【簡介】" : (hasEnglish ? "【簡介 Summary】" : "【簡介】"));
  var itineraryTag = (prefLang === "en") ? "【Detailed Itinerary】" : (prefLang === "zh" ? "【詳細行程】" : (hasEnglish ? "【詳細行程 Detailed Itinerary】" : "【詳細行程】"));

  // 查詢該活動有效報名人數 (排除已取消者)
  var regCount = 0;
  var detailSignups = _supabaseGet("event_signups", {
    select: "id,status",
    event_id: "eq." + String(eventId).trim()
  });
  if (detailSignups && Array.isArray(detailSignups)) {
    for (var ds = 0; ds < detailSignups.length; ds++) {
      var dStatus = String(detailSignups[ds].status || "").trim().toLowerCase();
      if (dStatus.indexOf("取消") === -1 && dStatus.indexOf("cancel") === -1) {
        regCount++;
      }
    }
  }

  var regCountStrZh = "已報名：" + regCount + " 人";
  var regCountStrEn = "Registered: " + regCount;
  var regCountDisplay = (prefLang === "en")
    ? regCountStrEn
    : (prefLang === "zh"
        ? regCountStrZh
        : (regCountStrZh + " / " + regCountStrEn));

  var summaryZh = ev.summary || "尚無簡介";
  var summaryEn = ev.summary_en || ev.short_desc_en || ev.summary || "No summary";
  var summaryContent = (prefLang === "en")
    ? summaryEn
    : (prefLang === "zh"
        ? summaryZh
        : (hasEnglish ? _formatBilingualMessage(summaryZh, summaryEn, null) : summaryZh));

  var fullDescZh = ev.itinerary || ev.full_desc || "尚無詳細行程";
  var fullDescEn = ev.itinerary_en || ev.full_desc_en || ev.itinerary || ev.full_desc || "No detailed itinerary";
  var fullDescContent = (prefLang === "en")
    ? fullDescEn
    : (prefLang === "zh"
        ? fullDescZh
        : (hasEnglish ? _formatBilingualMessage(fullDescZh, fullDescEn, null) : fullDescZh));

  var buttonBox;
  if (isOpen) {
    var signupBtnLabel = (prefLang === "en") ? "Sign Up" : (prefLang === "zh" ? "一鍵報名" : "一鍵報名 Sign Up");
    var signupDisplayText = (prefLang === "en")
      ? ("Sign up for: " + eventNameEn)
      : (prefLang === "zh"
          ? ("我要報名：" + eventNameZh)
          : ("我要報名 Sign up for: " + (hasEnglish ? eventNameEn : eventNameZh)));

    buttonBox = {
      "type": "button",
      "style": "primary",
      "color": "#1DB446",
      "action": {
        "type": "postback",
        "label": signupBtnLabel,
        "data": "action=signup&eventId=" + eventId,
        "displayText": signupDisplayText
      }
    };
  } else {
    var closedLabelZh = isFuture ? "即將開放" : (isExpired ? "報名已截止" : "尚未開放");
    var closedLabelEn = isFuture ? "Coming Soon" : (isExpired ? "Closed" : "Not Open");
    var closedLabel = (prefLang === "en") ? closedLabelEn : (prefLang === "zh" ? closedLabelZh : (isFuture ? "即將開放 Coming Soon" : (isExpired ? "報名已截止 Closed" : "尚未開放 Not Open")));
    buttonBox = {
      "type": "button",
      "style": "secondary",
      "color": "#CCCCCC",
      "action": {
        "type": "message",
        "label": closedLabel,
        "text": ((prefLang === "en") ? eventNameEn : eventNameZh) + " " + closedLabel
      }
    };
  }

  var bubble = {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "box",
          "layout": "horizontal",
          "justifyContent": "space-between",
          "alignItems": "center",
          "contents": [
            {
              "type": "text",
              "text": titleTag,
              "weight": "bold",
              "size": "sm",
              "color": "#1DB446",
              "flex": 0
            },
            {
              "type": "box",
              "layout": "horizontal",
              "backgroundColor": "#f0f9ff",
              "cornerRadius": "md",
              "paddingStart": "sm",
              "paddingEnd": "sm",
              "paddingTop": "xs",
              "paddingBottom": "xs",
              "flex": 0,
              "contents": [
                {
                  "type": "text",
                  "text": regCountDisplay,
                  "size": "xs",
                  "color": "#0284c7",
                  "weight": "bold",
                  "flex": 0
                }
              ]
            }
          ]
        },
        {
          "type": "text",
          "text": eventName,
          "weight": "bold",
          "size": "lg",
          "wrap": true,
          "margin": "xs"
        },
        {
          "type": "text",
          "text": summaryTag,
          "weight": "bold",
          "size": "sm",
          "color": "#1DB446",
          "margin": "lg"
        },
        {
          "type": "text",
          "text": summaryContent,
          "size": "sm",
          "color": "#555555",
          "wrap": true,
          "margin": "xs"
        },
        {
          "type": "text",
          "text": itineraryTag,
          "weight": "bold",
          "size": "sm",
          "color": "#1DB446",
          "margin": "lg"
        },
        {
          "type": "text",
          "text": fullDescContent,
          "size": "sm",
          "color": "#555555",
          "wrap": true,
          "margin": "xs"
        },
        {
          "type": "box",
          "layout": "vertical",
          "margin": "xl",
          "spacing": "xs",
          "contents": [
            {
              "type": "text",
              "text": costLabel + costStr,
              "size": "sm",
              "color": "#666666",
              "weight": "bold"
            },
            {
              "type": "text",
              "text": dateLabel + dateDisplay,
              "size": "sm",
              "color": "#1DB446",
              "weight": "bold"
            },
            {
              "type": "text",
              "text": deadlineLabel + deadlineFormatted,
              "size": "sm",
              "color": "#E53935",
              "weight": "bold"
            }
          ]
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "contents": [buttonBox]
    }
  };

  var imageUrl = String(ev.cover_image_url || ev.image_url || "").trim();
  if (imageUrl && imageUrl.startsWith("http") && !imageUrl.includes("drive.google.com")) {
    bubble.hero = {
      "type": "image",
      "url": imageUrl,
      "size": "full",
      "aspectRatio": "20:13",
      "aspectMode": "cover"
    };
  }

  var flexReplyTitle = (prefLang === "en") ? ("Event: " + eventNameEn) : ("活動詳情: " + eventNameZh);
  _replyFlexMessage(replyToken, flexReplyTitle, bubble);
}

/**
 * 產生幹部團隊名冊卡片 (支援職稱、頭像與負責業務)
 */
function sendOfficerMenu(replyToken, ss) {
  // 1. 優先直通 Supabase members 表 (is_officer: "eq.true") (SSOT)
  try {
    var sbOfficers = _supabaseGet("members", { is_officer: "eq.true", select: "name,role,quote,duty,photo_url" });
    if (sbOfficers && Array.isArray(sbOfficers) && sbOfficers.length > 0) {
      var bubbles = [];
      for (var k = 0; k < sbOfficers.length; k++) {
        var off = sbOfficers[k];
        var name = String(off.name || "").trim();
        if (!name) continue;
        var role = String(off.role || "幹部 Officer").trim();
        var duty = String(off.duty || "協助社團事務 Assist with club affairs").trim();
        var quote = String(off.quote || "歡迎加入登山社！ Welcome to the club!").trim();
        var photoUrl = String(off.photo_url || "").trim();
        var themeColor = (role.indexOf("社長") > -1) ? "#FF9800" : "#0367D3";

        var bubble = {
          "type": "bubble",
          "size": "micro",
          "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [{
              "type": "text",
              "text": role,
              "weight": "bold",
              "color": themeColor,
              "size": "sm"
            }, {
              "type": "text",
              "text": name,
              "weight": "bold",
              "size": "xl",
              "margin": "sm"
            }, {
              "type": "separator",
              "margin": "md"
            }, {
              "type": "text",
              "text": "📌 負責業務 Duties",
              "size": "xxs",
              "color": "#999999",
              "margin": "md"
            }, {
              "type": "text",
              "text": duty,
              "size": "xs",
              "color": "#333333",
              "wrap": true,
              "margin": "xs"
            }, {
              "type": "separator",
              "margin": "md"
            }, {
              "type": "text",
              "text": "💬 " + quote,
              "size": "xs",
              "color": "#666666",
              "wrap": true,
              "margin": "md",
              "style": "italic"
            }]
          }
        };

        if (photoUrl && (photoUrl.startsWith("http://") || photoUrl.startsWith("https://")) && !photoUrl.includes("drive.google.com")) {
          bubble.hero = {
            "type": "image",
            "url": photoUrl,
            "size": "full",
            "aspectRatio": "1:1",
            "aspectMode": "cover"
          };
        }

        bubbles.push(bubble);
        if (bubbles.length === 10) break;
      }

      if (bubbles.length > 0) {
        _replyFlexMessage(replyToken, "來認識一下登山社幹部吧！ / Meet the club officers!", {
          "type": "carousel",
          "contents": bubbles
        });
        return;
      }
    }
    _replyMessage(replyToken, "目前還沒有建立幹部資料喔！敬請期待。\n─────────────\nOfficer data not set up yet. Stay tuned!");
  } catch (sbErr) {
    console.error("[sendOfficerMenu] 直查 Supabase 幹部名冊失敗:", sbErr);
    _replyMessage(replyToken, "查詢幹部名冊失敗：" + (sbErr.message || sbErr) + "\n─────────────\nFailed to fetch officers: " + (sbErr.message || sbErr));
  }
}

/**
 * 產生「更多服務 More Services」卡片 (100% 還原圖二「🛠️ 聯絡與支援 / 幫助中心」)
 */
function _buildMoreServicesFlex() {
  return {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
        "type": "text",
        "text": "🛠️ 聯絡與支援 Support",
        "weight": "bold",
        "color": "#0367D3",
        "size": "sm"
      }, {
        "type": "text",
        "text": "幫助中心 Help Center",
        "weight": "bold",
        "size": "xl",
        "margin": "md"
      }, {
        "type": "text",
        "text": "聯絡社團幹部 Contact Officers",
        "size": "xs",
        "color": "#999999",
        "margin": "sm"
      }]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "spacing": "sm",
      "contents": [{
        "type": "button",
        "style": "secondary",
        "action": {
          "type": "message",
          "label": "📖 社員使用指南 Member Guide",
          "text": "使用指南"
        }
      }, {
        "type": "button",
        "style": "secondary",
        "action": {
          "type": "message",
          "label": "🤖 小岳說明 AI Guide",
          "text": "小岳說明 AI Guide"
        }
      }, {
        "type": "button",
        "style": "secondary",
        "action": {
          "type": "message",
          "label": "👤 幹部是誰 Officers",
          "text": "幹部是誰 Officers"
        }
      }, {
        "type": "button",
        "style": "secondary",
        "action": {
          "type": "message",
          "label": "📢 意見與回饋 Feedback",
          "text": "意見與回饋 Feedback"
        }
      }]
    }
  };
}

/**
 * 發送「更多服務」選單
 */
function sendMoreOptionsMenu(replyToken) {
  var bubble = _buildMoreServicesFlex();
  _replyFlexMessage(replyToken, "更多服務 More Services", bubble);
}

/**
 * 發送「意見與回饋」連結表單
 */
function sendFeedbackLink(replyToken) {
  var googleFormUrl = "https://forms.gle/bCT7fjVP3bSrReF96";
  var msg = "【意見與回饋 / Feedback & Suggestions】\n\n" +
    "無論是想對社團說的話、活動建議、問題詢問，還是回報系統錯誤 (可附截圖)，都歡迎透過下方表單告訴我們！\n\n" +
    "Whether you have suggestions, questions, or want to report a bug (screenshots supported), please let us know!\n\n" +
    "點此填寫回饋表單 Click here to fill out the feedback form：\n" + googleFormUrl + "\n\n" +
    "收到您的回饋後，幹部會盡快查看並處理喔！After receiving your feedback, the club officers will review and handle it as soon as possible!🏔️";

  _replyMessage(replyToken, msg);
}

/**
 * 檢查隊員個人資料是否完整 (支援 signup 與 loan 兩種驗證等級)
 */
function _checkProfileComplete(userId, ss, type) {
  var missingFields = [];
  var p = {
    name: "", gender: "", realLineId: "", email: "", phone: "",
    department: "", studentId: "", birthday: "", idNumber: "", studentAddr: "",
    emerName: "", emerRel: "", emerAddr: "", emerPhone: "",
    exp: "", strength: "", strengthProof: "", medicalHistory: "", isOfficial: "否"
  };

  // 1. 直查 Supabase members 表（SSOT）
  var sbMembers = _supabaseGet("members", { line_user_id: "eq." + userId });
  if (sbMembers !== null && Array.isArray(sbMembers)) {
    if (sbMembers.length === 0) {
      return { missingFields: ["NOT_FOUND"], p: null };
    }
    var m = sbMembers[0];
    p.name = m.name || "";
    p.gender = m.gender || "";
    p.realLineId = m.line_id || "";
    p.email = m.email || "";
    p.phone = m.phone || "";
    p.department = m.department || "";
    p.studentId = m.student_id || "";
    p.birthday = m.birthday || "";
    p.idNumber = m.id_card || "";
    p.studentAddr = m.address || "";
    p.emerName = m.emergency_contact_name || "";
    p.emerRel = m.emergency_contact_rel || "";
    p.emerPhone = m.emergency_contact_phone || "";
    p.emerAddr = m.emergency_contact_address || "";
    p.exp = m.outdoor_experience || "";
    p.strength = m.fitness_desc || "";
    p.strengthProof = Array.isArray(m.proof_urls) ? m.proof_urls.join("\n") : (m.proof_urls || "");
    p.medicalHistory = m.medical_history || "";
    p.isOfficial = m.is_official_member ? "是" : "否";
    p.updatedAt = m.updated_at || "";
    p.createdAt = m.created_at || "";
  } else {
    return { missingFields: ["NOT_FOUND"], p: null };
  }

  // 3. 必填欄位清單 (依據 signup / loan 檢查)
  if (!p.name) missingFields.push("姓名");
  if (!p.gender) missingFields.push("性別");
  if (!p.idNumber) missingFields.push("身分證字號/居留證號");
  if (!p.birthday) missingFields.push("生日");
  if (!p.phone) missingFields.push("聯絡電話");
  if (!p.department) missingFields.push("系所");
  if (!p.studentId) missingFields.push("學號");
  if (!p.studentAddr) missingFields.push("現居地址");
  if (!p.email) missingFields.push("電子郵件");
  if (!p.realLineId) missingFields.push("真實 LINE ID");
  if (!p.emerName) missingFields.push("緊急聯絡人姓名");
  if (!p.emerRel) missingFields.push("與緊急聯絡人關係");
  if (!p.emerPhone) missingFields.push("緊急聯絡人電話");
  if (!p.emerAddr) missingFields.push("緊急聯絡人現居地址");

  if (type === "signup") {
    if (!p.exp) missingFields.push("爬山經歷");
    if (!p.strength) missingFields.push("體能自評");
    if (!p.strengthProof) missingFields.push("體能證明");
  }

  return { missingFields: missingFields, p: p };
}

/**
 * 處理活動一鍵報名 (漸進式個資檢查 + 報名寫入與多軌同步)
 */
function handleSignup(replyToken, userId, eventId, ss) {
  if (!ss) ss = _getSpreadsheet();

  var prefLang = _getUserPreferredLanguage(userId);
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    // 1. 檢查活動是否存在與是否已截止/已關閉 (優先查 Supabase events 表)
    var evName = _getEventName(ss, eventId);
    var evNameEn = "";
    var sbEvents = _supabaseGet("events", { id: "eq." + eventId, select: "id,title,title_en,status,deadline" });
    if (sbEvents && sbEvents.length > 0) {
      var ev = sbEvents[0];
      if (ev.title) evName = ev.title;
      if (ev.title_en) evNameEn = ev.title_en;
      var isEvExpired = _isEventExpired(ev.deadline);
      if (isEvExpired || ev.status === "關閉" || ev.status === "已截止") {
        var closedReply = "⚠️ 報名失敗：【" + evName + "】已於 " + (ev.deadline || "日前") + " 截止報名！\n感謝您的熱情關注，請期待下一次的精彩活動！🏕️\n─────────────\n⚠️ Registration Closed: [" + (evNameEn || evName) + "] registration is closed.";
        _replyMessage(replyToken, _splitBilingualMessage(closedReply, prefLang));
        return;
      }
    } else {
      var notFoundReply = "⚠️ 報名失敗：查無活動代號【" + eventId + "】，請確認活動代號是否正確！\n─────────────\n⚠️ Event not found for code: " + eventId;
      _replyMessage(replyToken, _splitBilingualMessage(notFoundReply, prefLang));
      return;
    }

    // 2. 執行個人資料完整性檢查 (100% 直查 Supabase)
    var profileCheck = _checkProfileComplete(userId, ss, "signup");

    if (profileCheck.missingFields.indexOf("NOT_FOUND") > -1) {
      var noProfileReply = "⚠️ 報名失敗：系統找不到您的社員資料！\n請先點選單中的「填寫資料」完成註冊後再報名。\n─────────────\n⚠️ Registration Failed: Member profile not found!\nPlease click 'Register' in the menu to complete your profile first.";
      _replyMessage(replyToken, _splitBilingualMessage(noProfileReply, prefLang));
      return;
    }

    if (profileCheck.missingFields.length > 0) {
      var fieldEnMap = {
        "姓名": "Full Name",
        "性別": "Gender",
        "身分證字號/居留證號": "ID / ARC / Passport Number",
        "生日": "Date of Birth (Birthday)",
        "聯絡電話": "Phone Number",
        "系所": "Department",
        "學號": "Student ID",
        "身分別": "Identity Status",
        "現居地址": "Current Residential Address",
        "電子郵件": "Email Address",
        "真實 LINE ID": "LINE ID",
        "緊急聯絡人姓名": "Emergency Contact Name",
        "與緊急聯絡人關係": "Relationship with Emergency Contact",
        "緊急聯絡人電話": "Emergency Contact Phone",
        "緊急聯絡人現居地址": "Emergency Contact Address",
        "爬山經歷": "Hiking Experience",
        "體能自評": "Fitness Self-Assessment",
        "體能證明": "Fitness Proof"
      };
      var missingFormattedZh = profileCheck.missingFields.map(function (f) {
        return "👉 " + f + (fieldEnMap[f] ? " (" + fieldEnMap[f] + ")" : "");
      }).join("\n");

      var missingFormattedEn = profileCheck.missingFields.map(function (f) {
        return "👉 " + (fieldEnMap[f] || f);
      }).join("\n");

      var missingProfileMsg = "⚠️ 報名失敗：您的個人資料尚不完整！\n\n" +
        "為了辦理平安保險與確保戶外活動安全，請先點擊選單的「填寫資料」，補齊以下必填資訊：\n\n" +
        missingFormattedZh + "\n\n" +
        "完成資料更新後，再回來點擊一鍵報名喔！🏕️\n" +
        "─────────────\n" +
        "⚠️ Registration Failed: Incomplete member profile!\n\n" +
        "For insurance coverage and outdoor activity safety, please click 'Register' in the menu to complete the following required fields:\n\n" +
        missingFormattedEn + "\n\n" +
        "Once your profile is updated, return here to sign up with one click! 🏕️";

      _replyMessage(replyToken, _splitBilingualMessage(missingProfileMsg, prefLang));
      return;
    }

    var p = profileCheck.p;

    // 2.5 檢查個人資料與體能經歷更新時效性 (超過 6 個月/180 天或尚未校驗需提醒更新)
    var lastUpdateStr = p.updatedAt || p.createdAt || "";
    var isProfileExpired = false;
    var isUnverifiedTime = false;
    if (lastUpdateStr) {
      var lastUpdateDate = new Date(lastUpdateStr);
      if (!isNaN(lastUpdateDate.getTime())) {
        var diffDays = (new Date().getTime() - lastUpdateDate.getTime()) / (24 * 60 * 60 * 1000);
        if (diffDays > 180) {
          isProfileExpired = true;
        }
      } else {
        isProfileExpired = true;
        isUnverifiedTime = true;
      }
    } else {
      isProfileExpired = true;
      isUnverifiedTime = true;
    }

    if (isProfileExpired) {
      var reasonZh = isUnverifiedTime
        ? "您的個人資料與體能紀錄尚未完成時效校驗（或查無最近更新紀錄）"
        : "您的個人資料與體能紀錄已超過 6 個月未更新";

      var reasonEn = isUnverifiedTime
        ? "Your profile and fitness records have an unverified update time or no recent records found"
        : "Your profile and fitness records have not been updated for over 6 months";

      var expireNoticeZh = "⚠️ 報名提醒：" + reasonZh + "！\n\n" +
        "社團出團活動將依據您的「爬山經歷」與「體能狀況」進行審查與篩選。為了維護出隊安全並增加您的錄取機會，若近期有更豐富的登山紀錄或更佳的體能表現，請先前往更新個人資料後，再回到此處報名活動喔！\n\n" +
        "👉 立即前往更新個人資料：\n" +
        "https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fdashboard\n" +
        "(或於選單點擊「填寫資料 / 個人主頁」)";

      var expireNoticeEn = "⚠️ Registration Notice: " + reasonEn + "!\n\n" +
        "Club outings evaluate applications based on your hiking experience and fitness status. To ensure safety and boost your admission chances, please update your profile with your latest records before signing up!\n\n" +
        "👉 Update Your Profile Now:\n" +
        "https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fdashboard";

      _replyMessage(replyToken, _formatBilingualMessage(expireNoticeZh, expireNoticeEn, prefLang));
      return;
    }

    // 3. 檢查重複報名 (⭐️ 100% 查 Supabase event_signups 表，絕不查主試算表！)
    var sbSignups = _supabaseGet("event_signups", { line_user_id: "eq." + userId, event_id: "eq." + eventId, select: "id,status" });
    if (sbSignups && sbSignups.length > 0) {
      // 只要有一筆狀態非「取消」的報名，才視為重複報名
      var hasActiveSignup = sbSignups.some(function (sig) {
        var st = String(sig.status || "");
        return st.indexOf("取消") === -1 && st.toLowerCase().indexOf("cancelled") === -1;
      });
      if (hasActiveSignup) {
        var dupMsg = "⚠️ 您已經報名過【" + evName + "】囉！\n請耐心等候幹部審核，或是至個人主頁查詢進度。\n─────────────\n⚠️ You have already registered for [" + (evNameEn || evName) + "]!\nPlease wait for officer review.";
        _replyMessage(replyToken, _splitBilingualMessage(dupMsg, prefLang));
        return;
      }
    }

    // 4. 生成報名碼並即時寫入 Supabase (SSOT 優先)
    var signupCode = "S" + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "MMddHHmmss");
    try {
      _syncSignupToSupabase(userId, eventId, signupCode, p, "審核中 Checking", evName);
    } catch (sbErr) {
      console.warn("同步報名至 Supabase 例外 (略過不影響主流程):", sbErr);
    }

    // 4.1 即時追加至活動專屬獨立試算表 (若有設定獨立試算表)
    try {
      if (typeof _asyncAppendToEventSpreadsheet === "function") {
        var sDataForEventSS = Object.assign({}, p, {
          userId: userId,
          signupCode: signupCode,
          eventName: evName,
          reviewStatus: "審核中 Checking",
          payStatus: "未繳費 Unpaid"
        });
        _asyncAppendToEventSpreadsheet(eventId, sDataForEventSS, evName);
      }
    } catch (evSSErr) {
      console.warn("同步至活動專屬試算表例外:", evSSErr);
    }

    // 6. 回傳確認收據 (依偏好語言精準拆分)
    var successReceiptZh = "✅ 報名登記已送出！\n\n" +
      "活動：" + evName + "\n" +
      "活動代號：" + eventId + "\n" +
      "報名專屬碼：" + signupCode + "\n\n" +
      p.name + "，我們收到您的報名資料囉～\n\n" +
      "【重要提醒】\n" +
      "此階段為「報名登記與資格審核」，幹部將進行體能評估與篩選，最終錄取名單（正取/備取）將透過本帳號推播通知您！\n\n" +
      "【體能與經歷更新說明】\n" +
      "社團出團會依據爬山經驗與體能進行評估，若有最新的登山紀錄或更佳體能證明，記得隨時至個人主頁更新資料，增加自己的錄取機會喔！";

    var successReceiptEn = "✅ Registration Submitted!\n\n" +
      "Event: " + (evNameEn || evName) + "\n" +
      "Event ID: " + eventId + "\n" +
      "Signup Code: " + signupCode + "\n\n" +
      "Dear " + p.name + ", we have received your application.\n\n" +
      "【Important Reminder】\n" +
      "This stage is registration & review. Officers will evaluate qualifications, and admission status (Confirmed/Waitlisted) will be notified to you via this LINE account!\n\n" +
      "【Fitness & Experience Reminder】\n" +
      "Admission is evaluated based on hiking experience and fitness. If you have newer hiking records or fitness proofs, remember to update them anytime on your Dashboard to boost your admission chances!";

    _replyMessage(replyToken, _formatBilingualMessage(successReceiptZh, successReceiptEn, prefLang));

  } catch (err) {
    console.error("活動報名失敗:", err);
    var busyMsg = "⚠️ 系統目前忙碌中，請稍後再試！\n─────────────\n⚠️ System is currently busy, please try again later!";
    _replyMessage(replyToken, _splitBilingualMessage(busyMsg, prefLang));
  } finally {
    _safeReleaseLock(lock);
  }
}

/**
 * 處理備取意願確認 (Postback) - 100% 直連 Supabase (SSOT)，杜絕試算表錯誤
 */
function handleConfirmWaitlist(replyToken, userId, paramsMap, ss) {
  var prefLang = _getUserPreferredLanguage(userId);
  var eventId = paramsMap["eventId"] || "";
  var targetUid = paramsMap["userId"] || userId;
  var targetCode = paramsMap["signupCode"] || paramsMap["targetId"] || "";

  if (!targetUid) {
    var missingUidMsg = "系統錯誤：缺少使用者識別碼。\n─────────────\nSystem Error: Missing user identifier.";
    _replyMessage(replyToken, _splitBilingualMessage(missingUidMsg, prefLang));
    return;
  }

  try {
    // 1. 直查 Supabase event_signups
    var queryParams = {
      line_user_id: "eq." + targetUid,
      select: "id,event_id,status"
    };
    if (targetCode) {
      queryParams = { id: "eq." + targetCode, select: "id,event_id,status" };
    } else if (eventId) {
      queryParams.event_id = "eq." + eventId;
    }

    var signups = _supabaseGet("event_signups", queryParams);
    if (!signups || signups.length === 0) {
      var notFoundRecordMsg = "找不到該筆報名資料，請洽詢社團幹部！\n─────────────\nRegistration record not found, please contact club officers!";
      _replyMessage(replyToken, _splitBilingualMessage(notFoundRecordMsg, prefLang));
      return;
    }

    var signup = signups[0];
    var currentStatus = String(signup.status || "");

    if (currentStatus.indexOf("備取（有意願）") > -1 || currentStatus.indexOf("有意願") > -1) {
      var alreadyConfirmedMsg = "您先前已確認過備取意願！若有名額釋出，幹部將主動與您聯絡！\n─────────────\nYou have already confirmed your waitlist preference! Officers will contact you if a spot opens up!";
      _replyMessage(replyToken, _splitBilingualMessage(alreadyConfirmedMsg, prefLang));
      return;
    }

    // 2. 直寫 Supabase event_signups 狀態為 備取（有意願）Waitlisted (Interested)
    var patchSuccess = _supabasePatch("event_signups", { id: "eq." + signup.id }, {
      status: "備取（有意願）Waitlisted (Interested)",
      updated_at: new Date().toISOString()
    });

    if (patchSuccess) {
      var confirmedSuccessMsg = "已成功確認您的備取意願！審核狀態已更新為：【備取（有意願）】。若有正取名額釋出，幹部將主動與您聯絡！\n─────────────\nSuccessfully confirmed waitlist preference! Status updated to: [Waitlisted (Interested)]. We will contact you if a spot opens up!";
      _replyMessage(replyToken, _splitBilingualMessage(confirmedSuccessMsg, prefLang));
    } else {
      var updateFailMsg = "⚠️ 更新備取意願失敗，請稍後再試或洽詢幹部！\n─────────────\n⚠️ Failed to update waitlist preference, please try again later or contact officers!";
      _replyMessage(replyToken, _splitBilingualMessage(updateFailMsg, prefLang));
    }
  } catch (err) {
    console.error("[handleConfirmWaitlist] 例外:", err);
    var exMsg = "系統發生錯誤：" + (err.message || err) + "\n─────────────\nSystem error: " + (err.message || err);
    _replyMessage(replyToken, _splitBilingualMessage(exMsg, prefLang));
  }
}

/**
 * 建立幹部群組新繳費申報 Flex Message 卡片
 */
function _buildPaymentDeclarationFlex(params) {
  var userName = params.userName || "社員";
  var paymentId = params.paymentId || "";
  var totalAmount = params.totalAmount || 0;
  var last5Digits = params.last5Digits || "無";
  var items = params.selectedNames || (params.itemsZh ? params.itemsZh.split('\n').map(function(s){ return s.replace(/^-\s*/, '').replace(/^\s*-\s*/, '').trim(); }).filter(Boolean) : ["社團相關費用"]);
  var note = params.note || "";
  var verifyLink = params.verifyLink || "";
  var proofImageUrl = params.proofImageUrl || "";

  var bodyContents = [
    {
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "申報人", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: userName, weight: "bold", color: "#0f172a", size: "sm", flex: 5, wrap: true }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "單號", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: paymentId, color: "#2563eb", size: "xs", flex: 5, wrap: true, weight: "bold" }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "末五碼", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: last5Digits, weight: "bold", color: "#0f172a", size: "sm", flex: 5 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "申報金額", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: "$" + totalAmount + " 元", weight: "bold", color: "#059669", size: "lg", flex: 5 }
          ]
        }
      ]
    },
    { type: "separator", margin: "lg", color: "#e2e8f0" },
    {
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "xs",
      contents: [
        { type: "text", text: "申報項目：", color: "#64748b", size: "xs", weight: "bold" }
      ].concat(items.map(function(item) {
        return {
          type: "text",
          text: "• " + item,
          color: "#334155",
          size: "xs",
          wrap: true
        };
      }))
    }
  ];

  if (note) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      contents: [
        { type: "text", text: "備註：", color: "#64748b", size: "xs", weight: "bold" },
        { type: "text", text: note, color: "#475569", size: "xs", wrap: true }
      ]
    });
  }

  var footerButtons = [];
  if (verifyLink) {
    footerButtons.push({
      type: "button",
      style: "primary",
      color: "#059669",
      height: "sm",
      action: {
        type: "uri",
        label: "確認無誤（一鍵核銷）",
        uri: verifyLink
      }
    });
  }

  if (proofImageUrl) {
    footerButtons.push({
      type: "button",
      style: "secondary",
      color: "#475569",
      height: "sm",
      margin: "sm",
      action: {
        type: "uri",
        label: "檢視匯款截圖",
        uri: proofImageUrl
      }
    });
  }

  var flexContents = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#065f46",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: "台科登山社 • 新繳費申報",
          color: "#ffffff",
          weight: "bold",
          size: "md"
        },
        {
          type: "text",
          text: "請核對帳目後點擊下方按鈕進行核銷",
          color: "#a7f3d0",
          size: "xxs",
          margin: "xs"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: bodyContents
    }
  };

  if (footerButtons.length > 0) {
    flexContents.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "14px",
      contents: footerButtons
    };
  }

  return flexContents;
}

/**
 * 建立個人繳費成功確認 Flex Message 卡片 (支援繁中/英文)
 */
function _buildPaymentConfirmedFlex(params) {
  var isEn = (params.lang === "en" || params.userLanguage === "en" || params.preferredLanguage === "en");
  var userName = params.userName || (isEn ? "Member" : "社員");
  var paymentId = params.paymentId || "";
  var amount = params.amount || 0;
  var items = params.items || (isEn ? "Club Event / Gear Fee" : "社團活動/裝備費用");

  var titleText = isEn ? "🎉 Payment Confirmed" : "🎉 繳費成功確認通知";
  var subtitleText = isEn ? "Officers have verified your payment!" : "幹部已確認收到款項，核銷作業已完成！";
  var labelName = isEn ? "Name" : "姓名";
  var labelId = isEn ? "Payment ID" : "單號";
  var labelAmount = isEn ? "Amount" : "核銷金額";
  var labelItems = isEn ? "Items" : "核銷項目";
  var labelStatus = isEn ? "Status" : "狀態";
  var statusText = isEn ? "Confirmed" : "已核銷 Confirmed";
  var amountText = isEn ? ("$" + amount + " TWD") : ("$" + amount + " 元");
  var footerText = isEn
    ? "Your event registration and gear rental status have been updated. Check your Dashboard anytime!"
    : "相關活動報名與裝備狀態已同步更新，您可隨時至個人主頁查看！";

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
          text: titleText,
          color: "#ffffff",
          weight: "bold",
          size: "md"
        },
        {
          type: "text",
          text: subtitleText,
          color: "#d1fae5",
          size: "xxs",
          margin: "xs"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: labelName, color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: userName, weight: "bold", color: "#0f172a", size: "sm", flex: 5 }
              ]
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: labelId, color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: paymentId, color: "#2563eb", size: "xs", flex: 5, wrap: true, weight: "bold" }
              ]
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: labelAmount, color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: amountText, weight: "bold", color: "#059669", size: "md", flex: 5 }
              ]
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: labelItems, color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: items, color: "#334155", size: "sm", flex: 5, wrap: true }
              ]
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: labelStatus, color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: statusText, weight: "bold", color: "#059669", size: "sm", flex: 5 }
              ]
            }
          ]
        },
        { type: "separator", margin: "lg", color: "#e2e8f0" },
        {
          type: "text",
          text: footerText,
          color: "#64748b",
          size: "xs",
          wrap: true,
          margin: "md"
        }
      ]
    }
  };
}

/**
 * 建立幹部群組專用「繳費單已完成核銷」Flex Message 卡片 (純繁體中文)
 */
function _buildOfficerPaymentConfirmedFlex(params) {
  var userName = params.userName || "社員";
  var paymentId = params.paymentId || "";
  var amount = params.amount || 0;
  var items = params.items || "社團活動/裝備費用";
  var confirmedBy = params.confirmedBy || "單鍵快速核銷";

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#065f46",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: "💳 繳費單已完成核銷",
          color: "#ffffff",
          weight: "bold",
          size: "md"
        },
        {
          type: "text",
          text: "款項已入帳，已同步更新資料庫狀態",
          color: "#a7f3d0",
          size: "xxs",
          margin: "xs"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: "申報人", color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: userName, weight: "bold", color: "#0f172a", size: "sm", flex: 5 }
              ]
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: "繳費單號", color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: paymentId, color: "#2563eb", size: "xs", flex: 5, wrap: true, weight: "bold" }
              ]
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: "核銷金額", color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: "$" + amount + " 元", weight: "bold", color: "#059669", size: "md", flex: 5 }
              ]
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: "核銷項目", color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: items, color: "#334155", size: "sm", flex: 5, wrap: true }
              ]
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: "核銷途徑", color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: confirmedBy, color: "#475569", size: "sm", flex: 5 }
              ]
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: "系統狀態", color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: "已更新 Supabase 資料庫", weight: "bold", color: "#059669", size: "sm", flex: 5 }
              ]
            }
          ]
        }
      ]
    }
  };
}
