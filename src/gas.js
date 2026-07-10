// ⭐️ 1. 全域變數與環境設定
var MEMBER_BOT_TOKEN = 'r5sUx1VkwED0wFUldkoU3EcM+xAnEI0f1eXRniml3BoR5hwqDlmvW7OxI3APqiKEmgTHi/Zykqg6TCFd0DCLNCOqwPWGVvTOtBWWp1IyOz+8+M4s+89iU1b0VqL8QQN1JJ8ke5vmjSEq65j8NAoAFwdB04t89/1O/w1cDnyilFU=';
var ADMIN_BOT_TOKEN = 'N9qUaf5LTU8pWnc8DaKF5IcnPBNl7VriyfluY9fRSBxPjVezwNSDOosHHSY33y6V76PsCHIYQ9gTcIn5Y85tCCx/Uuj3LKD5THQkred03ICXtbPBiL69682smXKoul/R2QKcpaEUK0f75I6ZHDK89gdB04t89/1O/w1cDnyilFU=';
var SPREADSHEET_ID = '14tVHqkx9TrhdPSNmsYYF2Cm5pdQMJWS2bot2dtsvcJM';
var ADMIN_GROUP_ID = 'C9de5bb076802134f4131ca1c60a66073';
var GEMINI_API_KEY = "AIzaSyDOp0xxtIZTWO4qoSx0UWrz39swakpzmeQ";

// ⭐️ 共用工具函式

// 共用 LINE API 呼叫核心
function _lineAPI(endpoint, token, payload) {
  return UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + endpoint, {
    'headers': {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': 'Bearer ' + token
    },
    'method': 'post',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  });
}

// 動態欄位查找 (在 headers 中搜尋包含 keyword 的欄位索引)
function _fi(headers, keyword) {
  return headers.findIndex(function (h) {
    return String(h).includes(keyword);
  });
}

// 跨表查詢活動名稱 (從 Events 表根據活動編號取得名稱)
function _getEventName(ss, eventId) {
  var eventSheet = ss.getSheetByName("Events");
  if (!eventSheet || !eventId) return eventId || "活動";
  var eData = eventSheet.getDataRange().getDisplayValues();
  var eIdIdx = _fi(eData[0], "活動編號");
  var eNameIdx = _fi(eData[0], "活動名稱");
  for (var i = 1; i < eData.length; i++) {
    if (eIdIdx > -1 && eData[i][eIdIdx] === eventId) {
      return (eNameIdx > -1) ? eData[i][eNameIdx] : eventId;
    }
  }
  return eventId;
}

// 三重保險抓取裝備名稱
function _getEquipName(row, name1Idx, name2Idx, idIdx, fallback) {
  var name = "";
  if (name1Idx > -1 && row[name1Idx]) name = String(row[name1Idx]).trim();
  if (name === "" && name2Idx > -1 && row[name2Idx]) name = String(row[name2Idx]).trim();
  if (name === "" && idIdx > -1 && row[idIdx]) name = String(row[idIdx]).trim();
  return name || (fallback || "未知裝備");
}

// ⭐️ 訊息發送引擎 (雙核心智慧切換版)

// 傳送單一「純文字」訊息

// 👉 1. 【回覆社員】(完全免費，使用 MEMBER_BOT_TOKEN)
// 說明：只要是社員主動操作，都必須使用這組 API 來回覆，以節省成本。
// 注意：Reply Token 是一次性的，且時效只有 1 分鐘！
function replyMessage(replyToken, text) {
  _lineAPI('reply', MEMBER_BOT_TOKEN, {
    'replyToken': replyToken,
    'messages': [{
      'type': 'text',
      'text': text
    }]
  });
}

// 傳送單張「精美排版卡片 (Flex Message)」
function replyFlexMessage(replyToken, altText, contents) {
  _lineAPI('reply', MEMBER_BOT_TOKEN, {
    'replyToken': replyToken,
    'messages': [{
      'type': 'flex',
      'altText': altText,
      'contents': contents
    }]
  });
}

// 一次傳送「多筆訊息」(例如：先傳一句文字，緊接著再傳一張卡片)
function replyMultiMessages(replyToken, messagesArray) {
  _lineAPI('reply', MEMBER_BOT_TOKEN, {
    'replyToken': replyToken,
    'messages': messagesArray
  });
}

// 主動推播單一「純文字」訊息

// 👉 2. 【推播給社員】(需消耗額度，使用 MEMBER_BOT_TOKEN)
// 說明：用於系統「主動」聯絡社員 (例如：幹部審核通過後的正備取通知、對帳成功的通知)。
// 參數使用 userId (U開頭的系統識別碼) 來精準定位要傳給誰。
function pushMessage(userId, text) {
  return _lineAPI('push', MEMBER_BOT_TOKEN, {
    'to': userId,
    'messages': [{
      'type': 'text',
      'text': text
    }]
  });
}

// 主動推播「精美排版卡片 (Flex Message)」
function pushFlexMessage(to, altText, contents) {
  return _lineAPI('push', MEMBER_BOT_TOKEN, {
    'to': to,
    'messages': [{
      'type': 'flex',
      'altText': altText,
      'contents': contents
    }]
  });
}

// 傳送純文字通知給幹部群組

// 👉 3. 【推播給幹部群組】(需消耗額度，切換使用 ADMIN_BOT_TOKEN)
// 說明：專門用來將社員的報名、借裝備、匯款證明，自動轉發到「幹部群組」裡。
// 因為切換了 Token，所以消耗的是「二號機器人 (管理員專用)」的免費額度，不會跟社員搶配額！
function pushAdminMessage(text) {
  if (!ADMIN_GROUP_ID) return;
  return _lineAPI('push', ADMIN_BOT_TOKEN, {
    'to': ADMIN_GROUP_ID,
    'messages': [{
      'type': 'text',
      'text': text
    }]
  });
}

// 傳送「帶有確認按鈕的卡片 (Flex Message)」給幹部群組 (如：匯款對帳卡)
function pushAdminFlexMessage(altText, contents) {
  if (!ADMIN_GROUP_ID) return;
  return _lineAPI('push', ADMIN_BOT_TOKEN, {
    'to': ADMIN_GROUP_ID,
    'messages': [{
      'type': 'flex',
      'altText': altText,
      'contents': contents
    }]
  });
}


// 👉 4. 【幹部專用回覆引擎】(完全免費，使用 ADMIN_BOT_TOKEN)
// 說明：當幹部在群組裡點擊了「確認無誤並發通知」的按鈕時，
// 系統會透過這個引擎，立刻在群組內回覆幹部「已成功發送通知」。
function replyAdminMessage(replyToken, text) {
  _lineAPI('reply', ADMIN_BOT_TOKEN, {
    'replyToken': replyToken,
    'messages': [{
      'type': 'text',
      'text': text
    }]
  });
}

// ⭐️ 總機大廳 (Webhook 接收端 / 解除快取陷阱防護版)
// 【函式說明】
// 這是 LINE Bot 的「大門口」。當使用者在 LINE 傳送任何訊息、點擊按鈕或傳送照片時，
// LINE 的伺服器都會把資料打包發送到這個 doPost 函式。
// 這個程式負責將收到的資料「拆包分流」，判斷使用者是在按按鈕 (postback)、
// 傳送一般文字 (text)，還是在傳送照片 (image)，然後交給對應的處理部門。
// 同時，這裡也掌管了「狀態機 (Cache)」，負責攔截使用者正在進行的「繳費」或「取消」流程。
function doPost(e) {
  if (!e || !e.postData) return ContentService.createTextOutput('ok');

  try {
    var msg = JSON.parse(e.postData.contents);

    if (msg.action === 'submit_multi_loan') {
      return processMultiLoan(msg);
    }
    
    if (msg.action === 'submit_payment') {
      return processPaymentSubmit(msg);
    }

    if (msg.action === 'save_profile') {
      return processSaveProfile(msg);
    }

    if (msg.action === 'submit_reflection') {
      return processSubmitReflection(msg);
    }

    for (var i = 0; i < msg.events.length; i++) {
      var event = msg.events[i];

      if (event.type === 'message' && event.message.type === 'text') {
        var tempMessage = event.message.text;
        var replyToken = event.replyToken;

        if (tempMessage === "抓取群組ID") {
          var sourceType = event.source.type;
          if (sourceType === "group") {
            var groupId = event.source.groupId;
            // 因為是幹部機器人被加進群組，所以必須用 ADMIN_BOT_TOKEN 來回覆，否則 LINE 會報錯
            replyAdminMessage(replyToken, "✅ 抓到了！這個幹部群組的 ID 是：\n\n" + groupId + "\n\n⚠️ 請複製這串 C 開頭的亂碼，貼到 SCRIPT 的 ADMIN_GROUP_ID 變數中，並記得把這個隱藏指令刪掉或註解起來喔！");
          } else if (sourceType === "user") {
            var userId = event.source.userId;
            // 如果是一對一對話，同時嘗試用兩個 Token 回覆 (因為不知道社員是對哪一隻幹部還是社員機器人輸入)
            replyAdminMessage(replyToken, "❌ 這裡不是群組喔！這是我們一對一的聊天室。\n順帶一提，您的個人 User ID 是：\n" + userId);
            replyMessage(replyToken, "❌ 這裡不是群組喔！這是我們一對一的聊天室。\n順帶一提，您的個人 User ID 是：\n" + userId);
          }
          return;
        }
      }

      var replyToken = event.replyToken;
      var userId = event.source.userId;

      try {
        // 分流 1：postback
        if (event.type === 'postback') {
          handlePostback(replyToken, userId, event.postback.data);
        }
        // 分流 2：文字訊息
        else if (event.type === 'message' && event.message.type === 'text') {
          var userText = event.message.text.trim();

          if (userText.indexOf("我想借用：") > -1 || userText.indexOf("我要報名：") > -1 || userText.indexOf("我要取消") > -1 || userText.indexOf("我要上傳匯款證明") > -1) {
            continue;
          }

          var cache = CacheService.getUserCache();

          var menuCommands = ["我的狀態 My Status", "填寫資料 Register", "最新活動 Activities", "器材借用 Equipment Loan", "取消預約 Cancel", "繳費系統 Payment System", "繳費紀錄 History", "繳費回報", "其他", "更多服務 More Services", "幹部是誰 Officers", "意見與回饋 Feedback"];
          if (menuCommands.indexOf(userText) > -1) {
            cache.remove(userId + "_canceling_event");
            cache.remove(userId + "_payment_type");
            handleTextCommand(replyToken, userId, userText, event.source.type);
            continue;
          }

          var cancelingEventId = cache.get(userId + "_canceling_event");
          if (cancelingEventId) {
            if (userText === "取消" || userText === "取消 Cancel") {
              cache.remove(userId + "_canceling_event");
              replyMessage(replyToken, "✅ 已為您終止取消流程，您的【正取】資格已為您保留！\n─────────────\n✅ Cancellation process aborted. Your [Confirmed] status has been safely retained!");
            } else {
              handleEventCancelReason(replyToken, userId, userText, cancelingEventId);
            }
            continue;
          }

          var paymentType = cache.get(userId + "_payment_type");
          if (paymentType) {
            if (userText === "取消" || userText === "取消 Cancel") {
              cache.remove(userId + "_payment_type");
              replyMessage(replyToken, "✅ 已為您取消繳費回報流程\n─────────────\n✅ Payment reporting process cancelled.");
            } else {
              handlePaymentInput(replyToken, userId, userText, paymentType, "text");
            }
            continue;
          }

          handleTextCommand(replyToken, userId, userText, event.source.type);
        }
        // 分流 3：圖片
        else if (event.type === 'message' && event.message.type === 'image') {
          var cache = CacheService.getUserCache();
          var paymentType = cache.get(userId + "_payment_type");
          if (paymentType) {
            handlePaymentInput(replyToken, userId, event.message.id, paymentType, "image");
            continue;
          }
        }
      } catch (innerError) {
        console.error("內部錯誤:", innerError);
        replyMessage(replyToken, "🚨 系統執行時發生錯誤 System Error：\n" + innerError.message + "\n\n請截圖通知幹部修復！\nPlease screenshot this and notify the officers!");
      }
    }
  } catch (err) {
    console.error(err);
  }

  return ContentService.createTextOutput('ok');
}

// ⭐️ 處理按鈕隱藏回傳值 (全動態搜尋版)
// 【函式說明】
// 當社員在 LINE 點擊了卡片上的按鈕 (例如「我要報名」、「我要借這個」)，
// 系統並不會收到文字，而是會收到一串我們預先埋好的「隱藏資料 (Postback Data)」。
// 這個函式負責把這串資料拆解開來，判斷使用者到底按了什麼按鈕 (action)，
// 以及這個按鈕對應的目標是什麼 (targetId，例如活動代碼、裝備代碼)，並執行對應動作。
function handlePostback(replyToken, userId, postbackData) {
  var params = postbackData.split("&");
  var action = params[0].split("=")[1];
  var targetId = params.length > 1 ? params[1].split("=")[1] : "";
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // 📌 動作：借用裝備
  if (action === "borrow_form") {
    var profileCheck = _checkProfileComplete(userId, ss, "borrow");
    if (profileCheck.missingFields.indexOf("NOT_FOUND") > -1) {
      replyMessage(replyToken, "⚠️ 借用失敗：系統找不到您的社員資料！\n請先完成「填寫資料」後再借用裝備。\n─────────────\n⚠️ Borrow Failed: Member profile not found!\nplease click 'Register' in the menu to complete your profile first.");
      return;
    }
    if (profileCheck.missingFields.length > 0) {
      replyMessage(replyToken, "⚠️ 借用失敗：您的個人資料尚不完整！\n\n為了確保裝備借用紀錄與聯繫順暢，請先點擊選單的「填寫資料」，補齊以下必填資訊：\n\n👉 " + profileCheck.missingFields.join("\n👉 ") + "\n\n完成資料更新後，再回來點選借用喔！🏕️\n─────────────\n⚠️ Borrow Failed: Incomplete Profile!\nPlease update your profile first.");
      return;
    }

    var equipSheet = ss.getSheetByName("Equipments");
    var eData = equipSheet.getDataRange().getValues();
    var eH = eData[0];
    var eIdIdx = _fi(eH, "裝備代號");
    var eNameIdx = _fi(eH, "裝備名稱");

    var equipName = "未知裝備";
    for (var i = 1; i < eData.length; i++) {
      if (eIdIdx > -1 && eData[i][eIdIdx] === targetId) {
        equipName = (eNameIdx > -1) ? eData[i][eNameIdx] : targetId;
        break;
      }
    }

    var baseUrl = "https://docs.google.com/forms/d/e/1FAIpQLSctyPWViZnt6tLkju_2-_kozenStbnvtzOUcq3Ig7E8lJasSQ/viewform?usp=pp_url&entry.1659200472=NNNNN&entry.1758853980=ZZZZZ&entry.1336614037=EEEEE";
    var formUrl = baseUrl.replace("ZZZZZ", userId).replace("EEEEE", targetId).replace("NNNNN", encodeURIComponent(equipName));

    var text = "📝 裝備借用預約 / Equipment Reservation\n\n" +
      "您選擇了 (Selected)：【" + equipName + "】\n\n" +
      "請點擊下方專屬連結填寫日期、數量與用途：\n" +
      "Please click the link below to fill in details:\n" +
      formUrl + "\n\n" +
      "⚠️ 表單中的系統資料已為您自動帶入，請千萬不要修改它們喔！\n" +
      "(Note: System data in the form is auto-filled, please do NOT modify it!)";
    replyMessage(replyToken, text);
  }

  // 📌 動作：查看活動詳情
  else if (action === "view") {
    sendEventDetail(replyToken, targetId, ss);
  }

  // 📌 動作：一鍵報名活動
  else if (action === "signup") {
    handleSignup(replyToken, userId, targetId, ss);
  }

  // 📌 動作：取消裝備預約
  else if (action === "cancel_equip") {
    var targetId = params.length > 1 ? params[1].split("=")[1] : "";
    var loanSheet = ss.getSheetByName("Loan_Records");
    if (!loanSheet) return;
    var lData = loanSheet.getDataRange().getValues();
    var lH = lData[0];
    var equipSheet = ss.getSheetByName("Equipments");
    var eData = equipSheet.getDataRange().getValues();
    var eH = eData[0];

    var eIdIdx = _fi(eH, "裝備代號");
    var eNameIdx = _fi(eH, "裝備名稱");
    var lOrderIdx = _fi(lH, "租借編號");
    var lSysIdx = _fi(lH, "系統識別碼");
    var lStatusIdx = _fi(lH, "領取/歸還");
    var lEquipIdIdx = _fi(lH, "裝備代號");
    var lQtyIdx = _fi(lH, "數量");
    var lEquipNameIdx = lH.findIndex(function (h) {
      return String(h).includes("裝備名稱") || String(h).includes("租借項目");
    });
    var lNameIdx = _fi(lH, "姓名");

    var foundRecord = false;
    for (var i = 1; i < lData.length; i++) {
      var isTarget = (lOrderIdx > -1 && lData[i][lOrderIdx] === targetId) || (lEquipIdIdx > -1 && lData[i][lEquipIdIdx] === targetId);

      if (isTarget && lSysIdx > -1 && lData[i][lSysIdx] === userId) {
        foundRecord = true;
        if (lStatusIdx > -1 && lData[i][lStatusIdx] === "待領取 To Be Collected") {
          loanSheet.getRange(i + 1, lStatusIdx + 1).setValue("已取消 Cancelled");

          // 自動退還庫存 (加鎖保護防止並發寫入衝突)
          var lock = LockService.getScriptLock();
          try {
            lock.waitLock(10000); // 最多等待 10 秒
            var equipSheet = ss.getSheetByName("Equipments");
            if (equipSheet) {
              var eData = equipSheet.getDataRange().getValues();
              var eH = eData[0];
              var eIdIdx = _fi(eH, "裝備代號");
              var eStockIdx = _fi(eH, "剩餘數量");
              for (var j = 1; j < eData.length; j++) {
                if (eIdIdx > -1 && lEquipIdIdx > -1 && eData[j][eIdIdx] === lData[i][lEquipIdIdx]) {
                  equipSheet.getRange(j + 1, eStockIdx + 1).setValue((parseInt(eData[j][eStockIdx], 10) || 0) + parseInt(lData[i][lQtyIdx], 10));
                  break;
                }
              }
            }
          } catch (e) {
            console.error("庫存退還時取得鎖定失敗", e);
          } finally {
            if (lock.hasLock()) {
              lock.releaseLock();
            }
          }

          var equipName = (lEquipNameIdx > -1 && lData[i][lEquipNameIdx]) ? String(lData[i][lEquipNameIdx]).trim() : "未知裝備";
          if (equipName === "未知裝備" || equipName === "") {
            for (var k = 1; k < eData.length; k++) {
              if (eIdIdx > -1 && lEquipIdIdx > -1 && eData[k][eIdIdx] === lData[i][lEquipIdIdx]) {
                equipName = (eNameIdx > -1) ? String(eData[k][eNameIdx]).trim() : "未知裝備";
                break;
              }
            }
          }

          replyMessage(replyToken, "✅ 【" + equipName + "】預約已成功取消！\n─────────────\n✅ Reservation successfully cancelled!");
          var userName = (lNameIdx > -1) ? lData[i][lNameIdx] : "社員";
          pushAdminMessage("🔔 【幹部通知：裝備取消】\n申請人：" + userName + "\n裝備：" + equipName + "\n庫存已自動回補！");
        } else {
          replyMessage(replyToken, "⚠️ 取消失敗：該訂單狀態已變更，無法直接取消。\n─────────────\n⚠️ Cancellation failed: Order status has changed.");
        }
        return;
      }
    }
    if (!foundRecord) replyMessage(replyToken, "⚠️ 找不到該筆預約紀錄，請重新點選。\n─────────────\n⚠️ Record not found, please try again.");
  }

  // 📌 動作：取消活動報名
  else if (action === "cancel_event") {
    var signupSheet = ss.getSheetByName("Signups");
    if (!signupSheet) return;
    var sData = signupSheet.getDataRange().getValues();
    var sH = sData[0];

    var sCodeIdx = _fi(sH, "專屬碼");
    var sSysIdx = _fi(sH, "系統識別碼");
    var sStatusIdx = _fi(sH, "審核結果");
    var sEventIdIdx = _fi(sH, "活動編號");

    for (var k = 1; k < sData.length; k++) {
      if (sCodeIdx > -1 && sSysIdx > -1 && sData[k][sCodeIdx].toString() === targetId.toString() && sData[k][sSysIdx].toString() === userId.toString()) {

        var eventName = _getEventName(ss, sEventIdIdx > -1 ? sData[k][sEventIdIdx] : "");

        // 情境 A：正取 -> 詢問取消原因
        if (sStatusIdx > -1 && sData[k][sStatusIdx].indexOf("正取") > -1) {
          CacheService.getUserCache().put(userId + "_canceling_event", targetId, 300);

          var cancelPromptFlex = {
            "type": "bubble",
            "body": {
              "type": "box",
              "layout": "vertical",
              "contents": [{
                "type": "text",
                "text": "⚠️ 正取取消確認 / Confirm Cancel",
                "weight": "bold",
                "color": "#E54545",
                "size": "sm"
              }, {
                "type": "text",
                "text": "您目前為【" + eventName + "】的正取名單。\nYou are on the confirmed list.",
                "wrap": true,
                "margin": "md",
                "size": "sm",
                "weight": "bold"
              }, {
                "type": "text",
                "text": "請直接在此對話框輸入您的「取消原因」，送出後系統才會為您完成手續！\nPlease type your reason for cancellation in this chat to complete the process.",
                "wrap": true,
                "margin": "md",
                "size": "xs",
                "color": "#666666"
              }]
            },
            "footer": {
              "type": "box",
              "layout": "vertical",
              "contents": [{
                "type": "button",
                "style": "secondary",
                "action": {
                  "type": "message",
                  "label": "❌ 放棄取消 Abort",
                  "text": "取消 Cancel"
                }
              }]
            }
          };
          replyFlexMessage(replyToken, "請輸入取消原因或選擇保留資格", cancelPromptFlex);
        }
        // 情境 B：備取或審核中 -> 直接取消
        else {
          if (sStatusIdx > -1) signupSheet.getRange(k + 1, sStatusIdx + 1).setValue("已取消 Cancelled");
          replyMessage(replyToken, "✅ 【" + eventName + "】報名已成功取消！\n期待在未來的社團活動與您相見。\n─────────────\n✅ Registration successfully cancelled!\nHope to see you in our future activities.");
        }
        return;
      }
    }
  }

  // 📌 動作：備取意願確認
  else if (action === "confirm_waitlist") {
    var signupSheet = ss.getSheetByName("Signups");
    var sData = signupSheet.getDataRange().getValues();
    var sH = sData[0];

    var sCodeIdx = _fi(sH, "專屬碼");
    var sSysIdx = _fi(sH, "系統識別碼");
    var sStatusIdx = _fi(sH, "審核結果");
    var sNameIdx = _fi(sH, "姓名");
    var sEventIdIdx = _fi(sH, "活動編號");

    for (var k = 1; k < sData.length; k++) {
      if (sCodeIdx > -1 && sSysIdx > -1 && sData[k][sCodeIdx].toString() === targetId.toString() && sData[k][sSysIdx].toString() === userId.toString()) {

        var currentStatus = (sStatusIdx > -1) ? sData[k][sStatusIdx].toString() : "";
        if (currentStatus.indexOf("有意願") > -1) {
          replyMessage(replyToken, "您已經登記過遞補意願囉！請靜候幹部通知。\n─────────────\nYou have already registered for the waitlist! Please wait for officer notification.");
          return;
        }

        var newStatus = "備取(有意願) Waitlisted (Interested)";
        if (sStatusIdx > -1) signupSheet.getRange(k + 1, sStatusIdx + 1).setValue(newStatus);

        replyMessage(replyToken, "✅ 已為您登記遞補意願！\nYour waitlist intention is recorded!\n\n若有正取名額釋出，幹部將第一時間優先通知您，謝謝您的耐心等候！\nWe will notify you immediately if a spot opens up. Thank you for your patience!");
        return;
      }
    }
  }

  // 📌 動作：準備繳費 (單筆回報/合併結帳)
  else if (action === "upload_proof" || action === "ready_to_pay") {
    var profileCheck = _checkProfileComplete(userId, ss, "payment");
    if (profileCheck.missingFields.indexOf("NOT_FOUND") > -1) {
      replyMessage(replyToken, "⚠️ 繳費失敗：系統找不到您的社員資料！\n請先完成「填寫資料」後再進行繳費操作。\n─────────────\n⚠️ Payment Failed: Member profile not found!\nPlease click 'Register' in the menu to complete your profile first.");
      return;
    }
    if (profileCheck.missingFields.length > 0) {
      replyMessage(replyToken, "⚠️ 繳費失敗：您的個人資料尚不完整！\n\n為了對帳與後續聯絡順暢，請先點擊選單的「填寫資料」，補齊以下必填資訊：\n\n👉 " + profileCheck.missingFields.join("\n👉 ") + "\n\n完成資料更新後，再回來點擊繳費喔！💸\n─────────────\n⚠️ Failed: Incomplete Profile!\nPlease update your profile first before proceeding with the payment.");
      return;
    }

    var isAlreadyPendingOrPaid = false;

    // 情境 A：合併結帳 - 檢查是否還有未繳費項目
    if (targetId === "combined") {
      var hasUnpaid = false;

      var mSheet = ss.getSheetByName("Members");
      if (mSheet) {
        var mData = mSheet.getDataRange().getValues();
        var mH = mData[0];
        var sysIdx = _fi(mH, "系統識別碼");
        var payIdx = _fi(mH, "繳費狀態");
        for (var i = 1; i < mData.length; i++) {
          if (sysIdx > -1 && mData[i][sysIdx] === userId && payIdx > -1) {
            var pt = String(mData[i][payIdx]);
            if (pt !== "已繳費 Paid" && pt !== "待確認 Checking") hasUnpaid = true;
            break;
          }
        }
      }

      if (!hasUnpaid) {
        var sSheet = ss.getSheetByName("Signups");
        if (sSheet) {
          var sData = sSheet.getDataRange().getValues();
          var sH = sData[0];
          var sSysIdx = _fi(sH, "系統識別碼");
          var sPayIdx = _fi(sH, "繳費狀態");
          var sStatIdx = _fi(sH, "審核結果");
          for (var j = 1; j < sData.length; j++) {
            if (sSysIdx > -1 && sData[j][sSysIdx] === userId && sPayIdx > -1 && sStatIdx > -1) {
              var st = String(sData[j][sStatIdx]);
              var pt = String(sData[j][sPayIdx]);
              if (st.indexOf("正取") > -1 && st.indexOf("取消") === -1 && pt !== "已繳費 Paid" && pt !== "待確認 Checking") {
                hasUnpaid = true;
                break;
              }
            }
          }
        }
      }

      if (!hasUnpaid) {
        var lSheet = ss.getSheetByName("Loan_Records");
        if (lSheet) {
          var lData = lSheet.getDataRange().getValues();
          var lH = lData[0];
          var lSysIdx = _fi(lH, "系統識別碼");
          var lPayIdx = _fi(lH, "繳費狀態");
          var lStatIdx = _fi(lH, "領取/歸還");
          for (var l = 1; l < lData.length; l++) {
            if (lSysIdx > -1 && lData[l][lSysIdx] === userId && lPayIdx > -1 && lStatIdx > -1) {
              var lst = String(lData[l][lStatIdx]);
              var lpt = String(lData[l][lPayIdx]);
              if (lst.indexOf("取消") === -1 && lst.indexOf("歸還") === -1 && lpt !== "已繳費 Paid" && lpt !== "待確認 Checking") {
                hasUnpaid = true;
                break;
              }
            }
          }
        }
      }
      if (!hasUnpaid) isAlreadyPendingOrPaid = true;
    }
    // 情境 B：單筆回報
    else {
      if (targetId === "繳交社費") {
        isAlreadyPendingOrPaid = false;
      } else if (String(targetId).startsWith("活動：")) {
        var targetEventName = String(targetId).split("活動：")[1].trim();
        var sSheet = ss.getSheetByName("Signups");
        var eSheet = ss.getSheetByName("Events");
        if (sSheet && eSheet) {
          var sData = sSheet.getDataRange().getValues();
          var eData = eSheet.getDataRange().getDisplayValues();
          var sH = sData[0],
            eH = eData[0];
          var sSysIdx = _fi(sH, "系統識別碼");
          var sPayIdx = _fi(sH, "繳費狀態");
          var sEventIdIdx = _fi(sH, "活動編號");
          var eIdIdx = _fi(eH, "活動編號");
          var eNameIdx = _fi(eH, "活動名稱");

          for (var j = 1; j < sData.length; j++) {
            if (sSysIdx > -1 && sData[j][sSysIdx] === userId && sPayIdx > -1 && sEventIdIdx > -1) {
              var eName = "";
              for (var k = 1; k < eData.length; k++) {
                if (eIdIdx > -1 && String(eData[k][eIdIdx]).trim() === String(sData[j][sEventIdIdx]).trim()) {
                  eName = (eNameIdx > -1) ? String(eData[k][eNameIdx]).replace(/[&=]/g, '') : "";
                  break;
                }
              }
              if (targetEventName === eName) {
                var pStat = String(sData[j][sPayIdx]);
                if (pStat === "待確認 Checking" || pStat === "已繳費 Paid") {
                  isAlreadyPendingOrPaid = true;
                  break;
                }
              }
            }
          }
        }
      } else if (String(targetId).startsWith("裝備：")) {
        var targetOrderId = String(targetId).split("裝備：")[1].split(" ")[0].trim();
        var lSheet = ss.getSheetByName("Loan_Records");
        if (lSheet) {
          var lData = lSheet.getDataRange().getValues();
          var lH = lData[0];
          var lSysIdx = _fi(lH, "系統識別碼");
          var lOrderIdx = _fi(lH, "租借編號");
          var lPayIdx = _fi(lH, "繳費狀態");

          for (var l = 1; l < lData.length; l++) {
            if (lSysIdx > -1 && lData[l][lSysIdx] === userId && lPayIdx > -1 && lOrderIdx > -1) {
              if (targetOrderId === String(lData[l][lOrderIdx] || "")) {
                var pStat = String(lData[l][lPayIdx]);
                if (pStat === "待確認 Checking" || pStat === "已繳費 Paid") {
                  isAlreadyPendingOrPaid = true;
                  break;
                }
              }
            }
          }
        }
      }
    }

    if (isAlreadyPendingOrPaid) {
      replyMessage(replyToken, "⚠️ 繳費確認中，請勿重複回報喔！\n(若是歷史項目，代表該筆帳務已結清)\n─────────────\n⚠️ Payment is under review, please do not resubmit!\n(If this is a past item, it means the balance is cleared.)");
      return;
    }

    var cache = CacheService.getUserCache();
    cache.put(userId + "_payment_type", targetId, 300);

    var promptText = (targetId === "繳交社費") ?
      "一學期(per semester)：$200\n直到畢業(until graduation)：\n$800（Undergraduate）/ $400（Master）\n\n請直接在此對話框輸入包含『匯款金額』與『帳號末 5 碼』的文字\nPlease type your 'payment amount' and the 'last 5 digits of your bank account' in this chat! ✍️" :
      "收到！請直接在此對話框輸入包含『匯款金額』與『帳號末 5 碼』的文字\n\nPlease type your 'payment amount' and the 'last 5 digits of your bank account' in this chat! ✍️";

    var promptFlex = {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [{
          "type": "text",
          "text": "⏳ 等待回報中... Pending...",
          "weight": "bold",
          "color": "#0367D3",
          "size": "sm"
        }, {
          "type": "text",
          "text": promptText,
          "wrap": true,
          "margin": "md",
          "size": "sm",
          "color": "#333333"
        }]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "contents": [{
          "type": "button",
          "style": "secondary",
          "action": {
            "type": "message",
            "label": "❌ 取消回報 Cancel",
            "text": "取消 Cancel"
          }
        }]
      }
    };
    replyFlexMessage(replyToken, "請輸入匯款金額與末5碼", promptFlex);
  }

  // 📌 動作：幹部確認繳費
  else if (action === "admin_confirm") {
    var paramsMap = {};
    params.forEach(function (p) {
      var kv = p.split("=");
      paramsMap[kv[0]] = kv[1];
    });
    var row = parseInt(paramsMap["row"], 10);
    var targetUserId = paramsMap["userId"];
    var pType = decodeURIComponent(postbackData.substring(postbackData.indexOf("&type=") + 6));

    var paymentSheet = ss.getSheetByName("Payments");
    if (paymentSheet && !isNaN(row) && row > 0) {
      var pHeaders = paymentSheet.getRange(1, 1, 1, paymentSheet.getLastColumn()).getValues()[0];
      var pStatusCol = _fi(pHeaders, "對帳狀態") + 1;
      if (pStatusCol > 0) paymentSheet.getRange(row, pStatusCol).setValue("已確認無誤");
    }

    var confirmedList = [];

    // 1. 社費
    if (pType === "繳交社費") {
      var mSheet = ss.getSheetByName("Members");
      if (mSheet) {
        var mData = mSheet.getDataRange().getValues();
        var sysIdx = _fi(mData[0], "系統識別碼");
        var payIdx = _fi(mData[0], "繳費狀態");
        for (var i = 1; i < mData.length; i++) {
          if (sysIdx > -1 && mData[i][sysIdx] === targetUserId) {
            if (String(mData[i][payIdx]).trim() !== "已繳費 Paid") confirmedList.push("🔸 社費 (入社/續社費)");
            break;
          }
        }
      }
    }

    // 2. 活動
    if (pType === "combined" || pType === "activity" || String(pType).startsWith("活動：")) {
      var targetEventName = String(pType).startsWith("活動：") ? String(pType).split("活動：")[1].trim() : "ALL";
      var sSheet = ss.getSheetByName("Signups");
      var eSheet = ss.getSheetByName("Events");
      if (sSheet && eSheet) {
        var sData = sSheet.getDataRange().getValues();
        var eData = eSheet.getDataRange().getDisplayValues();
        var sSysIdx = _fi(sData[0], "系統識別碼");
        var sStatusIdx = _fi(sData[0], "審核結果");
        var sPayIdx = _fi(sData[0], "繳費狀態");
        var sEventIdIdx = _fi(sData[0], "活動編號");
        var eIdIdx = _fi(eData[0], "活動編號");
        var eNameIdx = _fi(eData[0], "活動名稱");

        for (var j = 1; j < sData.length; j++) {
          if (sSysIdx > -1 && sData[j][sSysIdx] === targetUserId) {
            var currentStatus = String(sData[j][sStatusIdx] || "");
            var currentPay = String(sData[j][sPayIdx] || "").trim();
            if (currentStatus.indexOf("正取") > -1 && currentStatus.indexOf("取消") === -1 && currentPay !== "已繳費 Paid") {
              var eName = "";
              for (var k = 1; k < eData.length; k++) {
                if (eIdIdx > -1 && String(eData[k][eIdIdx]).trim() === String(sData[j][sEventIdIdx]).trim()) {
                  eName = eNameIdx > -1 ? String(eData[k][eNameIdx]).replace(/[&=]/g, '') : "未知活動";
                  break;
                }
              }
              if (targetEventName === "ALL" || targetEventName === eName) confirmedList.push("🔸 活動：" + eName);
            }
          }
        }
      }
    }

    // 3. 裝備
    if (pType === "combined" || pType === "equipment" || String(pType).startsWith("裝備：")) {
      var targetOrderId = String(pType).startsWith("裝備：") ? String(pType).split("裝備：")[1].split(" ")[0].trim() : "ALL";
      var lSheet = ss.getSheetByName("Loan_Records");
      if (lSheet) {
        var lData = lSheet.getDataRange().getValues();
        var lSysIdx = _fi(lData[0], "系統識別碼");
        var lOrderIdx = _fi(lData[0], "租借編號");
        var lStatusIdx = _fi(lData[0], "領取/歸還");
        var lPayIdx = _fi(lData[0], "繳費狀態");
        var lName1Idx = _fi(lData[0], "裝備名稱");
        var lName2Idx = _fi(lData[0], "租借項目");
        var lIdIdx = _fi(lData[0], "裝備代號");

        for (var l = 1; l < lData.length; l++) {
          if (lSysIdx > -1 && lData[l][lSysIdx] === targetUserId) {
            var currentStatus = String(lData[l][lStatusIdx] || "");
            var currentPay = String(lData[l][lPayIdx] || "").trim();
            if (currentStatus.indexOf("取消") === -1 && currentStatus.indexOf("歸還") === -1 && currentPay !== "已繳費 Paid") {
              var currentOrder = lOrderIdx > -1 ? String(lData[l][lOrderIdx]).trim() : "";
              if (targetOrderId === "ALL" || targetOrderId === currentOrder) {
                var equipName = _getEquipName(lData[l], lName1Idx, lName2Idx, lIdIdx, "未知裝備");
                confirmedList.push("🔹 裝備：" + equipName);
              }
            }
          }
        }
      }
    }

    processPaymentConfirmation(targetUserId, pType, ss);

    var confirmedItemsStr = confirmedList.length > 0 ? confirmedList.join("\n") : "🔸 " + pType;

    var successMsg = "🎉 繳費成功通知 / Payment Confirmed\n\n" +
      "您好！幹部已確認收到您的款項囉！\nOfficer has confirmed your payment!\n\n" +
      "✅ 【確認項目 / Confirmed Items】\n" + confirmedItemsStr + "\n\n" +
      "感謝您的配合，您的帳務狀態已經更新為「已繳費」！🏔️\nYour account status has been updated to 'Paid'.";
    pushMessage(targetUserId, successMsg);

    // 查詢繳費人姓名
    var userName = "未知社員";
    var isOfficial = "否";
    var memberSheetForName = ss.getSheetByName("Members");
    if (memberSheetForName) {
      var mData = memberSheetForName.getDataRange().getValues();
      var mH = mData[0];
      var mSysIdx = _fi(mH, "系統識別碼");
      var mNameIdx = _fi(mH, "姓名");
      var mPayIdx = _fi(mH, "繳費狀態");

      for (var i = 1; i < mData.length; i++) {
        if (mSysIdx > -1 && mData[i][mSysIdx] === targetUserId) {
          if (mNameIdx > -1) userName = String(mData[i][mNameIdx]).trim() || "未知社員";
          var payStatus = (mPayIdx > -1) ? String(mData[i][mPayIdx]).trim() : "";
          if (payStatus.indexOf("已繳") > -1 || payStatus === "是") isOfficial = "是";
          break;
        }
      }
    }

    var adminMsg = "🔔 【幹部通知：繳費確認完成】\n\n" +
      "👤 繳費人：" + userName + " (" + isOfficial + "社員)\n" +
      "─────────────\n" +
      "已成功將該筆帳務標記為「已確認無誤」，並同步更新社員繳費狀態為「已繳費」！\n\n" +
      "👉 詳細項目：\n" +
      confirmedItemsStr +
      "\n\n系統已自動發送詳細項目通知給社員囉！";
    replyAdminMessage(replyToken, adminMsg);
  }

  // 📌 動作：回到取消選單
  else if (action === "cancel_menu") {
    sendCancelMenu(replyToken, userId, ss);
  }
}

