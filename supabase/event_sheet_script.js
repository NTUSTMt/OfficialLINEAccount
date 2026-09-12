// ==============================================================================
// 🏔️ 野境戶外系統：活動專屬報名試算表 綁定腳本 (Event Sheet Bound Script)
// 說明：貼入活動專屬試算表的 Apps Script 中，即可自動獲得頂部自訂選單、側邊欄差異比對與一鍵推播錄取通知功能
// ==============================================================================

// ⭐️ 請設定您的 Supabase 專案參數 (亦可由 _CONFIG 工作表讀取)
var SUPABASE_URL = "https://xilpnirhquuovdntqskm.supabase.co"; 
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; 

/**
 * 試算表開啟時自動建立頂部自訂選單
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🏔️ 社團系統")
    .addItem("🔄 比對差異並同步至 Supabase", "openDiffSidebar")
    .addSeparator()
    .addItem("📢 一鍵推播正備取錄取通知", "sendAdmissionNotifications")
    .addToUi();
}

/**
 * 打開側邊欄進行差異比對
 */
function openDiffSidebar() {
  var html = HtmlService.createHtmlOutputFromFile("SidebarDiff")
    .setTitle("活動報名差異比對與同步")
    .setWidth(360);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * 讀取此試算表的活動編號 (Event ID) 與活動名稱 (Event Name)
 */
function getEventInfo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfgSheet = ss.getSheetByName("_CONFIG");
  var eventId = "";
  var eventName = "";
  var botToken = "";

  if (cfgSheet) {
    var data = cfgSheet.getDataRange().getValues();
    for (var i = 0; i < data.length; i++) {
      var k = String(data[i][0]).trim();
      var v = String(data[i][1]).trim();
      if (k === "EVENT_ID") eventId = v;
      if (k === "EVENT_NAME") eventName = v;
      if (k === "MEMBER_BOT_TOKEN" || k === "LINE_BOT_TOKEN") botToken = v;
    }
  }

  return {
    eventId: eventId,
    eventName: eventName || eventId,
    botToken: botToken
  };
}

/**
 * 取得比對差異清單 (由側邊欄前端呼叫)
 * 嚴格安全防護：僅比對具備有效「報名專屬碼」之隊員列，自動忽略幹部在下方填寫之統計、車輛分配等雜項
 */
