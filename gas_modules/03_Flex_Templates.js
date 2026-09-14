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
 * 輔助函式：日期字串格式化 (依台灣時區轉換為 YYYY/MM/DD)
 */
function _formatEventDate(dateVal) {
  if (!dateVal) return "";
  var str = String(dateVal).trim();
  if (str.includes("T")) {
    var d = new Date(str);
    if (!isNaN(d.getTime())) {
      var tzDate = new Date(d.getTime() + (8 * 60 * 60 * 1000));
      var pad = function(n) { return n < 10 ? '0' + n : n; };
      var yr = tzDate.getUTCFullYear();
      var mo = pad(tzDate.getUTCMonth() + 1);
      var dy = tzDate.getUTCDate();
      return yr + '/' + mo + '/' + dy;
    }
  }
  return str.replace(/-/g, "/").substring(0, 10);
}

/**
 * 產生最新活動卡片輪播 (100% 直連 Supabase events 表，絕不讀取主試算表)
 */
function sendEventList(replyToken) {
  var sbEvents = _supabaseGet("events", {
    select: "id,title,fee,start_date,end_date,deadline,status,summary,cover_image_url",
    order: "start_date.desc"
  });

  if (!sbEvents || !Array.isArray(sbEvents) || sbEvents.length === 0) {
    _replyMessage(replyToken, "目前這學期還沒有排定的活動喔！\n─────────────\nThere are no scheduled activities for this semester yet!");
    return;
  }

  var bubbles = [];

  for (var i = 0; i < sbEvents.length; i++) {
    var ev = sbEvents[i];
    var status = String(ev.status || "").trim();
    var deadlineStr = ev.deadline || "";
    var isExpired = _isEventExpired(deadlineStr);

    // 判斷是否為未來開放或已過期
    var isFuture = status.indexOf("未來") > -1 || status.toLowerCase().indexOf("coming") > -1 || status.toLowerCase().indexOf("future") > -1;
    if (status === "開放" && isExpired) {
      status = "關閉";
    }

    // 僅顯示「開放」或「未來開放」之活動
    if (isFuture || status === "開放" || status.indexOf("開放") > -1 || status.toLowerCase().indexOf("open") > -1) {
      var eventId = ev.id || "";
      var eventName = ev.title || "未命名活動";
      var isOpen = !isFuture && (status === "開放" || status.indexOf("開放") > -1) && !isExpired;
      var tagColor = isFuture ? "#FF9800" : (isOpen ? "#1DB446" : "#999999");
      var displayStatus = isFuture ? "未來開放 Coming Soon" : (isOpen ? "開放 Open" : "已截止 Closed");
      var costStr = (ev.fee !== undefined && ev.fee !== null && ev.fee > 0) ? "$" + ev.fee : "免費 Free";
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
            "type": "text",
            "text": displayStatus,
            "weight": "bold",
            "color": tagColor,
            "size": "sm"
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
              "text": "費用 Cost: " + costStr,
              "size": "sm",
              "color": "#666666",
              "weight": "bold"
            }, {
              "type": "text",
              "text": "活動時間 Event Date:",
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
              "text": "報名截止 Sign Up Deadline:",
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
            "text": ev.summary || "",
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
              "label": "查看詳情 View",
              "data": "action=view&eventId=" + eventId,
              "displayText": "我想查看 " + eventName + " 的資訊 / I want to view details"
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
  }

  if (bubbles.length === 0) {
    _replyMessage(replyToken, "目前這學期還沒有排定的活動喔！\n─────────────\nThere are no scheduled activities for this semester yet!");
  } else {
    _replyFlexMessage(replyToken, "請查看本學期活動列表 / Event List", {
      "type": "carousel",
      "contents": bubbles
    });
  }
}

/**
 * 產生單一活動詳細資訊卡片 (100% 直連 Supabase events 表，絕不讀取主試算表)
 */
function sendEventDetail(replyToken, eventId) {
  if (!eventId) {
    _replyMessage(replyToken, "找不到該活動的詳細資訊！\n─────────────\nEvent details not found!");
    return;
  }

  var sbList = _supabaseGet("events", { id: "eq." + String(eventId).trim() });
  if (!sbList || !Array.isArray(sbList) || sbList.length === 0) {
    _replyMessage(replyToken, "找不到該活動的詳細資訊！\n─────────────\nEvent details not found!");
    return;
  }

  var ev = sbList[0];
  var eventName = ev.title || "未命名活動 (Untitled Event)";
  var status = String(ev.status || "").trim();
  var deadlineStr = ev.deadline || "";
  var isExpired = _isEventExpired(deadlineStr);

  var isFuture = status.indexOf("未來") > -1 || status.toLowerCase().indexOf("coming") > -1 || status.toLowerCase().indexOf("future") > -1;
  if (status === "開放" && isExpired) {
    status = "關閉";
  }

  var costStr = (ev.fee !== undefined && ev.fee !== null && ev.fee > 0) ? "$" + ev.fee : "免費 Free";
  var startFormatted = _formatEventDate(ev.start_date);
  var endFormatted = _formatEventDate(ev.end_date);
  var deadlineFormatted = _formatEventDate(ev.deadline);

  var dateDisplay = startFormatted;
  if (endFormatted && endFormatted !== startFormatted) {
    dateDisplay += " ~ " + endFormatted;
  }

  var buttonBox;
  if (!isFuture && status === "開放" && !isExpired) {
    buttonBox = {
      "type": "button",
      "style": "primary",
      "color": "#1DB446",
      "action": {
        "type": "postback",
        "label": "一鍵報名 Sign Up",
        "data": "action=signup&eventId=" + eventId,
        "displayText": "我要報名 Sign up for: " + eventName
      }
    };
  } else {
    var closedLabel = isFuture ? "即將開放 Coming Soon" : (isExpired ? "報名已截止 Closed" : "尚未開放 Not Open");
    buttonBox = {
      "type": "button",
      "style": "secondary",
      "color": "#CCCCCC",
      "action": {
        "type": "message",
        "label": closedLabel,
        "text": eventName + " " + closedLabel
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
          "type": "text",
          "text": "【名稱】",
          "weight": "bold",
          "size": "sm",
          "color": "#1DB446"
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
          "text": "【簡介】",
          "weight": "bold",
          "size": "sm",
          "color": "#1DB446",
          "margin": "lg"
        },
        {
          "type": "text",
          "text": ev.summary || "尚無簡介",
          "size": "sm",
          "color": "#555555",
          "wrap": true,
          "margin": "xs"
        },
        {
          "type": "text",
          "text": "【詳細行程】",
          "weight": "bold",
          "size": "sm",
          "color": "#1DB446",
          "margin": "lg"
        },
        {
          "type": "text",
          "text": ev.itinerary || "尚無詳細行程",
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
              "text": "費用 Cost: " + costStr,
              "size": "sm",
              "color": "#666666",
              "weight": "bold"
            },
            {
              "type": "text",
              "text": "活動時間 Event Date: " + dateDisplay,
              "size": "sm",
              "color": "#1DB446",
              "weight": "bold"
            },
            {
              "type": "text",
              "text": "報名截止 Deadline: " + deadlineFormatted,
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

  _replyFlexMessage(replyToken, "活動詳情: " + eventName, bubble);
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
  } catch (sbErr) {
    console.warn("從 Supabase 取得幹部名冊失敗，降級至試算表:", sbErr);
  }

  // 2. 備援讀取試算表
  if (!ss) ss = _getSpreadsheet();
  if (!ss) return;
  try {
    var sheet = (typeof _getSheetByTableName === "function") ? _getSheetByTableName(ss, "officers") : (ss.getSheetByName("Officers") || ss.getSheetByName("officers"));
    if (!sheet) {
      _replyMessage(replyToken, "目前幹部名冊維護中。\n─────────────\nOfficer directory is currently undergoing maintenance.");
      return;
    }
    var data = sheet.getDataRange().getDisplayValues();
    if (data.length <= 1) {
      _replyMessage(replyToken, "目前還沒有建立幹部資料喔！敬請期待。\n─────────────\nOfficer data not set up yet. Stay tuned!");
      return;
    }

    var headers = data[0];
    var roleIdx = headers.findIndex(function (h) {
      return String(h).includes("職稱") || String(h).includes("職位") || String(h).includes("role") || String(h).includes("title");
    });
    var nameIdx = headers.findIndex(function (h) {
      return String(h).includes("姓名") || String(h).includes("名字") || String(h).includes("name");
    });
    var photoIdx = headers.findIndex(function (h) {
      return String(h).includes("照片") || String(h).includes("圖片") || String(h).includes("頭像");
    });
    var dutyIdx = headers.findIndex(function (h) {
      return String(h).includes("負責業務") || String(h).includes("負責") || String(h).includes("業務");
    });
    var quoteIdx = headers.findIndex(function (h) {
      return String(h).includes("給社員的話") || String(h).includes("介紹") || String(h).includes("備註");
    });

    var bubbles = [];

    if (nameIdx === -1) {
      _replyMessage(replyToken, "⚠️ 幹部名單的「姓名」欄位遺失了，請通知管理員檢查試算表！\n─────────────\n⚠️ 'Name' column is missing in the Officer sheet!");
      return;
    }

    for (var i = 1; i < data.length; i++) {
      var name = String(data[i][nameIdx]).trim();
      if (name !== "") {
        var role = (roleIdx > -1 && data[i][roleIdx]) ? String(data[i][roleIdx]).trim() : "幹部 Officer";
        var photoUrl = (photoIdx > -1 && data[i][photoIdx]) ? String(data[i][photoIdx]).trim() : "";
        var duty = (dutyIdx > -1 && data[i][dutyIdx]) ? String(data[i][dutyIdx]).trim() : "協助社團事務 Assist with club affairs";
        var quote = (quoteIdx > -1 && data[i][quoteIdx]) ? String(data[i][quoteIdx]).trim() : "歡迎加入登山社！ Welcome to the club!";
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
    }

    if (bubbles.length === 0) {
      _replyMessage(replyToken, "目前還沒有建立幹部資料喔！敬請期待。\n─────────────\nOfficer data not set up yet. Stay tuned!");
    } else {
      _replyFlexMessage(replyToken, "來認識一下登山社幹部吧！ / Meet the club officers!", {
        "type": "carousel",
        "contents": bubbles
      });
    }

  } catch (err) {
    console.error("幹部名單載入失敗:", err);
    _replyMessage(replyToken, "⚠️ 讀取幹部名單時發生錯誤，請稍後再試。\n─────────────\n⚠️ Error loading officer list, please try again later.");
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

  // 1. 優先直查 Supabase members 表（SSOT）
  var sbMembers = _supabaseGet("members", { line_user_id: "eq." + userId });
  if (sbMembers !== null) {
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
  } else {
    // 2. 若 Supabase 連線異常，備援讀取試算表 Members 表
    if (!ss) ss = _getSpreadsheet();
    var memberSheet = ss ? ((typeof _getSheetByTableName === "function") ? _getSheetByTableName(ss, "members") : (ss.getSheetByName("members") || ss.getSheetByName("Members"))) : null;
    if (!memberSheet) {
      return { missingFields: ["NOT_FOUND"], p: null };
    }
    var mData = memberSheet.getDataRange().getValues();
    var mH = mData.length > 0 ? mData[0] : [];
    var mSysIdx = _fi(mH, "系統識別碼");
    var isMember = false;

    for (var i = mData.length - 1; i >= 1; i--) {
      if (mSysIdx > -1 && String(mData[i][mSysIdx]).trim() === String(userId).trim()) {
        isMember = true;
        p.name = mData[i][_fi(mH, "姓名")] || "";
        p.gender = mData[i][_fi(mH, "性別")] || "";
        p.realLineId = mData[i][mH.findIndex(function (h) {
          return String(h).toUpperCase().includes("LINE");
        })] || "";
        p.email = mData[i][mH.findIndex(function (h) {
          return String(h).toUpperCase().includes("EMAIL") || String(h).includes("信箱");
        })] || "";
        p.phone = mData[i][mH.findIndex(function (h) {
          return String(h).includes("電話") && !String(h).includes("緊急");
        })] || "";
        p.department = mData[i][_fi(mH, "系所")] || "";
        p.studentId = mData[i][_fi(mH, "學號")] || "";
        p.birthday = mData[i][_fi(mH, "生日")] || "";
        p.idNumber = mData[i][_fi(mH, "證件")] || "";
        p.studentAddr = mData[i][mH.findIndex(function (h) {
          return String(h).includes("地址") && !String(h).includes("緊急");
        })] || "";
        p.emerName = mData[i][mH.findIndex(function (h) {
          return String(h).includes("緊急聯絡人") && !String(h).includes("關係") && !String(h).includes("地址") && !String(h).includes("電話");
        })] || "";
        p.emerRel = mData[i][_findEmerRelColIdx(mH)] || "";
        p.emerPhone = mData[i][mH.findIndex(function (h) {
          return String(h).includes("電話") && String(h).includes("緊急");
        })] || "";
        p.emerAddr = mData[i][mH.findIndex(function (h) {
          return String(h).includes("地址") && String(h).includes("緊急");
        })] || "";
        p.exp = mData[i][_fi(mH, "經驗")] || "";
        p.strength = mData[i][_fi(mH, "體能")] || "";
        p.strengthProof = mData[i][_fi(mH, "證明")] || "";
        p.medicalHistory = mData[i][_fi(mH, "病史")] || "";
        var memberStatusCol = _fi(mH, "社員狀態");
        if (memberStatusCol > -1) {
          p.isOfficial = String(mData[i][memberStatusCol]).indexOf("已繳費") > -1 ? "是" : "否";
        }
        break;
      }
    }

    if (!isMember) {
      return { missingFields: ["NOT_FOUND"], p: null };
    }
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

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    // 1. 檢查活動是否存在與是否已截止/已關閉 (優先查 Supabase events 表)
    var evName = _getEventName(ss, eventId);
    var sbEvents = _supabaseGet("events", { id: "eq." + eventId, select: "id,title,status,deadline" });
    if (sbEvents && sbEvents.length > 0) {
      var ev = sbEvents[0];
      if (ev.title) evName = ev.title;
      var isEvExpired = _isEventExpired(ev.deadline);
      if (isEvExpired || ev.status === "關閉" || ev.status === "已截止") {
        _replyMessage(replyToken, "⚠️ 報名失敗：【" + evName + "】已於 " + (ev.deadline || "日前") + " 截止報名！\n感謝您的熱情關注，請期待下一次的精彩活動！🏕️\n─────────────\n⚠️ Registration Closed: [" + evName + "] registration is closed.");
        return;
      }
    } else if (ss) {
      // 備援檢查 Sheets Events 表
      var eventSheet = (typeof _getSheetByTableName === "function") ? _getSheetByTableName(ss, "events") : (ss.getSheetByName("events") || ss.getSheetByName("Events"));
      if (eventSheet) {
        var eData = eventSheet.getDataRange().getDisplayValues();
        if (eData.length > 1) {
          var eHeaders = eData[0];
          var eIdCol = _fi(eHeaders, "活動編號");
          var eNameCol = _fi(eHeaders, "活動名稱");
          var eStatusCol = eHeaders.findIndex(function (h) {
            return String(h).includes("報名狀態") || String(h).includes("狀態");
          });
          var eDeadCol = _fi(eHeaders, "報名截止日期");

          for (var row = 1; row < eData.length; row++) {
            if (String(eData[row][eIdCol > -1 ? eIdCol : 0]).trim() === String(eventId).trim()) {
              var evStatus = eStatusCol > -1 ? String(eData[row][eStatusCol]).trim() : "";
              var evDead = eDeadCol > -1 ? String(eData[row][eDeadCol]).trim() : "";
              if (eNameCol > -1 && eData[row][eNameCol]) evName = eData[row][eNameCol];
              if (_isEventExpired(evDead) || evStatus === "關閉" || evStatus === "已截止") {
                _replyMessage(replyToken, "⚠️ 報名失敗：【" + evName + "】已於 " + (evDead || "日前") + " 截止報名！\n感謝您的熱情關注，請期待下一次的精彩活動！🏕️");
                return;
              }
              break;
            }
          }
        }
      }
    }

    // 2. 執行個人資料完整性檢查 (100% 直查 Supabase)
    var profileCheck = _checkProfileComplete(userId, ss, "signup");

    if (profileCheck.missingFields.indexOf("NOT_FOUND") > -1) {
      _replyMessage(replyToken, "⚠️ 報名失敗：系統找不到您的社員資料！\n請先點選單中的「填寫資料」完成註冊後再報名。\n─────────────\n⚠️ Registration Failed: Member profile not found!\nPlease click 'Register' in the menu to complete your profile first:\nhttps://liff.line.me/2009217429-AhPRqAHg");
      return;
    }

    if (profileCheck.missingFields.length > 0) {
      var fieldEnMap = {
        "姓名": "Name", "性別": "Gender", "身分證字號/居留證號": "ID / ARC Number",
        "生日": "Birthday", "聯絡電話": "Phone Number", "系所": "Department",
        "學號": "Student ID", "身分別": "Identity Status", "現居地址": "Current Address",
        "電子郵件": "Email", "真實 LINE ID": "LINE ID", "緊急聯絡人姓名": "Emergency Contact Name",
        "與緊急聯絡人關係": "Relationship", "緊急聯絡人電話": "Emergency Contact Phone",
        "緊急聯絡人現居地址": "Emergency Contact Address", "爬山經歷": "Hiking Experience",
        "體能自評": "Fitness Description", "體能證明": "Fitness Proof"
      };
      var missingFormatted = profileCheck.missingFields.map(function (f) {
        return "👉 " + f + (fieldEnMap[f] ? " (" + fieldEnMap[f] + ")" : "");
      }).join("\n");

      _replyMessage(replyToken, "⚠️ 報名失敗：您的個人資料尚不完整！\n\n為了辦理平安保險與確保戶外活動安全，請先點擊選單的「填寫資料」，補齊以下必填資訊：\n\n" + missingFormatted + "\n\n完成資料更新後，再回來點擊一鍵報名喔！🏕️\n─────────────\n⚠️ Registration Failed: Incomplete member profile!\nFor insurance and safety requirements, please click 'Register' in the menu to update the required information above, then try registering again:\n👉 https://liff.line.me/2009217429-AhPRqAHg");
      return;
    }

    var p = profileCheck.p;

    // 3. 檢查重複報名 (⭐️ 100% 查 Supabase event_signups 表，絕不查主試算表！)
    var sbSignups = _supabaseGet("event_signups", { line_user_id: "eq." + userId, event_id: "eq." + eventId, select: "id,status" });
    if (sbSignups && sbSignups.length > 0) {
      // 只要有一筆狀態非「取消」的報名，才視為重複報名
      var hasActiveSignup = sbSignups.some(function (sig) {
        var st = String(sig.status || "");
        return st.indexOf("取消") === -1 && st.toLowerCase().indexOf("cancelled") === -1;
      });
      if (hasActiveSignup) {
        _replyMessage(replyToken, "⚠️ 您已經報名過【" + evName + "】囉！\n請耐心等候幹部審核，或是至個人主頁查詢進度。\n─────────────\n⚠️ You have already registered for [" + evName + "]!\nPlease wait for officer review.");
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

    // 5. 備援寫入主試算表 event_signups 表（若試算表有該表則覆蓋或追加，絕不新建 Signups 表）
    if (ss) {
      var signupSheet = (typeof _getSheetByTableName === "function") ? _getSheetByTableName(ss, "event_signups") : (ss.getSheetByName("event_signups") || ss.getSheetByName("Signups"));
      if (signupSheet) {
        var sheetHeaders = signupSheet.getRange(1, 1, 1, signupSheet.getLastColumn()).getValues()[0];
        var relColIdx = _findEmerRelColIdx(sheetHeaders);

        var rowData = new Array(sheetHeaders.length).fill("");
        function placeData(keyword, value) {
          var idx = _fi(sheetHeaders, keyword);
          if (idx > -1) rowData[idx] = value;
        }

      placeData("活動編號", eventId);
      placeData("系統識別碼", userId);
      placeData("專屬碼", signupCode);
      placeData("活動名稱", evName);
      placeData("姓名", p.name);
      placeData("性別", p.gender);
      placeData("LINE", p.realLineId);
      placeData("Email", p.email);

      var phoneIdx = sheetHeaders.findIndex(function (h) {
        return String(h).includes("電話") && !String(h).includes("緊急");
      });
      if (phoneIdx > -1) rowData[phoneIdx] = p.phone ? "'" + String(p.phone) : "";

      placeData("生日", p.birthday);
      placeData("證件", p.idNumber);

      var studentAddrIdx = sheetHeaders.findIndex(function (h) {
        return String(h).includes("地址") && !String(h).includes("緊急");
      });
      if (studentAddrIdx > -1) rowData[studentAddrIdx] = p.studentAddr;

      var emerNameIdx = sheetHeaders.findIndex(function (h) {
        return String(h).includes("緊急聯絡人") && !String(h).includes("關係") && !String(h).includes("地址") && !String(h).includes("電話");
      });
      if (emerNameIdx > -1) rowData[emerNameIdx] = p.emerName;

      if (relColIdx > -1) rowData[relColIdx] = p.emerRel;

      var emerAddrIdx = sheetHeaders.findIndex(function (h) {
        return String(h).includes("地址") && String(h).includes("緊急");
      });
      if (emerAddrIdx > -1) rowData[emerAddrIdx] = p.emerAddr;

      var emerPhoneIdx = sheetHeaders.findIndex(function (h) {
        return String(h).includes("電話") && String(h).includes("緊急");
      });
      if (emerPhoneIdx > -1) rowData[emerPhoneIdx] = p.emerPhone ? "'" + String(p.emerPhone) : "";

      placeData("經驗", p.exp);
      placeData("體能", p.strength);
      placeData("證明", p.strengthProof);
      placeData("是否為社員", p.isOfficial);
      placeData("審核結果", "審核中 Checking");
      placeData("通知狀態", "");
      placeData("繳費狀態", "未繳費 Unpaid");
      placeData("系所", p.department);
      placeData("學號", p.studentId);
      placeData("病史", p.medicalHistory);

      // 檢查試算表中是否有歷史舊列需要覆蓋
      var existingData = signupSheet.getDataRange().getValues();
      var foundRow = -1;
      if (existingData.length > 1) {
        var eSysIdx = _fi(sheetHeaders, "系統識別碼");
        var eEvtIdx = _fi(sheetHeaders, "活動編號");
        for (var s = 1; s < existingData.length; s++) {
          if (eSysIdx > -1 && String(existingData[s][eSysIdx]).trim() === String(userId).trim() &&
              eEvtIdx > -1 && String(existingData[s][eEvtIdx]).trim() === String(eventId).trim()) {
            foundRow = s + 1;
            break;
          }
        }
      }

      if (foundRow > -1) {
        signupSheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
      } else {
        signupSheet.appendRow(rowData);
      }
    }
  }

    // 6. 回傳確認收據
    _replyMessage(replyToken, "✅ 報名登記已送出！ / Registration Submitted!\n\n活動 (Event)：\n" + evName + "\n活動代號 (Event ID)：" + eventId + "\n報名專屬碼 (Signup Code)：" + signupCode + "\n\n" + p.name + "，我們已收到您的報名資料。\n\n⚠️ 【重要提醒 / Important Reminder】\n由於部分戶外行程有人數安全限制，此階段為「報名登記」。幹部將進行體能評估與審核，最終錄取名單（正取/備取）將透過本帳號推播通知您！\n─────────────\nDue to safety and team size limits, this stage is registration review. Officers will assess fitness qualifications, and confirmed/waitlisted rosters will be announced via this LINE account!");

  } catch (err) {
    console.error("活動報名失敗:", err);
    _replyMessage(replyToken, "⚠️ 系統目前忙碌中，請稍後再試！\n─────────────\n⚠️ System is currently busy, please try again later!");
  } finally {
    _safeReleaseLock(lock);
  }
}

/**
 * 處理備取意願確認 (Postback)
 */
function handleConfirmWaitlist(replyToken, userId, paramsMap, ss) {
  if (!ss) ss = _getSpreadsheet();
  if (!ss) return;
  var eventId = paramsMap["eventId"] || "";
  var targetUid = paramsMap["userId"] || userId;
  var sSheet = ss.getSheetByName("Signups");
  if (!sSheet) {
    _replyMessage(replyToken, "系統錯誤：找不到報名資料表。\n─────────────\nSystem Error: Signups sheet not found.");
    return;
  }
  var sData = sSheet.getDataRange().getValues();
  var sH = sData[0];
  var sSysIdx = _fi(sH, "系統識別碼");
  var sEventIdIdx = _fi(sH, "活動編號");
  var sStatusIdx = _fi(sH, "審核結果");

  for (var i = 1; i < sData.length; i++) {
    var rowUser = sSysIdx > -1 ? String(sData[i][sSysIdx]).trim() : "";
    var rowEvtId = sEventIdIdx > -1 ? String(sData[i][sEventIdIdx]).trim() : "";

    if (rowUser === targetUid && (!eventId || rowEvtId === eventId)) {
      var currentStatus = sStatusIdx > -1 ? String(sData[i][sStatusIdx]) : "";
      if (currentStatus.indexOf("備取（有意願）") > -1 || currentStatus.indexOf("有意願") > -1) {
        _replyMessage(replyToken, "您先前已確認過備取意願！若有名額釋出，幹部將主動與您聯絡！\n─────────────\nYou have already confirmed your waitlist preference! Officers will contact you if a spot opens up!");
        return;
      }
      if (sStatusIdx > -1) {
        sSheet.getRange(i + 1, sStatusIdx + 1).setValue("備取（有意願）Waitlisted (Interested)");
        SpreadsheetApp.flush();
        _replyMessage(replyToken, "已成功確認您的備取意願！審核狀態已更新為：【備取（有意願）】。若有正取名額釋出，幹部將主動與您聯絡！\n─────────────\nSuccessfully confirmed waitlist preference! Status updated to: [Waitlisted (Interested)]. We will contact you if a spot opens up!");
        return;
      }
    }
  }
  _replyMessage(replyToken, "找不到該筆報名資料，請洽詢社團幹部！\n─────────────\nRegistration record not found, please contact club officers!");
}