// ⭐️ 文字指令分流 (Text Command Router)
// 【函式說明】
// 當使用者在 LINE 對話框輸入純文字（而不是按按鈕）時，會進入這個函式。
// 這裡就像是總機的「分機轉接表」，會根據使用者輸入的關鍵字，
// 決定要呼叫哪個對應的功能模組。
// 這裡也包含了呼叫 AI 助理「小岳」的專屬通道。
function handleTextCommand(replyToken, userId, text, sourceType) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // AI 聊天觸發
  if (text.startsWith("小岳") || text.startsWith("Yue") || text.startsWith("yue")) {
    var question = text.substring(2).trim();
    if (question === "") {
      replyMessage(replyToken, "找小岳嗎？有什麼我可以幫忙的？⛰️\n(請輸入：小岳 加上你的問題，例如：小岳 新手需要準備什麼裝備？)\n─────────────\nLooking for Yue? How can I help you? ⛰️\n(Type 'Yue' followed by your question, e.g., Yue What gear do beginners need?)");
      return;
    }
    replyMessage(replyToken, talkToGemini(question));
    return;
  }

  // 核心圖文選單指令對應
  if (text === "我的狀態" || text === "我的狀態 My Status") handleStatusQuery(replyToken, userId, ss);
  else if (text === "填寫資料" || text === "填寫資料 Register") sendRegisterForm(replyToken, userId);
  else if (text === "最新活動" || text === "最新活動 Activities") sendEventList(replyToken, ss);
  else if (text === "器材借用" || text === "器材借用 Equipment Loan") {
    replyMessage(replyToken, "🏕️ 歡迎使用裝備租借系統！\n請點擊下方連結進入多選借用表單：\n\nhttps://liff.line.me/2009217429-zXvGeSrI");
  }
  else if (text === "取消預約" || text === "取消預約 Cancel") sendCancelMenu(replyToken, userId, ss);
  else if (text === "繳費系統" || text === "繳費系統 Payment System") {
    replyMessage(replyToken, "💰 歡迎使用繳費與對帳系統！\n請點擊下方連結進入多選結帳表單：\n\nhttps://liff.line.me/2009217429-u7OCkmQO");
  }
  else if (text === "繳費紀錄" || text === "繳費紀錄 Payment History") sendPaymentHistory(replyToken, userId, ss);
  else if (text === "意見與回饋" || text === "意見與回饋 Feedback") sendFeedbackLink(replyToken);
  else if (text === "其他" || text === "更多服務" || text === "更多服務 More Services") sendMoreOptionsMenu(replyToken);
  else if (text === "幹部是誰" || text === "幹部是誰 Officers") sendOfficerMenu(replyToken, ss);
  else {
    // 阻擋群組內的無效指令，避免對話暴走洗版 (這也是之前引發「帯域幅の上限を超えています」流量耗盡的主因！)
    if (sourceType === "group" || sourceType === "room") return;

    replyMessage(replyToken, "嗨！我是登山社助理小岳 ⛰️\n請點選下方圖文選單，來查看所有功能！\n\n💡 AI 助理隱藏玩法：\n如果有登山知識或社團規章的問題，在句首加上「小岳」就可以直接問我喔！\n(例如：小岳 新手該準備什麼裝備？)\n─────────────\nHi! I am Xiao Yue, the Mountaineering Club Assistant ⛰️\nPlease use the menu below for more features!\n\n💡 AI Chat Feature:\nHave questions about hiking or the club? Just start your message with \"Yue\" to ask me!\n(e.g., Yue What gear do beginners need?)");
  }
}

// ⭐️ 產生合併繳費與單筆回報卡片 (無懼空欄位防彈版 + 雙語 UI 版)
// 【函式說明】
// 這是系統最複雜的財務核心！當社員點擊「繳費系統」時，
// 系統會去「活動報名表」、「裝備租借表」中，把該社員所有「尚未繳費」的項目全部撈出來。
// 接著，它會自動計算總金額，並產生一組精美的 LINE 輪播卡片 (Carousel)。
// 包含：總金額合併結帳卡、單筆活動繳費卡、單筆裝備繳費卡，以及最後一張固定的社費卡。
function sendConsolidatedPaymentMenu(replyToken, userId, ss) {
  var profileCheck = _checkProfileComplete(userId, ss, "payment");
  if (profileCheck.missingFields.indexOf("NOT_FOUND") > -1) {
    replyMessage(replyToken, "⚠️ 讀取失敗：系統找不到您的社員資料！\n請先完成「填寫資料」後再進入繳費系統。\n─────────────\n⚠️ Access Failed: Member profile not found!\nPlease click 'Register' in the menu to complete your profile first.");
    return;
  }
  if (profileCheck.missingFields.length > 0) {
    replyMessage(replyToken, "⚠️ 讀取失敗：您的個人資料尚不完整！\n\n為了對帳與後續聯絡順暢，請先點擊選單的「填寫資料」，補齊以下必填資訊：\n\n👉 " + profileCheck.missingFields.join("\n👉 ") + "\n\n完成資料更新後，再回來點選繳費系統喔！💸\n─────────────\n⚠️ Access Failed: Incomplete Profile!\nPlease update your profile first before entering the payment system.");
    return;
  }

  var activityDebts = [];
  var equipmentDebts = [];
  var bankInfo = "銀行 Bank：(824) 連線商業銀行 (LINE Bank)\n帳號 Account：111019636700\n戶名 Name：曹洧祥";

  // 階段一：抓取活動欠款
  var signupSheet = ss.getSheetByName("Signups");
  var eventSheet = ss.getSheetByName("Events");

  if (signupSheet && eventSheet) {
    var sData = signupSheet.getDataRange().getValues();
    var eData = eventSheet.getDataRange().getDisplayValues();
    var sH = sData[0],
      eH = eData[0];
    var sSysIdx = _fi(sH, "系統識別碼"),
      sStatusIdx = _fi(sH, "審核結果"),
      sPayIdx = _fi(sH, "繳費狀態"),
      sEventIdIdx = _fi(sH, "活動編號");
    var eIdIdx = _fi(eH, "活動編號"),
      eNameIdx = _fi(eH, "活動名稱");
    var eCostIdx = eH.findIndex(function (h) {
      return String(h).includes("預計費用") || String(h).includes("費用");
    });

    for (var i = 1; i < sData.length; i++) {
      if (sSysIdx > -1 && sData[i][sSysIdx] === userId) {
        var status = (sStatusIdx > -1) ? String(sData[i][sStatusIdx] || "").trim() : "";
        var payStatus = (sPayIdx > -1) ? String(sData[i][sPayIdx] || "").trim() : "未繳費 Unpaid";
        if (status.indexOf("正取") > -1 && status.indexOf("取消") === -1 && payStatus !== "已繳費 Paid" && payStatus !== "待確認 Checking") {
          var targetEId = (sEventIdIdx > -1) ? String(sData[i][sEventIdIdx]).trim() : "";
          for (var j = 1; j < eData.length; j++) {
            if (eIdIdx > -1 && String(eData[j][eIdIdx]).trim() === targetEId) {
              var eName = (eNameIdx > -1 && eData[j][eNameIdx]) ? eData[j][eNameIdx] : "未知活動";
              var eCostStr = (eCostIdx > -1) ? String(eData[j][eCostIdx] || "0") : "0";
              var eCost = parseInt(eCostStr.replace(/\D/g, ''), 10) || 0;
              var safeName = String(eName).replace(/[&=]/g, '');
              if (eCost > 0) activityDebts.push({
                name: safeName,
                amount: eCost
              });
              break;
            }
          }
        }
      }
    }
  }

  // 階段二：抓取裝備欠款
  var loanSheet = ss.getSheetByName("Loan_Records");
  if (loanSheet) {
    var lData = loanSheet.getDataRange().getValues();
    var lH = lData[0];
    var lSysIdx = _fi(lH, "系統識別碼"),
      lStatusIdx = _fi(lH, "領取/歸還"),
      lPayIdx = _fi(lH, "繳費狀態");
    var lCostIdx = lH.findIndex(function (h) {
      return String(h).includes("應繳費用") || String(h).includes("費用");
    });
    var lOrderIdx = _fi(lH, "租借編號");
    var lName1Idx = _fi(lH, "裝備名稱"),
      lName2Idx = _fi(lH, "租借項目"),
      lIdIdx = _fi(lH, "裝備代號");

    for (var k = 1; k < lData.length; k++) {
      if (lSysIdx > -1 && lData[k][lSysIdx] === userId) {
        var lStatus = (lStatusIdx > -1) ? String(lData[k][lStatusIdx] || "").trim() : "";
        var equipPayStatus = (lPayIdx > -1) ? String(lData[k][lPayIdx] || "").trim() : "未繳費 Unpaid";
        var cost = (lCostIdx > -1) ? parseInt(String(lData[k][lCostIdx] || "0").replace(/\D/g, ''), 10) || 0 : 0;
        var orderId = (lOrderIdx > -1) ? String(lData[k][lOrderIdx]).trim() : "";
        var equipName = _getEquipName(lData[k], lName1Idx, lName2Idx, lIdIdx, "未知裝備(名稱遺失)");
        if (lStatus.indexOf("取消") === -1 && lStatus.indexOf("歸還") === -1 && cost > 0 && equipPayStatus !== "已繳費 Paid" && equipPayStatus !== "待確認 Checking") {
          equipmentDebts.push({
            name: equipName.replace(/[&=]/g, ''),
            amount: cost,
            orderId: orderId
          });
        }
      }
    }
  }

  // 階段三：結算總額
  var activityTotal = activityDebts.reduce(function (sum, item) {
    return sum + item.amount;
  }, 0);
  var equipmentTotal = equipmentDebts.reduce(function (sum, item) {
    return sum + item.amount;
  }, 0);
  var totalAmount = activityTotal + equipmentTotal;
  var hasActivity = activityTotal > 0;
  var hasEquipment = equipmentTotal > 0;

  var textMessage;
  if (hasActivity || hasEquipment) {
    textMessage = {
      "type": "text",
      "text": "💡 貼心提醒：若您有多項待繳費用，建議可以參考第一頁的【總費用】一次繳清，省去多次匯款麻煩。\n您也可以向右滑動，針對單一項目個別繳費喔！\n─────────────\n💡 Tip: You can pay multiple pending fees at once using the [Total Fee] card. Swipe right to pay for individual items!\n\n🏦 匯款帳戶 Bank Info：\n" + bankInfo + "\n\n回報完成後起重新點選「繳費系統」，查看最新繳費狀態\n─────────────\nAfter completing the report, please click \"Payment System\" again to check the latest payment status."
    };
  } else {
    textMessage = {
      "type": "text",
      "text": "🎉 太棒了！您目前沒有任何未繳的活動或裝備費用。\n─────────────\n🎉 Great! You have no pending payments for activities or equipment.\n\n💡 若您尚未繳交本學期社費，可以透過下方卡片進行回報喔！\n💡 If you haven't paid the club membership fee, you can do so below!\n\n🏦 匯款帳戶 Bank Info：\n" + bankInfo
    };
  }

  // 階段四：卡片 UI 產生器
  var carouselBubbles = [];

  function createDetailBoxes(items) {
    return items.map(function (item) {
      return {
        "type": "box",
        "layout": "horizontal",
        "margin": "xs",
        "contents": [{
          "type": "text",
          "text": item.name,
          "size": "sm",
          "color": "#555555",
          "flex": 2,
          "wrap": true
        }, {
          "type": "text",
          "text": "$" + item.amount,
          "size": "sm",
          "color": "#111111",
          "align": "end",
          "flex": 1
        }]
      };
    });
  }

  function createTotalBubble(title, items, total, postbackType) {
    return {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [{
          "type": "text",
          "text": title,
          "weight": "bold",
          "size": "md",
          "color": "#1DB446"
        }, {
          "type": "separator",
          "margin": "md"
        }, {
          "type": "box",
          "layout": "vertical",
          "margin": "md",
          "spacing": "sm",
          "contents": createDetailBoxes(items)
        }, {
          "type": "separator",
          "margin": "md"
        }, {
          "type": "box",
          "layout": "horizontal",
          "margin": "md",
          "contents": [{
            "type": "text",
            "text": "總計 Total",
            "size": "md",
            "color": "#555555"
          }, {
            "type": "text",
            "text": "$" + total,
            "size": "lg",
            "color": "#E54545",
            "align": "end",
            "weight": "bold"
          }]
        }]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "spacing": "sm",
        "contents": [{
          "type": "button",
          "style": "primary",
          "color": "#1DB446",
          "action": {
            "type": "postback",
            "label": "合併繳清 Pay All",
            "data": "action=upload_proof&type=" + postbackType,
            "displayText": "我要上傳匯款證明 / Upload Proof"
          }
        }]
      }
    };
  }

  function createIndividualBubble(tagText, tagColor, itemName, amount, targetId) {
    return {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [{
          "type": "text",
          "text": tagText,
          "color": tagColor,
          "size": "xs",
          "weight": "bold"
        }, {
          "type": "text",
          "text": itemName,
          "weight": "bold",
          "size": "md",
          "margin": "sm",
          "wrap": true
        }, {
          "type": "text",
          "text": "應繳金額 Amount: $" + amount,
          "size": "sm",
          "color": "#FF3333",
          "margin": "sm",
          "weight": "bold"
        }]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "contents": [{
          "type": "button",
          "style": "primary",
          "color": tagColor,
          "action": {
            "type": "postback",
            "label": "單筆回報 Pay Single",
            "data": "action=ready_to_pay&targetId=" + targetId
          }
        }]
      }
    };
  }

  // 階段五：組裝卡片
  if (hasActivity && hasEquipment) carouselBubbles.push(createTotalBubble("活動+裝備總費用 / Total Fee", [].concat(activityDebts, equipmentDebts), totalAmount, "combined"));
  if (hasActivity) carouselBubbles.push(createTotalBubble("活動明細 / Activities", activityDebts, activityTotal, "activity"));
  if (hasEquipment) carouselBubbles.push(createTotalBubble("裝備明細 / Equipments", equipmentDebts, equipmentTotal, "equipment"));

  for (var a = 0; a < activityDebts.length; a++) {
    if (carouselBubbles.length >= 9) break;
    carouselBubbles.push(createIndividualBubble("📅 活動繳費 Activity", "#FF9800", activityDebts[a].name, activityDebts[a].amount, "活動：" + activityDebts[a].name));
  }
  for (var b = 0; b < equipmentDebts.length; b++) {
    if (carouselBubbles.length >= 9) break;
    carouselBubbles.push(createIndividualBubble("🏕️ 裝備繳費 Equipment", "#0367D3", equipmentDebts[b].name, equipmentDebts[b].amount, "裝備：" + equipmentDebts[b].orderId + " " + equipmentDebts[b].name));
  }

  // 階段六：社費卡片
  var memberSheet = ss.getSheetByName("Members");
  var payStatus = "未繳費 Unpaid";
  var expireDate = "尚未核發/尚未繳費 (Not issued/Unpaid)";
  if (memberSheet) {
    var mData = memberSheet.getDataRange().getValues();
    var mHead = mData[0];
    var mSysIdx = _fi(mHead, "系統識別碼"),
      mPayIdx = _fi(mHead, "繳費狀態");
    var mExpireIdx = mHead.findIndex(function (h) {
      return String(h).includes("到期日") || String(h).includes("社籍");
    });
    for (var m = 1; m < mData.length; m++) {
      if (mSysIdx > -1 && mData[m][mSysIdx] === userId) {
        payStatus = (mPayIdx > -1 && mData[m][mPayIdx]) ? String(mData[m][mPayIdx]).trim() : "未繳費 Unpaid";
        if (mExpireIdx > -1 && mData[m][mExpireIdx]) {
          var d = new Date(mData[m][mExpireIdx]);
          expireDate = !isNaN(d.getTime()) ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy/MM/dd") : String(mData[m][mExpireIdx]).trim();
        }
        break;
      }
    }
  }
  var statusColor = (payStatus === "已繳費 Paid" || payStatus === "已繳" || payStatus === "待確認 Checking" || payStatus === "是") ? "#1DB446" : "#FF3333";

  carouselBubbles.push({
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
        "type": "text",
        "text": "👤 社籍與社費 / Membership",
        "color": "#1DB446",
        "size": "xs",
        "weight": "bold"
      }, {
        "type": "text",
        "text": "繳交入社/續社費\nPay Membership Fee",
        "weight": "bold",
        "size": "md",
        "margin": "sm",
        "wrap": true
      }, {
        "type": "text",
        "text": "狀態 Status:\n " + (payStatus || "無紀錄"),
        "size": "xs",
        "color": statusColor,
        "margin": "sm",
        "weight": "bold"
      }, {
        "type": "text",
        "text": "期限 Expiry: ",
        "size": "xs",
        "color": "#666666",
        "margin": "xs"
      }, {
        "type": "text",
        "text": "  " + expireDate,
        "size": "xs",
        "color": "#666666",
        "margin": "xs"
      }]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
        "type": "button",
        "style": "primary",
        "color": "#1DB446",
        "action": {
          "type": "postback",
          "label": "回報繳費 Pay",
          "data": "action=ready_to_pay&targetId=繳交社費"
        }
      }]
    }
  });

  var flexMessage = {
    "type": "flex",
    "altText": "您的繳費系統明細 / Payment Details",
    "contents": {
      "type": "carousel",
      "contents": carouselBubbles
    }
  };
  replyMultiMessages(replyToken, [textMessage, flexMessage]);
}

