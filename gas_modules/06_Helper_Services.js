// ==============================================================================
// ⚡ 台科登山社社團系統 GAS 模組 6：LIFF 輕量 Helper API (06_Helper_Services.js)
// 目的：僅處理 Google Drive 檔案上傳與 LINE 推播通知，徹底移除所有試算表寫入依賴
// ==============================================================================

/**
 * 處理來自 LIFF 前端之輕量非同步 Helper 請求
 */
function handleLiffHelperApi(json) {
  var action = json.action;

  // 1. Google Drive 照片上傳 Helper (純上傳，不碰試算表)
  if (action === "upload_drive_file") {
    return _handleDriveUploadHelper(json);
  }

  // 2. 裝備租借幹部推播 Helper (純發訊息，不碰試算表)
  if (action === "notify_officers_loan") {
    return _handleNotifyOfficersLoan(json);
  }

  // 3. 繳費申報幹部推播 Helper (純發訊息，不碰試算表)
  if (action === "notify_officers_payment") {
    return _handleNotifyOfficersPayment(json);
  }

  // 4. 基本資料填寫/修改 LINE 推播通知 Helper (純推播訊息)
  if (action === "notify_profile_saved") {
    return _handleNotifyProfileSaved(json);
  }

  // 5. 幹部身分檢查 (輕量唯讀)
  if (action === "check_officer_status") {
    return _handleCheckOfficerStatus(json);
  }

  // 6. 幹部更新裝備照片 Helper
  if (action === "update_equipment_images") {
    return _handleUpdateEquipmentImages(json);
  }

  // 7. 儲存/新增活動 (AdminEvents: 建立/更新活動、資料夾、名冊試算表、封面圖、幹部推播、Supabase 同步)
  if (action === "save_event") {
    return _handleSaveEvent(json);
  }

  // 8. 發送審核結果推播通知 (AdminEvents: 發送正取/備取 Flex 訊息)
  if (action === "send_event_notifications") {
    return _handleSendEventNotifications(json);
  }

  return _errorResponse("未支援的 Helper Action: " + action);
}

/**
 * Google Drive 檔案上傳處理核心 (絕不觸碰試算表)
 */
function _handleDriveUploadHelper(json) {
  try {
    var userId = json.userId || "guest";
    var folderType = json.folderType || "general";
    var files = json.files || [];

    if (!Array.isArray(files) || files.length === 0) {
      return _errorResponse("缺少上傳檔案內容");
    }

    var folderPath = "Wilderness_" + folderType;
    var uploadedUrls = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var base64Data = f.data || f.base64 || "";
      var fileName = (f.name || ("upload_" + Date.now() + "_" + i)).replace(/[^a-zA-Z0-9._-]/g, "_");

      if (base64Data) {
        var fileUrl = uploadFileToDrive(base64Data, fileName, folderPath);
        if (fileUrl && !fileUrl.startsWith("上傳失敗")) {
          var driveMatch = fileUrl.match(/(?:file\/d\/|id=)([^/&?]+)/);
          if (driveMatch && driveMatch[1]) {
            uploadedUrls.push("https://lh3.googleusercontent.com/d/" + driveMatch[1] + "=w1000");
          } else {
            uploadedUrls.push(fileUrl);
          }
        }
      }
    }

    return _successResponse({
      urls: uploadedUrls,
      message: "成功上傳 " + uploadedUrls.length + " 個檔案至 Google Drive！"
    });
  } catch (err) {
    console.error("Google Drive 上傳失敗:", err);
    return _errorResponse("Drive 上傳例外: " + err.toString());
  }
}

/**
 * 取得社員聯絡資訊輔助函式 (優先查詢 Supabase members 表，備援查詢 Google Sheets Members 表)
 */
function _getMemberContactInfo(userId) {
  if (!userId || userId === "TEST_USER_ID") return null;
  try {
    if (typeof _supabaseGet === "function") {
      var sbMembers = _supabaseGet("members", { line_user_id: "eq." + userId });
      if (sbMembers && sbMembers.length > 0) {
        var m = sbMembers[0];
        return {
          name: m.name || "",
          realLineId: m.line_id || "",
          phone: m.phone || "",
          isOfficial: !!(m.is_official_member)
        };
      }
    }
  } catch (e) {
    console.warn("_getMemberContactInfo Supabase 例外:", e);
  }

  try {
    if (typeof SpreadsheetApp !== "undefined" && typeof SPREADSHEET_ID !== "undefined") {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ss ? ss.getSheetByName("Members") : null;
      if (sheet) {
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var idIdx = _fi(headers, "系統識別碼");
        for (var i = 1; i < data.length; i++) {
          if (idIdx > -1 && data[i][idIdx] === userId) {
            var nameIdx = _fi(headers, "姓名");
            var lineIdx = _fi(headers, "LINE");
            var phoneIdx = _fi(headers, "聯絡電話");
            var payIdx = _fi(headers, "繳費狀態");
            return {
              name: nameIdx > -1 ? data[i][nameIdx] : "",
              realLineId: lineIdx > -1 ? data[i][lineIdx] : "",
              phone: phoneIdx > -1 ? data[i][phoneIdx] : "",
              isOfficial: payIdx > -1 && String(data[i][payIdx]).trim() === "已繳費 Paid"
            };
          }
        }
      }
    }
  } catch (e) {
    console.warn("_getMemberContactInfo Sheet 例外:", e);
  }
  return null;
}

/**
 * 裝備租借幹部推播 Helper (純推播訊息)
 * 包含：訂單編號、申請人真實姓名、LINE ID、聯絡電話、出隊天數、租借用途、預估租金與中文品項明細
 */