function getSignupsDiff() {
  var info = getEventInfo();
  var eventId = info.eventId;
  if (!eventId) {
    return { status: "error", message: "找不到活動編號 (_CONFIG 缺少 EVENT_ID)" };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("報名名冊") || ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { status: "success", diffs: [], message: "試算表尚無報名資料" };
  }

  var headers = data[0];
  var colIdx = {
    code: headers.indexOf("報名專屬碼"),
    name: headers.indexOf("姓名"),
    gender: headers.indexOf("性別"),
    idNumber: headers.indexOf("身分證字號"),
    birthday: headers.indexOf("出生年月日"),
    phone: headers.indexOf("手機電話"),
    emerName: headers.indexOf("緊急聯絡人"),
    emerRel: headers.indexOf("關係"),
    emerPhone: headers.indexOf("聯絡人電話"),
    status: headers.indexOf("審核狀態"),
    notifyStatus: headers.indexOf("通知狀態"),
    payStatus: headers.indexOf("繳費狀態"),
    userId: headers.indexOf("系統識別碼"),
    notes: headers.indexOf("備註")
  };

  // 1. 抓取試算表中「有專屬碼」的隊員資料 (過濾非隊員雜項列)
  var sheetApplicants = {};
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var code = colIdx.code > -1 ? String(row[colIdx.code] || "").trim() : "";
    // 嚴格識別：必須有有效報名專屬碼 (如 S 開頭且非空)
    if (!code || !code.startsWith("S")) continue;

    sheetApplicants[code] = {
      rowIndex: r + 1,
      signupCode: code,
      name: colIdx.name > -1 ? String(row[colIdx.name] || "").trim() : "",
      gender: colIdx.gender > -1 ? String(row[colIdx.gender] || "").trim() : "",
      idNumber: colIdx.idNumber > -1 ? String(row[colIdx.idNumber] || "").trim() : "",
      birthday: colIdx.birthday > -1 ? String(row[colIdx.birthday] || "").trim() : "",
      phone: colIdx.phone > -1 ? String(row[colIdx.phone] || "").trim() : "",
      emerName: colIdx.emerName > -1 ? String(row[colIdx.emerName] || "").trim() : "",
      emerRel: colIdx.emerRel > -1 ? String(row[colIdx.emerRel] || "").trim() : "",
      emerPhone: colIdx.emerPhone > -1 ? String(row[colIdx.emerPhone] || "").trim() : "",
      status: colIdx.status > -1 ? String(row[colIdx.status] || "").trim() : "",
      notifyStatus: colIdx.notifyStatus > -1 ? String(row[colIdx.notifyStatus] || "").trim() : "",
      payStatus: colIdx.payStatus > -1 ? String(row[colIdx.payStatus] || "").trim() : "",
      userId: colIdx.userId > -1 ? String(row[colIdx.userId] || "").trim() : "",
      notes: colIdx.notes > -1 ? String(row[colIdx.notes] || "").trim() : ""
    };
  }

  // 2. 向 Supabase 查詢最新資料
  var props = PropertiesService.getScriptProperties();
  var sbUrl = props.getProperty("SUPABASE_URL") || SUPABASE_URL;
  var sbKey = props.getProperty("SUPABASE_SERVICE_ROLE_KEY") || props.getProperty("SUPABASE_ANON_KEY") || SUPABASE_ANON_KEY;

  var fetchUrl = sbUrl + "/rest/v1/event_signups?event_id=eq." + encodeURIComponent(eventId) + "&select=id,status,notes,line_user_id,members(name,phone,id_card,birthday,gender,emergency_contact_name,emergency_contact_rel,emergency_contact_phone)";
  var res = UrlFetchApp.fetch(fetchUrl, {
    method: "get",
    headers: {
      "apikey": sbKey,
      "Authorization": "Bearer " + sbKey
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    return { status: "error", message: "Supabase 連線失敗：" + res.getContentText() };
  }

  var sbSignups = JSON.parse(res.getContentText());
  var sbMap = {};
  for (var s = 0; s < sbSignups.length; s++) {
    var sbItem = sbSignups[s];
    var m = sbItem.members || {};
    sbMap[sbItem.id] = {
      status: sbItem.status || "",
      notes: sbItem.notes || "",
      userId: sbItem.line_user_id || "",
      name: m.name || "",
      phone: m.phone || "",
      idNumber: m.id_card || "",
      birthday: m.birthday || "",
      emerName: m.emergency_contact_name || "",
      emerPhone: m.emergency_contact_phone || ""
    };
  }

  // 3. 逐筆比對差異
  var diffs = [];
  for (var codeKey in sheetApplicants) {
    var local = sheetApplicants[codeKey];
    var remote = sbMap[codeKey];

    if (!remote) {
      diffs.push({
        type: "NEW_LOCAL",
        code: codeKey,
        name: local.name,
        changes: [{ field: "全新報名", oldVal: "無", newVal: local.status }]
      });
      continue;
    }

    var changes = [];
    if (local.status && local.status !== remote.status) {
      changes.push({ field: "審核狀態", oldVal: remote.status, newVal: local.status });
    }
    if (local.notes !== remote.notes) {
      changes.push({ field: "備註", oldVal: remote.notes, newVal: local.notes });
    }
    if (local.phone && remote.phone && local.phone !== remote.phone) {
      changes.push({ field: "手機電話", oldVal: remote.phone, newVal: local.phone });
    }
    if (local.idNumber && remote.idNumber && local.idNumber !== remote.idNumber) {
      changes.push({ field: "身分證號", oldVal: remote.idNumber, newVal: local.idNumber });
    }

    if (changes.length > 0) {
      diffs.push({
        type: "MODIFIED",
        code: codeKey,
        userId: local.userId,
        name: local.name || remote.name,
        changes: changes,
        fullData: local
      });
    }
  }

  return {
    status: "success",
    eventId: eventId,
    totalChecked: Object.keys(sheetApplicants).length,
    diffs: diffs
  };
}

/**
 * 執行差異同步至 Supabase (由幹部在側邊欄確認後送出)
 * 規範：絕對不發送任何 LINE 訊息給社員或幹部，僅在試算表側邊欄即時回傳成功提示
 */
function commitDiffsToSupabase(diffsToCommit) {
  if (!diffsToCommit || diffsToCommit.length === 0) {
    return { success: true, count: 0, message: "無待更新項目" };
  }

  var props = PropertiesService.getScriptProperties();
  var sbUrl = props.getProperty("SUPABASE_URL") || SUPABASE_URL;
  var sbKey = props.getProperty("SUPABASE_SERVICE_ROLE_KEY") || props.getProperty("SUPABASE_ANON_KEY") || SUPABASE_ANON_KEY;

  var updatedCount = 0;
  for (var i = 0; i < diffsToCommit.length; i++) {
    var diff = diffsToCommit[i];
    var code = diff.code;
    var full = diff.fullData || {};

    // 1. 更新 event_signups 表
    var updatePayload = {};
    if (full.status) updatePayload.status = full.status;
    if (full.notes !== undefined) updatePayload.notes = full.notes;
    if (full.name) updatePayload.name = full.name;

    var patchUrl = sbUrl + "/rest/v1/event_signups?id=eq." + encodeURIComponent(code);
    UrlFetchApp.fetch(patchUrl, {
      method: "patch",
      contentType: "application/json",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey
      },
      payload: JSON.stringify(updatePayload),
      muteHttpExceptions: true
    });

    // 2. 若有異動隊員個資，連帶更新 members 表
    if (full.userId) {
      var memberPayload = {};
      if (full.name) memberPayload.name = full.name;
      if (full.phone) memberPayload.phone = full.phone;
      if (full.idNumber) memberPayload.id_card = full.idNumber;
      if (full.emerName) memberPayload.emergency_contact_name = full.emerName;
      if (full.emerPhone) memberPayload.emergency_contact_phone = full.emerPhone;

      if (Object.keys(memberPayload).length > 0) {
        var mUrl = sbUrl + "/rest/v1/members?line_user_id=eq." + encodeURIComponent(full.userId);
        UrlFetchApp.fetch(mUrl, {
          method: "patch",
          contentType: "application/json",
          headers: {
            "apikey": sbKey,
            "Authorization": "Bearer " + sbKey
          },
          payload: JSON.stringify(memberPayload),
          muteHttpExceptions: true
        });
      }
    }

    updatedCount++;
  }

  // 純試算表內部提示，絕不發送 LINE 訊息
  SpreadsheetApp.getActiveSpreadsheet().toast("已成功同步 " + updatedCount + " 筆紀錄至 Supabase！", "✅ 同步成功", 5);

  return {
    success: true,
    count: updatedCount,
    message: "已成功同步 " + updatedCount + " 筆資料至 Supabase 資料庫！"
  };
}