// ⭐️ 發送歷史繳費紀錄

// 📜 全新功能：發送歷史繳費紀錄清單 (Payments 帳本集中查詢版)
function sendPaymentHistory(replyToken, userId, ss) {
  var profileCheck = _checkProfileComplete(userId, ss, "payment");
  if (profileCheck.missingFields.indexOf("NOT_FOUND") > -1) {
    replyMessage(replyToken, "⚠️ 讀取失敗：系統找不到您的社員資料！\n請先完成「填寫資料」後再查看歷史繳費紀錄。\n─────────────\n⚠️ Access Failed: Member profile not found!\nPlease click 'Register' in the menu to complete your profile first.");
    return;
  }
  if (profileCheck.missingFields.length > 0) {
    replyMessage(replyToken, "⚠️ 讀取失敗：您的個人資料尚不完整！\n\n為了對帳與核對身分，請先點擊選單的「填寫資料」，補齊以下必填資訊：\n\n👉 " + profileCheck.missingFields.join("\n👉 ") + "\n\n完成資料更新後，再回來點選歷史繳費紀錄喔！\n─────────────\n⚠️ Access Failed: Incomplete Profile!\nPlease update your profile first before viewing your payment history.");
    return;
  }

  var pSheet = ss.getSheetByName("Payments");
  if (!pSheet) {
    replyMessage(replyToken, "⚠️ 系統找不到 Payments 分頁，請聯絡幹部確認設定。");
    return;
  }

  var pData = pSheet.getDataRange().getValues();
  var pH = pData[0];
  var timeIdx = pH.findIndex(function (h) {
    return String(h).includes("時間") || String(h).includes("日期");
  });
  var sysIdx = _fi(pH, "系統識別碼"),
    eventIdx = _fi(pH, "活動名稱"),
    equipIdx = _fi(pH, "裝備名稱"),
    itemIdx = _fi(pH, "繳費項目");
  var statusIdx = pH.findIndex(function (h) {
    return String(h).includes("對帳狀態") || String(h).includes("狀態");
  });

  var historyGroups = {};
  var hasRecord = false;

  for (var i = 1; i < pData.length; i++) {
    if (sysIdx > -1 && pData[i][sysIdx] === userId) {
      var status = statusIdx > -1 ? String(pData[i][statusIdx]).trim() : "";
      if (status.indexOf("確認") > -1 || status.indexOf("無誤") > -1 || status.indexOf("已繳") > -1) {
        hasRecord = true;

        var rawDate = timeIdx > -1 ? pData[i][timeIdx] : "";
        var dateStr = "未知日期";
        if (rawDate) {
          var d = new Date(rawDate);
          dateStr = !isNaN(d.getTime()) ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy/MM/dd") : String(rawDate).split(" ")[0];
        }
        if (!historyGroups[dateStr]) historyGroups[dateStr] = [];

        var eventName = eventIdx > -1 ? String(pData[i][eventIdx]).trim() : "";
        var equipName = equipIdx > -1 ? String(pData[i][equipIdx]).trim() : "";
        var payItem = itemIdx > -1 ? String(pData[i][itemIdx]).trim() : "";

        if (eventName && eventName !== "無" && eventName !== "-") {
          eventName.split(/\r?\n/).forEach(function (line) {
            if (line.trim()) historyGroups[dateStr].push(line.trim());
          });
        }
        if (equipName && equipName !== "無" && equipName !== "-") {
          equipName.split(/\r?\n/).forEach(function (line) {
            if (line.trim()) historyGroups[dateStr].push(line.trim());
          });
        }
        if (payItem.indexOf("社費") > -1 || ((!eventName || eventName === "無" || eventName === "-") && (!equipName || equipName === "無" || equipName === "-") && payItem === "")) {
          historyGroups[dateStr].push("社費 Membership Fee");
        }
        if ((!eventName || eventName === "無") && (!equipName || equipName === "無")) {
          historyGroups[dateStr].push("社費 Membership Fee");
        }
      }
    }
  }

  if (!hasRecord || Object.keys(historyGroups).length === 0) {
    replyMessage(replyToken, "📜 【歷史繳費紀錄 / Payment History】\n\n目前系統中沒有您的已繳費紀錄喔！\nNo payment history found in the system.");
    return;
  }

  var blocks = [];
  for (var dateKey in historyGroups) {
    var uniqueItems = historyGroups[dateKey].filter(function (item, pos, arr) {
      return arr.indexOf(item) === pos;
    });
    if (uniqueItems.length > 0) blocks.push(dateKey + "\n" + uniqueItems.join("\n"));
  }
  replyMessage(replyToken, "📜 【歷史繳費紀錄 / Payment History】\n\n" + blocks.join("\n─────────────\n"));
}

// ⭐️ 處理繳費回報 (動態明細解析 + 寫入對帳單版)
// 【函式說明】
// 當社員在「等待回報中」的狀態下，輸入了「匯款金額與末5碼」，就會進入這個函式。
// 這個函式會做幾件大事：
// 1. 查出這位社員的名字。
// 2. 根據他剛剛點選的繳費類別 (社費/單筆活動/合併結帳)，去各大表單把對應的「未繳費」項目與金額撈出來。
// 3. 自動在「Payments (對帳單)」分頁新增一列詳細的交易紀錄。
// 4. 把該項目的狀態從「未繳費」改成「待確認」。
// 5. 傳送精美的 Flex 卡片給幹部群組，讓幹部可以一鍵按下「確認無誤」。
function handlePaymentInput(replyToken, userId, inputData, paymentType, inputType) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var memberSheet = ss.getSheetByName("Members");
  var paymentSheet = ss.getSheetByName("Payments");

  if (!paymentSheet) {
    paymentSheet = ss.insertSheet("Payments");
    paymentSheet.appendRow(["Timestamp", "系統識別碼", "姓名", "繳費項目", "活動名稱", "裝備名稱", "帳號末5碼/備註", "對帳狀態"]);
  }

  // 階段一：尋找社員姓名
  var userName = "未知社員";
  if (memberSheet) {
    var mData = memberSheet.getDataRange().getValues();
    var mH = mData[0];
    var mSysIdx = _fi(mH, "系統識別碼"),
      mNameIdx = _fi(mH, "姓名");
    for (var i = mData.length - 1; i >= 1; i--) {
      if (mSysIdx > -1 && mData[i][mSysIdx] === userId) {
        userName = (mNameIdx > -1 && mData[i][mNameIdx]) ? String(mData[i][mNameIdx]).trim() : "未知社員";
        break;
      }
    }
  }

  // 階段二：處理證明
  var proofContent = "",
    displayProof = "";
  if (inputType === "image") {
    replyMessage(replyToken, "⚠️ 抱歉，目前系統僅支援「文字回報」。\n\n請重新點選繳費項目，並直接輸入「匯款金額與帳號末5碼」即可，謝謝您的配合！\n─────────────\n⚠️ Sorry, the system currently only supports 'Text Reports'.\n\nPlease re-select the payment item and directly type the 'Amount & Last 5 Digits of Account'. Thank you for your cooperation!");
    CacheService.getUserCache().remove(userId + "_payment_type");
    return;
  } else {
    proofContent = "文字：" + inputData;
    displayProof = inputData;
  }

  // 階段三：解析細項
  var actDetails = "",
    eqDetails = "",
    typeStr = "",
    totalAmount = 0;

  if (paymentType === "繳交社費") {
    typeStr = "繳交社費";
    totalAmount = "請見備註";
  } else {
    // 處理活動
    if (paymentType === "activity" || paymentType === "combined" || String(paymentType).startsWith("活動：")) {
      var targetEventName = String(paymentType).startsWith("活動：") ? String(paymentType).split("活動：")[1].trim() : "ALL";
      var sSheet = ss.getSheetByName("Signups"),
        eSheet = ss.getSheetByName("Events");
      if (sSheet && eSheet) {
        var sData = sSheet.getDataRange().getValues(),
          eData = eSheet.getDataRange().getDisplayValues();
        var sH = sData[0],
          eH = eData[0];
        var sSysIdx = _fi(sH, "系統識別碼"),
          sStatIdx = _fi(sH, "審核結果"),
          sPayIdx = _fi(sH, "繳費狀態"),
          sEventIdIdx = _fi(sH, "活動編號");
        var eIdIdx = _fi(eH, "活動編號"),
          eNameIdx = _fi(eH, "活動名稱");
        var eCostIdx = eH.findIndex(function (h) {
          return String(h).includes("預計費用") || String(h).includes("費用");
        });

        for (var s = 1; s < sData.length; s++) {
          var cStatus = sStatIdx > -1 ? String(sData[s][sStatIdx]) : "";
          var cPayStatus = sPayIdx > -1 ? String(sData[s][sPayIdx]).trim() : "未繳費 Unpaid";
          if (sSysIdx > -1 && sData[s][sSysIdx] === userId && cStatus.indexOf("正取") > -1 && cStatus.indexOf("取消") === -1 && cPayStatus !== "已繳費 Paid" && cPayStatus !== "待確認 Checking") {
            var currentSignupEventId = sEventIdIdx > -1 ? String(sData[s][sEventIdIdx]).trim() : "";
            for (var e = 1; e < eData.length; e++) {
              if (eIdIdx > -1 && String(eData[e][eIdIdx]).trim() === currentSignupEventId) {
                var eventNameRaw = (eNameIdx > -1 && eData[e][eNameIdx]) ? String(eData[e][eNameIdx]) : "未知活動";
                var safeName = eventNameRaw.replace(/[&=]/g, '');
                if (targetEventName === "ALL" || targetEventName === safeName) {
                  var eCostStr = eCostIdx > -1 ? String(eData[e][eCostIdx]) : "0";
                  var eCost = parseInt(eCostStr.replace(/\D/g, ''), 10) || 0;
                  if (eCost > 0) {
                    actDetails += safeName + "($" + eCost + ")\n";
                    totalAmount += eCost;
                  }
                }
                break;
              }
            }
          }
        }
      }
    }

    // 處理裝備
    if (paymentType === "equipment" || paymentType === "combined" || String(paymentType).startsWith("裝備：")) {
      var targetOrderId = String(paymentType).startsWith("裝備：") ? String(paymentType).split("裝備：")[1].split(" ")[0].trim() : "ALL";
      var lSheet = ss.getSheetByName("Loan_Records");
      if (lSheet) {
        var lData = lSheet.getDataRange().getValues();
        var lH = lData[0];
        var lSysIdx = _fi(lH, "系統識別碼"),
          lOrderIdx = _fi(lH, "租借編號"),
          lPayIdx = _fi(lH, "繳費狀態"),
          lStatusIdx = _fi(lH, "領取/歸還");
        var lCostIdx = lH.findIndex(function (h) {
          return String(h).includes("應繳費用") || String(h).includes("費用");
        });
        var lName1Idx = _fi(lH, "裝備名稱"),
          lName2Idx = _fi(lH, "租借項目"),
          lIdIdx = _fi(lH, "裝備代號");

        for (var l = 1; l < lData.length; l++) {
          var lStatStr = lStatusIdx > -1 ? String(lData[l][lStatusIdx]) : "";
          var eqPayStatus = lPayIdx > -1 ? String(lData[l][lPayIdx]).trim() : "未繳費 Unpaid";
          if (lSysIdx > -1 && lData[l][lSysIdx] === userId && lStatStr.indexOf("取消") === -1 && lStatStr.indexOf("歸還") === -1 && eqPayStatus !== "已繳費 Paid" && eqPayStatus !== "待確認 Checking") {
            var eqCostStr = lCostIdx > -1 ? String(lData[l][lCostIdx]) : "0";
            var eqCost = parseInt(eqCostStr.replace(/\D/g, ''), 10) || 0;
            var currentOrder = lOrderIdx > -1 ? String(lData[l][lOrderIdx]).trim() : "";
            if (eqCost > 0 && (targetOrderId === "ALL" || targetOrderId === currentOrder)) {
              var equipName = _getEquipName(lData[l], lName1Idx, lName2Idx, lIdIdx, "未知裝備");
              eqDetails += equipName + "($" + eqCost + ")\n";
              totalAmount += eqCost;
            }
          }
        }
      }
    }

    if (paymentType === "combined") typeStr = "合併結帳";
    else if (paymentType === "activity" || String(paymentType).startsWith("活動：")) typeStr = "單繳活動";
    else typeStr = "單繳裝備";
  }

  actDetails = actDetails.trim();
  eqDetails = eqDetails.trim();

  // 階段四：寫入 Payments 對帳表
  var pHeaders = paymentSheet.getRange(1, 1, 1, paymentSheet.getLastColumn()).getValues()[0];
  var pRowData = new Array(pHeaders.length).fill("");
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");

  function placePData(keyword, value) {
    var idx = _fi(pHeaders, keyword);
    if (idx > -1) pRowData[idx] = value;
  }

  placePData("Timestamp", now);
  placePData("繳款時間", now);
  placePData("系統識別碼", userId);
  placePData("姓名", userName);
  placePData("繳費項目", typeStr);
  placePData("活動名稱", actDetails);
  placePData("裝備名稱", eqDetails);
  placePData("帳號末5碼/備註", proofContent);
  placePData("證明", proofContent);
  placePData("對帳狀態", "待確認 Checking");
  paymentSheet.appendRow(pRowData);

  // 階段五：收尾
  markAsPending(userId, paymentType, ss);
  CacheService.getUserCache().remove(userId + "_payment_type");

  replyMessage(replyToken, "✅ 已經收到您的匯款資訊囉！\n系統已為您提交對帳申請。待幹部確認無誤後，狀態就會自動更新為已繳費。🙌\n─────────────\n✅ Your payment information has been received!\nThe system has submitted your reconciliation request. Once confirmed by the officer, the status will automatically update to 'Paid'. 🙌");

  var specificItems = "";
  if (actDetails) specificItems += "🔸 活動：\n" + actDetails + "\n";
  if (eqDetails) specificItems += "🔹 裝備：\n" + eqDetails + "\n";
  if (!specificItems.trim()) specificItems = "🔸 項目：" + typeStr;
  var displayAmount = (typeof totalAmount === 'number' && totalAmount > 0) ? "$" + totalAmount : String(totalAmount);

  var adminFlex = {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
        "type": "text",
        "text": "🔔 新繳費回報",
        "weight": "bold",
        "color": "#1DB446",
        "size": "md"
      }, {
        "type": "separator",
        "margin": "md"
      }, {
        "type": "text",
        "text": "繳款人：" + userName,
        "margin": "md",
        "size": "sm",
        "weight": "bold"
      }, {
        "type": "text",
        "text": "回報明細：\n" + specificItems.trim(),
        "size": "sm",
        "wrap": true,
        "margin": "sm",
        "color": "#555555"
      }, {
        "type": "text",
        "text": "總金額：" + displayAmount,
        "size": "sm",
        "color": "#FF3333",
        "weight": "bold",
        "margin": "sm"
      }, {
        "type": "text",
        "text": "證明：" + displayProof,
        "size": "sm",
        "wrap": true,
        "margin": "sm",
        "color": "#333333"
      }]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
        "type": "button",
        "style": "primary",
        "color": "#1DB446",
        "action": {
          "type": "postback",
          "label": "✅ 確認無誤並發通知",
          "data": "action=admin_confirm&row=" + paymentSheet.getLastRow() + "&userId=" + userId + "&type=" + encodeURIComponent(paymentType)
        }
      }]
    }
  };

  if (paymentType === "繳交社費") {
    adminFlex.body.contents.push({
      "type": "separator",
      "margin": "md"
    }, {
      "type": "text",
      "text": "⚠️ 注意：此為社費繳交，請幹部務必至「Members」分頁手動更新該社員的【社籍到期日】！",
      "size": "xs",
      "color": "#FF9800",
      "wrap": true,
      "margin": "md",
      "weight": "bold"
    });
  }

  if (typeof pushAdminFlexMessage === "function") {
    pushAdminFlexMessage("收到新的繳費回報", adminFlex);
  } else if (typeof pushAdminMessage === "function") {
    pushAdminMessage({
      "type": "flex",
      "altText": "收到新的繳費回報",
      "contents": adminFlex
    });
  }
}

// ⭐️ 全新：幹部手動更新狀態觸發器 (全動態防彈版)
// 【函式說明】
// 這是一個特殊的「Google 試算表觸發器 (Simple Trigger)」。
// 每當有人(通常是幹部)在試算表中「手動編輯」任何一格資料時，這個函式就會默默在背後啟動。
// 它負責兩大自動化任務：
// 1. 【裝備歸還自動化】：當幹部把裝備狀態改成「已歸還」時，自動把庫存加回去。
// 2. 【繳費對帳自動化】：當幹部把對帳單改成「已確認無誤」時，自動發 LINE 通知給該社員。
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();

  // 裝備歸還觸發器
  if (sheetName === "Loan_Records") {
    var lHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var statusCol = _fi(lHeaders, "領取/歸還") + 1;
    if (statusCol > 0 && e.range.getColumn() === statusCol) {
      if (e.value === "已歸還 Returned" && e.oldValue !== "已歸還 Returned") {
        var row = e.range.getRow();
        var equipIdCol = _fi(lHeaders, "裝備代號") + 1;
        var qtyCol = _fi(lHeaders, "借用數量") + 1;
        var equipId = (equipIdCol > 0) ? sheet.getRange(row, equipIdCol).getValue() : "";
        var qty = (qtyCol > 0) ? sheet.getRange(row, qtyCol).getValue() : 0;

        var equipSheet = e.source.getSheetByName("Equipments");
        if (equipSheet && equipId) {
          var eData = equipSheet.getDataRange().getValues();
          var eH = eData[0];
          var eIdIdx = _fi(eH, "裝備代號"),
            eStockIdx = _fi(eH, "剩餘數量");
          for (var i = 1; i < eData.length; i++) {
            if (eIdIdx > -1 && eData[i][eIdIdx] === equipId && eStockIdx > -1) {
              equipSheet.getRange(i + 1, eStockIdx + 1).setValue((parseInt(eData[i][eStockIdx], 10) || 0) + parseInt(qty, 10));
              e.source.toast("✅ 已將 " + qty + " 個加回庫存！", "系統自動通知", 5);
              break;
            }
          }
        }
      }
    }
  }

  // Payments 繳費確認觸發器
  if (sheetName === "Payments") {
    var pHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var pStatusCol = _fi(pHeaders, "對帳狀態") + 1;
    if (pStatusCol > 0 && e.range.getColumn() === pStatusCol && e.value === "已確認無誤" && e.oldValue !== "已確認無誤") {
      var row = e.range.getRow();
      var sysIdCol = _fi(pHeaders, "系統識別碼") + 1;
      var userId = (sysIdCol > 0) ? sheet.getRange(row, sysIdCol).getValue() : "";

      if (!userId) {
        var nameCol = _fi(pHeaders, "姓名") + 1;
        var userName = (nameCol > 0) ? sheet.getRange(row, nameCol).getValue() : "";
        if (userName) {
          var mSheet = e.source.getSheetByName("Members");
          if (mSheet) {
            var mData = mSheet.getDataRange().getValues();
            var mNameIdx = _fi(mData[0], "姓名"),
              mSysIdx = _fi(mData[0], "系統識別碼");
            for (var m = 1; m < mData.length; m++) {
              if (mNameIdx > -1 && mData[m][mNameIdx] === userName) {
                userId = (mSysIdx > -1) ? mData[m][mSysIdx] : "";
                break;
              }
            }
          }
        }
      }

      if (userId) {
        pushMessage(userId, "🎉 繳費成功通知 / Payment Confirmed\n\n您好！幹部已確認收到您的款項囉！\nOfficer has confirmed the receipt of your payment!\n\n感謝您的配合，帳務狀態已更新，期待活動相見！🏔️\nThank you for your cooperation. Your account status is updated. Hope to see you at the event!");
        e.source.toast("✅ 已自動發送推播通知給該社員！", "繳費確認成功", 5);
      } else {
        e.source.toast("⚠️ 找不到該社員的系統識別碼，無法發送通知", "推播失敗", 5);
      }
    }
  }
}