function _handleNotifyOfficersLoan(json) {
  try {
    var userId = json.userId;
    var details = json.details || {};
    var loanId = json.loanId || "新訂單";
    var totalRent = json.totalRent !== undefined ? json.totalRent : 0;
    var isOfficial = json.isOfficial;
    var borrowerName = json.borrowerName || "";
    var borrowerLineId = json.borrowerLineId || "";
    var borrowerPhone = json.borrowerPhone || "";
    var days = json.days;

    // 若未傳入天數，由日期動態推算
    if (!days && details.pickupDate && details.returnDate) {
      var pTime = new Date(String(details.pickupDate).replace(/-/g, "/")).getTime();
      var rTime = new Date(String(details.returnDate).replace(/-/g, "/")).getTime();
      days = Math.max(1, Math.round((rTime - pTime) / (1000 * 60 * 60 * 24)) + 1);
    }
    if (!days) days = 1;

    // 若前端未附帶姓名或 LINE ID，自動查詢 Supabase / 試算表補齊
    if (!borrowerName || !borrowerLineId) {
      var memberInfo = _getMemberContactInfo(userId);
      if (memberInfo) {
        if (!borrowerName) borrowerName = memberInfo.name;
        if (!borrowerLineId) borrowerLineId = memberInfo.realLineId;
        if (!borrowerPhone) borrowerPhone = memberInfo.phone;
        if (isOfficial === undefined) isOfficial = memberInfo.isOfficial;
      }
    }
    if (!borrowerName) borrowerName = "未知社員";
    if (!borrowerLineId) borrowerLineId = "未填寫";
    if (!borrowerPhone) borrowerPhone = "未填寫";

    var purpose = details.purpose || "社團出隊";
    if (purpose === "其他用途" && details.otherPurpose) {
      purpose = "其他用途 (" + details.otherPurpose + ")";
    }

    var identityDesc = (purpose === "社團出隊") ? "社團出隊 (免租金)" : (isOfficial ? "社員 (享5折)" : "非社員 (原價)");

    var itemsSummary = [];
    if (Array.isArray(json.cartDetails) && json.cartDetails.length > 0) {
      for (var i = 0; i < json.cartDetails.length; i++) {
        var itm = json.cartDetails[i];
        var itmName = itm.name || itm.id || "裝備";
        var itmQty = itm.quantity || itm.qty || 1;
        itemsSummary.push("• " + itmName + (itm.id && itm.name !== itm.id ? " (" + itm.id + ")" : "") + " x " + itmQty);
      }
    } else {
      var cart = details.cart || {};
      for (var eqId in cart) {
        if (cart[eqId] > 0) {
          itemsSummary.push("• " + eqId + " x " + cart[eqId]);
        }
      }
    }

    var msg = "【🎒 幹部通知：新裝備租借申請】\n" +
      "────────────────────\n" +
      "• 訂單編號：" + loanId + "\n" +
      "• 申請人：" + borrowerName + " (" + identityDesc + ")\n" +
      "• LINE ID：" + borrowerLineId + "\n" +
      "• 聯絡電話：" + borrowerPhone + "\n" +
      "• 出隊天數：" + days + " 天 (" + (details.pickupDate || "") + " ~ " + (details.returnDate || "") + ")\n" +
      "• 租借用途：" + purpose + "\n" +
      "• 預估總租金：$" + totalRent + " 元\n\n" +
      "📦 借用裝備明細：\n" +
      (itemsSummary.length > 0 ? itemsSummary.join("\n") : "• 無品項") + "\n\n" +
      "⚡ 本資料已安全寫入 Supabase，請至幹部後台確認備用！";

    pushAdminMessage(msg);
    return _successResponse({ message: "幹部推播已成功送出" });
  } catch (err) {
    console.warn("裝備租借幹部推播失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 繳費申報幹部推播 Helper (純推播訊息)
 */
function _handleNotifyOfficersPayment(json) {
  try {
    var userId = json.userId;
    var details = json.details || {};
    var totalAmount = details.totalAmount || 0;
    var last5Digits = details.last5Digits || "無";
    var note = details.note ? "\n備註：" + details.note : "";

    var msg = "【💳 幹部通知：新繳費申報】\n\n" +
      "申報人 ID：" + userId + "\n" +
      "申報金額：$" + totalAmount + "\n" +
      "帳號末五碼：" + last5Digits +
      note + "\n\n" +
      "⚡ 資料已安全記錄於 Supabase，請幹部核對網銀後至系統核銷！";

    pushAdminMessage(msg);
    return _successResponse({ message: "繳費申報推播已成功送出" });
  } catch (err) {
    console.warn("繳費申報幹部推播失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 基本資料填寫/更新 LINE 推播通知核心 (純推播訊息)
 */
function _handleNotifyProfileSaved(json) {
  try {
    var userId = json.userId;
    if (!userId || userId === "TEST_USER_ID") {
      return _successResponse({ message: "測試使用者略過推播" });
    }

    var data = json.formData || json.data || {};
    var isNew = !!json.isNewUser;
    var name = data.name || "社員";
    var dept = data.department || "未填寫";
    var studentId = data.studentId ? _maskString(data.studentId, 2, 2) : "未填寫";
    var phone = data.phone ? _maskString(data.phone, 4, 3) : "未填寫";
    var emerName = data.emerName || "未填寫";
    var emerRel = data.emerRel || "未填寫";
    var offIntent = data.intendOfficial || "未填寫";

    function _translateValueToEn(val) {
      if (val === null || val === undefined) return "Updated";
      var s = String(val).trim();
      if (!s || s === "未填寫") return "Not provided";
      if (s === "已更新") return "Updated";
      if (s.indexOf("我有意願成為社團幹部") > -1) return "Willing to be an officer";
      if (s === "一般社員") return "General Member";
      if (s === "正式社員") return "Official Member";
      if (s === "暫不加入") return "Not joining yet";
      if (s === "男") return "Male";
      if (s === "女") return "Female";
      if (s === "其他") return "Other";
      if (s === "校內學生") return "NTUST Student";
      if (s === "校友") return "NTUST Alumnus";
      if (s === "外校學生") return "Non-NTUST Student";
      if (s === "校外人士") return "Community Member";
      if (s === "教職員") return "Faculty / Staff";
      if (s === "父子" || s === "父女") return "Father";
      if (s === "母子" || s === "母女") return "Mother";
      if (s === "父母") return "Parents";
      if (s === "朋友") return "Friend";
      if (s === "配偶") return "Spouse";
      if (s === "兄弟" || s === "姊妹") return "Sibling";
      return s;
    }

    var titleZh = isNew ? "【🎉 歡迎加入！基本資料註冊成功】" : "【✅ 基本資料已成功更新】";
    var titleEn = isNew ? "【🎉 Welcome! Registration Success】" : "【✅ Profile Updated Successfully】";

    // 檢查活動出隊保險與審核必備之 13 項資料完整度 (與 handleSignup 保持完全一致)
    var activityMissing = [];
    if (!String(data.name || "").trim()) activityMissing.push("姓名");
    if (!String(data.gender || "").trim()) activityMissing.push("性別");
    if (!String(data.phone || "").trim()) activityMissing.push("聯絡電話");
    if (!String(data.birthday || "").trim()) activityMissing.push("生日");
    if (!String(data.idNumber || data.id_card || "").trim()) activityMissing.push("身分證/護照");
    if (!String(data.studentAddr || data.address || "").trim()) activityMissing.push("通訊地址");
    if (!String(data.emerName || data.emergency_contact_name || "").trim()) activityMissing.push("緊急聯絡人姓名");
    if (!String(data.emerRel || data.emergency_contact_rel || "").trim()) activityMissing.push("與緊急聯絡人關係");
    if (!String(data.emerAddr || data.emergency_contact_address || "").trim()) activityMissing.push("緊急聯絡人地址");
    if (!String(data.emerPhone || data.emergency_contact_phone || "").trim()) activityMissing.push("緊急聯絡人電話");
    if (!String(data.strength || data.fitness_desc || "").trim()) activityMissing.push("體能自評");
    if (!String(data.strengthProof || data.proof_urls || "").trim()) activityMissing.push("體能證明");
    if (!String(data.exp || data.outdoor_experience || "").trim()) activityMissing.push("爬山經驗");
    var isActivityReady = (activityMissing.length === 0);

    // 依據資料完整度動態生成結尾引導話
    var footerZh = "";
    var footerEn = "";
    if (isActivityReady) {
      footerZh = "💡 您的出隊保險與資料已完整，隨時可於 LINE 選單點擊「最新活動」報名出隊行程，或至「裝備租借」預約出隊器材！";
      footerEn = "💡 Your trip insurance and safety verification details are fully completed. You are eligible to sign up for upcoming club events via \"Activities\", or reserve gear via \"Equipment Loan\" anytime!";
    } else {
      var fieldEnMap = {
        "姓名": "Name", "性別": "Gender", "聯絡電話": "Phone", "生日": "Birthday",
        "身分證/護照": "ID/ARC/Passport", "通訊地址": "Current Address", "緊急聯絡人姓名": "Emergency Contact Name",
        "與緊急聯絡人關係": "Relationship", "緊急聯絡人地址": "Emergency Contact Address", "緊急聯絡人電話": "Emergency Contact Phone",
        "體能自評": "Fitness Self-Assessment", "體能證明": "Fitness Proof", "爬山經驗": "Hiking Experience"
      };
      var missingText = activityMissing.slice(0, 4).join("、") + (activityMissing.length > 4 ? " 等 " + activityMissing.length + " 項" : "");
      var missingEnText = activityMissing.slice(0, 4).map(function (f) { return fieldEnMap[f] || f; }).join(", ") + (activityMissing.length > 4 ? " and " + (activityMissing.length - 4) + " more" : "");

      footerZh = "💡 您可隨時至 LINE 選單「裝備租借」預約出隊器材！\n\n⚠️ 提醒：出隊活動需辦理平安保險與安全審核，目前尚缺少出隊必要資訊（" + missingText + "），如欲報名最新活動，記得至選單「填寫資料」補齊即可啟用一鍵報名喔！🏕️";
      footerEn = "💡 You can reserve outdoor gear anytime via \"Equipment Loan\" without full trip details!\n\n⚠️ Trip Notice: Participating in hiking events requires safety insurance and qualification review. You currently have missing trip information (" + missingEnText + "). If you plan to join upcoming events, please update your profile via \"Register\" in the menu to enable one-click signup! 🏕️";
    }

    var introZh = "";
    var introEn = "";
    var detailsZh = [];
    var detailsEn = [];

    var deptEn = (dept === "未填寫" ? "Not provided" : dept);
    var studentIdEn = (studentId === "未填寫" ? "Not provided" : studentId);
    var phoneEn = (phone === "未填寫" ? "Not provided" : phone);

    if (isNew) {
      // 1. 新註冊使用者：顯示完整註冊資料
      introZh = "您好 " + name + "！感謝您完成台科登山社社團系統個人資料註冊：";
      introEn = "Hello " + name + "! Thank you for registering your profile with the NTUST Mountaineering Club:";
      if (data.name) {
        detailsZh.push("• 姓名：" + name);
        detailsEn.push("• Name: " + name);
      }
      if (data.department || data.studentId) {
        detailsZh.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
        detailsEn.push("• Dept / Student ID: " + deptEn + " (" + studentIdEn + ")");
      }
      if (data.phone) {
        detailsZh.push("• 聯絡電話：" + phone);
        detailsEn.push("• Phone Number: " + phoneEn);
      }
      if (data.emerName || data.emerRel) {
        detailsZh.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
        detailsEn.push("• Emergency Contact: " + (emerName === "未填寫" ? "Not provided" : emerName) + " (" + _translateValueToEn(emerRel) + ")");
      }
      if (data.intendOfficial) {
        detailsZh.push("• 加入社員意願：" + offIntent);
        detailsEn.push("• Club Membership Intent: " + _translateValueToEn(offIntent));
      }
      if (data.exp) {
        detailsZh.push("• 爬山經歷：已更新");
        detailsEn.push("• Hiking Experience: Updated");
      }
      if (data.strength || data.strengthProof) {
        detailsZh.push("• 體能自評：已更新");
        detailsEn.push("• Fitness Self-Assessment: Updated");
      }
    } else if (Array.isArray(json.changedFields)) {
      // 2. 既有使用者更新個人檔案：依據實際變更欄位動態顯示
      var cFields = json.changedFields;
      if (cFields.length === 0) {
        introZh = "您好 " + name + "！您的個人檔案未有變更，資料已為最新狀態。";
        introEn = "Hello " + name + "! No changes were made to your profile; your information is up to date.";
      } else {
        introZh = "您好 " + name + "！您已於系統中成功更新個人檔案：";
        introEn = "Hello " + name + "! You have successfully updated your profile:";
        if (cFields.indexOf("name") > -1) {
          detailsZh.push("• 姓名：" + name);
          detailsEn.push("• Name: " + name);
        }
        if (cFields.indexOf("gender") > -1) {
          detailsZh.push("• 性別：" + (data.gender || "已更新"));
          detailsEn.push("• Gender: " + _translateValueToEn(data.gender || "已更新"));
        }
        if (cFields.indexOf("birthday") > -1) {
          detailsZh.push("• 生日：" + (data.birthday || "已更新"));
          detailsEn.push("• Birthday: " + (data.birthday || "Updated"));
        }
        if (cFields.indexOf("idNumber") > -1) {
          var maskedId = data.idNumber ? _maskString(data.idNumber, 2, 2) : "已更新";
          detailsZh.push("• 身分證/護照：" + maskedId);
          detailsEn.push("• ID / Passport: " + (maskedId === "已更新" ? "Updated" : maskedId));
        }
        if (cFields.indexOf("department_studentId") > -1) {
          detailsZh.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
          detailsEn.push("• Dept / Student ID: " + deptEn + " (" + studentIdEn + ")");
        }
        if (cFields.indexOf("identityStatus") > -1) {
          detailsZh.push("• 身分別：" + (data.identityStatus || "已更新"));
          detailsEn.push("• Identity Status: " + _translateValueToEn(data.identityStatus || "已更新"));
        }
        if (cFields.indexOf("phone") > -1) {
          detailsZh.push("• 聯絡電話：" + phone);
          detailsEn.push("• Phone Number: " + phoneEn);
        }
        if (cFields.indexOf("email") > -1) {
          detailsZh.push("• 電子信箱：" + (data.email || "已更新"));
          detailsEn.push("• Email: " + (data.email || "Updated"));
        }
        if (cFields.indexOf("realLineId") > -1) {
          detailsZh.push("• LINE ID：" + (data.realLineId || "已更新"));
          detailsEn.push("• LINE ID: " + (data.realLineId || "Updated"));
        }
        if (cFields.indexOf("studentAddr") > -1) {
          detailsZh.push("• 現居地址：" + (data.studentAddr || "已更新"));
          detailsEn.push("• Current Address: " + (data.studentAddr || "Updated"));
        }
        if (cFields.indexOf("emergency_contact") > -1) {
          detailsZh.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
          detailsEn.push("• Emergency Contact: " + (emerName === "未填寫" ? "Not provided" : emerName) + " (" + _translateValueToEn(emerRel) + ")");
        }
        if (cFields.indexOf("emerPhone") > -1) {
          var maskedEmerPhone = data.emerPhone ? _maskString(data.emerPhone, 4, 3) : "已更新";
          detailsZh.push("• 緊急聯絡人電話：" + maskedEmerPhone);
          detailsEn.push("• Emergency Contact Phone: " + (maskedEmerPhone === "已更新" ? "Updated" : maskedEmerPhone));
        }
        if (cFields.indexOf("emerAddr") > -1) {
          detailsZh.push("• 緊急聯絡人地址：" + (data.emerAddr || "已更新"));
          detailsEn.push("• Emergency Contact Address: " + (data.emerAddr || "Updated"));
        }
        if (cFields.indexOf("medicalHistory") > -1) {
          detailsZh.push("• 特殊病史：已更新");
          detailsEn.push("• Medical History: Updated");
        }
        if (cFields.indexOf("exp") > -1) {
          detailsZh.push("• 爬山經歷：已更新");
          detailsEn.push("• Hiking Experience: Updated");
        }
        if (cFields.indexOf("strength") > -1) {
          detailsZh.push("• 體能自評：已更新");
          detailsEn.push("• Fitness Assessment: Updated");
        }
        if (cFields.indexOf("intendOfficial") > -1) {
          detailsZh.push("• 加入社員意願：" + offIntent);
          detailsEn.push("• Club Membership Intent: " + _translateValueToEn(offIntent));
        }
        if (cFields.indexOf("intendOfficer") > -1) {
          detailsZh.push("• 擔任幹部意願：" + (data.intendOfficer || "已更新"));
          detailsEn.push("• Officer Intent: " + _translateValueToEn(data.intendOfficer || "已更新"));
        }
      }
    } else {
      // 3. 既有使用者且未傳入 changedFields 之向下相容 fallback
      introZh = "您好 " + name + "！您已於系統中成功更新個人檔案：";
      introEn = "Hello " + name + "! You have successfully updated your profile:";
      detailsZh.push("• 姓名：" + name);
      detailsEn.push("• Name: " + name);
      detailsZh.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
      detailsEn.push("• Dept / Student ID: " + deptEn + " (" + studentIdEn + ")");
      detailsZh.push("• 聯絡電話：" + phone);
      detailsEn.push("• Phone Number: " + phoneEn);
      detailsZh.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
      detailsEn.push("• Emergency Contact: " + (emerName === "未填寫" ? "Not provided" : emerName) + " (" + _translateValueToEn(emerRel) + ")");
      detailsZh.push("• 加入社員意願：" + offIntent);
      detailsEn.push("• Club Membership Intent: " + _translateValueToEn(offIntent));
      if (data.exp) {
        detailsZh.push("• 爬山經歷：已更新");
        detailsEn.push("• Hiking Experience: Updated");
      }
      if (data.strength) {
        detailsZh.push("• 體能自評：已更新");
        detailsEn.push("• Fitness Assessment: Updated");
      }
    }

    var zhBlock = introZh;
    if (detailsZh.length > 0) {
      zhBlock += "\n\n" + detailsZh.join("\n");
    }
    zhBlock += "\n\n" + footerZh;

    var enBlock = introEn;
    if (detailsEn.length > 0) {
      enBlock += "\n\n" + detailsEn.join("\n");
    }
    enBlock += "\n\n" + footerEn;

    var msg = titleZh + "\n\n" + zhBlock + "\n─────────────\n" + titleEn + "\n\n" + enBlock;

    _pushMessage(userId, msg);

    // 2. 若隊員勾選「我有意願成為社團幹部」，且為新意願（由無變有或首次填寫），即時推播幹部管理群組
    var officerIntent = data.intendOfficer || data.officer_intent || "";
    var wantsToBeOfficer = false;
    if (officerIntent) {
      var strOfficerIntent = String(officerIntent).trim();
      var lowerOfficerIntent = strOfficerIntent.toLowerCase();
      if (strOfficerIntent.indexOf("我有意願成為社團幹部") > -1 || (lowerOfficerIntent !== "無" && lowerOfficerIntent !== "無意願" && lowerOfficerIntent !== "否" && lowerOfficerIntent !== "none" && lowerOfficerIntent !== "no" && strOfficerIntent !== "")) {
        wantsToBeOfficer = true;
      }
    }

    // 狀態變更才推播：判斷是否為新勾選意願 (若前端有傳入 isOfficerIntentNew 依其判定，否則檢查 previousOfficerIntent)
    var isOfficerIntentNew = true;
    if (typeof json.isOfficerIntentNew === "boolean") {
      isOfficerIntentNew = json.isOfficerIntentNew;
    } else if (json.previousOfficerIntent !== undefined) {
      var prevLower = String(json.previousOfficerIntent).trim().toLowerCase();
      var wasWilling = Boolean(prevLower && prevLower !== "無" && prevLower !== "無意願" && prevLower !== "否" && prevLower !== "none" && prevLower !== "no");
      isOfficerIntentNew = !wasWilling && wantsToBeOfficer;
    }

    if (wantsToBeOfficer && isOfficerIntentNew) {
      var fullStudentId = data.studentId ? String(data.studentId).trim() : "未填寫";
      var genderText = data.gender ? String(data.gender).trim() : "未填寫";
      var climbingExp = (data.exp || data.outdoor_experience) ? String(data.exp || data.outdoor_experience).trim() : "未填寫";
      var fitnessText = (data.strength || data.fitness_desc) ? String(data.strength || data.fitness_desc).trim() : "未填寫";
      var contactPhone = data.phone ? String(data.phone).trim() : phone;
      var lineContact = (data.realLineId || data.lineId) ? String(data.realLineId || data.lineId).trim() : "同本帳號";

      var adminNotice = "🌟 【新幹部招募意願通知】\n" +
        "─────────────\n" +
        "社員填寫個人資料時，表達了加入幹部團隊的意願！\n\n" +
        "• 姓名：" + name + "\n" +
        "• 性別：" + genderText + "\n" +
        "• 科系：" + dept + "\n" +
        "• 學號：" + fullStudentId + "\n" +
        "• 爬山經驗：" + climbingExp + "\n" +
        "• 體能證明：" + fitnessText + "\n" +
        "• 聯絡電話：" + contactPhone + "\n" +
        "• LINE ID：" + lineContact + "\n\n" +
        "💡 幹部團隊可主動與該社員聯繫，歡迎新夥伴加入！";
      pushAdminMessage(adminNotice);
    }

    return _successResponse({ message: "資料更新推播已成功發送" });
  } catch (err) {
    console.warn("個人資料更新推播失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 幹部身分檢查 (輕量唯讀)
 */
function _handleCheckOfficerStatus(json) {
  try {
    var userId = json.userId;
    if (!userId) return _jsonResponse({ status: "success", isOfficer: false });

    var ss = null;
    try {
      if (SPREADSHEET_ID) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) { }

    var res = checkOfficerInternal(ss, userId);
    return _jsonResponse({
      status: "success",
      isOfficer: res.isOfficer,
      name: res.name || "幹部",
      role: res.role || "幹部"
    });
  } catch (err) {
    return _jsonResponse({ status: "success", isOfficer: false, error: err.toString() });
  }
}

/**
 * GAS GET 請求入口 (支援 check_officer_status, send_event_notifications, get_admin_events, get_event_signups, get_unpaid 與健康檢查)
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";
  var userId = (e && e.parameter && e.parameter.userId) ? e.parameter.userId : "";

  // 1. 幹部身分初檢 (GET 備援)
  if (action === "check_officer_status") {
    return _handleCheckOfficerStatus({ userId: userId });
  }

  // 2. 審核結果推播通知 (GET 端點支援)
  if (action === "send_event_notifications") {
    var eventId = (e && e.parameter && e.parameter.eventId) ? e.parameter.eventId : "";
    return _handleSendEventNotifications({ userId: userId, eventId: eventId });
  }

  // 3. 活動清單唯讀備援
  if (action === "get_admin_events") {
    return _handleGetAdminEvents(userId);
  }

  // 4. 報名名冊唯讀備援
  if (action === "get_event_signups") {
    var signupEventId = (e && e.parameter && e.parameter.eventId) ? e.parameter.eventId : "";
    return _handleGetEventSignups(signupEventId, userId);
  }

  // 5. 待繳費用清單唯讀備援 (保證絕不噴 500/404 錯誤，回傳安全空結構)
  if (action === "get_unpaid") {
    return _jsonResponse({
      status: "success",
      data: {
        membership: [],
        activities: [],
        equipments: []
      },
      message: "目前無待繳費用"
    });
  }

  // 6. 預設健康檢查
  return _jsonResponse({
    status: "ok",
    service: "Wilderness GAS Microservices",
    version: "2.0.2",
    architecture: "Modular (Supabase Primary, GAS Helper & Background Sync)"
  });
}

/**
 * 將上傳檔案存入雲端硬碟指定資料夾 (預設為 系統圖庫，可指定多層子資料夾路徑) 並設為公開連結
 * 完全對齊 gas.backup.js 原始強健實作：不依賴任何外部 DRIVE_FOLDER_ID，自動建立與查找
 */
function uploadFileToDrive(base64Str, fileName, folderPath) {
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
    var blob = Utilities.newBlob(decoded, contentType || "image/jpeg", fileName);

    // 1. 取得或建立主資料夾 系統圖庫 (具備 LINE_Uploads 自動平滑過渡遷移)
    var currentFolder;
    var rootFolders = DriveApp.getFoldersByName("系統圖庫");
    if (rootFolders.hasNext()) {
      currentFolder = rootFolders.next();
    } else {
      var legacyFolders = DriveApp.getFoldersByName("LINE_Uploads");
      if (legacyFolders.hasNext()) {
        currentFolder = legacyFolders.next();
        try { currentFolder.setName("系統圖庫"); } catch (e) { }
      } else {
        currentFolder = DriveApp.createFolder("系統圖庫");
      }
    }

    // 2. 支援深層子資料夾路徑 (字串如 "裝備照片/帳篷" 或 "Wilderness_payment")
    if (folderPath) {
      var parts = Array.isArray(folderPath) ? folderPath : String(folderPath).split("/");
      for (var i = 0; i < parts.length; i++) {
        var partName = parts[i].trim();
        if (!partName) continue;
        var subFolders = currentFolder.getFoldersByName(partName);
        if (subFolders.hasNext()) {
          currentFolder = subFolders.next();
        } else {
          currentFolder = currentFolder.createFolder(partName);
        }
      }
    }

    var file = currentFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    console.error("檔案上傳 Google Drive 失敗: " + err.toString());
    return "上傳失敗: " + err.toString();
  }
}

/**
 * 取得或建立欄位索引 (若欄位不存在則在最後新增並寫入標題，對齊 gas.backup.js)
 */
function getOrCreateColIdx(sheet, headers, columnName) {
  var idx = _fi(headers, columnName);
  if (idx === -1) {
    var lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1).setValue(columnName);
    headers.push(columnName);
    idx = headers.length - 1;
  }
  return idx;
}

/**
 * 幹部更新裝備照片處理函式 (完全對齊 gas.backup.js 實作與 Supabase 雙軌更新)
 */
function _handleUpdateEquipmentImages(payload) {
  try {
    var equipId = String(payload.equipId || "").trim();
    var equipName = String(payload.equipName || "").trim();
    var keptUrls = payload.keptUrls || [];
    var newPhotoFiles = payload.newPhotoFiles || [];

    if (!equipId) {
      return _errorResponse("缺少裝備代號 (equipId)");
    }

    // 1. 保留幹部未刪除的既有照片 URL
    var finalUrls = [];
    if (Array.isArray(keptUrls)) {
      for (var k = 0; k < keptUrls.length; k++) {
        var u = String(keptUrls[k] || "").trim();
        if (u.startsWith("http") && finalUrls.indexOf(u) === -1) {
          finalUrls.push(u);
        }
      }
    }

    // 2. 上傳新照片至 Google Drive: 系統圖庫/裝備照片/裝備名稱/
    // 檔案命名格式：裝備名稱_YYYYMMDD_序號.jpg
    if (Array.isArray(newPhotoFiles) && newPhotoFiles.length > 0) {
      var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyyyMMdd");
      var folderPath = "裝備照片/" + (equipName || "未命名裝備");

      for (var f = 0; f < newPhotoFiles.length; f++) {
        if (finalUrls.length >= 5) break; // 最多 5 張
        var fileObj = newPhotoFiles[f];
        var base64Str = (fileObj && (fileObj.base64 || fileObj.data)) ? (fileObj.base64 || fileObj.data) : "";
        if (base64Str) {
          var ext = (fileObj.name && fileObj.name.split('.').pop()) || "jpg";
          var fileName = (equipName || "裝備") + "_" + todayStr + "_" + (finalUrls.length + 1) + "." + ext;
          var uploadedUrl = uploadFileToDrive(base64Str, fileName, folderPath);
          if (uploadedUrl && !uploadedUrl.startsWith("上傳失敗")) {
            var driveMatch = uploadedUrl.match(/(?:file\/d\/|id=)([^/&?]+)/);
            if (driveMatch && driveMatch[1]) {
              finalUrls.push("https://lh3.googleusercontent.com/d/" + driveMatch[1] + "=w1000");
            } else {
              finalUrls.push(uploadedUrl);
            }
          } else {
            console.warn("照片上傳 Drive 警告: " + uploadedUrl);
          }
        }
      }
    }

    // 3. 截斷至最多 5 張
    if (finalUrls.length > 5) {
      finalUrls = finalUrls.slice(0, 5);
    }

    var finalUrlStr = finalUrls.join(",");

    // 4. 同步更新 Supabase equipments 表 (保護性執行，不阻塞回傳)
    try {
      var props = PropertiesService.getScriptProperties();
      var sbUrl = props.getProperty('SUPABASE_URL') || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '');
      var sbKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || (typeof SUPABASE_SERVICE_ROLE_KEY !== 'undefined' ? SUPABASE_SERVICE_ROLE_KEY : '');
      if (sbUrl && sbKey) {
        var patchUrl = sbUrl + "/rest/v1/equipments?id=eq." + encodeURIComponent(equipId);
        UrlFetchApp.fetch(patchUrl, {
          method: "patch",
          contentType: "application/json",
          headers: { "apikey": sbKey, "Authorization": "Bearer " + sbKey },
          payload: JSON.stringify({ images: finalUrls, updated_at: new Date().toISOString() }),
          muteHttpExceptions: true
        });
      }
    } catch (sbErr) {
      console.warn("Supabase equipments images 同步略過: " + sbErr.toString());
    }

    // 5. 同步更新主試算表 Equipments 表 (對齊 gas.backup.js 多欄獨立儲存與名稱容錯)
    try {
      var ss = _getSpreadsheet();
      if (ss) {
        var equipSheet = ss.getSheetByName("Equipments") || ss.getSheetByName("裝備清單") || ss.getSheetByName("裝備");
        if (equipSheet) {
          var data = equipSheet.getDataRange().getValues();
          var headers = data[0];
          var idIdx = _fi(headers, "裝備代號");
          var targetRow = -1;

          if (idIdx > -1) {
            for (var i = 1; i < data.length; i++) {
              if (String(data[i][idIdx]).trim() === equipId) {
                targetRow = i + 1;
                break;
              }
            }
          }

          if (targetRow > -1) {
            // 取得或建立 5 欄照片欄位 (圖片網址1 ~ 圖片網址5)
            var imgColIndices = [];
            var currentHeaders = equipSheet.getRange(1, 1, 1, equipSheet.getLastColumn()).getValues()[0];

            for (var k = 1; k <= 5; k++) {
              var targetColName = "圖片網址" + k;
              var foundIdx = currentHeaders.findIndex(function (h) {
                var s = String(h).trim();
                return s === targetColName || s === ("圖片網址 " + k);
              });

              if (foundIdx === -1 && k === 1) {
                var legacyIdx = _fi(currentHeaders, "圖片網址");
                if (legacyIdx > -1) {
                  equipSheet.getRange(1, legacyIdx + 1).setValue(targetColName);
                  currentHeaders[legacyIdx] = targetColName;
                  foundIdx = legacyIdx;
                }
              }

              if (foundIdx === -1) {
                foundIdx = getOrCreateColIdx(equipSheet, currentHeaders, targetColName);
                currentHeaders = equipSheet.getRange(1, 1, 1, equipSheet.getLastColumn()).getValues()[0];
              }
              imgColIndices.push(foundIdx);
            }

            // 將 5 張照片分別寫入對應獨立欄位 (一欄一個網址，未使用的欄位清空)
            for (var c = 0; c < 5; c++) {
              var cIdx = imgColIndices[c];
              if (cIdx > -1) {
                var cellVal = (c < finalUrls.length) ? finalUrls[c] : "";
                equipSheet.getRange(targetRow, cIdx + 1).setValue(cellVal);
              }
            }
          }
        }
      }
    } catch (sheetErr) {
      console.warn("試算表裝備照片欄位更新略過: " + sheetErr.toString());
    }

    return _successResponse({
      status: "success",
      message: "裝備照片更新成功",
      imageUrl: finalUrlStr,
      equipId: equipId
    });
  } catch (error) {
    console.error("更新裝備照片失敗:", error);
    return _errorResponse("更新裝備照片時發生後端錯誤: " + error.toString());
  }
}

/**
 * 內部輔助：檢驗使用者是否為登山社幹部 (支援 Google Sheets Officers 工作表 + Supabase members 表雙軌校驗)
 */
function checkOfficerInternal(ss, userId, userName) {
  if (!userId && !userName) return { isOfficer: false, role: "", name: "" };
  if (userId === "TEST_USER_ID") return { isOfficer: true, role: "管理員", name: "測試管理員" };

  try {
    // 1. 若有提供試算表物件，先搜尋 Officers 工作表
    if (ss) {
      var oSheet = ss.getSheetByName("Officers");
      if (oSheet) {
        var oData = oSheet.getDataRange().getDisplayValues();
        if (oData.length > 1) {
          var oH = oData[0];
          var nameIdx = oH.findIndex(function (h) { return String(h).includes("姓名") || String(h).includes("名字"); });
          var roleIdx = oH.findIndex(function (h) { return String(h).includes("職稱") || String(h).includes("職位"); });
          var sysIdx = oH.findIndex(function (h) {
            var s = String(h).toLowerCase();
            return s.includes("識別碼") || s.includes("userid") || s.includes("user id") || s.includes("uid") || s.includes("幹部 id") || s.includes("幹部id");
          });
          var lineIdx = oH.findIndex(function (h) { return String(h).toUpperCase().includes("LINE"); });

          // (1) 以 userId 比對識別碼或 LINE ID
          if (userId) {
            var cleanUserId = String(userId).trim();
            for (var i = 1; i < oData.length; i++) {
              var rowSysId = (sysIdx > -1 && oData[i][sysIdx]) ? String(oData[i][sysIdx]).trim() : "";
              var rowLineId = (lineIdx > -1 && oData[i][lineIdx]) ? String(oData[i][lineIdx]).trim() : "";

              if ((rowSysId && (rowSysId === cleanUserId || cleanUserId.indexOf(rowSysId) > -1 || rowSysId.indexOf(cleanUserId) > -1)) ||
                (rowLineId && rowLineId === cleanUserId)) {
                var role = (roleIdx > -1 && oData[i][roleIdx]) ? String(oData[i][roleIdx]).trim() : "幹部";
                return { isOfficer: true, role: role, name: (nameIdx > -1) ? String(oData[i][nameIdx]).trim() : "" };
              }
            }
          }

          // (2) 以 userName 比對姓名
          if (userName && nameIdx > -1) {
            var cleanUserName = userName.trim();
            for (var j = 1; j < oData.length; j++) {
              var oName = oData[j][nameIdx].trim();
              if (oName !== "" && (oName === cleanUserName || cleanUserName.indexOf(oName) > -1 || oName.indexOf(cleanUserName) > -1)) {
                var officerRole = (roleIdx > -1) ? oData[j][roleIdx].trim() : "幹部";
                if (userId && sysIdx > -1 && !oData[j][sysIdx]) {
                  try { oSheet.getRange(j + 1, sysIdx + 1).setValue(userId); } catch (e) { }
                }
                return { isOfficer: true, role: officerRole, name: oName };
              }
            }
          }
        }
      }
    }

    // 2. 雙軌校驗：查詢 Supabase members 表
    var sbUrl = SUPABASE_URL || PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
    var sbKey = SUPABASE_SERVICE_ROLE_KEY || PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY");
    if (sbUrl && sbKey && userId) {
      var queryUrl = sbUrl + "/rest/v1/members?or=(user_id.eq." + encodeURIComponent(userId) + ",line_user_id.eq." + encodeURIComponent(userId) + ")&select=name,role,is_officer&limit=1";
      var sbRes = UrlFetchApp.fetch(queryUrl, {
        method: "get",
        headers: { "apikey": sbKey, "Authorization": "Bearer " + sbKey },
        muteHttpExceptions: true
      });
      if (sbRes.getResponseCode() === 200) {
        var members = JSON.parse(sbRes.getContentText());
        if (members && members.length > 0) {
          var m = members[0];
          if (m.is_officer === true || m.role === "幹部" || m.role === "管理員" || m.role === "社長") {
            return { isOfficer: true, role: m.role || "幹部", name: m.name || "" };
          }
        }
      }
    }
  } catch (err) {
    console.warn("幹部身分檢查例外:", err);
  }

  return { isOfficer: false, role: "", name: "" };
}

/**
 * 主動推播 Flex 訊息
 */
function pushFlexMessage(to, altText, contents) {
  if (!to || !contents) return;
  var token = MEMBER_BOT_TOKEN || PropertiesService.getScriptProperties().getProperty("MEMBER_BOT_TOKEN");
  return _lineAPI("push", token, {
    to: to,
    messages: [{
      type: "flex",
      altText: altText || "通知訊息",
      contents: contents
    }]
  });
}

/**
 * 安全設置或更新 _CONFIG 工作表中的鍵值對
 */
function _setOrUpdateConfigRow(configSheet, key, value) {
  if (!configSheet || !key) return;
  var cData = configSheet.getDataRange().getValues();
  for (var i = 0; i < cData.length; i++) {
    if (String(cData[i][0]).trim().toUpperCase() === String(key).trim().toUpperCase()) {
      configSheet.getRange(i + 1, 2).setValue(value !== undefined && value !== null ? value : "");
      return;
    }
  }
  configSheet.appendRow([key, value !== undefined && value !== null ? value : ""]);
}

/**
 * 建立活動專屬雲端硬碟資料夾 (YYYY/MM/DD_活動名稱) 與報名名冊試算表
 */
function _createEventDriveFolderAndSheet(payload, eventId) {
  try {
    var rawDate = payload.startDate || "";
    var datePart = "";
    if (rawDate) {
      datePart = String(rawDate).trim().replace(/-/g, "/").split(" ")[0].split("T")[0];
    }
    if (!datePart) {
      datePart = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyyy/MM/dd");
    }

    var eventName = (payload.name || "未命名活動").trim();
    var folderName = datePart + "_" + eventName;

    // 1. 於 Google Drive 根目錄建立專屬活動資料夾
    var folder = DriveApp.getRootFolder().createFolder(folderName);
    var folderUrl = folder.getUrl();
    var folderId = folder.getId();

    // 2. 建立活動專屬報名試算表 (優先從 EVENT_SHEET_TEMPLATE_ID 範本自動複製)
    var sheetName = folderName + "_報名名冊";
    var templateId = PropertiesService.getScriptProperties().getProperty("EVENT_SHEET_TEMPLATE_ID");
    var newSS = null;
    var ssId = "";
    var ssUrl = "";

    if (templateId) {
      try {
        var templateFile = DriveApp.getFileById(templateId.trim());
        var copiedFile = templateFile.makeCopy(sheetName, folder);
        ssId = copiedFile.getId();
        ssUrl = copiedFile.getUrl();
        newSS = SpreadsheetApp.open(copiedFile);
        console.log("⚡ [Template] 成功複製範本試算表: " + ssId);
      } catch (tmplErr) {
        console.warn("複製範本試算表失敗，切換為程式化動態生成:", tmplErr);
      }
    }

    if (!newSS) {
      newSS = SpreadsheetApp.create(sheetName);
      ssId = newSS.getId();
      ssUrl = newSS.getUrl();

      var file = DriveApp.getFileById(ssId);
      folder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);

      var signupSheet = newSS.getSheets()[0];
      signupSheet.setName("報名名冊");

      var headers = [
        "系統識別碼", "專屬碼", "姓名", "性別", "LINE ID", "聯絡信箱", "聯絡電話", "聯絡地址",
        "生日", "證件號碼", "緊急聯絡人姓名", "緊急聯絡人電話", "緊急聯絡人聯絡地址", "緊急聯絡人關係",
        "爬山經驗", "體能測驗", "體能證明", "是否為社員", "審核結果", "通知狀態", "繳費狀態", "備註"
      ];
      signupSheet.appendRow(headers);

      var headerRange = signupSheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#2563eb");
      headerRange.setFontColor("#ffffff");
      signupSheet.setFrozenRows(1);
    }

    // 3. 建立或動態更新隱藏之 _CONFIG 工作表
    var configSheet = newSS.getSheetByName("_CONFIG");
    if (!configSheet) {
      configSheet = newSS.insertSheet("_CONFIG");
      configSheet.appendRow(["KEY", "VALUE"]);
    }

    var sbUrl = SUPABASE_URL || PropertiesService.getScriptProperties().getProperty("SUPABASE_URL") || "";
    var sbKey = SUPABASE_SERVICE_ROLE_KEY || PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY") || "";
    var botToken = PropertiesService.getScriptProperties().getProperty("MEMBER_BOT_TOKEN") || PropertiesService.getScriptProperties().getProperty("LINE_BOT_TOKEN") || "";

    _setOrUpdateConfigRow(configSheet, "EVENT_ID", eventId);
    _setOrUpdateConfigRow(configSheet, "EVENT_NAME", eventName);
    _setOrUpdateConfigRow(configSheet, "FOLDER_ID", folderId);
    _setOrUpdateConfigRow(configSheet, "CREATED_AT", new Date().toISOString());
    if (sbUrl) _setOrUpdateConfigRow(configSheet, "SUPABASE_URL", sbUrl);
    if (sbKey) _setOrUpdateConfigRow(configSheet, "SUPABASE_SERVICE_ROLE_KEY", sbKey);
    if (botToken) _setOrUpdateConfigRow(configSheet, "MEMBER_BOT_TOKEN", botToken);
    configSheet.hideSheet();

    return {
      folderUrl: folderUrl,
      folderId: folderId,
      spreadsheetUrl: ssUrl,
      spreadsheetId: ssId
    };
  } catch (err) {
    console.error("建立活動專屬雲端資料夾與試算表失敗:", err);
    return null;
  }
}

/**
 * 將活動雲端資料夾與試算表連結同步至 Supabase events 表
 */
function _syncEventDriveUrlsToSupabase(eventId, driveFolderUrl, spreadsheetUrl, spreadsheetId) {
  var sbUrl = SUPABASE_URL || PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
  var sbKey = SUPABASE_SERVICE_ROLE_KEY || PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey || !eventId) return;

  try {
    var updatePayload = {
      updated_at: new Date().toISOString()
    };
    if (driveFolderUrl) updatePayload.drive_folder_url = driveFolderUrl;
    if (spreadsheetUrl) updatePayload.spreadsheet_url = spreadsheetUrl;
    if (spreadsheetId) updatePayload.spreadsheet_id = spreadsheetId;

    var url = sbUrl + "/rest/v1/events?id=eq." + encodeURIComponent(eventId);
    var res = UrlFetchApp.fetch(url, {
      method: "patch",
      contentType: "application/json",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey,
        "Prefer": "return=representation"
      },
      payload: JSON.stringify(updatePayload),
      muteHttpExceptions: true
    });

    var updated = [];
    try {
      if (res.getResponseCode() === 200) {
        updated = JSON.parse(res.getContentText());
      }
    } catch (parseErr) { }

    if (!updated || updated.length === 0) {
      var upsertUrl = sbUrl + "/rest/v1/events?on_conflict=id";
      updatePayload.id = eventId;
      if (!updatePayload.title) updatePayload.title = eventId;
      var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd");
      updatePayload.fee = 0;
      updatePayload.start_date = todayStr;
      updatePayload.end_date = todayStr;
      updatePayload.status = "開放";
      UrlFetchApp.fetch(upsertUrl, {
        method: "post",
        contentType: "application/json",
        headers: {
          "apikey": sbKey,
          "Authorization": "Bearer " + sbKey,
          "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        payload: JSON.stringify(updatePayload),
        muteHttpExceptions: true
      });
    }
  } catch (err) {
    console.warn("同步活動雲端連結至 Supabase 失敗:", err);
  }
}

/**
 * 將活動完整資料同步/Upsert 至 Supabase events 表
 */
function _syncEventToSupabase(eventData) {
  var sbUrl = SUPABASE_URL || PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
  var sbKey = SUPABASE_SERVICE_ROLE_KEY || PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey || !eventData || !eventData.id) return;

  try {
    var url = sbUrl + "/rest/v1/events?on_conflict=id";
    var costNum = 0;
    if (eventData.cost !== undefined && eventData.cost !== null) {
      costNum = parseInt(String(eventData.cost).replace(/[^\d]/g, ""), 10) || 0;
    }

    var startStr = null;
    if (eventData.startDate) {
      startStr = String(eventData.startDate).replace(/\//g, "-").split(" ")[0].split("T")[0];
    }
    var endStr = null;
    if (eventData.endDate) {
      endStr = String(eventData.endDate).replace(/\//g, "-").split(" ")[0].split("T")[0];
    } else {
      endStr = startStr;
    }
    var deadlineIso = null;
    if (eventData.deadline) {
      var dStr = String(eventData.deadline).replace(/\//g, "-").trim();
      deadlineIso = dStr.includes("T") ? dStr : (dStr + "T23:59:59Z");
    }

    var payload = {
      id: eventData.id,
      title: eventData.name || eventData.title || eventData.id,
      fee: costNum,
      start_date: startStr,
      end_date: endStr,
      deadline: deadlineIso,
      status: eventData.status || "開放",
      summary: eventData.shortDesc || "",
      itinerary: eventData.fullDesc || "",
      cover_image_url: eventData.imageUrl || "",
      drive_folder_url: eventData.driveFolderUrl || null,
      spreadsheet_url: eventData.spreadsheetUrl || null,
      spreadsheet_id: eventData.spreadsheetId || null,
      updated_at: new Date().toISOString()
    };

    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey,
        "Prefer": "resolution=merge-duplicates,return=representation"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      console.log("⚡ [Supabase] 已成功 Upsert 活動至 events 表: " + eventData.id);
    } else {
      console.warn("⚠️ [Supabase] Upsert 活動失敗 (" + code + "): " + res.getContentText());
    }
  } catch (err) {
    console.warn("同步活動至 Supabase 例外:", err);
  }
}

/**
 * API: 儲存或新增活動 (POST action=save_event)
 */
function _handleSaveEvent(json) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = null;
    try {
      if (SPREADSHEET_ID) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {
      console.warn("無法開啟主試算表: " + e.toString());
    }

    var officerCheck = checkOfficerInternal(ss, json.userId);
    if (!officerCheck.isOfficer) {
      return _errorResponse("權限不足，無法儲存活動！");
    }

    var eventId = json.eventId ? String(json.eventId).trim() : "";
    var isUpdate = false;
    var targetRow = -1;
    var eventSheet = null;
    var headers = [];
    var hIdx = {};

    if (ss) {
      eventSheet = ss.getSheetByName("Events");
      if (!eventSheet) {
        eventSheet = ss.insertSheet("Events");
        eventSheet.appendRow(["活動編號", "活動名稱", "活動開始日期", "活動結束日期", "報名截止日期", "預計費用", "報名狀態", "簡介", "詳細行程", "封面圖網址", "雲端資料夾網址", "報名名冊網址", "試算表ID"]);
      }

      var eData = eventSheet.getDataRange().getDisplayValues();
      headers = eData[0];
      hIdx = {
        id: getOrCreateColIdx(eventSheet, headers, "活動編號"),
        name: getOrCreateColIdx(eventSheet, headers, "活動名稱"),
        startDate: getOrCreateColIdx(eventSheet, headers, "活動開始日期"),
        endDate: getOrCreateColIdx(eventSheet, headers, "活動結束日期"),
        deadline: getOrCreateColIdx(eventSheet, headers, "報名截止日期"),
        cost: getOrCreateColIdx(eventSheet, headers, "預計費用"),
        status: getOrCreateColIdx(eventSheet, headers, "報名狀態"),
        shortDesc: getOrCreateColIdx(eventSheet, headers, "簡介"),
        fullDesc: getOrCreateColIdx(eventSheet, headers, "詳細行程"),
        img: getOrCreateColIdx(eventSheet, headers, "封面圖網址"),
        driveFolder: getOrCreateColIdx(eventSheet, headers, "雲端資料夾網址"),
        sheetUrl: getOrCreateColIdx(eventSheet, headers, "報名名冊網址"),
        sheetId: getOrCreateColIdx(eventSheet, headers, "試算表ID")
      };

      if (eventId) {
        for (var i = 1; i < eData.length; i++) {
          if (String(eData[i][hIdx.id]).trim() === eventId) {
            isUpdate = true;
            targetRow = i + 1;
            break;
          }
        }
      }
    }

    if (eventId) {
      isUpdate = true;
    }

    // 若為新活動且未提供編號，自動產生編號：E + 年月 + 序號 (如 E2609-01)
    if (!isUpdate && !eventId) {
      var datePrefix = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyMM");
      var maxSeq = 0;
      if (eventSheet) {
        var curData = eventSheet.getDataRange().getDisplayValues();
        for (var j = 1; j < curData.length; j++) {
          var existingId = String(curData[j][hIdx.id] || "").trim();
          if (existingId.indexOf("E" + datePrefix) === 0) {
            var numPart = parseInt(existingId.replace("E" + datePrefix, "").replace("-", ""), 10);
            if (!isNaN(numPart) && numPart > maxSeq) maxSeq = numPart;
          }
        }
      }
      var nextSeqStr = (maxSeq + 1 < 10) ? ("0" + (maxSeq + 1)) : String(maxSeq + 1);
      eventId = "E" + datePrefix + "-" + nextSeqStr;
    }

    // 若為新活動，自動於 Google Drive 建立專屬資料夾與報名名冊試算表
    var driveFolderUrl = json.driveFolderUrl || "";
    var spreadsheetUrl = json.spreadsheetUrl || "";
    var spreadsheetId = json.spreadsheetId || "";

    if (!isUpdate && (!driveFolderUrl || !spreadsheetUrl)) {
      var driveInfo = _createEventDriveFolderAndSheet(json, eventId);
      if (driveInfo) {
        driveFolderUrl = driveInfo.folderUrl;
        spreadsheetUrl = driveInfo.spreadsheetUrl;
        spreadsheetId = driveInfo.spreadsheetId;
        _syncEventDriveUrlsToSupabase(eventId, driveFolderUrl, spreadsheetUrl, spreadsheetId);
      }
    }

    // 處理圖片上傳
    var imageUrl = json.imageUrl || "";
    if (json.coverImageFile && json.coverImageFile.base64) {
      var eventFirstDate = json.startDate ? String(json.startDate).replace(/\D/g, "").substring(0, 8) : Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyyyMMdd");
      var eventCleanName = (json.name || "活動").trim();
      var fileName = eventFirstDate + "_" + eventCleanName + "_封面.jpg";
      var uploadResult = uploadFileToDrive(json.coverImageFile.base64, fileName, "活動封面");
      if (uploadResult && !uploadResult.startsWith("上傳失敗")) {
        var driveMatch = uploadResult.match(/(?:file\/d\/|id=)([^/&?]+)/);
        if (driveMatch && driveMatch[1]) {
          imageUrl = "https://lh3.googleusercontent.com/d/" + driveMatch[1] + "=w1000";
        } else {
          imageUrl = uploadResult;
        }
      }
    }

    // 寫入 Google Sheets
    if (eventSheet && headers.length > 0) {
      var rowValues = new Array(headers.length).fill("");
      if (isUpdate && targetRow > -1) {
        rowValues = eventSheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
      }

      rowValues[hIdx.id] = eventId;
      rowValues[hIdx.name] = json.name || "";
      rowValues[hIdx.startDate] = json.startDate || "";
      rowValues[hIdx.endDate] = json.endDate || "";
      rowValues[hIdx.deadline] = json.deadline || "";
      rowValues[hIdx.cost] = json.cost || "";
      rowValues[hIdx.status] = json.status || "開放";
      rowValues[hIdx.shortDesc] = json.shortDesc || "";
      rowValues[hIdx.fullDesc] = json.fullDesc || "";
      if (imageUrl) rowValues[hIdx.img] = imageUrl;
      if (driveFolderUrl) rowValues[hIdx.driveFolder] = driveFolderUrl;
      if (spreadsheetUrl) rowValues[hIdx.sheetUrl] = spreadsheetUrl;
      if (spreadsheetId) rowValues[hIdx.sheetId] = spreadsheetId;

      if (isUpdate && targetRow > -1) {
        eventSheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        eventSheet.appendRow(rowValues);
      }
    }

    // 即時完整同步至 Supabase events 表
    try {
      _syncEventToSupabase({
        id: eventId,
        name: json.name,
        startDate: json.startDate,
        endDate: json.endDate,
        deadline: json.deadline,
        cost: json.cost,
        status: json.status,
        shortDesc: json.shortDesc,
        fullDesc: json.fullDesc,
        imageUrl: imageUrl,
        driveFolderUrl: driveFolderUrl,
        spreadsheetUrl: spreadsheetUrl,
        spreadsheetId: spreadsheetId
      });
    } catch (sbSyncErr) {
      console.warn("同步活動資料至 Supabase 警告:", sbSyncErr);
    }

    // 若有勾選推播至幹部群組
    if (json.notifyOfficerGroup) {
      try {
        var groupMsg = "【幹部通知：新活動發布】\n\n" +
          "活動名稱：" + (json.name || "") + "\n" +
          "活動編號：" + eventId + "\n" +
          "出隊日期：" + (json.startDate || "") + " ~ " + (json.endDate || "") + "\n" +
          "報名截止：" + (json.deadline || "") + "\n" +
          "預計費用：" + (json.cost || "") + "\n" +
          "狀態：" + (json.status || "開放") + "\n\n" +
          "已上架完成，社員可在「最新活動」瀏覽與報名！";
        pushAdminMessage(groupMsg);
      } catch (err) {
        console.error("推播至幹部群組失敗: " + err.toString());
      }
    }

    return _jsonResponse({
      status: "success",
      eventId: eventId,
      imageUrl: imageUrl,
      driveFolderUrl: driveFolderUrl,
      spreadsheetUrl: spreadsheetUrl,
      spreadsheetId: spreadsheetId,
      message: isUpdate ? "活動資訊更新成功！" : "新活動發布成功！"
    });

  } catch (err) {
    console.error("儲存活動失敗:", err);
    return _errorResponse("儲存活動失敗: " + (err.message || err.toString()));
  } finally {
    _safeReleaseLock(lock);
  }
}

/**
 * API: 發送審核結果推播通知 (POST/GET action=send_event_notifications)
 */
function _handleSendEventNotifications(json) {
  try {
    var userId = json.userId;
    var targetEventId = json.eventId ? String(json.eventId).trim() : "";

    var ss = null;
    try {
      if (SPREADSHEET_ID) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) { }

    var officerCheck = checkOfficerInternal(ss, userId);
    if (!officerCheck.isOfficer) {
      return _errorResponse("權限不足，僅限幹部發送推播通知");
    }

    var notifiedCount = 0;

    // 1. 優先嘗試由 Google Sheets 查詢與更新
    if (ss) {
      var sSheet = ss.getSheetByName("Signups");
      var eventSheet = ss.getSheetByName("Events");
      if (sSheet && eventSheet) {
        var sData = sSheet.getDataRange().getValues();
        var eData = eventSheet.getDataRange().getDisplayValues();
        var eIdIdx = _fi(eData[0], "活動編號");
        var eNameIdx = _fi(eData[0], "活動名稱");

        var sysIdx = sData[0].findIndex(function (h) {
          var s = String(h).toLowerCase();
          return s.includes("系統識別碼") || s.includes("userid") || s.includes("識別碼");
        });
        var nameIdx = _fi(sData[0], "姓名");
        var evtIdx = _fi(sData[0], "活動編號");
        var resultIdx = sData[0].findIndex(function (h) {
          return String(h).includes("審核") || String(h).includes("結果");
        });
        var notifyIdx = sData[0].findIndex(function (h) {
          return String(h).includes("通知");
        });

        for (var i = 1; i < sData.length; i++) {
          var rowEventId = (evtIdx > -1) ? String(sData[i][evtIdx] || "").trim() : "";
          if (targetEventId && rowEventId !== targetEventId) continue;

          var result = (resultIdx > -1) ? String(sData[i][resultIdx] || "") : "";
          var notifyStatus = (notifyIdx > -1) ? String(sData[i][notifyIdx] || "") : "";
          var targetUid = (sysIdx > -1) ? String(sData[i][sysIdx] || "").trim() : "";
          var name = (nameIdx > -1 && sData[i][nameIdx]) ? String(sData[i][nameIdx]) : "社員";

          var isAcceptedOrWaitlisted = (result.indexOf("正取") > -1 || result.indexOf("備取") > -1);
          if (isAcceptedOrWaitlisted && notifyStatus !== "已通知" && result.indexOf("取消") === -1 && targetUid.startsWith("U")) {
            var eventName = rowEventId;
            for (var e = 1; e < eData.length; e++) {
              if (eData[e][eIdIdx > -1 ? eIdIdx : 0] === rowEventId) {
                eventName = eData[e][eNameIdx > -1 ? eNameIdx : 1];
                break;
              }
            }

            if (result.indexOf("正取") > -1) {
              var acceptedFlex = {
                type: "bubble",
                body: {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    { type: "text", text: "審核結果出爐 Result", weight: "bold", color: "#1DB446", size: "sm" },
                    { type: "text", text: "活動正取通知", weight: "bold", size: "xl", margin: "md" },
                    { type: "text", text: "哈囉 " + name + "！您報名的活動：\nHello " + name + "! For the event:", margin: "md", size: "sm", wrap: true },
                    { type: "text", text: eventName, weight: "bold", color: "#111111", size: "md", wrap: true, margin: "sm" },
                    { type: "text", text: "審核結果為 Result：", margin: "md", size: "sm" },
                    { type: "text", text: "【 " + result + " 】", weight: "bold", color: "#1DB446", size: "lg", align: "center", margin: "md" },
                    { type: "separator", margin: "md" },
                    { type: "text", text: "恭喜您錄取！請留意我們後續會透過您留下的真實 LINE ID 將您加入出隊群組，並請於期限內完成繳費！\nCongratulations! We will invite you to the LINE group soon. Please complete the payment before the deadline!", wrap: true, margin: "md", size: "xs", color: "#666666" }
                  ]
                },
                footer: {
                  type: "box",
                  layout: "vertical",
                  contents: [{
                    type: "button",
                    style: "primary",
                    color: "#1DB446",
                    action: {
                      type: "uri",
                      label: "前往繳費系統 Pay",
                      uri: "https://liff.line.me/" + (LIFF_CHANNEL_ID || "2009217429") + "-u7OCkmQO"
                    }
                  }]
                }
              };
              pushFlexMessage(targetUid, "【活動正取通知 Confirmed】", acceptedFlex);
            } else {
              var waitlistFlex = {
                type: "bubble",
                body: {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    { type: "text", text: "審核結果出爐 Result", weight: "bold", color: "#FF9800", size: "sm" },
                    { type: "text", text: "活動備取通知", weight: "bold", size: "xl", margin: "md" },
                    { type: "text", text: "哈囉 " + name + "！您報名的活動：\nHello " + name + "! For the event:", margin: "md", size: "sm", wrap: true },
                    { type: "text", text: eventName, weight: "bold", color: "#111111", size: "md", wrap: true, margin: "sm" },
                    { type: "text", text: "審核結果為 Result：", margin: "md", size: "sm" },
                    { type: "text", text: "【 " + result + " 】", weight: "bold", color: "#FF9800", size: "lg", align: "center", margin: "md" },
                    { type: "separator", margin: "md" },
                    { type: "text", text: "目前為備取狀態，若有正取人員釋出名額，幹部將主動聯絡您遞補！\nYou are currently on the waitlist. We will contact you if a spot opens up!", wrap: true, margin: "md", size: "xs", color: "#666666" }
                  ]
                },
                footer: {
                  type: "box",
                  layout: "vertical",
                  contents: [{
                    type: "button",
                    style: "primary",
                    color: "#FF9800",
                    action: {
                      type: "postback",
                      label: "確認備取意願 Confirm Waitlist",
                      data: "action=confirm_waitlist&eventId=" + rowEventId + "&userId=" + targetUid
                    }
                  }]
                }
              };
              pushFlexMessage(targetUid, "【活動備取通知 Waitlist】", waitlistFlex);
            }

            if (notifyIdx > -1) {
              sSheet.getRange(i + 1, notifyIdx + 1).setValue("已通知");
            }
            notifiedCount++;
          }
        }
      }
    }

    // 2. 同步更新 Supabase event_signups 表的 notify_status
    var sbUrl = SUPABASE_URL || PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
    var sbKey = SUPABASE_SERVICE_ROLE_KEY || PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY");
    if (sbUrl && sbKey && targetEventId) {
      try {
        var patchUrl = sbUrl + "/rest/v1/event_signups?event_id=eq." + encodeURIComponent(targetEventId) + "&review_status=in.(正取,備取)&notify_status=neq.已通知";
        UrlFetchApp.fetch(patchUrl, {
          method: "patch",
          contentType: "application/json",
          headers: {
            "apikey": sbKey,
            "Authorization": "Bearer " + sbKey,
            "Prefer": "return=minimal"
          },
          payload: JSON.stringify({ notify_status: "已通知" }),
          muteHttpExceptions: true
        });
      } catch (sbErr) {
        console.warn("同步 Supabase 報名通知狀態警告:", sbErr);
      }
    }

    return _jsonResponse({
      status: "success",
      notifiedCount: notifiedCount,
      message: "已成功發送 " + notifiedCount + " 則審核推播通知！"
    });
  } catch (err) {
    console.error("發送審核通知失敗:", err);
    return _errorResponse("發送審核通知失敗: " + (err.message || err.toString()));
  }
}

/**
 * API: 活動列表唯讀備援 (GET action=get_admin_events)
 */
function _handleGetAdminEvents(userId) {
  try {
    var ss = null;
    try {
      if (SPREADSHEET_ID) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) { }

    var officerCheck = checkOfficerInternal(ss, userId);
    if (!officerCheck.isOfficer) {
      return _errorResponse("權限不足");
    }

    if (ss) {
      var eSheet = ss.getSheetByName("Events");
      if (eSheet) {
        var eData = eSheet.getDataRange().getDisplayValues();
        var headers = eData[0];
        var idIdx = _fi(headers, "活動編號");
        var nameIdx = _fi(headers, "活動名稱");
        var startIdx = _fi(headers, "活動開始日期");
        var endIdx = _fi(headers, "活動結束日期");
        var deadIdx = _fi(headers, "報名截止日期");
        var costIdx = _fi(headers, "預計費用");
        var statIdx = _fi(headers, "報名狀態");
        var shortIdx = _fi(headers, "簡介");
        var fullIdx = _fi(headers, "詳細行程");
        var imgIdx = _fi(headers, "封面圖網址");
        var driveIdx = _fi(headers, "雲端資料夾網址");
        var sheetUrlIdx = _fi(headers, "報名名冊網址");
        var sheetIdIdx = _fi(headers, "試算表ID");

        var events = [];
        for (var i = 1; i < eData.length; i++) {
          var id = (idIdx > -1) ? eData[i][idIdx] : "";
          if (!id) continue;
          events.push({
            id: id,
            name: (nameIdx > -1) ? eData[i][nameIdx] : "",
            startDate: (startIdx > -1) ? eData[i][startIdx] : "",
            endDate: (endIdx > -1) ? eData[i][endIdx] : "",
            deadline: (deadIdx > -1) ? eData[i][deadIdx] : "",
            cost: (costIdx > -1) ? eData[i][costIdx] : "0",
            status: (statIdx > -1) ? eData[i][statIdx] : "開放",
            shortDesc: (shortIdx > -1) ? eData[i][shortIdx] : "",
            fullDesc: (fullIdx > -1) ? eData[i][fullIdx] : "",
            imageUrl: (imgIdx > -1) ? eData[i][imgIdx] : "",
            driveFolderUrl: (driveIdx > -1) ? eData[i][driveIdx] : "",
            spreadsheetUrl: (sheetUrlIdx > -1) ? eData[i][sheetUrlIdx] : "",
            spreadsheetId: (sheetIdIdx > -1) ? eData[i][sheetIdIdx] : ""
          });
        }
        return _jsonResponse({ status: "success", events: events });
      }
    }

    return _jsonResponse({ status: "success", events: [] });
  } catch (err) {
    return _errorResponse("取得活動列表例外: " + err.toString());
  }
}

/**
 * API: 報名名冊唯讀備援 (GET action=get_event_signups)
 */
function _handleGetEventSignups(eventId, userId) {
  try {
    var ss = null;
    try {
      if (SPREADSHEET_ID) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) { }

    var officerCheck = checkOfficerInternal(ss, userId);
    if (!officerCheck.isOfficer) {
      return _errorResponse("權限不足");
    }

    if (ss) {
      var sSheet = ss.getSheetByName("Signups");
      if (sSheet) {
        var sData = sSheet.getDataRange().getDisplayValues();
        var headers = sData[0];
        var evtIdx = _fi(headers, "活動編號");
        var codeIdx = _fi(headers, "專屬碼");
        var nameIdx = _fi(headers, "姓名");
        var genderIdx = _fi(headers, "性別");
        var emailIdx = _fi(headers, "聯絡信箱");
        var phoneIdx = _fi(headers, "聯絡電話");
        var expIdx = _fi(headers, "爬山經驗");
        var proofIdx = _fi(headers, "體能證明");
        var resultIdx = headers.findIndex(function (h) { return String(h).includes("審核") || String(h).includes("結果"); });
        var notifyIdx = headers.findIndex(function (h) { return String(h).includes("通知"); });
        var payIdx = headers.findIndex(function (h) { return String(h).includes("繳費"); });

        var signups = [];
        for (var i = 1; i < sData.length; i++) {
          var rowEvtId = (evtIdx > -1) ? sData[i][evtIdx] : "";
          if (eventId && rowEvtId !== eventId) continue;

          signups.push({
            rowNumber: i + 1,
            signupCode: (codeIdx > -1) ? sData[i][codeIdx] : "",
            name: (nameIdx > -1) ? sData[i][nameIdx] : "",
            gender: (genderIdx > -1) ? sData[i][genderIdx] : "",
            email: (emailIdx > -1) ? sData[i][emailIdx] : "",
            phone: (phoneIdx > -1) ? sData[i][phoneIdx] : "",
            experience: (expIdx > -1) ? sData[i][expIdx] : "",
            fitnessProof: (proofIdx > -1) ? sData[i][proofIdx] : "",
            reviewResult: (resultIdx > -1) ? sData[i][resultIdx] : "未審核",
            notifyStatus: (notifyIdx > -1) ? sData[i][notifyIdx] : "未通知",
            paymentStatus: (payIdx > -1) ? sData[i][payIdx] : "未繳費"
          });
        }
        return _jsonResponse({ status: "success", signups: signups });
      }
    }

    return _jsonResponse({ status: "success", signups: [] });
  } catch (err) {
    return _errorResponse("取得報名名冊例外: " + err.toString());
  }
}