// ==============================================================================
// 📢 一鍵推播正取與備取錄取通知引擎
// ==============================================================================

/**
 * 一鍵推播正取與備取錄取通知 (供幹部在試算表頂部選單一鍵送出)
 */
function sendAdmissionNotifications() {
  var ui = SpreadsheetApp.getUi();
  var info = getEventInfo();
  var eventId = info.eventId;
  var eventName = info.eventName;

  if (!eventId) {
    ui.alert("錯誤", "找不到活動編號，請確認 _CONFIG 工作表是否存在 EVENT_ID！", ui.ButtonSet.OK);
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("報名名冊") || ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    ui.alert("提示", "目前名冊尚無任何報名資料。", ui.ButtonSet.OK);
    return;
  }

  var headers = data[0];
  var codeCol = headers.indexOf("報名專屬碼");
  var statusCol = headers.indexOf("審核狀態");
  var notifyCol = headers.indexOf("通知狀態");
  var nameCol = headers.indexOf("姓名");
  var uidCol = headers.indexOf("系統識別碼");

  if (statusCol === -1 || uidCol === -1) {
    ui.alert("欄位缺失", "找不到「審核狀態」或「系統識別碼」欄位，請檢查表頭！", ui.ButtonSet.OK);
    return;
  }

  // 1. 篩選待通知之正取與備取隊員
  var candidates = [];
  var acceptedCount = 0;
  var waitlistCount = 0;

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var code = codeCol > -1 ? String(row[codeCol] || "").trim() : "";
    var status = String(row[statusCol] || "").trim();
    var notify = notifyCol > -1 ? String(row[notifyCol] || "").trim() : "";
    var uid = String(row[uidCol] || "").trim();
    var name = nameCol > -1 ? String(row[nameCol] || "隊員").trim() : "隊員";

    var isAccepted = status.indexOf("正取") > -1;
    var isWaitlisted = status.indexOf("備取") > -1;
    var isCancelled = status.indexOf("取消") > -1;

    if ((isAccepted || isWaitlisted) && !isCancelled && notify !== "已通知" && uid.startsWith("U")) {
      candidates.push({
        rowIdx: r + 1,
        code: code,
        name: name,
        uid: uid,
        status: status,
        isAccepted: isAccepted
      });
      if (isAccepted) acceptedCount++;
      else waitlistCount++;
    }
  }

  if (candidates.length === 0) {
    ui.alert("無待通知對象", "所有正取與備取隊員皆已發送過通知，或目前尚無審核完成之錄取隊員。", ui.ButtonSet.OK);
    return;
  }

  // 2. 彈出確認視窗防呆
  var confirmMsg = "活動名稱：" + eventName + " (" + eventId + ")\n\n" +
    "即將發送錄取通知：共 " + candidates.length + " 人\n" +
    "  • 正取通知：" + acceptedCount + " 人\n" +
    "  • 備取通知：" + waitlistCount + " 人\n\n" +
    "提示：系統將透過 LINE 官方帳號個別推播 Flex Message 卡片，發送完成後本表將標記為「已通知」。\n\n是否確定發送？";

  var answer = ui.alert("📢 確認發送正備取推播通知", confirmMsg, ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) {
    return;
  }

  // 3. 取得 LINE Bot Token (優先由 ScriptProperties 讀取，亦可由 _CONFIG 讀取)
  var props = PropertiesService.getScriptProperties();
  var botToken = props.getProperty("MEMBER_BOT_TOKEN") || props.getProperty("LINE_BOT_TOKEN") || info.botToken;

  if (!botToken) {
    ui.alert("缺少 LINE Token", "未設定 LINE Bot Token！請至專案屬性 (Script Properties) 設定 MEMBER_BOT_TOKEN，或於 _CONFIG 表中填入 LINE_BOT_TOKEN。", ui.ButtonSet.OK);
    return;
  }

  // 4. 逐筆推播精美 Flex Message
  var sentCount = 0;
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var ok = _pushAdmissionFlex(botToken, c.uid, c.name, eventName, c.status, c.isAccepted, eventId);
    if (ok) {
      if (notifyCol > -1) {
        sheet.getRange(c.rowIdx, notifyCol + 1).setValue("已通知");
      }
      sentCount++;
    }
  }

  // 5. 提示完成
  SpreadsheetApp.getActiveSpreadsheet().toast("已成功推播 " + sentCount + " 則錄取通知！", "📢 推播完成", 6);
  ui.alert("推播成功", "已成功向 " + sentCount + " 位社員發送錄取通知！\n試算表已同步將通知狀態標記為「已通知」。", ui.ButtonSet.OK);
}