// ⭐️ 查詢我的狀態 (無懼空欄位防彈版 / 雙語升級)
// 【函式說明】
// 當社員點擊圖文選單的「我的狀態」時，會觸發這個函式。
// 它會同時掃描「社員資料」、「活動報名」、「裝備租借」與「活動資訊」四張資料表，
// 把該名社員所有進行中的進度（包含繳費狀態、審核結果）一次打包，
// 並用中英雙語回覆給社員，是一個非常強大的跨表查詢引擎！
function handleStatusQuery(replyToken, userId, ss) {
  var memberSheet = ss.getSheetByName("Members"),
    signupSheet = ss.getSheetByName("Signups"),
    loanSheet = ss.getSheetByName("Loan_Records"),
    eventSheet = ss.getSheetByName("Events");
  var mData = memberSheet ? memberSheet.getDataRange().getValues() : [],
    sData = signupSheet ? signupSheet.getDataRange().getValues() : [];
  var lData = loanSheet ? loanSheet.getDataRange().getValues() : [],
    eData = eventSheet ? eventSheet.getDataRange().getDisplayValues() : [];
  var found = false,
    userInfo = "";

  // 1. 社員資料
  if (mData.length > 0) {
    var mH = mData[0],
      mSysIdx = _fi(mH, "系統識別碼"),
      mNameIdx = _fi(mH, "姓名");
    var mExpireIdx = mH.findIndex(function (h) {
      return String(h).includes("到期日") || String(h).includes("社籍");
    });
    for (var i = mData.length - 1; i >= 1; i--) {
      if (mSysIdx > -1 && mData[i][mSysIdx] === userId) {
        found = true;
        var expireDate = "尚未核發/尚未繳費 (Not issued/Unpaid)";
        if (mExpireIdx > -1 && mData[i][mExpireIdx]) {
          var d = new Date(mData[i][mExpireIdx]);
          expireDate = !isNaN(d.getTime()) ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy/MM/dd") : mData[i][mExpireIdx];
        }
        userInfo += "👤 【社員資料 Profile】\n姓名 Name：" + (mNameIdx > -1 ? mData[i][mNameIdx] : "未知 (Unknown)") + "\n到期日 Expiry：" + expireDate + "\n\n";
        break;
      }
    }
  }
  if (!found) {
    replyMessage(replyToken, "找不到您的資料，請先點選單中的「填寫資料」完成註冊喔！\n─────────────\nProfile not found. Please click 'Register' in the menu first!");
    return;
  }

  // 2. 已報名活動
  var eventList = [];
  if (sData.length > 0 && eData.length > 0) {
    var sH = sData[0],
      sSysIdx = _fi(sH, "系統識別碼"),
      sEventIdIdx = _fi(sH, "活動編號"),
      sStatIdx = _fi(sH, "審核結果"),
      sPayIdx = _fi(sH, "繳費狀態");
    var eH = eData[0],
      eIdIdx = _fi(eH, "活動編號"),
      eNameIdx = _fi(eH, "活動名稱");
    var eDateIdx = eH.findIndex(function (h) {
      var s = String(h);
      return s.includes("活動開始日期") || s.includes("活動日期") || (s.includes("日期") && !s.includes("截止") && !s.includes("結束"));
    });
    for (var j = 1; j < sData.length; j++) {
      if (sSysIdx > -1 && sData[j][sSysIdx] === userId) {
        var eStatus = (sStatIdx > -1 && sData[j][sStatIdx]) ? String(sData[j][sStatIdx]).trim() : "審核中 Checking";
        var payStatus = (sPayIdx > -1 && sData[j][sPayIdx]) ? String(sData[j][sPayIdx]).trim() : "未繳費 Unpaid";
        if (eStatus.indexOf("取消") === -1) {
          var eName = "未知活動 (Unknown)",
            eDate = "未知日期 (TBD)",
            isExpiredChecking = false;
          var eventId = sEventIdIdx > -1 ? sData[j][sEventIdIdx] : "";
          for (var k = 1; k < eData.length; k++) {
            if (eIdIdx > -1 && eData[k][eIdIdx] === eventId) {
              eName = eNameIdx > -1 ? eData[k][eNameIdx] : "活動";
              if (eDateIdx > -1 && eData[k][eDateIdx]) {
                var ed = new Date(eData[k][eDateIdx]);
                eDate = !isNaN(ed.getTime()) ? Utilities.formatDate(ed, Session.getScriptTimeZone(), "yyyy/MM/dd") : eData[k][eDateIdx];
              }
              // 檢查結束日期是否已經過去
              var endIdx = _fi(eH, "結束");
              if (endIdx > -1 && eData[k][endIdx]) {
                var endDate = new Date(eData[k][endIdx]);
                if (!isNaN(endDate.getTime())) {
                  endDate.setHours(23, 59, 59, 999);
                  if (new Date() > endDate && eStatus.indexOf("審核中") > -1) {
                    isExpiredChecking = true;
                  }
                }
              }
              break;
            }
          }

          if (!isExpiredChecking) {
            var displayStatus = "[" + eStatus + "]";
            if (eStatus.indexOf("正取") > -1) displayStatus += "[" + payStatus + "]";
            eventList.push("🔸 " + eName + " (" + eDate + ")\n進度 Progress：\n" + displayStatus);
          }
        }
      }
    }
  }
  userInfo += "📅 【已報名活動 Activities】\n" + (eventList.length > 0 ? eventList.join("\n\n") : "目前無報名紀錄 (No records found)") + "\n\n";

  // 3. 租借裝備
  var loanList = [];
  if (lData.length > 0) {
    var lH = lData[0],
      lSysIdIdx = _fi(lH, "系統識別碼"),
      lStatusIdx = _fi(lH, "領取/歸還"),
      lPayIdx = _fi(lH, "繳費狀態"),
      lQtyIdx = _fi(lH, "數量");
    var lName1Idx = _fi(lH, "裝備名稱"),
      lName2Idx = _fi(lH, "裝備名稱"),
      lIdIdx = _fi(lH, "裝備代號");
    for (var x = 1; x < lData.length; x++) {
      if (lSysIdIdx > -1 && lData[x][lSysIdIdx] === userId) {
        var lStatus = (lStatusIdx > -1 && lData[x][lStatusIdx]) ? String(lData[x][lStatusIdx]).trim() : "處理中";
        var lPayStatus = (lPayIdx > -1 && lData[x][lPayIdx]) ? String(lData[x][lPayIdx]).trim() : "未繳費 Unpaid";
        var lQty = (lQtyIdx > -1 && lData[x][lQtyIdx]) ? parseInt(lData[x][lQtyIdx], 10) || 1 : 1;
        var lEquip = _getEquipName(lData[x], lName1Idx, lName2Idx, lIdIdx, "未知裝備 (Name missing)");
        if (lStatus.indexOf("取消") === -1 && lStatus.indexOf("歸還") === -1) {
          loanList.push("🔹 " + lEquip + " x" + lQty + "\n   狀態 Status：[" + lStatus + "][" + lPayStatus + "]");
        }
      }
    }
  }
  userInfo += "🏕️ 【租借裝備 Equipments】\n" + (loanList.length > 0 ? loanList.join("\n\n") : "目前無租借紀錄 (No records found)");
  userInfo += "\n\n📊 數位個人總覽儀表板 (My Dashboard)：\nhttps://liff.line.me/2009217429-jvj3ydDT";
  replyMessage(replyToken, userInfo);
}

// ⭐️ 表單觸發：一鍵報名引擎 (漸進式個資檢查 + 雙語升級版)
// 【函式說明】
// 新增了「漸進式資料收集」的安全攔截機制。
// 當社員點擊一鍵報名時，系統會先盤點他的基本資料。
// 驗證社員資料是否完整 (回傳 missingFields 陣列與 p 物件，若陣列包含 "NOT_FOUND" 則代表找不到社員)
function _checkProfileComplete(userId, ss, type) {
  var memberSheet = ss.getSheetByName("Members");
  if (!memberSheet) return {
    missingFields: ["NOT_FOUND"],
    p: null
  };
  var mData = memberSheet.getDataRange().getValues();
  var mH = mData.length > 0 ? mData[0] : [];
  var mSysIdx = _fi(mH, "系統識別碼");
  var isMember = false;
  var missingFields = [];
  var p = {};

  for (var i = mData.length - 1; i >= 1; i--) {
    if (mSysIdx > -1 && mData[i][mSysIdx] === userId) {
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

      // 借用裝備、繳交費用共同必填項
      if (String(p.name).trim() === "") missingFields.push("姓名 (Name)");
      if (String(p.gender).trim() === "") missingFields.push("性別 (Gender)");
      if (String(p.realLineId).trim() === "") missingFields.push("LINE ID");
      if (String(p.email).trim() === "") missingFields.push("聯絡信箱 (Email)");
      if (String(p.phone).trim() === "") missingFields.push("聯絡電話 (Phone)");
      if (String(p.department).trim() === "") missingFields.push("系所 (Department)");
      if (String(p.studentId).trim() === "") missingFields.push("學號 (Student ID)");

      // 只有報名活動才需要的額外欄位 (type === "signup")
      if (type === "signup") {
        p.birthday = mData[i][_fi(mH, "生日")] || "";
        p.idNumber = mData[i][_fi(mH, "證件")] || "";
        p.studentAddr = mData[i][mH.findIndex(function (h) {
          return String(h).includes("地址") && !String(h).includes("緊急");
        })] || "";
        p.emerName = mData[i][mH.findIndex(function (h) {
          return String(h).includes("緊急聯絡人") && !String(h).includes("關係") && !String(h).includes("地址") && !String(h).includes("電話");
        })] || "";
        p.emerRel = mData[i][_fi(mH, "關係")] || "";
        p.emerAddr = mData[i][mH.findIndex(function (h) {
          return String(h).includes("地址") && String(h).includes("緊急");
        })] || "";
        p.emerPhone = mData[i][_fi(mH, "緊急聯絡人電話")] || "";
        p.exp = mData[i][_fi(mH, "經驗")] || "";
        p.strength = mData[i][_fi(mH, "體能")] || "";
        p.strengthProof = mData[i][_fi(mH, "證明")] || "";

        if (String(p.birthday).trim() === "") missingFields.push("生日 (Birthday)");
        if (String(p.idNumber).trim() === "") missingFields.push("身分證/護照號碼 (ID/Passport)");
        if (String(p.studentAddr).trim() === "") missingFields.push("聯絡地址 (Correspondence Address)");
        if (String(p.emerName).trim() === "") missingFields.push("緊急聯絡人姓名 (Emergency Contact)");
        if (String(p.emerRel).trim() === "") missingFields.push("與緊急聯絡人關係 (Emergency Relation)");
        if (String(p.emerAddr).trim() === "") missingFields.push("緊急聯絡人地址 (Emergency Address)");
        if (String(p.emerPhone).trim() === "") missingFields.push("緊急聯絡人電話 (Emergency Phone)");
        if (String(p.strength).trim() === "") missingFields.push("體能 (Physical Fitness)");
        if (String(p.strengthProof).trim() === "") missingFields.push("體能證明 (Proof of Physical Fitness)");
        if (String(p.exp).trim() === "") missingFields.push("爬山經驗 (Mountaineering Experience)");
      }

      var payIdx = _fi(mH, "繳費狀態");
      var paymentStatus = payIdx > -1 ? String(mData[i][payIdx]).trim() : "";
      p.isOfficial = (paymentStatus === "已繳費 Paid" || paymentStatus === "已繳" || paymentStatus === "是") ? "是" : "否";
      break;
    }
  }

  if (!isMember) return {
    missingFields: ["NOT_FOUND"],
    p: null
  };
  return {
    missingFields: missingFields,
    p: p
  };
}

// 如果發現缺少辦理保險所需的敏感資訊 (身分證、緊急聯絡人等)，
// 系統會中斷報名，並貼心地列出「缺少的清單」，引導社員先去更新資料。
function handleSignup(replyToken, userId, eventId, ss) {
  var profileCheck = _checkProfileComplete(userId, ss, "signup");

  if (profileCheck.missingFields.indexOf("NOT_FOUND") > -1) {
    replyMessage(replyToken, "⚠️ 報名失敗：系統找不到您的社員資料！\n請先完成「填寫資料」後再報名。\n─────────────\n⚠️ Registration Failed: Member profile not found!\nplease click 'Register' in the menu to complete your profile first");
    return;
  }

  if (profileCheck.missingFields.length > 0) {
    replyMessage(replyToken, "⚠️ 報名失敗：您的個人資料尚不完整！\n\n為了辦理平安保險與確保戶外活動安全，請先點擊選單的「填寫資料」，補齊以下必填資訊：\n\n👉 " + profileCheck.missingFields.join("\n👉 ") + "\n\n完成資料更新後，再回來點擊一鍵報名喔！🏕️\n─────────────\n⚠️ Failed: Incomplete Profile!\nFor insurance and safety purposes, please click 'Register' in the menu to complete your profile. Once updated, you can sign up again!");
    return;
  }

  var p = profileCheck.p;

  // 寫入 Signups
  var signupSheet = ss.getSheetByName("Signups");
  if (!signupSheet) {
    signupSheet = ss.insertSheet("Signups");
    signupSheet.appendRow(["活動編號", "系統識別碼", "專屬碼", "活動名稱", "姓名", "性別", "LINE ID", "聯絡信箱 Email", "聯絡電話", "生日", "證件號碼", "緊急聯絡人姓名", "爬山經驗", "緊急聯絡人聯絡地址", "體能測驗", "是否為社員", "審核結果", "通知狀態", "繳費狀態", "聯絡地址", "緊急聯絡人電話"]);
  }
  var sheetHeaders = signupSheet.getRange(1, 1, 1, signupSheet.getLastColumn()).getValues()[0];

  // 防重複報名
  var existingData = signupSheet.getDataRange().getValues();
  if (existingData.length > 1) {
    var eSysIdx = _fi(sheetHeaders, "系統識別碼"),
      eEvtIdx = _fi(sheetHeaders, "活動編號"),
      eStatIdx = _fi(sheetHeaders, "審核結果");
    for (var s = 1; s < existingData.length; s++) {
      if (eSysIdx > -1 && existingData[s][eSysIdx] === userId && existingData[s][eEvtIdx] === eventId) {
        var currentStatus = existingData[s][eStatIdx] ? String(existingData[s][eStatIdx]) : "";
        if (currentStatus.indexOf("取消") === -1) {
          var cache = CacheService.getScriptCache();
          if (!cache.get(userId + "_" + eventId)) {
            cache.put(userId + "_" + eventId, 'locked', 10);
            var eventName = _getEventName(ss, eventId);
            replyMessage(replyToken, "⚠️ 您已經報名過【" + eventName + "】囉！\n請耐心等候幹部審核，或是點選選單「我的狀態」查詢進度。\n─────────────\n⚠️ You have already registered for [" + eventName + "]!\nPlease wait for officer review, or check 'My Status' for progress.");
          }
          return;
        }
      }
    }
  }

  // 寫入資料
  var signupCode = "S" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMddHHmmss");
  var rowData = new Array(sheetHeaders.length).fill("");
  var eName = _getEventName(ss, eventId);

  function placeData(keyword, value) {
    var idx = _fi(sheetHeaders, keyword);
    if (idx > -1) rowData[idx] = value;
  }

  placeData("活動編號", eventId);
  placeData("系統識別碼", userId);
  placeData("專屬碼", signupCode);
  placeData("活動名稱", eName);
  placeData("姓名", p.name);
  placeData("性別", p.gender);
  placeData("LINE", p.realLineId);
  placeData("Email", p.email);
  placeData("電話", p.phone);
  placeData("生日", p.birthday);
  placeData("證件", p.idNumber);
  placeData("地址", p.studentAddr);
  var emerNameIdx = sheetHeaders.findIndex(function (h) {
    return String(h).includes("緊急聯絡人") && !String(h).includes("關係") && !String(h).includes("地址") && !String(h).includes("電話");
  });
  if (emerNameIdx > -1) rowData[emerNameIdx] = p.emerName;
  placeData("關係", p.emerRel);
  placeData("緊急聯絡人聯絡地址", p.emerAddr);
  placeData("緊急聯絡人電話", p.emerPhone);
  placeData("經驗", p.exp);
  placeData("體能", p.strength);
  placeData("體能證明", p.strengthProof);
  placeData("是否為社員", p.isOfficial);
  placeData("審核結果", "審核中 Checking");
  placeData("通知狀態", "");
  placeData("繳費狀態", "未繳費 Unpaid");
  signupSheet.appendRow(rowData);

  replyMessage(replyToken, "✅ 報名登記已送出！ / Registration Submitted!\n\n📍 活動 (Event)：\n" + eName + "\n🏷️ 代號 (Event ID)：" + eventId + "\n🎫 專屬碼 (Code)：" + signupCode + "\n\n" + p.name + "，我們已收到您的資料 (We have received your info)。\n\n⚠️ 【重要提醒 / Important】\n由於活動有人數限制及安全考量，此階段僅為「報名登記」。幹部將進行體能評估與篩選。最終是否錄取（正取/備取），將會透過本帳號個別推播通知您，請留意後續訊息！\n(This is only a registration. Final admission status will be notified to you individually through this account!)");
}

// ⭐️ 傳送專屬註冊/更新表單 (雙語排版版)
// 【函式說明】
// 這是新生入社或舊生更新資料的「大門口」。
// 為了精準識別是哪位社員填寫了表單，系統會將使用者的 LINE 系統識別碼 (userId)，
// 透過 URL 參數 (Google 表單的「取得預先填入連結」功能)，
// 自動帶入並填寫在 Google 表單的特定格子裡。
// 這樣社員就不需要自己去查一長串複雜的 ID，系統也能百分之百保證資料不會對錯人！
function sendRegisterForm(replyToken, userId) {
  var liffUrl = "https://liff.line.me/2009217429-AhPRqAHg";
  replyMessage(replyToken, "📝 登山社資料填寫 / Club Registration\n\n請點擊下方專屬連結填寫或更新您的個人資料：\nPlease click the link below to fill out or update your profile:\n\n" + liffUrl);
}

// ⭐️ 產生最新活動卡片 (100% 全動態對應最新欄位版 / 雙語升級)
// 【函式說明】
// 當社員點擊「最新活動」時，這個函式會去「Events (活動資訊)」分頁，
// 撈出所有狀態標記為「開放」或「未來開放」的活動。
// 接著，它會把這些活動的名稱、日期、費用、簡介和封面圖，
// 自動組裝成一組精美的 LINE 輪播卡片 (Carousel Flex Message) 傳送給社員。
// 這支程式採用了「全動態欄位對應」，即使幹部未來不小心調換了試算表的欄位順序，系統也不會壞掉！
function sendEventList(replyToken, ss) {
  var eventSheet = ss.getSheetByName("Events");
  if (!eventSheet) return;
  var data = eventSheet.getDataRange().getDisplayValues();
  var bubbles = [];

  var headers = data[0];
  var hIdx = {
    id: _fi(headers, "活動編號"),
    name: _fi(headers, "活動名稱"),
    startDate: _fi(headers, "活動開始日期"),
    endDate: _fi(headers, "活動結束日期"),
    deadline: _fi(headers, "報名截止日期"),
    cost: headers.findIndex(function (h) {
      return String(h).includes("預計費用") || String(h).includes("費用");
    }),
    status: headers.findIndex(function (h) {
      return String(h).includes("報名狀態") || String(h).includes("狀態");
    }),
    shortDesc: _fi(headers, "簡介"),
    img: headers.findIndex(function (h) {
      return String(h).includes("封面圖網址") || String(h).includes("照片") || String(h).includes("圖片");
    })
  };

  for (var i = 1; i < data.length; i++) {
    var status = hIdx.status > -1 ? data[i][hIdx.status] : "";
    if (status === "開放" || status === "未來開放") {
      var eventId = hIdx.id > -1 ? data[i][hIdx.id] : "";
      var eventName = hIdx.name > -1 ? data[i][hIdx.name] : "未命名活動";
      var tagColor = (status === "開放") ? "#1DB446" : "#FF9800";
      var displayStatus = status === "開放" ? "開放 Open" : "未來開放 Coming Soon";

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
              "text": "💰 費用 Cost: " + (hIdx.cost > -1 ? data[i][hIdx.cost] : ""),
              "size": "sm",
              "color": "#666666",
              "weight": "bold"
            }, {
              "type": "text",
              "text": "📅 活動時間 Event Date:",
              "size": "xs",
              "color": "#888888",
              "margin": "sm"
            }, {
              "type": "text",
              "text": "   " + (hIdx.startDate > -1 ? data[i][hIdx.startDate] : "") + " ~ " + (hIdx.endDate > -1 ? data[i][hIdx.endDate] : ""),
              "size": "sm",
              "color": "#666666"
            }, {
              "type": "text",
              "text": "⏰ 報名截止 Sign Up Deadline:",
              "size": "xs",
              "color": "#E53935",
              "margin": "sm",
              "weight": "bold"
            }, {
              "type": "text",
              "text": "   " + (hIdx.deadline > -1 ? data[i][hIdx.deadline] : ""),
              "size": "sm",
              "color": "#E53935"
            }]
          }, {
            "type": "separator",
            "margin": "md"
          }, {
            "type": "text",
            "text": hIdx.shortDesc > -1 ? data[i][hIdx.shortDesc] : "",
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

      var imageUrl = hIdx.img > -1 ? data[i][hIdx.img] : "";
      if (imageUrl && imageUrl.startsWith("http")) {
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
    replyMessage(replyToken, "目前這學期還沒有排定的活動喔！\n─────────────\nThere are no scheduled activities for this semester yet!");
  } else {
    replyFlexMessage(replyToken, "請查看本學期活動列表 / Event List", {
      "type": "carousel",
      "contents": bubbles
    });
  }
}

// ⭐️ 傳送單一活動詳細資訊與報名按鈕 (100% 全動態對應最新欄位版 / 雙語升級)
// 【函式說明】
// 當社員在「最新活動」輪播卡片上點擊某個活動的「查看詳情」時，會觸發此函式。
// 系統會根據傳入的 eventId，去「Events」試算表裡精準找出那場活動的完整資料，
// 包含長篇的「詳細行程」。
// 然後將這些資訊組裝成一張「單一的超大張詳情卡片」，
// 如果該活動處於「開放」狀態，卡片最下方就會出現綠色的「一鍵報名」按鈕！
function sendEventDetail(replyToken, eventId, ss) {
  var eventSheet = ss.getSheetByName("Events");
  if (!eventSheet) {
    replyMessage(replyToken, "找不到活動資料表！\n─────────────\nEvent sheet not found!");
    return;
  }
  var data = eventSheet.getDataRange().getDisplayValues();
  if (data.length <= 1) {
    replyMessage(replyToken, "目前沒有任何活動資料！\n─────────────\nNo event data available yet!");
    return;
  }

  var headers = data[0];
  var hIdx = {
    id: _fi(headers, "活動編號"),
    name: _fi(headers, "活動名稱"),
    startDate: _fi(headers, "活動開始日期"),
    endDate: _fi(headers, "活動結束日期"),
    deadline: _fi(headers, "報名截止日期"),
    cost: headers.findIndex(function (h) {
      return String(h).includes("預計費用") || String(h).includes("費用");
    }),
    status: headers.findIndex(function (h) {
      return String(h).includes("報名狀態") || String(h).includes("狀態");
    }),
    fullDesc: headers.findIndex(function (h) {
      return String(h).includes("詳細行程") || String(h).includes("行程");
    }),
    img: headers.findIndex(function (h) {
      return String(h).includes("封面圖網址") || String(h).includes("照片") || String(h).includes("圖片");
    })
  };

  var idCol = hIdx.id > -1 ? hIdx.id : 0;
  var eventData = null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === eventId) {
      eventData = data[i];
      break;
    }
  }
  if (!eventData) {
    replyMessage(replyToken, "找不到該活動的詳細資訊！\n─────────────\nEvent details not found!");
    return;
  }

  var eventName = hIdx.name > -1 ? eventData[hIdx.name] : "未命名活動 (Untitled Event)";
  var status = hIdx.status > -1 ? eventData[hIdx.status] : "";

  var buttonBox;
  if (status === "開放") {
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
    buttonBox = {
      "type": "button",
      "style": "secondary",
      "color": "#CCCCCC",
      "action": {
        "type": "uri",
        "label": "⏳ 尚未開放 Not Open",
        "uri": "https://line.me/R/"
      }
    };
  }

  var bubble = {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
        "type": "text",
        "text": "📝 活動詳情 Event Details",
        "weight": "bold",
        "color": "#1DB446",
        "size": "sm"
      }, {
        "type": "text",
        "text": eventName,
        "weight": "bold",
        "size": "xxl",
        "margin": "md",
        "wrap": true
      }, {
        "type": "box",
        "layout": "vertical",
        "margin": "md",
        "spacing": "sm",
        "contents": [{
          "type": "text",
          "text": "💰 費用 Cost: " + (hIdx.cost > -1 ? eventData[hIdx.cost] : ""),
          "size": "sm",
          "color": "#666666",
          "weight": "bold"
        }, {
          "type": "text",
          "text": "📅 活動時間 Event Date:",
          "size": "sm",
          "color": "#666666",
          "margin": "sm"
        }, {
          "type": "text",
          "text": "   " + (hIdx.startDate > -1 ? eventData[hIdx.startDate] : "") + " ~ " + (hIdx.endDate > -1 ? eventData[hIdx.endDate] : ""),
          "size": "sm",
          "color": "#1DB446",
          "weight": "bold"
        }, {
          "type": "text",
          "text": "⏰ 報名截止 Sign Up Deadline:",
          "size": "sm",
          "color": "#666666",
          "margin": "sm"
        }, {
          "type": "text",
          "text": "   " + (hIdx.deadline > -1 ? eventData[hIdx.deadline] : ""),
          "size": "sm",
          "color": "#E53935",
          "weight": "bold"
        }]
      }, {
        "type": "separator",
        "margin": "lg"
      }, {
        "type": "text",
        "text": "【行程與說明 Itinerary & Info】",
        "weight": "bold",
        "size": "sm",
        "margin": "lg"
      }, {
        "type": "text",
        "text": hIdx.fullDesc > -1 ? eventData[hIdx.fullDesc] : "無詳細說明 (No details provided)",
        "size": "sm",
        "margin": "md",
        "wrap": true
      }]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "contents": [buttonBox]
    }
  };

  var imageUrl = hIdx.img > -1 ? eventData[hIdx.img] : "";
  if (imageUrl && imageUrl.startsWith("http")) {
    bubble.hero = {
      "type": "image",
      "url": imageUrl,
      "size": "full",
      "aspectRatio": "20:13",
      "aspectMode": "cover"
    };
  }
  replyFlexMessage(replyToken, eventName + " 詳細資訊 Details", bubble);
}

// ⭐️ 幹部管理工具 (主動推播通知系統)
// 【函式說明】
// 這是一個 Google Apps Script 的「內建觸發器 (Simple Trigger)」。
// 只要有任何擁有權限的人(幹部)打開這份 Google 試算表，這個函式就會自動執行。
// 它的唯一工作，就是在試算表最上方的工具列中，額外「長出」一個自訂的下拉選單。
// 這樣一來，不懂程式的幹部也能透過簡單的點擊，一鍵觸發強大的後端自動化推播功能！
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🏕️ 登山社管理工具').addItem('發送審核結果通知 Send Review Notifications', 'sendReviewNotifications').addToUi();
}

// ⭐️ 幹部發送通知引擎 (防呆除錯升級版 / 雙語升級)
// 【函式說明】
// 這是專門給「幹部」使用的批次發送工具。
// 當幹部在試算表上點擊「發送審核結果通知」時，系統會掃描整張「Signups (報名表)」。
// 只要發現有人的審核結果被標記為「正取」或「備取」，且通知狀態還不是「已通知」，
// 系統就會主動推播相對應的精美錄取卡片給該名社員。
// 為了避免 LINE 的 API 報錯，這個函式內建了極強的除錯與防呆機制，並會把發送失敗的名單回報給幹部。
function sendReviewNotifications() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Signups"),
    eventSheet = ss.getSheetByName("Events");
  if (!sheet || !eventSheet) return;

  var data = sheet.getDataRange().getValues();
  var eData = eventSheet.getDataRange().getDisplayValues();
  var eIdIdx = _fi(eData[0], "活動編號"),
    eNameIdx = _fi(eData[0], "活動名稱");
  var sysIdIndex = _fi(data[0], "系統識別碼"),
    nameIndex = _fi(data[0], "姓名"),
    eventIndex = _fi(data[0], "活動編號");
  var resultIndex = _fi(data[0], "審核結果"),
    statusIndex = _fi(data[0], "通知狀態"),
    codeIndex = _fi(data[0], "專屬碼");

  var count = 0,
    errorLog = "";

  for (var i = 1; i < data.length; i++) {
    var userId = String(data[i][sysIdIndex] || "").trim();
    var name = nameIndex > -1 ? data[i][nameIndex] : "社員";
    var eventId = data[i][eventIndex];
    var result = String(data[i][resultIndex] || "");
    var status = String(data[i][statusIndex] || "");
    var signupCode = (codeIndex > -1) ? data[i][codeIndex] : "";

    var isAcceptedOrWaitlisted = (result.indexOf("正取") > -1 || result.indexOf("備取") > -1);
    if (isAcceptedOrWaitlisted && status !== "已通知" && result.indexOf("取消") === -1) {
      if (!userId.startsWith("U") || userId.length < 30) {
        errorLog += "❌ " + name + " 的系統識別碼格式錯誤 (必須為U開頭的長亂碼)。\n";
        continue;
      }

      var eventName = eventId;
      for (var e = 1; e < eData.length; e++) {
        if (eData[e][eIdIdx > -1 ? eIdIdx : 0] === eventId) {
          eventName = eData[e][eNameIdx > -1 ? eNameIdx : 1];
          break;
        }
      }

      var apiResponse = null;

      if (result.indexOf("正取") > -1) {
        var acceptedFlex = {
          "type": "bubble",
          "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [{
              "type": "text",
              "text": "📣 審核結果出爐 Result",
              "weight": "bold",
              "color": "#1DB446",
              "size": "sm"
            }, {
              "type": "text",
              "text": "活動正取通知",
              "weight": "bold",
              "size": "xl",
              "margin": "md"
            }, {
              "type": "text",
              "text": "哈囉 " + name + "！您報名的活動：\nHello " + name + "! For the event:",
              "margin": "md",
              "size": "sm",
              "wrap": true
            }, {
              "type": "text",
              "text": eventName,
              "weight": "bold",
              "color": "#111111",
              "size": "md",
              "wrap": true,
              "margin": "sm"
            }, {
              "type": "text",
              "text": "審核結果為 Result：",
              "margin": "md",
              "size": "sm"
            }, {
              "type": "text",
              "text": "【 " + result + " 】",
              "weight": "bold",
              "color": "#1DB446",
              "size": "lg",
              "align": "center",
              "margin": "md"
            }, {
              "type": "separator",
              "margin": "md"
            }, {
              "type": "text",
              "text": "🎉 恭喜您錄取！請留意我們後續會透過您留下的真實 LINE ID 將您加入群組，並請於期限內完成繳費！\nCongratulations! We will invite you to the LINE group soon. Please complete the payment before the deadline!",
              "wrap": true,
              "margin": "md",
              "size": "xs",
              "color": "#666666"
            }]
          },
          "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [{
              "type": "button",
              "style": "primary",
              "color": "#1DB446",
              "action": {
                "type": "message",
                "label": "前往繳費系統 Pay",
                "text": "繳費系統 Payment System"
              }
            }]
          }
        };
        apiResponse = pushFlexMessage(userId, "【活動正取通知 Confirmed】", acceptedFlex);
      } else if (result.indexOf("備取") > -1) {
        var waitlistFlex = {
          "type": "bubble",
          "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [{
              "type": "text",
              "text": "📣 審核結果出爐 Result",
              "weight": "bold",
              "color": "#FF9800",
              "size": "sm"
            }, {
              "type": "text",
              "text": "活動備取通知",
              "weight": "bold",
              "size": "xl",
              "margin": "md"
            }, {
              "type": "text",
              "text": "哈囉 " + name + "！您報名的活動：\nHello " + name + "! For the event:",
              "margin": "md",
              "size": "sm",
              "wrap": true
            }, {
              "type": "text",
              "text": eventName,
              "weight": "bold",
              "color": "#111111",
              "size": "md",
              "wrap": true,
              "margin": "sm"
            }, {
              "type": "text",
              "text": "審核結果為 Result：",
              "margin": "md",
              "size": "sm"
            }, {
              "type": "text",
              "text": "【 " + result + " 】",
              "weight": "bold",
              "color": "#FF3333",
              "size": "md",
              "align": "center",
              "margin": "md"
            }, {
              "type": "separator",
              "margin": "md"
            }, {
              "type": "text",
              "text": "若有正取者放棄資格，我們將會隨時遞補。如果您確定願意等待遞補，請點擊下方按鈕進行登記！\nIf confirmed members cancel, we will notify the waitlist. Click below if you are willing to wait!",
              "wrap": true,
              "margin": "md",
              "size": "xs",
              "color": "#666666"
            }]
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
                "label": "我要遞補 Waitlist",
                "data": "action=confirm_waitlist&targetId=" + signupCode,
                "displayText": "我願意等待遞補！/ Willing to wait!"
              }
            }]
          }
        };
        apiResponse = pushFlexMessage(userId, "【活動備取通知 Waitlist】", waitlistFlex);
      }

      if (apiResponse && apiResponse.getResponseCode() !== 200) {
        errorLog += "❌ " + name + " 發送失敗 (LINE 拒絕)：" + apiResponse.getContentText() + "\n";
      } else {
        sheet.getRange(i + 1, statusIndex + 1).setValue("已通知");
        count++;
      }
    }
  }

  if (errorLog !== "") {
    SpreadsheetApp.getUi().alert("⚠️ 執行完畢，但有發生錯誤：\n\n✅ 成功發送: " + count + " 則\n\n📝 錯誤紀錄:\n" + errorLog);
  } else {
    SpreadsheetApp.getUi().alert("✅ 執行完畢！共成功發送了 " + count + " 則通知。");
  }
}

// ⭐️ 產生裝備借用輪播卡片 (100% 全動態對應最新欄位版 / 雙語升級)
// 【函式說明】
// 當社員點擊「器材借用」時，系統會啟動這個虛擬倉庫引擎。
// 它會去「Equipments (裝備表)」掃描所有狀態為「可外借」且沒有損壞的裝備，
// 並抓取庫存數量與租金，組裝成最多 10 張的精美輪播卡片。
// 若庫存大於 0，按鈕會亮綠燈允許借用；若庫存為 0，按鈕會反灰變成「庫存不足」。
function sendBorrowMenu(replyToken, ss) {
  var equipSheet = ss.getSheetByName("Equipments");
  if (!equipSheet) {
    replyMessage(replyToken, "找不到裝備資料表！\n─────────────\nEquipment sheet not found!");
    return;
  }
  var data = equipSheet.getDataRange().getDisplayValues();
  if (data.length <= 1) {
    replyMessage(replyToken, "目前沒有裝備資料！\n─────────────\nNo equipment data available!");
    return;
  }
  var bubbles = [];

  var headers = data[0];
  var hIdx = {
    id: _fi(headers, "裝備代號"),
    name: _fi(headers, "裝備名稱"),
    totalQty: _fi(headers, "總數量"),
    remainQty: _fi(headers, "剩餘數量"),
    borrowable: _fi(headers, "是否外借"),
    price2Days: _fi(headers, "2天"),
    priceExtra: _fi(headers, "+1天"),
    status: _fi(headers, "狀態")
  };

  for (var i = 1; i < data.length; i++) {
    var isBorrowable = hIdx.borrowable > -1 ? data[i][hIdx.borrowable] : "";
    var status = hIdx.status > -1 ? data[i][hIdx.status] : "";
    if (isBorrowable === "可外借" && status !== "維修中" && status !== "報廢" && status !== "需汰換" && status !== "待測") {
      var equipId = hIdx.id > -1 ? data[i][hIdx.id] : "";
      var equipName = hIdx.name > -1 ? data[i][hIdx.name] : "未知裝備";
      var remainQty = hIdx.remainQty > -1 ? data[i][hIdx.remainQty] : "0";
      var hasStock = parseInt(remainQty) > 0;
      var stockColor = hasStock ? "#1DB446" : "#FF3333";
      var stockText = hasStock ? "剩餘 Left " + remainQty + " / " + (hIdx.totalQty > -1 ? data[i][hIdx.totalQty] : "0") : "已全數借出 Out of stock";

      var buttonAction = hasStock ?
        {
          "type": "postback",
          "label": "我要借 Borrow",
          "data": "action=borrow_form&equipId=" + equipId,
          "displayText": "我想借用 I want to borrow: " + equipName
        } :
        {
          "type": "uri",
          "label": "庫存不足 Empty",
          "uri": "https://line.me/R/"
        };

      bubbles.push({
        "type": "bubble",
        "size": "kilo",
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [{
            "type": "text",
            "text": equipId,
            "color": "#888888",
            "size": "xs",
            "weight": "bold"
          }, {
            "type": "text",
            "text": equipName,
            "weight": "bold",
            "size": "md",
            "margin": "sm",
            "wrap": true
          }, {
            "type": "text",
            "text": "📦 " + stockText,
            "size": "xs",
            "color": stockColor,
            "margin": "sm",
            "weight": "bold"
          }, {
            "type": "separator",
            "margin": "md"
          }, {
            "type": "text",
            "text": "非社員收費 Non-member Rates:",
            "size": "xxs",
            "color": "#999999",
            "margin": "md"
          }, {
            "type": "text",
            "text": "💰 基本(2天) Base(2D): $" + (hIdx.price2Days > -1 ? data[i][hIdx.price2Days] : "0"),
            "size": "xs",
            "color": "#666666",
            "margin": "xs"
          }, {
            "type": "text",
            "text": "💰 之後(+1天) After(+1D): +$" + (hIdx.priceExtra > -1 ? data[i][hIdx.priceExtra] : "0"),
            "size": "xs",
            "color": "#666666",
            "margin": "xs"
          }, {
            "type": "text",
            "text": "✨ 正式社員享 5 折 Member gets 50% Off",
            "size": "xxs",
            "color": "#FF9800",
            "weight": "bold",
            "margin": "md"
          }]
        },
        "footer": {
          "type": "box",
          "layout": "vertical",
          "contents": [{
            "type": "button",
            "style": hasStock ? "primary" : "secondary",
            "color": hasStock ? "#1DB446" : "#CCCCCC",
            "action": buttonAction
          }]
        }
      });
      if (bubbles.length === 10) break;
    }
  }

  if (bubbles.length === 0) {
    replyMessage(replyToken, "目前沒有可外借的裝備。\n─────────────\nNo equipment available for borrowing currently.");
  } else {
    var replyText = "請選擇您要預約的裝備 / Please select equipment" + (bubbles.length === 10 ? "\n(僅顯示前 10 項可外借裝備 Top 10 items shown)" : "");
    replyFlexMessage(replyToken, replyText, {
      "type": "carousel",
      "contents": bubbles
    });
  }
}

// ⭐️ 裝備表單提交攔截器 (防呆與算錢引擎 / 雙語升級版)
// 【函式說明】
// 這是一個 Google Apps Script 的「表單提交觸發器 (onFormSubmit)」。
// 當社員填寫完「裝備借用 Google 表單」並按下提交時，這個函式會立刻啟動。
// 它會對剛剛送進來的資料進行 4 道嚴格的防呆檢查：
// 1. 日期是否合理 (歸還不能早於領取)
// 2. 借用天數是否超標 (不可超過 14 天)
// 3. 是否真的是本社社員
// 4. 裝備庫存是否足夠，且名稱沒有被惡意竄改
// 如果任何一項不合格，它會把這筆訂單標示為「已取消」，並傳 LINE 警告社員。
// 如果一切正常，它會自動計算費用、扣除庫存，並發出訂單成立的推播！
function onBorrowFormSubmit(e) {
  try {
    var sheet = e.range.getSheet();
    if (sheet.getName() !== "Loan_Records") return;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var row = e.range.getRow();
    var lHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    function getColIdx(keyword) {
      return lHeaders.findIndex(function (h) {
        return String(h).includes(keyword);
      });
    }

    var userIdIdx = getColIdx("系統識別碼"),
      equipIdIdx = getColIdx("裝備代號");
    var purposeIdx = getColIdx("用途") > -1 ? getColIdx("用途") : getColIdx("借用用途");
    var qtyIdx = getColIdx("數量") > -1 ? getColIdx("數量") : getColIdx("借用數量");
    var pickupIdx = getColIdx("預計領取"),
      returnIdx = getColIdx("預計歸還"),
      noteIdx = getColIdx("備註");
    var submittedEquipNameIdx = getColIdx("裝備名稱") > -1 ? getColIdx("裝備名稱") : getColIdx("租借項目");

    if (userIdIdx === -1 || equipIdIdx === -1) return;

    function getDisplayDate(val) {
      if (!val) return "";
      if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy/MM/dd");
      return String(val);
    }

    var userId = String(rowData[userIdIdx]).trim();
    var equipId = String(rowData[equipIdIdx]).trim().toUpperCase();
    var purpose = purposeIdx > -1 ? String(rowData[purposeIdx]) : "未填寫";
    var qty = qtyIdx > -1 ? parseInt(rowData[qtyIdx], 10) || 0 : 0;
    var pickupTime = pickupIdx > -1 ? getDisplayDate(rowData[pickupIdx]) : "";
    var returnTime = returnIdx > -1 ? getDisplayDate(rowData[returnIdx]) : "";
    var note = noteIdx > -1 && rowData[noteIdx] ? String(rowData[noteIdx]) : "無";
    var submittedEquipName = submittedEquipNameIdx > -1 ? String(rowData[submittedEquipNameIdx]).trim() : "";

    function ensureCol(keyword) {
      var idx = getColIdx(keyword);
      if (idx === -1) {
        idx = lHeaders.length;
        sheet.getRange(1, idx + 1).setValue(keyword);
        lHeaders.push(keyword);
        rowData.push("");
      }
      return idx;
    }

    var colStatusIdx = ensureCol("領取/歸還"),
      colPayStatusIdx = ensureCol("繳費狀態");
    var colOrderIdIdx = ensureCol("租借編號"),
      colCostIdx = ensureCol("應繳費用");
    var colIsOfficialIdx = ensureCol("是否為社員"),
      colEquipNameIdx = ensureCol("裝備名稱"),
      colNameIdx = ensureCol("姓名");

    // 日期解析與防呆
    function parseDate(dateStr) {
      if (!dateStr) return new Date();
      var parts = String(dateStr).split(/[-/]/);
      if (parts.length === 3) {
        if (parts[2].length === 4) return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        else if (parts[0].length === 4) return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
      return new Date(dateStr);
    }

    var pDate = parseDate(pickupTime),
      rDate = parseDate(returnTime);
    pDate.setHours(0, 0, 0, 0);
    rDate.setHours(0, 0, 0, 0);
    var diffTime = rDate.getTime() - pDate.getTime();

    if (isNaN(diffTime) || diffTime < 0) {
      sheet.deleteRow(row);
      pushMessage(userId, "⚠️ 借用失敗：您填寫的「預計歸還日期」早於「預計領取日期」或格式錯誤，請重新填寫表單！\n─────────────\n⚠️ Failed: 'Return Date' cannot be earlier than 'Pickup Date' or format error. Please refill the form!");
      return;
    }

    var borrowDays = Math.max(2, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
    if (borrowDays > 14) {
      sheet.deleteRow(row);
      pushMessage(userId, "⚠️ 借用失敗：單次借用天數不可超過 14 天（您填寫了 " + borrowDays + " 天），請重新評估後再填寫一次！如需長時間借用請直接聯繫幹部。\n─────────────\n⚠️ Failed: Borrowing period cannot exceed 14 days (You selected " + borrowDays + " days). Please re-evaluate and refill the form! For long-term borrowing, please contact the officers directly.");
      return;
    }

    // 跨表查詢社員
    var mSheet = ss.getSheetByName("Members"),
      mData = mSheet.getDataRange().getValues();
    var mSysIdx = _fi(mData[0], "系統識別碼");
    var userName = "未知",
      isOfficial = "否",
      realLineId = "未提供",
      idFound = false;

    for (var i = 1; i < mData.length; i++) {
      if (mSysIdx > -1 && mData[i][mSysIdx] === userId) {
        idFound = true;
        userName = mData[i][_fi(mData[0], "姓名")] || "未知";
        var lineIdx = mData[0].findIndex(function (h) {
          return String(h).toUpperCase().includes("LINE");
        });
        realLineId = lineIdx > -1 ? (mData[i][lineIdx] || "未提供") : "未提供";
        var payStatus = mData[i][_fi(mData[0], "繳費狀態")] || "";
        if (String(payStatus).trim() === "已繳費 Paid") isOfficial = "是";
        break;
      }
    }

    if (!idFound) {
      sheet.deleteRow(row);
      pushMessage(userId, "⚠️ 借用失敗：系統找不到您的社員資料，請先透過選單的「填寫資料」完成註冊喔！\n─────────────\n⚠️ Failed: Profile not found. Please click 'Register' in the menu first!");
      return;
    }

    // 跨表查詢裝備與計算費用 (加入並行鎖定保護)
    var equipSheet = ss.getSheetByName("Equipments");
    var eData = equipSheet.getDataRange().getValues();
    var eIdIdx = _fi(eData[0], "裝備代號");
    var equipName = "未知裝備",
      cost = 0,
      newStock = 0,
      equipFound = false,
      nameMatch = true;

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000); // 最多等 10 秒
      // 由於可能等待過，再次取得最新庫存資料
      eData = equipSheet.getDataRange().getValues();

      for (var j = 1; j < eData.length; j++) {
        if (eIdIdx > -1 && eData[j][eIdIdx] === equipId) {
          equipFound = true;
          var actualName = eData[j][_fi(eData[0], "裝備名稱")] || equipId;
          if (submittedEquipName && submittedEquipName !== actualName) {
            nameMatch = false;
            break;
          }
          equipName = actualName;

          var eStockIdx = _fi(eData[0], "剩餘數量");
          var currentStock = eStockIdx > -1 ? (parseInt(eData[j][eStockIdx], 10) || 0) : 0;

          if (qty > currentStock) {
            sheet.deleteRow(row);
            pushMessage(userId, "⚠️ 借用失敗：您欲借用的【" + equipName + "】數量大於剩餘庫存（目前剩餘 " + currentStock + " 個），請重新填寫數量！\n─────────────\n⚠️ Failed: Requested quantity for [" + equipName + "] exceeds available stock (Only " + currentStock + " left). Please re-enter quantity!");
            return;
          }

          newStock = currentStock - qty;
          if (eStockIdx > -1) equipSheet.getRange(j + 1, eStockIdx + 1).setValue(newStock);

          if (purpose && purpose.indexOf("社團出隊") === -1) {
            var price2 = parseInt(eData[j][eData[0].findIndex(function (h) {
              return String(h).includes("2天");
            })], 10) || 0;
            var priceEx = parseInt(eData[j][eData[0].findIndex(function (h) {
              return String(h).includes("+1天");
            })], 10) || 0;
            var unitCost = price2 + (borrowDays > 2 ? priceEx * (borrowDays - 2) : 0);
            cost = (isOfficial === "是") ? Math.ceil((unitCost * qty) / 2) : (unitCost * qty);
          }
          break;
        }
      }
    } catch (e) {
      console.error("裝備扣庫存時取得鎖定失敗", e);
      sheet.deleteRow(row);
      pushMessage(userId, "⚠️ 借用失敗：系統忙碌中（太多人同時借用），請稍後再試填一次！\n─────────────\n⚠️ System busy. Please try again later!");
      return;
    } finally {
      if (lock.hasLock()) {
        lock.releaseLock();
      }
    }

    if (!equipFound) {
      sheet.deleteRow(row);
      pushMessage(userId, "⚠️ 借用失敗：系統找不到代號為「" + equipId + "」的裝備，請確認後重新填寫表單！\n─────────────\n⚠️ Failed: Equipment ID '" + equipId + "' not found. Please check and try again!");
      return;
    }
    if (!nameMatch) {
      sheet.deleteRow(row);
      pushMessage(userId, "⚠️ 借用失敗：您填寫的裝備名稱與系統代號不符。\n請勿任意修改表單自動帶入的預設資料！\n─────────────\n⚠️ Failed: Equipment name does not match ID. Please do NOT modify auto-filled data!");
      return;
    }

    // 生成訂單
    var orderId = "R" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMddHHmmss");
    rowData[colOrderIdIdx] = orderId;
    rowData[colNameIdx] = userName;
    rowData[colIsOfficialIdx] = isOfficial;
    rowData[colEquipNameIdx] = equipName;
    rowData[colCostIdx] = cost;
    rowData[colStatusIdx] = "待領取 To Be Collected";
    rowData[colPayStatusIdx] = "未繳費 Unpaid";
    sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);

    var userMsg = "⛺ 【裝備預約成功 / Reservation Confirmed】\n\n" +
      userName + " 您好，您的借用申請已成立！\nYour reservation is successful!\n\n" +
      "🔹 訂單 Order：" + orderId + "\n" +
      "🔹 裝備 Item：" + equipName + " x" + qty + "\n" +
      "🔹 天數 Days：" + borrowDays + " 天\n" +
      "🔹 預計領取 Pickup：" + pickupTime + "\n" +
      "🔹 預計歸還 Return：" + returnTime + "\n" +
      "🔹 用途 Purpose：" + purpose + "\n" +
      "💰 總費用 Total Fee：$" + cost + "\n\n" +
      "⚠️ 幹部將會透過 LINE 與您聯繫，確認面交時間與地點！\nOfficer will contact you via LINE for pickup details! (Where and When)";
    pushMessage(userId, userMsg);

    var adminMsg = "🔔 【幹部通知：新裝備預約】\n\n" +
      "申請人：" + userName + " (" + isOfficial + "社員)\n" +
      "聯絡 (Line ID)：" + realLineId + "\n" +
      "裝備：" + equipName + " x" + qty + "\n" +
      "用途：" + purpose + "\n" +
      "借用天數：" + borrowDays + " 天\n" +
      "預計領取：" + pickupTime + "\n" +
      "預計歸還：" + returnTime + "\n" +
      "備註：" + note + "\n\n" +
      "💵 系統試算費用：$" + cost + "\n" +
      "📦 該裝備剩餘庫存：" + newStock + "\n\n" +
      "📌 請負責幹部聯繫申請人！";
    if (typeof pushAdminMessage === "function") pushAdminMessage(adminMsg);

  } catch (err) {
    console.error(err);
    var errSs = SpreadsheetApp.getActiveSpreadsheet();
    if (errSs) errSs.toast("❌ 裝備表單處理失敗：" + err.message, "系統錯誤", 10);
  }
}