/**
 * 透過 LINE Messaging API 發送專業錄取 Flex Message
 */
function _pushAdmissionFlex(botToken, targetUid, memberName, eventName, statusText, isAccepted, eventId) {
  try {
    var flexBubble;
    var altText;

    if (isAccepted) {
      altText = "【活動正取通知 Confirmed】" + eventName;
      flexBubble = {
        "type": "bubble",
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            { "type": "text", "text": "審核結果出爐 Result", "weight": "bold", "color": "#1DB446", "size": "sm" },
            { "type": "text", "text": "活動正取通知", "weight": "bold", "size": "xl", "margin": "md" },
            { "type": "text", "text": "哈囉 " + memberName + "！您報名的活動：\nHello " + memberName + "! For the event:", "margin": "md", "size": "sm", "wrap": true },
            { "type": "text", "text": eventName, "weight": "bold", "color": "#111111", "size": "md", "wrap": true, "margin": "sm" },
            { "type": "text", "text": "審核結果為 Result：", "margin": "md", "size": "sm" },
            { "type": "text", "text": "【 " + statusText + " 】", "weight": "bold", "color": "#1DB446", "size": "lg", "align": "center", "margin": "md" },
            { "type": "separator", "margin": "md" },
            { "type": "text", "text": "恭喜您錄取！請留意我們後續會透過您留下的真實 LINE ID 將您加入出隊群組，並請於期限內完成繳費！\nCongratulations! We will invite you to the LINE group soon. Please complete the payment before the deadline!", "wrap": true, "margin": "md", "size": "xs", "color": "#666666" }
          ]
        },
        "footer": {
          "type": "box",
          "layout": "vertical",
          "contents": [{
            "type": "button",
            "style": "primary",
            "color": "#1DB446",
            "action": {
              "type": "uri",
              "label": "前往繳費系統 Pay",
              "uri": "https://liff.line.me/2009217429-u7OCkmQO"
            }
          }]
        }
      };
    } else {
      altText = "【活動備取通知 Waitlist】" + eventName;
      flexBubble = {
        "type": "bubble",
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            { "type": "text", "text": "審核結果出爐 Result", "weight": "bold", "color": "#FF9800", "size": "sm" },
            { "type": "text", "text": "活動備取通知", "weight": "bold", "size": "xl", "margin": "md" },
            { "type": "text", "text": "哈囉 " + memberName + "！您報名的活動：\nHello " + memberName + "! For the event:", "margin": "md", "size": "sm", "wrap": true },
            { "type": "text", "text": eventName, "weight": "bold", "color": "#111111", "size": "md", "wrap": true, "margin": "sm" },
            { "type": "text", "text": "審核結果為 Result：", "margin": "md", "size": "sm" },
            { "type": "text", "text": "【 " + statusText + " 】", "weight": "bold", "color": "#FF9800", "size": "lg", "align": "center", "margin": "md" },
            { "type": "separator", "margin": "md" },
            { "type": "text", "text": "目前為備取狀態，若有正取人員釋出名額，幹部將主動聯絡您遞補！\nYou are currently on the waitlist. We will contact you if a spot opens up!", "wrap": true, "margin": "md", "size": "xs", "color": "#666666" }
          ]
        },
        "footer": {
          "type": "box",
          "layout": "vertical",
          "contents": [{
            "type": "button",
            "style": "primary",
            "color": "#FF9800",
            "action": {
              "type": "postback",
              "label": "確認備取意願 Confirm Waitlist",
              "data": "action=confirm_waitlist&eventId=" + eventId + "&userId=" + targetUid
            }
          }]
        }
      };
    }

    var payload = {
      "to": targetUid,
      "messages": [{
        "type": "flex",
        "altText": altText,
        "contents": flexBubble
      }]
    };

    var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + botToken
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    return (res.getResponseCode() === 200);
  } catch (e) {
    console.error("發送 LINE 錄取通知失敗:", e);
    return false;
  }
}