// ⭐️ 9. 取消系統：產生可取消的項目卡片 (100% 全動態防彈版 / 雙語升級)
// 【函式說明】
// 當社員點擊「取消預約」時，系統會自動盤點該社員所有「還可以取消」的項目。
// 包含：尚未領取的「裝備預約」、以及還沒被取消的「活動報名」。
// 系統會將這些項目做成精美的輪播卡片，最多產生 10 張，讓社員可以一鍵點擊取消。
// (註：如果取消的是「正取」活動，總機會自動攔截這個動作，並要求社員輸入取消原因)
function sendCancelMenu(replyToken, userId, ss) {
  var signupSheet = ss.getSheetByName("Signups"),
    loanSheet = ss.getSheetByName("Loan_Records"),
    eventSheet = ss.getSheetByName("Events");
  var bubbles = [];

  // 活動取消
  if (signupSheet && eventSheet) {
    var sData = signupSheet.getDataRange().getValues();
    var eData = eventSheet.getDataRange().getDisplayValues();
    var sH = sData[0],
      eH = eData[0];
    var sSysIdx = _fi(sH, "系統識別碼"),
      sCodeIdx = _fi(sH, "專屬碼"),
      sStatIdx = _fi(sH, "審核結果"),
      sEventIdIdx = _fi(sH, "活動編號");
    var eIdIdx = _fi(eH, "活動編號"),
      eNameIdx = _fi(eH, "活動名稱");

    for (var i = 1; i < sData.length; i++) {
      if (sSysIdx > -1 && sData[i][sSysIdx] === userId) {
        var status = (sStatIdx > -1) ? String(sData[i][sStatIdx]) : "";
        if (status.indexOf("取消") === -1 && status !== "") {
          var code = sCodeIdx > -1 ? sData[i][sCodeIdx] : "";
          var eventName = _getEventName(ss, sEventIdIdx > -1 ? sData[i][sEventIdIdx] : "");

          bubbles.push({
            "type": "bubble",
            "size": "kilo",
            "body": {
              "type": "box",
              "layout": "vertical",
              "contents": [{
                "type": "text",
                "text": "📅 活動報名 Activity",
                "color": "#FF9800",
                "size": "xs",
                "weight": "bold"
              }, {
                "type": "text",
                "text": eventName,
                "weight": "bold",
                "size": "md",
                "margin": "sm",
                "wrap": true
              }, {
                "type": "text",
                "text": "狀態 Status: " + status,
                "size": "xs",
                "color": "#666666",
                "margin": "sm"
              }]
            },
            "footer": {
              "type": "box",
              "layout": "vertical",
              "contents": [{
                "type": "button",
                "style": "primary",
                "color": "#E54545",
                "action": {
                  "type": "postback",
                  "label": "取消報名 Cancel",
                  "data": "action=cancel_event&targetId=" + code,
                  "displayText": "我要取消" + eventName + " / Cancel: " + eventName
                }
              }]
            }
          });
        }
      }
    }
  }

  // 裝備取消
  if (loanSheet) {
    var lData = loanSheet.getDataRange().getValues();
    var lH = lData[0];
    var lSysIdx = _fi(lH, "系統識別碼"),
      lStatIdx = _fi(lH, "領取/歸還"),
      lOrderIdx = _fi(lH, "租借編號");
    var lName1Idx = _fi(lH, "裝備名稱"),
      lName2Idx = _fi(lH, "租借項目"),
      lIdIdx = _fi(lH, "裝備代號");

    for (var j = 1; j < lData.length; j++) {
      if (lSysIdx > -1 && lData[j][lSysIdx] === userId) {
        var lStatus = (lStatIdx > -1) ? String(lData[j][lStatIdx]) : "";
        if (lStatus === "待領取 To Be Collected") {
          var orderId = lOrderIdx > -1 ? lData[j][lOrderIdx] : "";
          var equipName = _getEquipName(lData[j], lName1Idx, lName2Idx, lIdIdx, "未知裝備");

          bubbles.push({
            "type": "bubble",
            "size": "kilo",
            "body": {
              "type": "box",
              "layout": "vertical",
              "contents": [{
                "type": "text",
                "text": "🏕️ 裝備預約 Equipment",
                "color": "#0367D3",
                "size": "xs",
                "weight": "bold"
              }, {
                "type": "text",
                "text": equipName,
                "weight": "bold",
                "size": "md",
                "margin": "sm",
                "wrap": true
              }, {
                "type": "text",
                "text": "狀態 Status: " + lStatus,
                "size": "xs",
                "color": "#666666",
                "margin": "sm"
              }]
            },
            "footer": {
              "type": "box",
              "layout": "vertical",
              "contents": [{
                "type": "button",
                "style": "primary",
                "color": "#E54545",
                "action": {
                  "type": "postback",
                  "label": "取消預約 Cancel",
                  "data": "action=cancel_equip&targetId=" + orderId,
                  "displayText": "我要取消" + equipName + " / Cancel: " + equipName
                }
              }]
            }
          });
        }
      }
    }
  }

  if (bubbles.length === 0) {
    replyMessage(replyToken, "✅ 目前沒有可取消的報名或預約紀錄。\n─────────────\n✅ No cancellable registrations or reservations found.");
  } else {
    replyFlexMessage(replyToken, "請選擇您要取消的項目 / Select Item to Cancel", {
      "type": "carousel",
      "contents": bubbles
    });
  }
}

// ⭐️ 10. 處理正取取消活動的原因與幹部通知 (全動態防彈版 / 雙語升級)
// 【函式說明】
// 這是一個專門處理「正取生放棄資格」的特殊函式。
// 因為正取生取消會影響到整場活動的收支與備取遞補，所以系統會強制要求他們輸入「取消原因」。
// 當使用者在對話框輸入原因後，總機會把那段文字傳送到這個函式。
// 本函式會：
// 1. 去 Signups (報名表) 把該社員的狀態改為「已取消」。
// 2. 把他輸入的「取消原因」寫入通知狀態欄，留給幹部備查。
// 3. 解除他的快取等待狀態，讓他可以繼續使用選單。
// 4. 發送雙語成功通知給社員。
// 5. 發送緊急推播給幹部群組，提醒負責人趕快去聯絡備取名單！
function handleEventCancelReason(replyToken, userId, reasonText, signupCode) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var signupSheet = ss.getSheetByName("Signups");
  if (!signupSheet) return;
  var sData = signupSheet.getDataRange().getValues();
  var sH = sData[0];
  var sCodeIdx = _fi(sH, "專屬碼"),
    sSysIdx = _fi(sH, "系統識別碼"),
    sStatIdx = _fi(sH, "審核結果");
  var sEventIdIdx = _fi(sH, "活動編號"),
    sNameIdx = _fi(sH, "姓名");
  var sNotifyIdx = _fi(sH, "通知狀態");

  for (var i = 1; i < sData.length; i++) {
    if (sCodeIdx > -1 && sSysIdx > -1 && sData[i][sCodeIdx].toString() === signupCode.toString() && sData[i][sSysIdx].toString() === userId.toString()) {
      if (sStatIdx > -1) signupSheet.getRange(i + 1, sStatIdx + 1).setValue("已取消 Cancelled");
      if (sNotifyIdx > -1) signupSheet.getRange(i + 1, sNotifyIdx + 1).setValue("取消原因：" + reasonText);
      CacheService.getUserCache().remove(userId + "_canceling_event");
      var eventName = _getEventName(ss, sEventIdIdx > -1 ? sData[i][sEventIdIdx] : "");
      var userName = sNameIdx > -1 ? sData[i][sNameIdx] : "社員";

      replyMessage(replyToken, "✅ 【" + eventName + "】報名已取消成功！\n\n您的報名狀態已更新為「已取消」，我們期待在未來的社團活動與您相見。\n─────────────\n✅ Your registration for [" + eventName + "] has been cancelled.\nWe look forward to seeing you at future events!");

      pushAdminMessage("🔔 【幹部緊急通知：正取棄權】\n\n❗ 活動：" + eventName + "\n❗ 棄權社員：" + userName + "\n\n📝 取消原因：\n" + reasonText + "\n\n👉 建議幹部檢視備取名單，聯繫有遞補意願的社員！");
      return;
    }
  }
}

// ⭐️ 更多服務選單

// ⭐️ 產生「其他 / 更多服務」進階選單卡片 (雙語升級版)
// 【函式說明】
// 因為 LINE 手機版底下的「圖文選單」最多只能放 6 個按鈕，
// 當社團功能變多時，我們就把進階功能（如：繳費系統、查詢幹部名單）
// 收納進這個「更多服務」的擴充卡片裡。
function sendMoreOptionsMenu(replyToken) {
  var carousel = {
    "type": "carousel",
    "contents": [{
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [{
          "type": "text",
          "text": "⚙️ 帳務 Finance",
          "weight": "bold",
          "color": "#1DB446",
          "size": "sm"
        }, {
          "type": "text",
          "text": "繳費中心 Payment Center",
          "weight": "bold",
          "size": "xl",
          "margin": "md"
        }, {
          "type": "text",
          "text": "回報與查詢 Payment Report & Inquiry",
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
          "style": "primary",
          "color": "#1DB446",
          "action": {
            "type": "message",
            "label": "💰 繳費系統 Payment System",
            "text": "繳費系統 Payment System"
          }
        }, {
          "type": "button",
          "style": "secondary",
          "action": {
            "type": "message",
            "label": "📜 繳費紀錄 Payment History",
            "text": "繳費紀錄 Payment History"
          }
        }]
      }
    }, {
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
    }]
  };

  replyFlexMessage(replyToken, "請選擇更多進階服務 / More Services", carousel);
}

// ⭐️ 引擎一：回報後標記獨立欄位為「待確認」 (100% 全動態防彈版)
// 【函式說明】
// 這是繳費系統的「狀態鎖定器」。
// 💡 全域效能優化：使用 TextFinder 快速定位系統識別碼，避免讀取整張表格造成記憶體與效能浪費！
function markAsPending(userId, paymentType, ss) {
  // 1. 社費
  if (paymentType === "繳交社費" || paymentType === "combined") {
    var mSheet = ss.getSheetByName("Members");
    if (mSheet) {
      var mH = mSheet.getRange(1, 1, 1, mSheet.getLastColumn()).getValues()[0];
      var payCol = _fi(mH, "繳費狀態") + 1,
        sysCol = _fi(mH, "系統識別碼") + 1;
      if (payCol > 0 && sysCol > 0) {
        var matches = mSheet.createTextFinder(userId).matchEntireCell(true).findAll();
        for (var i = 0; i < matches.length; i++) {
          if (matches[i].getColumn() === sysCol) {
            var current = String(mSheet.getRange(matches[i].getRow(), payCol).getValue()).trim();
            if (current !== "已繳費 Paid") mSheet.getRange(matches[i].getRow(), payCol).setValue("待確認 Checking");
            break;
          }
        }
      }
    }
  }

  // 2. 活動
  if (paymentType === "combined" || paymentType === "activity" || String(paymentType).startsWith("活動：")) {
    var targetEventName = String(paymentType).startsWith("活動：") ? String(paymentType).split("活動：")[1].trim() : "ALL";
    var sSheet = ss.getSheetByName("Signups"),
      eSheet = ss.getSheetByName("Events");
    if (sSheet && eSheet) {
      var sH = sSheet.getRange(1, 1, 1, sSheet.getLastColumn()).getValues()[0];
      var payCol = _fi(sH, "繳費狀態") + 1,
        sysCol = _fi(sH, "系統識別碼") + 1;
      var statCol = _fi(sH, "審核結果") + 1,
        evtCol = _fi(sH, "活動編號") + 1;

      if (sysCol > 0 && payCol > 0 && statCol > 0) {
        var eData = eSheet.getDataRange().getDisplayValues();
        var eIdIdx = _fi(eData[0], "活動編號"),
          eNameIdx = _fi(eData[0], "活動名稱");
        var matches = sSheet.createTextFinder(userId).matchEntireCell(true).findAll();

        for (var j = 0; j < matches.length; j++) {
          if (matches[j].getColumn() === sysCol) {
            var row = matches[j].getRow();
            var st = String(sSheet.getRange(row, statCol).getValue());
            var pay = String(sSheet.getRange(row, payCol).getValue()).trim();
            if (st.indexOf("正取") > -1 && st.indexOf("取消") === -1 && pay !== "已繳費 Paid" && pay !== "待確認 Checking") {
              var eName = "";
              var evId = String(sSheet.getRange(row, evtCol).getValue()).trim();
              for (var k = 1; k < eData.length; k++) {
                if (eIdIdx > -1 && String(eData[k][eIdIdx]).trim() === evId) {
                  eName = eNameIdx > -1 ? String(eData[k][eNameIdx]).replace(/[&=]/g, '') : "";
                  break;
                }
              }
              if (targetEventName === "ALL" || targetEventName === eName) sSheet.getRange(row, payCol).setValue("待確認 Checking");
            }
          }
        }
      }
    }
  }

  // 3. 裝備
  if (paymentType === "combined" || paymentType === "equipment" || String(paymentType).startsWith("裝備：")) {
    var targetOrderId = String(paymentType).startsWith("裝備：") ? String(paymentType).split("裝備：")[1].split(" ")[0].trim() : "ALL";
    var lSheet = ss.getSheetByName("Loan_Records");
    if (lSheet) {
      var lH = lSheet.getRange(1, 1, 1, lSheet.getLastColumn()).getValues()[0];
      var sysCol = _fi(lH, "系統識別碼") + 1,
        payCol = _fi(lH, "繳費狀態") + 1;
      var statCol = _fi(lH, "領取/歸還") + 1,
        orderCol = _fi(lH, "租借編號") + 1;

      if (sysCol > 0 && payCol > 0 && statCol > 0) {
        var matches = lSheet.createTextFinder(userId).matchEntireCell(true).findAll();
        for (var l = 0; l < matches.length; l++) {
          if (matches[l].getColumn() === sysCol) {
            var row = matches[l].getRow();
            var lst = String(lSheet.getRange(row, statCol).getValue());
            var lPay = String(lSheet.getRange(row, payCol).getValue()).trim();
            if (lst.indexOf("取消") === -1 && lst.indexOf("歸還") === -1 && lPay !== "已繳費 Paid" && lPay !== "待確認 Checking") {
              var curOrder = orderCol > 0 ? String(lSheet.getRange(row, orderCol).getValue()).trim() : "";
              if (targetOrderId === "ALL" || targetOrderId === curOrder) lSheet.getRange(row, payCol).setValue("待確認 Checking");
            }
          }
        }
      }
    }
  }
}

// ⭐️ 引擎二：確認無誤後標記獨立欄位為「已繳費」 (100% 全動態防彈版 + 效能優化版)
// 💡 全域效能優化：改用 TextFinder 快速鎖定特定社員，避免大量陣列讀取與運算！
function processPaymentConfirmation(userId, paymentType, ss) {
  // 1. 社費
  if (paymentType === "繳交社費" || paymentType === "combined") {
    var mSheet = ss.getSheetByName("Members");
    if (mSheet) {
      var mH = mSheet.getRange(1, 1, 1, mSheet.getLastColumn()).getValues()[0];
      var payCol = _fi(mH, "繳費狀態") + 1,
        sysCol = _fi(mH, "系統識別碼") + 1;
      if (payCol > 0 && sysCol > 0) {
        var matches = mSheet.createTextFinder(userId).matchEntireCell(true).findAll();
        for (var i = 0; i < matches.length; i++) {
          if (matches[i].getColumn() === sysCol) {
            var current = String(mSheet.getRange(matches[i].getRow(), payCol).getValue()).trim();
            if (current !== "已繳費 Paid") mSheet.getRange(matches[i].getRow(), payCol).setValue("已繳費 Paid");
            break;
          }
        }
      }
    }
  }

  // 2. 活動
  if (paymentType === "combined" || paymentType === "activity" || String(paymentType).startsWith("活動：")) {
    var targetEventName = String(paymentType).startsWith("活動：") ? String(paymentType).split("活動：")[1].trim() : "ALL";
    var sSheet = ss.getSheetByName("Signups"),
      eSheet = ss.getSheetByName("Events");
    if (sSheet && eSheet) {
      var sH = sSheet.getRange(1, 1, 1, sSheet.getLastColumn()).getValues()[0];
      var payCol = _fi(sH, "繳費狀態") + 1,
        sysCol = _fi(sH, "系統識別碼") + 1;
      var statCol = _fi(sH, "審核結果") + 1,
        evtCol = _fi(sH, "活動編號") + 1;

      if (sysCol > 0 && payCol > 0 && statCol > 0) {
        var eData = eSheet.getDataRange().getDisplayValues();
        var eIdIdx = _fi(eData[0], "活動編號"),
          eNameIdx = _fi(eData[0], "活動名稱");
        var matches = sSheet.createTextFinder(userId).matchEntireCell(true).findAll();

        for (var j = 0; j < matches.length; j++) {
          if (matches[j].getColumn() === sysCol) {
            var row = matches[j].getRow();
            var st = String(sSheet.getRange(row, statCol).getValue());
            var pay = String(sSheet.getRange(row, payCol).getValue()).trim();
            if (st.indexOf("正取") > -1 && st.indexOf("取消") === -1 && pay !== "已繳費 Paid") {
              var eName = "";
              var evId = String(sSheet.getRange(row, evtCol).getValue()).trim();
              for (var k = 1; k < eData.length; k++) {
                if (eIdIdx > -1 && String(eData[k][eIdIdx]).trim() === evId) {
                  eName = eNameIdx > -1 ? String(eData[k][eNameIdx]).replace(/[&=]/g, '') : "";
                  break;
                }
              }
              if (targetEventName === "ALL" || targetEventName === eName) sSheet.getRange(row, payCol).setValue("已繳費 Paid");
            }
          }
        }
      }
    }
  }

  // 3. 裝備
  if (paymentType === "combined" || paymentType === "equipment" || String(paymentType).startsWith("裝備：")) {
    var targetOrderId = String(paymentType).startsWith("裝備：") ? String(paymentType).split("裝備：")[1].split(" ")[0].trim() : "ALL";
    var lSheet = ss.getSheetByName("Loan_Records");
    if (lSheet) {
      var lH = lSheet.getRange(1, 1, 1, lSheet.getLastColumn()).getValues()[0];
      var sysCol = _fi(lH, "系統識別碼") + 1,
        payCol = _fi(lH, "繳費狀態") + 1;
      var statCol = _fi(lH, "領取/歸還") + 1,
        orderCol = _fi(lH, "租借編號") + 1;

      if (sysCol > 0 && payCol > 0 && statCol > 0) {
        var matches = lSheet.createTextFinder(userId).matchEntireCell(true).findAll();
        for (var l = 0; l < matches.length; l++) {
          if (matches[l].getColumn() === sysCol) {
            var row = matches[l].getRow();
            var lst = String(lSheet.getRange(row, statCol).getValue());
            var lPay = String(lSheet.getRange(row, payCol).getValue()).trim();
            if (lst.indexOf("取消") === -1 && lst.indexOf("歸還") === -1 && lPay !== "已繳費 Paid") {
              var curOrder = orderCol > 0 ? String(lSheet.getRange(row, orderCol).getValue()).trim() : "";
              if (targetOrderId === "ALL" || targetOrderId === curOrder) lSheet.getRange(row, payCol).setValue("已繳費 Paid");
            }
          }
        }
      }
    }
  }
}

// ⭐️ 產生「幹部是誰」精美輪播卡片 (100% 全動態防彈版 / 雙語升級)
// 【函式說明】
// 當社員點擊「幹部是誰」時，系統會啟動這個「數位名片牆」功能。
// 系統會去「Officers (幹部名單)」分頁，抓取每一位幹部的照片、職稱與負責業務。
// 如果幹部有附上合法的照片網址，卡片上方就會顯示大大的頭像。
// 為了避免版面壞掉，本程式內建了「自動填補預設值」的防呆機制，
// 就算幹部忘了寫「給社員的話」，系統也會自動幫他補上歡迎詞！
function sendOfficerMenu(replyToken, ss) {
  try {
    var sheet = ss.getSheetByName("Officers");
    var data = sheet.getDataRange().getDisplayValues();
    if (data.length <= 1) {
      replyMessage(replyToken, "目前還沒有建立幹部資料喔！敬請期待。\n─────────────\nOfficer data not set up yet. Stay tuned!");
      return;
    }

    var headers = data[0];
    var roleIdx = headers.findIndex(function (h) {
      return String(h).includes("職稱") || String(h).includes("職位");
    });
    var nameIdx = headers.findIndex(function (h) {
      return String(h).includes("姓名") || String(h).includes("名字");
    });
    var photoIdx = headers.findIndex(function (h) {
      return String(h).includes("照片") || String(h).includes("圖片");
    });
    var dutyIdx = headers.findIndex(function (h) {
      return String(h).includes("負責業務") || String(h).includes("負責");
    });
    var quoteIdx = headers.findIndex(function (h) {
      return String(h).includes("給社員的話") || String(h).includes("介紹") || String(h).includes("備註");
    });

    var bubbles = [];

    if (nameIdx === -1) {
      replyMessage(replyToken, "⚠️ 幹部名單的「姓名」欄位遺失了，請通知管理員檢查試算表！\n─────────────\n⚠️ 'Name' column is missing in the Officer sheet!");
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

        if (photoUrl && (photoUrl.startsWith("http://") || photoUrl.startsWith("https://"))) {
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
      replyMessage(replyToken, "目前還沒有建立幹部資料喔！敬請期待。\n─────────────\nOfficer data not set up yet. Stay tuned!");
    } else {
      replyFlexMessage(replyToken, "來認識一下登山社幹部吧！ / Meet the club officers!", {
        "type": "carousel",
        "contents": bubbles
      });
    }

  } catch (err) {
    console.error("幹部名單載入失敗:", err);
    replyMessage(replyToken, "⚠️ 讀取幹部名單時發生錯誤，請稍後再試。\n─────────────\n⚠️ Error loading officer list, please try again later.");
  }
}

// ⭐️ 系統每日自動巡檢：社籍過期與活動報名截止 (全動態防彈版)
// 【函式說明】
// 這是一個設計給「時間驅動觸發器 (Time-driven Trigger)」使用的背景排程程式。
// 建議在 Apps Script 後台設定為「每天凌晨 1:00 ~ 2:00」自動執行一次。
// 它的任務有兩個：
// 1. 巡邏 Members 表：把「社籍到期日」早於今天的社員，自動標記為「未繳費」。
// 2. 巡邏 Events 表：把「報名截止日」早於今天的活動，自動把狀態改成「關閉」。
// 巡邏完畢後，它會整理一份報表傳送到幹部群組 (如果打開推播功能的話)。
function dailySystemCheck() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var requiredSheets = ["Members", "Events", "Signups", "Loan_Records", "Payments", "Equipments", "Officers"];
  var missingSheets = requiredSheets.filter(function (name) {
    return !ss.getSheetByName(name);
  });

  if (missingSheets.length > 0) {
    pushAdminMessage("🔔 【每日系統健檢通知】\n\n⚠️ 偵測到以下分頁缺失：\n" + missingSheets.join("\n") + "\n\n請盡速建立以上分頁，否則相關功能將無法正常運作！");
  }
}

// ⭐️ AI 聊天引擎：結合動態資料與 Docs 知識庫的終極版 (雙語防呆版)
// 【函式說明】
// 這是我們 AI 助理「小山/小岳 (Yue)」的核心大腦！
// 當社員在文字框輸入「小岳 xxx」時，問題就會傳送到這裡。
// 本程式使用了業界最強的 RAG (Retrieval-Augmented Generation) 架構：
// 1. 先去試算表抓「最新活動」(動態知識)。
// 2. 再去 Google Docs 抓「社團規章」(靜態知識)。
// 3. 把這些知識連同社員的問題，一起打包送給 Google Gemini 2.5 AI 模型。
// 這樣 AI 就絕對不會亂回答，而且會嚴格遵守我們設定的活潑個性！
function talkToGemini(question) {
  try {
    var eventsContext = getPublicEventsInfo();
    var clubKnowledge = getClubKnowledgeFromDoc();

    // ==========================================
    // 🧠 階段二：建構系統提示詞 (System Prompt)
    // 💡 這是賦予 AI 靈魂與規則的最高指導原則！
    // ==========================================
    var systemPrompt = `
      你現在是台灣某大學登山社的專屬 AI 助理，名字叫「小山」、「Yue」。
      你的個性活潑、熱心、幽默，回覆時喜歡加上 Emoji (如 ⛰️、🏕️、🎒) 和登山術語。
      
      【你的最高原則】
      1. 你的職責是解答社員關於「登山基礎知識、裝備保養、體能訓練」、「社團最新活動」以及「社團各項規章」的問題。
      2. 如果有人問你無關的問題，請幽默地拒絕。
      3. 如果有人問「怎麼報名活動」、「怎麼借裝備」、「怎麼繳費」，請務必回答：「這個可以直接點擊 LINE 下方的『圖文選單』來操作喔！超級方便的啦！✨」。
      4. ⚠️ 極度重要排版規則：絕對不要使用任何 Markdown 語法（例如不要用 **粗體**、不要用 # 標題）。請一律只使用「純文字」加上「適當的換行」與「Emoji」來排版！
      5. 語言自動偵測：請嚴格根據社員發問的語言來回答。如果社員用英文問，你就用全英文回答；如果用印尼文，你就用印尼文回答。
      
      👇👇👇 (這是系統剛剛從試算表抓取的【最新活動資料】) 👇👇👇
      ${eventsContext}
  
      👇👇👇 (這是社團幹部撰寫的【社團百科全書規章】) 👇👇👇
      請務必優先根據以下提供的資料來回答社員的問題：
      ${clubKnowledge}
    `;

    // ==========================================
    // 📦 階段三：打包資料送往 Google 伺服器
    // ==========================================
    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY;

    var payload = {
      // 放入剛剛寫好的最高指導原則 (System Instruction)
      "system_instruction": {
        "parts": [{
          "text": systemPrompt
        }]
      },
      // 放入社員真正問的問題
      "contents": [{
        "parts": [{
          "text": question
        }]
      }]
    };
    var response = UrlFetchApp.fetch(url, {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    });
    var json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates.length > 0 && json.candidates[0].content) {
      return json.candidates[0].content.parts[0].text;
    }
    return "小岳剛剛在山上收訊不好，沒聽清楚，請再說一次喔！⛰️\n─────────────\nYue has a bad signal on the mountain, please say that again! ⛰️。";
  } catch (error) {
    console.error("Gemini API error:", error);
    return "哎呀，小岳去營地打水了，暫時不在座位上喔！\n─────────────\nOops, Yue went to fetch water at the camp and is currently away! ";
  }
}

// ⭐️ 安全隔離牆：只抓取「公開活動」資訊餵給 AI (雙語升級版)
// 【函式說明】
// 這是一個「資料守門員」。為了防止 AI 助理 (小岳) 不小心洩漏社團的機密資料
// (例如尚未定案的活動、或是已被關閉的行程)，
// 我們只允許 AI 透過這個函式拿到「目前對外開放報名中」的活動清單。
// AI 拿到這串乾淨、安全的雙語字串後，就能自然且安全地回答社員的詢問！
function getPublicEventsInfo() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var eventSheet = ss.getSheetByName("Events");
    if (!eventSheet) return "";
    var data = eventSheet.getDataRange().getDisplayValues();
    if (data.length <= 1) return "";

    var headers = data[0];
    var result = "";
    for (var i = 1; i < data.length; i++) {
      result += data[i].join(" | ") + "\n";
    }
    return result;
  } catch (e) {
    return "";
  }
}

// ⭐️ AI 知識庫：讀取 Google Docs 雲端大腦 (防呆除錯版)
// 【函式說明】
// 這是 AI 助理小山/小岳的「靜態記憶庫 (Knowledge Base)」。
// 它可以讓不懂程式的幹部，直接在一個普通的 Google 文件 (Google Docs) 裡面，
// 用白話文打上社團的歷史、裝備清單、入社規章、甚至是常見 Q&A。
// 當社員用 LINE 問問題時，系統會瞬間去讀取那份文件的所有文字，
// 並把它當作背景知識餵給 AI，讓 AI 能夠回答社團專屬的客製化問題，不再憑空捏造！
function getClubKnowledgeFromDoc() {
  try {
    var docId = "1MJyA7a0X5fZr-JR3sHCG1I3p1gvL0X2QkJJ1cYmVxLI";
    var doc = DocumentApp.openById(docId);
    var text = doc.getBody().getText();
    return text.substring(0, 3000);
  } catch (e) {
    return "";
  }
}

// ⭐️ 傳送意見回饋表單連結

// 📢 全新功能：發送意見與回饋表單連結
function sendFeedbackLink(replyToken) {
  var googleFormUrl = "https://forms.gle/bCT7fjVP3bSrReF96";

  var msg = "📢 【意見與回饋 / Feedback & Suggestions】\n\n" +
    "無論是想對社團說的話、活動建議、問題詢問，還是回報系統錯誤 (可附截圖)，都歡迎透過下方表單告訴我們！\n\n" +
    "Whether you have suggestions, questions, or want to report a bug (screenshots supported), please let us know!\n\n" +
    "👉 點此填寫回饋表單 Click here to fill out the feedback form：\n" + googleFormUrl + "\n\n" +
    "收到您的回饋後，幹部會盡快查看並處理喔！After receiving your feedback, the club officers will review and handle it as soon as possible!🏔️";

  replyMessage(replyToken, msg);
}

// ⭐️ 表單送出觸發器 - 意見回饋 (自動寄送 Email)

// 📧 表單提交觸發：自動寄送完整內容 Email (動態掃描表頭版)
function onFeedbackSubmit(e) {
  try {
    var adminEmail = "ntustmountain@gmail.com";
    var sheet = e.range.getSheet();
    if (sheet.getName() !== "Feedbacks") return;

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rowData = e.range.getValues()[0];

    var nameIdx = headers.findIndex(function (h) {
      return String(h).includes("姓名");
    });
    var emailIdx = headers.findIndex(function (h) {
      return String(h).toUpperCase().includes("EMAIL") || String(h).includes("信箱");
    });
    var feedbackIdx = headers.findIndex(function (h) {
      return String(h).includes("想說的話") || String(h).includes("內容") || String(h).includes("回饋");
    });
    var fileIdx = headers.findIndex(function (h) {
      return String(h).includes("檔案") || String(h).includes("附件") || String(h).includes("上傳");
    });

    var name = (nameIdx > -1 && rowData[nameIdx]) ? String(rowData[nameIdx]).trim() : "匿名";
    var email = (emailIdx > -1 && rowData[emailIdx]) ? String(rowData[emailIdx]).trim() : "未提供";
    var feedback = (feedbackIdx > -1 && rowData[feedbackIdx]) ? String(rowData[feedbackIdx]).trim() : "無內容";
    var fileUrl = (fileIdx > -1 && rowData[fileIdx]) ? String(rowData[fileIdx]).trim() : "無附件";

    var subject = "🔔 【社團意見回饋】收到來自 " + name + " 的新訊息";
    var body = "幹部您好，\n\n" +
      "系統剛剛收到了一筆新的意見與回饋，詳細內容如下：\n" +
      "──────────────────────\n" +
      "👤 姓名：" + name + "\n" +
      "📧 聯絡信箱：" + email + "\n" +
      "💬 想說的話：\n" + feedback + "\n\n" +
      "📎 附檔連結：" + fileUrl + "\n" +
      "──────────────────────\n\n" +
      "請幹部盡快查閱並評估是否需要回覆喔！🏕️\n" +
      "(此信件由系統自動發送)";

    MailApp.sendEmail(adminEmail, subject, body);
  } catch (err) {
    console.error("寄送信件失敗：" + err.message);
  }
}

// ⭐️ 升級版：提供給 LIFF 前端呼叫的 API 路由器
function doGet(e) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 檢查前端是否有傳入 action 參數，若無則預設為 "get_equipments"
    var action = (e.parameter && e.parameter.action) ? e.parameter.action : "get_equipments";

    if (action === "get_unpaid") {
      var userId = e.parameter.userId;
      if (!userId) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "缺少 userId 參數" })).setMimeType(ContentService.MimeType.JSON);
      }
      // 呼叫未繳費清單處理引擎
      return getUnpaidListAPI(ss, userId);
      
    } else if (action === "get_profile") {
      var userId = e.parameter.userId;
      if (!userId) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "缺少 userId 參數" })).setMimeType(ContentService.MimeType.JSON);
      }
      return getMemberProfileAPI(ss, userId);

    } else if (action === "get_my_status") {
      var userId = e.parameter.userId;
      if (!userId) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "缺少 userId 參數" })).setMimeType(ContentService.MimeType.JSON);
      }
      return getMyStatusAPI(ss, userId);

    } else if (action === "get_payment_history") {
      var userId = e.parameter.userId;
      if (!userId) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "缺少 userId 參數" })).setMimeType(ContentService.MimeType.JSON);
      }
      return getPaymentHistoryAPI(ss, userId);

    } else if (action === "get_past_activities") {
      var userId = e.parameter.userId;
      if (!userId) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "缺少 userId 參數" })).setMimeType(ContentService.MimeType.JSON);
      }
      return getPastActivitiesAPI(ss, userId);

    } else if (action === "get_equipments") {
      // 呼叫原本的裝備清單處理引擎
      return getEquipmentsListAPI(ss);
      
    } else {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "未知的 action 參數" })).setMimeType(ContentService.MimeType.JSON);
    }
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: "GAS 後端執行錯誤: " + error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------------
// 引擎 1：取得可借用裝備清單 (原本 doGet 的邏輯)
// ------------------------------------------------------------------
function getEquipmentsListAPI(ss) {
  var equipSheet = ss.getSheetByName("Equipments");
  if (!equipSheet) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "找不到名為 Equipments 的裝備表" })).setMimeType(ContentService.MimeType.JSON);
  }

  var data = equipSheet.getDataRange().getDisplayValues();
  var headers = data[0];
  
  if (typeof _fi !== "function") {
     return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "系統缺少 _fi 共用函式" })).setMimeType(ContentService.MimeType.JSON);
  }

  var hIdx = {
    id: _fi(headers, "裝備代號"),
    name: _fi(headers, "裝備名稱"),
    remainQty: _fi(headers, "剩餘數量"),
    borrowable: _fi(headers, "是否外借"),
    price2Days: _fi(headers, "2天"),
    priceExtra: _fi(headers, "+1天"),
    status: _fi(headers, "狀態")
  };

  var availableEquipments = [];

  for (var i = 1; i < data.length; i++) {
    var isBorrowable = hIdx.borrowable > -1 ? data[i][hIdx.borrowable] : "";
    var status = hIdx.status > -1 ? data[i][hIdx.status] : "";
    var remainQty = hIdx.remainQty > -1 ? parseInt(data[i][hIdx.remainQty], 10) : 0;

    if (isBorrowable === "可外借" && remainQty > 0 && status !== "維修中" && status !== "報廢" && status !== "需汰換" && status !== "待測") {
      availableEquipments.push({
        id: hIdx.id > -1 ? data[i][hIdx.id] : "",
        name: hIdx.name > -1 ? data[i][hIdx.name] : "未知裝備",
        remainQty: remainQty,
        price: hIdx.price2Days > -1 ? parseInt(data[i][hIdx.price2Days], 10) || 0 : 0,
        priceExtra: hIdx.priceExtra > -1 ? parseInt(data[i][hIdx.priceExtra], 10) || 0 : 0
      });
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "success", data: availableEquipments })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------
// 引擎 2：取得社員未繳費清單 (為繳費系統打造)
// ------------------------------------------------------------------
function getUnpaidListAPI(ss, userId) {
  var responseData = {
    membership: [],
    activities: [],
    equipments: []
  };

  // 📌 1. 抓取社費欠款
  var mSheet = ss.getSheetByName("Members");
  if (mSheet) {
    var mData = mSheet.getDataRange().getValues();
    var mSysIdx = _fi(mData[0], "系統識別碼");
    var mPayIdx = _fi(mData[0], "繳費狀態");
    for (var i = 1; i < mData.length; i++) {
      if (mSysIdx > -1 && mData[i][mSysIdx] === userId) {
        var payStatus = String(mData[i][mPayIdx]).trim();
        // 只要不是「已繳費」或「待確認」，就列入未繳費清單
        if (payStatus !== "已繳費 Paid" && payStatus !== "待確認 Checking" && payStatus !== "是") {
          responseData.membership.push({
            id: "fee_membership",
            name: "社籍與社費 (Membership Fee)",
            amount: 200 // 依據你先前的設定，這裡預設為 200
          });
        }
        break; // 系統識別碼唯一，找到即可跳出
      }
    }
  }

  // 📌 2. 抓取活動報名欠款
  var sSheet = ss.getSheetByName("Signups");
  var eSheet = ss.getSheetByName("Events");
  if (sSheet && eSheet) {
    var sData = sSheet.getDataRange().getValues();
    var eData = eSheet.getDataRange().getDisplayValues();
    
    var sSysIdx = _fi(sData[0], "系統識別碼");
    var sStatIdx = _fi(sData[0], "審核結果");
    var sPayIdx = _fi(sData[0], "繳費狀態");
    var sEvtIdx = _fi(sData[0], "活動編號");
    
    var eIdIdx = _fi(eData[0], "活動編號");
    var eNameIdx = _fi(eData[0], "活動名稱");
    var eCostIdx = eData[0].findIndex(function(h) { return String(h).includes("預計費用") || String(h).includes("費用"); });

    for (var s = 1; s < sData.length; s++) {
      if (sSysIdx > -1 && sData[s][sSysIdx] === userId) {
        var st = String(sData[s][sStatIdx]);
        var pay = String(sData[s][sPayIdx]).trim();
        // 條件：正取且未取消，且狀態不為已繳或待確認
        if (st.indexOf("正取") > -1 && st.indexOf("取消") === -1 && pay !== "已繳費 Paid" && pay !== "待確認 Checking") {
          var evId = String(sData[s][sEvtIdx]).trim();
          for (var e = 1; e < eData.length; e++) {
            if (eIdIdx > -1 && String(eData[e][eIdIdx]).trim() === evId) {
              var costStr = eCostIdx > -1 ? String(eData[e][eCostIdx]) : "0";
              var cost = parseInt(costStr.replace(/\D/g, ''), 10) || 0;
              if (cost > 0) {
                responseData.activities.push({
                  id: "act_" + evId,
                  name: "活動：" + (eNameIdx > -1 ? String(eData[e][eNameIdx]).replace(/[&=]/g, '') : "未知活動"),
                  amount: cost
                });
              }
              break;
            }
          }
        }
      }
    }
  }

  // 📌 3. 抓取裝備租借欠款
  var lSheet = ss.getSheetByName("Loan_Records");
  if (lSheet) {
    var lData = lSheet.getDataRange().getValues();
    var lSysIdx = _fi(lData[0], "系統識別碼");
    var lStatIdx = _fi(lData[0], "領取/歸還");
    var lPayIdx = _fi(lData[0], "繳費狀態");
    var lOrderIdx = _fi(lData[0], "租借編號");
    var lNameIdx = _fi(lData[0], "裝備名稱");
    var lCostIdx = lData[0].findIndex(function(h) { return String(h).includes("應繳費用") || String(h).includes("費用"); });

    for (var l = 1; l < lData.length; l++) {
      if (lSysIdx > -1 && lData[l][lSysIdx] === userId) {
        var lst = String(lData[l][lStatIdx]);
        var lpay = String(lData[l][lPayIdx]).trim();
        // 條件：未取消、未歸還，且狀態不為已繳或待確認
        if (lst.indexOf("取消") === -1 && lst.indexOf("歸還") === -1 && lpay !== "已繳費 Paid" && lpay !== "待確認 Checking") {
          var costStr = lCostIdx > -1 ? String(lData[l][lCostIdx]) : "0";
          var cost = parseInt(costStr.replace(/\D/g, ''), 10) || 0;
          var orderId = lOrderIdx > -1 ? String(lData[l][lOrderIdx]).trim() : "未知訂單";
          if (cost > 0) {
            responseData.equipments.push({
              id: "eq_" + orderId,
              name: "裝備：" + (lNameIdx > -1 ? String(lData[l][lNameIdx]).trim() : "未知裝備"),
              amount: cost,
              orderId: orderId
            });
          }
        }
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "success", data: responseData })).setMimeType(ContentService.MimeType.JSON);
}

// ⭐️ 新增：處理 LIFF 多選裝備租借的專屬引擎
function processMultiLoan(payload) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Loan_Records");
  var equipSheet = ss.getSheetByName("Equipments");
  var mSheet = ss.getSheetByName("Members");
  
  var userId = payload.userId;
  var details = payload.details;
  
  // 1. 取得社員基本資料
  var mData = mSheet.getDataRange().getValues();
  var sysIdx = _fi(mData[0], "系統識別碼");
  var userName = "未知社員";
  var isOfficial = "否";
  
  for (var i = 1; i < mData.length; i++) {
    if (sysIdx > -1 && mData[i][sysIdx] === userId) {
      userName = mData[i][_fi(mData[0], "姓名")] || "未知社員";
      var payStatus = mData[i][_fi(mData[0], "繳費狀態")] || "";
      if (String(payStatus).trim() === "已繳費 Paid") isOfficial = "是";
      break;
    }
  }

  // 2. 準備寫入資料與鎖定庫存
  var orderId = "R" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMddHHmmss");
  var lHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var eData = equipSheet.getDataRange().getValues();
  var eIdIdx = _fi(eData[0], "裝備代號");
  
  var totalCost = 0;
  var summaryText = [];
  
  // 為了安全起見，這裡應該要加上 LockService (如同你原本的寫法)
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    
    // 遍歷購物車內的每一項裝備
    var cartKeys = Object.keys(details.cart);
    for (var k = 0; k < cartKeys.length; k++) {
      var equipId = cartKeys[k];
      var qty = details.cart[equipId];
      
      for (var j = 1; j < eData.length; j++) {
        if (eIdIdx > -1 && eData[j][eIdIdx] === equipId) {
          var equipName = eData[j][_fi(eData[0], "裝備名稱")];
          var eStockIdx = _fi(eData[0], "剩餘數量");
          var currentStock = parseInt(eData[j][eStockIdx], 10) || 0;
          
          // 扣除庫存
          equipSheet.getRange(j + 1, eStockIdx + 1).setValue(currentStock - qty);
          
          // 計算費用 (依照借用天數計算：前 2 天為基本價，超過 2 天按日加價)
          var pickupDate = new Date(details.pickupDate);
          var returnDate = new Date(details.returnDate);
          var diffTime = Math.abs(returnDate - pickupDate);
          var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
          
          var price2 = parseInt(eData[j][_fi(eData[0], "2天")], 10) || 0;
          var priceExtra = parseInt(eData[j][_fi(eData[0], "+1天")], 10) || 0;
          
          var extraDays = Math.max(0, diffDays - 2);
          var baseCost = price2 + extraDays * priceExtra;
          
          var itemCost = (isOfficial === "是") ? Math.ceil((baseCost * qty) / 2) : (baseCost * qty);
          totalCost += itemCost;
          
          summaryText.push(equipName + " x" + qty);
          
          // 寫入 Loan_Records
          var newRow = new Array(lHeaders.length).fill("");
          newRow[_fi(lHeaders, "系統識別碼")] = userId;
          newRow[_fi(lHeaders, "姓名")] = userName;
          newRow[_fi(lHeaders, "租借編號")] = orderId;
          newRow[_fi(lHeaders, "裝備代號")] = equipId;
          newRow[_fi(lHeaders, "裝備名稱")] = equipName;
          newRow[_fi(lHeaders, "數量")] = qty;
          newRow[_fi(lHeaders, "預計領取")] = details.pickupDate;
          newRow[_fi(lHeaders, "預計歸還")] = details.returnDate;
          newRow[_fi(lHeaders, "用途")] = details.purpose;
          newRow[_fi(lHeaders, "應繳費用")] = itemCost;
          newRow[_fi(lHeaders, "領取/歸還")] = "待領取 To Be Collected";
          newRow[_fi(lHeaders, "繳費狀態")] = "未繳費 Unpaid";
          newRow[_fi(lHeaders, "是否為社員")] = isOfficial;
          
          sheet.appendRow(newRow);
          break;
        }
      }
    }
  } catch (e) {
    console.error("處理多選訂單失敗", e);
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "系統忙碌中" })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }

  // 3. 發送幹部通知推播
  var adminMsg = "🔔 【幹部通知：新裝備預約 (多選合併)】\n\n申請人：" + userName + " (" + isOfficial + "社員)\n訂單編號：" + orderId + "\n領取：" + details.pickupDate + "\n歸還：" + details.returnDate + "\n\n📦 借用明細：\n" + summaryText.join("\n") + "\n\n💰 總金額：$" + totalCost;
  if (typeof pushAdminMessage === "function") pushAdminMessage(adminMsg);

  // 4. 回傳成功狀態給 LIFF 前端
  return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
}

// ⭐️ 新增：處理 LIFF 繳費申報的專屬引擎
function processPaymentSubmit(payload) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var paySheet = ss.getSheetByName("Payments");
  var mSheet = ss.getSheetByName("Members");
  var sSheet = ss.getSheetByName("Signups");
  var lSheet = ss.getSheetByName("Loan_Records");
  
  var userId = payload.userId;
  var details = payload.details; // details: { selectedIds: string[], last5Digits: string, totalAmount: number }
  
  // 1. 取得姓名與社員狀態
  var mData = mSheet.getDataRange().getValues();
  var sysIdx = _fi(mData[0], "系統識別碼");
  var userName = "未知社員";
  var isOfficial = "否";
  for (var i = 1; i < mData.length; i++) {
    if (sysIdx > -1 && mData[i][sysIdx] === userId) {
      userName = mData[i][_fi(mData[0], "姓名")] || "未知社員";
      var payStatus = mData[i][_fi(mData[0], "繳費狀態")] || "";
      if (String(payStatus).trim() === "已繳費 Paid") isOfficial = "是";
      break;
    }
  }
  
  var confirmedItems = [];
  var insertedRowIndex = 0;
  
  // 2. 鎖定並更改狀態為 "待確認 Checking" (加鎖防止並發衝突)
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    
    var selectedIds = details.selectedIds;
    
    for (var k = 0; k < selectedIds.length; k++) {
      var itemId = selectedIds[k];
      
      // A. 社費
      if (itemId === "fee_membership") {
        var mPayIdx = _fi(mData[0], "繳費狀態");
        for (var m = 1; m < mData.length; m++) {
          if (sysIdx > -1 && mData[m][sysIdx] === userId) {
            mSheet.getRange(m + 1, mPayIdx + 1).setValue("待確認 Checking");
            confirmedItems.push("🔸 社籍與社費 (Membership Fee)");
            break;
          }
        }
      }
      // B. 活動
      else if (itemId.startsWith("act_")) {
        var targetEventId = itemId.substring(4);
        var sData = sSheet.getDataRange().getValues();
        var sSysIdx = _fi(sData[0], "系統識別碼");
        var sPayIdx = _fi(sData[0], "繳費狀態");
        var sEvtIdx = _fi(sData[0], "活動編號");
        for (var s = 1; s < sData.length; s++) {
          if (sSysIdx > -1 && sData[s][sSysIdx] === userId && sEvtIdx > -1 && String(sData[s][sEvtIdx]).trim() === targetEventId) {
            sSheet.getRange(s + 1, sPayIdx + 1).setValue("待確認 Checking");
            var eventName = _getEventName(ss, targetEventId);
            confirmedItems.push("🔸 活動：" + eventName);
            break;
          }
        }
      }
      // C. 裝備
      else if (itemId.startsWith("eq_")) {
        var targetOrderId = itemId.substring(3);
        var lData = lSheet.getDataRange().getValues();
        var lSysIdx = _fi(lData[0], "系統識別碼");
        var lPayIdx = _fi(lData[0], "繳費狀態");
        var lOrderIdx = _fi(lData[0], "租借編號");
        var lName1Idx = _fi(lData[0], "裝備名稱");
        var lName2Idx = _fi(lData[0], "租借項目");
        var lIdIdx = _fi(lData[0], "裝備代號");
        for (var l = 1; l < lData.length; l++) {
          if (lSysIdx > -1 && lData[l][lSysIdx] === userId && lOrderIdx > -1 && String(lData[l][lOrderIdx]).trim() === targetOrderId) {
            lSheet.getRange(l + 1, lPayIdx + 1).setValue("待確認 Checking");
            var equipName = _getEquipName(lData[l], lName1Idx, lName2Idx, lIdIdx, "未知裝備");
            confirmedItems.push("🔹 裝備：" + equipName);
          }
        }
      }
    }
    
    // 3. 寫入 Payments 工作表
    if (paySheet) {
      var pHeaders = paySheet.getRange(1, 1, 1, paySheet.getLastColumn()).getValues()[0];
      var newRow = new Array(pHeaders.length).fill("");
      
      newRow[_fi(pHeaders, "時間")] = new Date();
      newRow[_fi(pHeaders, "姓名")] = userName;
      newRow[_fi(pHeaders, "系統識別碼")] = userId;
      newRow[_fi(pHeaders, "繳費項目")] = confirmedItems.join(", ");
      newRow[_fi(pHeaders, "金額")] = details.totalAmount;
      newRow[_fi(pHeaders, "帳號末5碼")] = details.last5Digits;
      newRow[_fi(pHeaders, "對帳狀態")] = "待核對";
      
      paySheet.appendRow(newRow);
      insertedRowIndex = paySheet.getLastRow();
    }
    
  } catch (e) {
    console.error("處理繳費申報失敗", e);
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "系統忙碌中：" + e.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
  
  // 4. 發送推播通知幹部對帳 Flex Message
  var altText = "🔔 收到一筆新對帳申報！";
  var postbackData = "action=admin_confirm&row=" + insertedRowIndex + "&userId=" + userId + "&type=combined";
  
  var flexContent = {
    "type": "bubble",
    "header": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "💰 繳費核對申請",
          "weight": "bold",
          "size": "lg",
          "color": "#ffffff"
        }
      ],
      "backgroundColor": "#10b981"
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "👤 申報人：" + userName,
          "weight": "bold",
          "size": "md"
        },
        {
          "type": "text",
          "text": "💵 申報金額：$" + details.totalAmount,
          "weight": "bold",
          "size": "md",
          "color": "#059669",
          "margin": "sm"
        },
        {
          "type": "text",
          "text": "🔢 帳號末5碼：" + details.last5Digits,
          "weight": "bold",
          "size": "md",
          "margin": "sm"
        },
        {
          "type": "separator",
          "margin": "md"
        },
        {
          "type": "text",
          "text": "📋 申報明細：\n" + confirmedItems.join("\n"),
          "wrap": true,
          "size": "sm",
          "color": "#475569",
          "margin": "md"
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "button",
          "style": "primary",
          "color": "#10b981",
          "action": {
            "type": "postback",
            "label": "✅ 確認無誤並發送通知",
            "data": postbackData
          }
        }
      ]
    }
  };
  
  if (typeof pushAdminFlexMessage === "function") {
    pushAdminFlexMessage(altText, flexContent);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------
// 引擎 4：查詢社員基本資料 API (供 LIFF 前端註冊/更新預載資料)
// ------------------------------------------------------------------
function getMemberProfileAPI(ss, userId) {
  var memberSheet = ss.getSheetByName("Members");
  if (!memberSheet) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "找不到 Members 資料表" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var mData = memberSheet.getDataRange().getValues();
  var mH = mData.length > 0 ? mData[0] : [];
  var mSysIdx = _fi(mH, "系統識別碼");
  
  var profile = null;
  var isMember = false;
  
  for (var i = 1; i < mData.length; i++) {
    if (mSysIdx > -1 && mData[i][mSysIdx] === userId) {
      isMember = true;
      profile = {};
      
      profile.name = mData[i][_fi(mH, "姓名")] || "";
      profile.gender = mData[i][_fi(mH, "性別")] || "";
      profile.realLineId = mData[i][mH.findIndex(function (h) { return String(h).toUpperCase().includes("LINE"); })] || "";
      profile.email = mData[i][mH.findIndex(function (h) { return String(h).toUpperCase().includes("EMAIL") || String(h).includes("信箱"); })] || "";
      profile.phone = mData[i][mH.findIndex(function (h) { return String(h).includes("電話") && !String(h).includes("緊急"); })] || "";
      profile.department = mData[i][_fi(mH, "系所")] || "";
      profile.studentId = mData[i][_fi(mH, "學號")] || "";
      
      var birthdayVal = mData[i][_fi(mH, "生日")];
      if (birthdayVal instanceof Date) {
        profile.birthday = Utilities.formatDate(birthdayVal, Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd");
      } else if (birthdayVal) {
        // 如果是字串或數字，安全處理為 YYYY-MM-DD 格式
        var bStr = String(birthdayVal).trim();
        if (bStr.indexOf("T") > -1) {
          profile.birthday = bStr.split("T")[0];
        } else {
          profile.birthday = bStr;
        }
      } else {
        profile.birthday = "";
      }

      profile.idNumber = mData[i][_fi(mH, "證件")] || "";
      
      var addrIdx = mH.findIndex(function (h) { return String(h).includes("地址") && !String(h).includes("緊急"); });
      profile.studentAddr = addrIdx > -1 ? mData[i][addrIdx] : "";
      
      var emerNameIdx = mH.findIndex(function (h) { return String(h).includes("緊急聯絡人") && !String(h).includes("關係") && !String(h).includes("地址") && !String(h).includes("電話"); });
      profile.emerName = emerNameIdx > -1 ? mData[i][emerNameIdx] : "";
      profile.emerRel = mData[i][_fi(mH, "關係")] || "";
      profile.emerPhone = mData[i][_fi(mH, "緊急聯絡人電話")] || "";
      
      var emerAddrIdx = mH.findIndex(function (h) { return String(h).includes("地址") && String(h).includes("緊急"); });
      profile.emerAddr = emerAddrIdx > -1 ? mData[i][emerAddrIdx] : "";
      
      profile.exp = mData[i][_fi(mH, "經驗")] || "";
      profile.strength = mData[i][_fi(mH, "體能")] || "";
      profile.strengthProof = mData[i][_fi(mH, "證明")] || "";
      
      var medIdx = mH.findIndex(function (h) { return String(h).includes("病史") || String(h).includes("過敏"); });
      profile.medicalHistory = medIdx > -1 ? mData[i][medIdx] : "";
      break;
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "success", 
    isMember: isMember,
    profile: profile
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------
// 📌 取得個人儀表板狀態 (My Dashboard API)
// ------------------------------------------------------------------
function getMyStatusAPI(ss, userId) {
  var responseData = {
    profile: {
      name: "",
      department: "",
      studentId: "",
      isOfficial: false,
      expireDate: "尚未核發/尚未繳費 (Not issued/Unpaid)"
    },
    activities: [],
    equipments: []
  };

  // 1. 取得 Members 資料
  var mSheet = ss.getSheetByName("Members");
  if (mSheet) {
    var mData = mSheet.getDataRange().getValues();
    var mH = mData.length > 0 ? mData[0] : [];
    var mSysIdx = _fi(mH, "系統識別碼");
    
    for (var i = 1; i < mData.length; i++) {
      if (mSysIdx > -1 && mData[i][mSysIdx] === userId) {
        responseData.profile.name = mData[i][_fi(mH, "姓名")] || "";
        responseData.profile.department = mData[i][_fi(mH, "系所")] || "";
        responseData.profile.studentId = mData[i][_fi(mH, "學號")] || "";
        
        var mPayIdx = _fi(mH, "繳費狀態");
        var payStatus = (mPayIdx > -1 && mData[i][mPayIdx]) ? String(mData[i][mPayIdx]).trim() : "";
        var hasPaid = (payStatus === "已繳費" || payStatus === "已繳費 Paid" || payStatus === "已繳" || payStatus === "是");

        var mExpireIdx = mH.findIndex(function (h) {
          return String(h).includes("到期日") || String(h).includes("社籍");
        });
        
        var hasExpireDate = false;
        if (mExpireIdx > -1 && mData[i][mExpireIdx]) {
          var d = new Date(mData[i][mExpireIdx]);
          if (!isNaN(d.getTime())) {
            hasExpireDate = true;
            responseData.profile.expireDate = Utilities.formatDate(d, Session.getScriptTimeZone() || "GMT+8", "yyyy/MM/dd");
            if (d.getTime() >= new Date().getTime()) {
              responseData.profile.isOfficial = true;
            }
          } else {
            var rawExp = String(mData[i][mExpireIdx]).trim();
            if (rawExp !== "") {
              hasExpireDate = true;
              responseData.profile.expireDate = rawExp;
              if (rawExp.indexOf("過期") === -1 && rawExp.indexOf("未") === -1) {
                responseData.profile.isOfficial = true;
              }
            }
          }
        }
        
        if (hasPaid && !hasExpireDate) {
          responseData.profile.isOfficial = true;
          responseData.profile.expireDate = "尚未提供，請聯繫幹部確認";
        }
        break;
      }
    }
  }

  // 2. 取得活動報名 (Signups & Events)
  var sSheet = ss.getSheetByName("Signups");
  var eSheet = ss.getSheetByName("Events");
  if (sSheet && eSheet) {
    var sData = sSheet.getDataRange().getValues();
    var eData = eSheet.getDataRange().getDisplayValues();
    
    var sSysIdx = _fi(sData[0], "系統識別碼");
    var sStatIdx = _fi(sData[0], "審核結果");
    var sPayIdx = _fi(sData[0], "繳費狀態");
    var sEvtIdx = _fi(sData[0], "活動編號");
    
    var eIdIdx = _fi(eData[0], "活動編號");
    var eNameIdx = _fi(eData[0], "活動名稱");
    var eDateIdx = _fi(eData[0], "活動開始日期") > -1 ? _fi(eData[0], "活動開始日期") : _fi(eData[0], "日期");

    for (var s = 1; s < sData.length; s++) {
      if (sSysIdx > -1 && sData[s][sSysIdx] === userId) {
        var evId = String(sData[s][sEvtIdx]).trim();
        var reviewStatus = String(sData[s][sStatIdx]).trim();
        var payStatus = String(sData[s][sPayIdx]).trim();
        
        // 找出活動詳情
        var eventName = "未知活動";
        var eventDate = "";
        for (var e = 1; e < eData.length; e++) {
          if (eIdIdx > -1 && String(eData[e][eIdIdx]).trim() === evId) {
            eventName = eNameIdx > -1 ? String(eData[e][eNameIdx]) : "未知活動";
            eventDate = eDateIdx > -1 ? String(eData[e][eDateIdx]) : "";
            break;
          }
        }
        
        responseData.activities.push({
          eventId: evId,
          eventName: eventName,
          date: eventDate,
          reviewStatus: reviewStatus,
          payStatus: payStatus
        });
      }
    }
  }

  // 3. 取得裝備租借 (Loan_Records)
  var lSheet = ss.getSheetByName("Loan_Records");
  if (lSheet) {
    var lData = lSheet.getDataRange().getValues();
    var lSysIdx = _fi(lData[0], "系統識別碼");
    var lOrderIdx = _fi(lData[0], "租借編號");
    var lNameIdx = _fi(lData[0], "裝備名稱");
    var lQtyIdx = _fi(lData[0], "數量");
    var lPickupIdx = _fi(lData[0], "預計領取");
    var lReturnIdx = _fi(lData[0], "預計歸還");
    var lStatusIdx = _fi(lData[0], "領取/歸還");

    for (var l = 1; l < lData.length; l++) {
      if (lSysIdx > -1 && lData[l][lSysIdx] === userId) {
        var statusStr = String(lData[l][lStatusIdx] || "");
        if (statusStr.indexOf("取消") === -1) {
          var pickupVal = lData[l][lPickupIdx];
          var returnVal = lData[l][lReturnIdx];
          var pickupStr = "";
          var returnStr = "";
          
          if (pickupVal instanceof Date) {
            pickupStr = Utilities.formatDate(pickupVal, Session.getScriptTimeZone() || "GMT+8", "yyyy/MM/dd");
          } else if (pickupVal) {
            pickupStr = String(pickupVal).split("T")[0].replace(/-/g, "/");
          }
          
          if (returnVal instanceof Date) {
            returnStr = Utilities.formatDate(returnVal, Session.getScriptTimeZone() || "GMT+8", "yyyy/MM/dd");
          } else if (returnVal) {
            returnStr = String(returnVal).split("T")[0].replace(/-/g, "/");
          }
          
          responseData.equipments.push({
            orderId: lOrderIdx > -1 ? String(lData[l][lOrderIdx]).trim() : "未知訂單",
            itemName: (lNameIdx > -1 ? String(lData[l][lNameIdx]) : "未知裝備") + " x" + (lQtyIdx > -1 ? String(lData[l][lQtyIdx]) : "1"),
            pickupDate: pickupStr,
            returnDate: returnStr,
            status: statusStr
          });
        }
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    data: responseData
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------
// 引擎 5：儲存社員基本資料 API (供 LIFF 前端註冊/更新送出)
// ------------------------------------------------------------------
function processSaveProfile(payload) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var memberSheet = ss.getSheetByName("Members");
  if (!memberSheet) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "找不到 Members 資料表" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var userId = payload.userId;
  if (!userId) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "缺少 userId 參數" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var data = payload.data || {};
  var name = data.name || "未具名";
  var studentId = data.studentId || "無學號";
  
  // 處理上傳檔案至 Google Drive，檔名可自訂以利辨識
  if (payload.strengthProofFile && payload.strengthProofFileName) {
    var ext = payload.strengthProofFileName.split('.').pop();
    var customFileName = name + "_體能證明." + ext;
    data.strengthProof = uploadFileToDrive(payload.strengthProofFile, customFileName);
  }
  
  var mData = memberSheet.getDataRange().getValues();
  var headers = mData[0];
  
  // 確保或建立所有需要的欄位
  var sysIdx = getOrCreateColIdx(memberSheet, headers, "系統識別碼");
  var nameIdx = getOrCreateColIdx(memberSheet, headers, "姓名");
  var genderIdx = getOrCreateColIdx(memberSheet, headers, "性別");
  
  var lineIdx = headers.findIndex(function (h) { return String(h).toUpperCase().includes("LINE"); });
  if (lineIdx === -1) lineIdx = getOrCreateColIdx(memberSheet, headers, "真實 LINE ID");
  
  var emailIdx = headers.findIndex(function (h) { return String(h).toUpperCase().includes("EMAIL") || String(h).includes("信箱"); });
  if (emailIdx === -1) emailIdx = getOrCreateColIdx(memberSheet, headers, "聯絡信箱 Email");
  
  var phoneIdx = headers.findIndex(function (h) { return String(h).includes("電話") && !String(h).includes("緊急"); });
  if (phoneIdx === -1) phoneIdx = getOrCreateColIdx(memberSheet, headers, "聯絡電話");
  
  var deptIdx = getOrCreateColIdx(memberSheet, headers, "系所");
  var studentIdIdx = getOrCreateColIdx(memberSheet, headers, "學號");
  var birthdayIdx = getOrCreateColIdx(memberSheet, headers, "生日");
  var idNumberIdx = getOrCreateColIdx(memberSheet, headers, "證件");
  
  var studentAddrIdx = headers.findIndex(function (h) { return String(h).includes("地址") && !String(h).includes("緊急"); });
  if (studentAddrIdx === -1) studentAddrIdx = getOrCreateColIdx(memberSheet, headers, "聯絡地址");
  
  var emerNameIdx = headers.findIndex(function (h) { return String(h).includes("緊急聯絡人") && !String(h).includes("關係") && !String(h).includes("地址") && !String(h).includes("電話"); });
  if (emerNameIdx === -1) emerNameIdx = getOrCreateColIdx(memberSheet, headers, "緊急聯絡人姓名");
  
  var emerRelIdx = getOrCreateColIdx(memberSheet, headers, "關係");
  
  var emerAddrIdx = headers.findIndex(function (h) { return String(h).includes("地址") && String(h).includes("緊急"); });
  if (emerAddrIdx === -1) emerAddrIdx = getOrCreateColIdx(memberSheet, headers, "緊急聯絡人地址");
  
  var emerPhoneIdx = getOrCreateColIdx(memberSheet, headers, "緊急聯絡人電話");
  var expIdx = getOrCreateColIdx(memberSheet, headers, "經驗");
  var strengthIdx = getOrCreateColIdx(memberSheet, headers, "體能");
  var strengthProofIdx = getOrCreateColIdx(memberSheet, headers, "證明");
  
  var medIdx = headers.findIndex(function (h) { return String(h).includes("病史") || String(h).includes("過敏"); });
  if (medIdx === -1) medIdx = getOrCreateColIdx(memberSheet, headers, "個人特殊病史或過敏");
  
  var payIdx = getOrCreateColIdx(memberSheet, headers, "繳費狀態");
  
  // 搜尋是否已存在該社員
  var userRow = -1;
  for (var i = 1; i < mData.length; i++) {
    if (mData[i][sysIdx] === userId) {
      userRow = i + 1;
      break;
    }
  }
  
  var isUpdate = (userRow !== -1);
  var rowData = new Array(headers.length).fill("");
  
  // 若為更新，預先複製原有整列的所有舊資料值，以防漏掉某些不在此程式寫入範圍內的欄位 (例如社籍到期日) 被覆蓋為空值！
  if (isUpdate) {
    var oldValues = memberSheet.getRange(userRow, 1, 1, headers.length).getValues()[0];
    for (var col = 0; col < headers.length; col++) {
      rowData[col] = oldValues[col];
    }
  }
  
  // 填入對應欄位資料
  rowData[sysIdx] = userId;
  rowData[nameIdx] = data.name || "";
  rowData[genderIdx] = data.gender || "";
  rowData[lineIdx] = data.realLineId || "";
  rowData[emailIdx] = data.email || "";
  rowData[phoneIdx] = data.phone || "";
  rowData[deptIdx] = data.department || "";
  rowData[studentIdIdx] = data.studentId || "";
  rowData[birthdayIdx] = data.birthday || "";
  rowData[idNumberIdx] = data.idNumber || "";
  rowData[studentAddrIdx] = data.studentAddr || "";
  rowData[emerNameIdx] = data.emerName || "";
  rowData[emerRelIdx] = data.emerRel || "";
  rowData[emerAddrIdx] = data.emerAddr || "";
  rowData[emerPhoneIdx] = data.emerPhone || "";
  rowData[expIdx] = data.exp || "";
  rowData[strengthIdx] = data.strength || "";
  
  if (isUpdate) {
    var oldValues = memberSheet.getRange(userRow, 1, 1, headers.length).getValues()[0];
    rowData[strengthProofIdx] = data.strengthProof || oldValues[strengthProofIdx] || "";
    rowData[payIdx] = oldValues[payIdx] || "未繳費 Unpaid";
  } else {
    rowData[strengthProofIdx] = data.strengthProof || "";
    rowData[payIdx] = "未繳費 Unpaid";
  }
  
  rowData[medIdx] = data.medicalHistory || "";
  
  // 寫入/更新試算表
  if (isUpdate) {
    memberSheet.getRange(userRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    memberSheet.appendRow(rowData);
  }
  
  // 主動推送 LINE 通知確認信
  try {
    var pushMsg = "✅ 您的社員資料已成功" + (isUpdate ? "更新" : "建立") + "！\n" +
                  "─────────────\n" +
                  "姓名 Name：" + (data.name || "") + "\n" +
                  "系所 Dept：" + (data.department || "") + "\n" +
                  "電話 Phone：" + (data.phone || "") + "\n\n" +
                  "感謝您的填寫！";
    pushMessage(userId, pushMsg);
  } catch (err) {
    console.error("發送 LINE 註冊成功通知失敗: " + err.toString());
  }
  
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "success", 
    message: isUpdate ? "資料已成功更新！" : "註冊成功！" 
  })).setMimeType(ContentService.MimeType.JSON);
}

// 動態查找或建立試算表欄位，並擴展 headers 陣列
function getOrCreateColIdx(sheet, headers, columnName) {
  var idx = headers.findIndex(function(h) { return String(h).includes(columnName); });
  if (idx === -1) {
    sheet.getRange(1, headers.length + 1).setValue(columnName);
    headers.push(columnName);
    idx = headers.length - 1;
  }
  return idx;
}

// 將上傳檔案存入雲端硬碟指定資料夾 (預設為 LINE_Uploads) 並設為公開連結
function uploadFileToDrive(base64Str, fileName) {
  if (!base64Str) return "";
  try {
    var splitData = base64Str.split(",");
    var contentType = "";
    var rawData = "";
    if (splitData.length > 1) {
      contentType = splitData[0].split(";")[0].split(":")[1];
      rawData = splitData[1];
    } else {
      rawData = splitData[0];
    }
    
    var decoded = Utilities.base64Decode(rawData);
    var blob = Utilities.newBlob(decoded, contentType, fileName);
    
    var folder;
    var folders = DriveApp.getFoldersByName("LINE_Uploads");
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder("LINE_Uploads");
    }
    
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    console.error("檔案上傳 Google Drive 失敗: " + err.toString());
    return "上傳失敗: " + err.toString();
  }
}

// 📜 全新功能：個人歷史對帳明細打包查詢 API
function getPaymentHistoryAPI(ss, userId) {
  var paySheet = ss.getSheetByName("Payments");
  if (!paySheet) {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", data: { totalSpent: 0, history: [] } })).setMimeType(ContentService.MimeType.JSON);
  }

  var data = paySheet.getDataRange().getValues();
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", data: { totalSpent: 0, history: [] } })).setMimeType(ContentService.MimeType.JSON);
  }

  var headers = data[0];
  var sysIdx = _fi(headers, "系統識別碼");
  var timeIdx = _fi(headers, "時間") > -1 ? _fi(headers, "時間") : _fi(headers, "Timestamp");
  var itemIdx = _fi(headers, "繳費項目");
  var amountIdx = _fi(headers, "金額");
  var proofIdx = _fi(headers, "帳號末5碼") > -1 ? _fi(headers, "帳號末5碼") : _fi(headers, "帳號末5碼/備註");
  var statusIdx = _fi(headers, "對帳狀態");

  var historyList = [];
  var totalSpent = 0;

  for (var i = 1; i < data.length; i++) {
    if (sysIdx > -1 && String(data[i][sysIdx]).trim() === userId) {
      var rawDate = timeIdx > -1 ? data[i][timeIdx] : "";
      var dateStr = "";
      if (rawDate) {
        var d = new Date(rawDate);
        dateStr = !isNaN(d.getTime()) ? Utilities.formatDate(d, Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd HH:mm:ss") : String(rawDate);
      }
      
      var rawAmount = amountIdx > -1 ? data[i][amountIdx] : 0;
      var amount = parseInt(String(rawAmount).replace(/\D/g, ''), 10) || 0;
      
      var title = itemIdx > -1 ? String(data[i][itemIdx]).trim() : "未命名項目";
      var status = statusIdx > -1 ? String(data[i][statusIdx]).trim() : "待確認";
      var last5Digits = proofIdx > -1 ? String(data[i][proofIdx]).trim() : "";

      // 判斷類型 (社費、活動、裝備)
      var type = "全部";
      if (title.indexOf("社籍") > -1 || title.indexOf("社費") > -1 || title.indexOf("Membership") > -1) {
        type = "社費";
      } else if (title.indexOf("活動") > -1 || title.indexOf("登山") > -1 || title.indexOf("act_") > -1) {
        type = "活動";
      } else if (title.indexOf("裝備") > -1 || title.indexOf("租用") > -1 || title.indexOf("eq_") > -1) {
        type = "裝備";
      }

      historyList.push({
        id: "row_" + i,
        date: dateStr,
        type: type,
        title: title,
        amount: amount,
        last5Digits: last5Digits,
        status: status
      });

      // 只有對帳狀態為「已確認無誤」或「已確認」或「已繳費」或「已核對」才加總
      if (status.indexOf("確認") > -1 || status.indexOf("無誤") > -1 || status.indexOf("已繳") > -1 || status.indexOf("已核對") > -1) {
        totalSpent += amount;
      }
    }
  }

  // 按日期降冪排序 (由新到舊)
  historyList.sort(function(a, b) {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    data: {
      totalSpent: totalSpent,
      history: historyList
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

// 📜 全新功能：取得已結束且正取的歷史活動，及已撰寫之心得
function getPastActivitiesAPI(ss, userId) {
  var sSheet = ss.getSheetByName("Signups");
  var eSheet = ss.getSheetByName("Events");
  var rSheet = ss.getSheetByName("Reflections");

  var pastList = [];
  var totalAttended = 0;
  var reflectionsCount = 0;

  if (!sSheet || !eSheet) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      data: { totalAttended: 0, reflectionsCount: 0, activities: [] }
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 1. 載入活動地圖
  var eData = eSheet.getDataRange().getValues();
  var eHeaders = eData[0];
  var eIdIdx = _fi(eHeaders, "活動編號");
  var eNameIdx = _fi(eHeaders, "活動名稱");
  var eEndIdx = eHeaders.findIndex(function (h) {
    return String(h).includes("結束日期") || String(h).includes("活動日期");
  });
  var eImgIdx = eHeaders.findIndex(function (h) {
    return String(h).includes("封面圖網址") || String(h).includes("照片") || String(h).includes("圖片");
  });

  var eventMap = {};
  for (var j = 1; j < eData.length; j++) {
    var eid = eIdIdx > -1 ? String(eData[j][eIdIdx]).trim() : "";
    if (eid) {
      eventMap[eid] = {
        name: eNameIdx > -1 ? String(eData[j][eNameIdx]).trim() : "未命名活動",
        endDateStr: eEndIdx > -1 ? String(eData[j][eEndIdx]).trim() : "",
        imgUrl: eImgIdx > -1 ? String(eData[j][eImgIdx]).trim() : ""
      };
    }
  }

  // 2. 載入心得地圖
  var refMap = {};
  if (rSheet) {
    var rData = rSheet.getDataRange().getValues();
    if (rData.length > 1) {
      var rHeaders = rData[0];
      var rSysIdx = _fi(rHeaders, "系統識別碼");
      var rEidIdx = _fi(rHeaders, "活動編號");
      var rDiffIdx = _fi(rHeaders, "難易度評分");
      var rViewIdx = _fi(rHeaders, "風景評分");
      var rContIdx = _fi(rHeaders, "心得內容");
      var rImgIdx = _fi(rHeaders, "登頂照片網址");

      for (var k = 1; k < rData.length; k++) {
        var rUid = rSysIdx > -1 ? String(rData[k][rSysIdx]).trim() : "";
        var rEid = rEidIdx > -1 ? String(rData[k][rEidIdx]).trim() : "";
        if (rUid === userId && rEid) {
          refMap[rEid] = {
            difficulty: rDiffIdx > -1 ? parseInt(rData[k][rDiffIdx], 10) || 5 : 5,
            beauty: rViewIdx > -1 ? parseInt(rData[k][rViewIdx], 10) || 5 : 5,
            content: rContIdx > -1 ? String(rData[k][rContIdx]).trim() : "",
            imageUrl: rImgIdx > -1 ? String(rData[k][rImgIdx]).trim() : ""
          };
          reflectionsCount++;
        }
      }
    }
  }

  // 3. 載入報名表
  var sData = sSheet.getDataRange().getValues();
  var sHeaders = sData[0];
  var sSysIdx = _fi(sHeaders, "系統識別碼");
  var sEidIdx = _fi(sHeaders, "活動編號");
  var sResultIdx = _fi(sHeaders, "審核結果");
  var sDateIdx = sHeaders.findIndex(function (h) {
    return String(h).includes("時間") || String(h).includes("日期");
  });

  var today = new Date();

  for (var i = 1; i < sData.length; i++) {
    if (sSysIdx > -1 && String(sData[i][sSysIdx]).trim() === userId) {
      var status = sResultIdx > -1 ? String(sData[i][sResultIdx]).trim() : "";
      // 判斷是否為「正取」
      if (status.indexOf("正取") > -1 || status.indexOf("錄取") > -1 || status.indexOf("已錄取") > -1 || status.indexOf("Confirmed") > -1) {
        var eid = sEidIdx > -1 ? String(sData[i][sEidIdx]).trim() : "";
        var evt = eventMap[eid];
        if (evt) {
          // 判斷活動是否已經結束
          var isPast = false;
          var displayDate = "";
          if (evt.endDateStr) {
            var ed = new Date(evt.endDateStr);
            if (!isNaN(ed.getTime())) {
              isPast = ed.getTime() < today.getTime();
              displayDate = Utilities.formatDate(ed, Session.getScriptTimeZone() || "GMT+8", "yyyy/MM/dd");
            } else {
              // 字串比對 fallback
              isPast = true; 
              displayDate = evt.endDateStr;
            }
          } else {
            isPast = true; // 預設為已參與
          }

          if (isPast) {
            totalAttended++;
            var hasReflected = !!refMap[eid];
            pastList.push({
              eventId: eid,
              title: evt.name,
              date: displayDate,
              img: evt.imgUrl || "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400",
              hasReflected: hasReflected,
              reflection: hasReflected ? refMap[eid] : null
            });
          }
        }
      }
    }
  }

  // 依日期降冪排序
  pastList.sort(function (a, b) {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    data: {
      totalAttended: totalAttended,
      reflectionsCount: reflectionsCount,
      activities: pastList
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

// 📜 全新功能：送出心得回饋 API
function processSubmitReflection(payload) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var rSheet = ss.getSheetByName("Reflections");
  if (!rSheet) {
    rSheet = ss.insertSheet("Reflections");
    rSheet.appendRow(["Timestamp", "系統識別碼", "姓名", "活動編號", "活動名稱", "難易度評分", "風景評分", "心得內容", "登頂照片網址"]);
  }

  var userId = payload.userId;
  var details = payload.details; // details: { eventId, eventName, difficulty, beauty, content, imageUrl }

  // 取得姓名
  var mSheet = ss.getSheetByName("Members");
  var userName = "未知社員";
  if (mSheet) {
    var mData = mSheet.getDataRange().getValues();
    var sysIdx = _fi(mData[0], "系統識別碼");
    for (var i = 1; i < mData.length; i++) {
      if (sysIdx > -1 && mData[i][sysIdx] === userId) {
        userName = mData[i][_fi(mData[0], "姓名")] || "未知社員";
        break;
      }
    }
  }

  // 檢查是否重複寫入
  var rData = rSheet.getDataRange().getValues();
  var rHeaders = rData[0];
  var rSysIdx = _fi(rHeaders, "系統識別碼");
  var rEidIdx = _fi(rHeaders, "活動編號");
  var targetRow = -1;

  for (var k = 1; k < rData.length; k++) {
    if (rSysIdx > -1 && String(rData[k][rSysIdx]).trim() === userId && rEidIdx > -1 && String(rData[k][rEidIdx]).trim() === details.eventId) {
      targetRow = k + 1;
      break;
    }
  }

  var now = new Date();
  var rHeaders = rSheet.getRange(1, 1, 1, rSheet.getLastColumn()).getValues()[0];
  var newRow = new Array(rHeaders.length).fill("");

  newRow[_fi(rHeaders, "Timestamp")] = now;
  newRow[_fi(rHeaders, "系統識別碼")] = userId;
  newRow[_fi(rHeaders, "姓名")] = userName;
  newRow[_fi(rHeaders, "活動編號")] = details.eventId;
  newRow[_fi(rHeaders, "活動名稱")] = details.eventName;
  newRow[_fi(rHeaders, "難易度評分")] = details.difficulty;
  newRow[_fi(rHeaders, "風景評分")] = details.beauty;
  newRow[_fi(rHeaders, "心得內容")] = details.content;
  newRow[_fi(rHeaders, "登頂照片網址")] = details.imageUrl || "";

  if (targetRow > -1) {
    // 更新
    for (var col = 0; col < newRow.length; col++) {
      rSheet.getRange(targetRow, col + 1).setValue(newRow[col]);
    }
  } else {
    // 新增
    rSheet.appendRow(newRow);
  }

  // 推送給幹部群組 (通知有新心得)
  var alertMsg = "🏕️ 【社員心得回饋通知】\n\n👤 社員：" + userName + "\n⛰️ 活動：" + details.eventName + "\n⭐ 路線難易：" + "★".repeat(details.difficulty) + "\n⭐ 風景推薦：" + "★".repeat(details.beauty) + "\n📝 心得內容：\n" + details.content;
  pushAdminMessage(alertMsg);

  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "心得已成功提交"
  })).setMimeType(ContentService.MimeType.JSON);
}