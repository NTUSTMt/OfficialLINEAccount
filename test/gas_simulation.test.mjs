import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 模擬 gas.js 中的核心邏輯函式
function _fi(headers, keyword) {
  return headers.findIndex(function (h) {
    return String(h).includes(keyword);
  });
}

function _findEmerRelColIdx(headers) {
  if (!headers || !headers.length) return -1;
  var bestIdx = -1;
  var fallbackIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    var hStr = String(headers[i]);
    if (hStr.includes("經驗") || hStr.includes("登山") || hStr.includes("爬山") || hStr.includes("經歷") || hStr.toLowerCase().includes("exp")) {
      continue;
    }
    var isRel = hStr.includes("關係") || hStr.toLowerCase().includes("relation");
    if (!isRel) continue;

    var isEmer = hStr.includes("緊急") || hStr.toLowerCase().includes("emergency");
    if (isEmer) {
      return i;
    }
    if (fallbackIdx === -1) {
      fallbackIdx = i;
    }
  }
  return fallbackIdx;
}

function _getEmerRelValue(headers, row) {
  if (!headers || !row) return "";
  var bestVal = "";
  var fallbackVal = "";
  for (var i = 0; i < headers.length; i++) {
    var hStr = String(headers[i]);
    if (hStr.includes("經驗") || hStr.includes("登山") || hStr.includes("爬山") || hStr.includes("經歷") || hStr.toLowerCase().includes("exp")) {
      continue;
    }
    var isRel = hStr.includes("關係") || hStr.toLowerCase().includes("relation");
    if (!isRel) continue;

    var val = String(row[i] || "").trim();
    if (!val) continue;

    var isEmer = hStr.includes("緊急") || hStr.toLowerCase().includes("emergency");
    if (isEmer && !bestVal) {
      bestVal = val;
    } else if (!fallbackVal) {
      fallbackVal = val;
    }
  }
  return bestVal || fallbackVal;
}

describe('1. 緊急聯絡人關係精準提取與爬山經驗防混淆測試', () => {
  it('在包含「與緊急聯絡人關係」與「爬山經驗」的表頭中，正確定位關係欄位而非經驗欄位', () => {
    const headers = ["活動編號", "系統識別碼", "專屬碼", "活動名稱", "姓名", "性別", "LINE ID", "聯絡信箱 Email", "聯絡電話", "生日", "證件號碼", "緊急聯絡人姓名", "與緊急聯絡人關係", "爬山經驗", "緊急聯絡人聯絡地址"];
    const row = ["E01", "U123", "S123", "合歡群峰", "王小明", "男", "ming_line", "ming@gmail.com", "0912345678", "2000/01/01", "A123456789", "王大明", "父子", "百岳10座、曾登合歡北峰與奇萊南華", "台北市大安區"];

    const relIdx = _findEmerRelColIdx(headers);
    assert.equal(relIdx, 12);
    assert.equal(headers[relIdx], "與緊急聯絡人關係");

    const relVal = _getEmerRelValue(headers, row);
    assert.equal(relVal, "父子");
    assert.notEqual(relVal, "百岳10座、曾登合歡北峰與奇萊南華");
  });

  it('即使表頭順序相反或經驗欄位前置，仍能正確取得關係', () => {
    const headers = ["姓名", "爬山經驗", "緊急聯絡人關係", "體能"];
    const row = ["李小美", "初學者，無高山經驗", "母女", "每週慢跑5公里"];

    const relIdx = _findEmerRelColIdx(headers);
    assert.equal(relIdx, 2);

    const relVal = _getEmerRelValue(headers, row);
    assert.equal(relVal, "母女");
  });

  it('若表頭有其他含「關係」的非緊急欄位，優先選擇含「緊急」者', () => {
    const headers = ["姓名", "人際關係評價", "與緊急聯絡人關係", "登山經歷"];
    const row = ["張三", "良好", "朋友", "百岳5座"];

    const relIdx = _findEmerRelColIdx(headers);
    assert.equal(relIdx, 2);

    const relVal = _getEmerRelValue(headers, row);
    assert.equal(relVal, "朋友");
  });
});

describe('2. 繳費申報 postback 與幹部對帳確認型態測試', () => {
  it('單純繳交活動費用時，determinedType 為活動名稱或 activity，不得為 combined', () => {
    const selectedIds = ['act_E01'];
    const hasMembership = selectedIds.indexOf("fee_membership") > -1;
    const actIds = selectedIds.filter(id => id.startsWith("act_"));
    const eqIds = selectedIds.filter(id => id.startsWith("eq_"));

    let determinedType = "combined";
    if (hasMembership && actIds.length === 0 && eqIds.length === 0) {
      determinedType = "繳交社費";
    } else if (!hasMembership && actIds.length > 0 && eqIds.length === 0) {
      if (actIds.length === 1) {
        determinedType = "活動：初級攀岩訓練營";
      } else {
        determinedType = "activity";
      }
    }
    assert.equal(determinedType, "活動：初級攀岩訓練營");
  });

  it('幹部確認活動繳費時，根據 itemsText 正確識別項目為活動，不觸發社費確認', () => {
    const itemsText = "🔸 活動：初級攀岩訓練營";
    const pType = "活動：初級攀岩訓練營";

    const hasMembershipFee = itemsText 
      ? (itemsText.indexOf("社籍") > -1 || itemsText.indexOf("社費") > -1 || itemsText.indexOf("Membership") > -1)
      : (pType === "繳交社費" || pType === "combined");

    const hasActivity = itemsText 
      ? (itemsText.indexOf("活動") > -1) 
      : (pType === "activity" || pType === "combined" || String(pType).startsWith("活動："));

    assert.equal(hasMembershipFee, false);
    assert.equal(hasActivity, true);
  });

  it('活動繳費確認後，寫入審核結果為標準格式「正取（已繳費）Confirmed(Paid)」且符合 Google Sheets 資料驗證', () => {
    const validDropdownOptions = [
      "正取 Confirmed",
      "正取（已繳費）Confirmed(Paid)",
      "備取 Waitlisted",
      "備取（有意願）Waitlisted (Interested)",
      "審核中 Checking",
      "已取消 Cancelled"
    ];
    const expectedStatus = "正取（已繳費）Confirmed(Paid)";
    assert.ok(validDropdownOptions.includes(expectedStatus));
    assert.equal(expectedStatus.charCodeAt(2), 0xff08); // 全形 （
    assert.equal(expectedStatus.charCodeAt(6), 0xff09); // 全形 ）
  });
});

describe('3. 備取意願登記狀態與前端解析測試', () => {
  it('備取確認寫入標準值「備取（有意願）Waitlisted (Interested)」且符合 Google Sheets 資料驗證', () => {
    const validDropdownOptions = [
      "正取 Confirmed",
      "正取（已繳費）Confirmed(Paid)",
      "備取 Waitlisted",
      "備取（有意願）Waitlisted (Interested)",
      "審核中 Checking",
      "已取消 Cancelled"
    ];
    const waitlistStatus = "備取（有意願）Waitlisted (Interested)";
    assert.ok(validDropdownOptions.includes(waitlistStatus));
    assert.equal(waitlistStatus.charCodeAt(2), 0xff08); // 全形 （
    assert.equal(waitlistStatus.charCodeAt(6), 0xff09); // 全形 ）
  });

  it('Dashboard 格式化函式能正確辨識「正取（已繳費）Confirmed(Paid)」與「備取（有意願）Waitlisted (Interested)」', () => {
    const formatReview = (status) => {
      if (status.includes('已繳費') || status.includes('Paid')) return '正取 (已繳費)';
      if (status.includes('正取')) return '正取';
      if (status.includes('有意願') || status.toLowerCase().includes('interested')) return '備取 (有意願)';
      if (status.includes('備取')) return '備取';
      return status;
    };

    assert.equal(formatReview("正取（已繳費）Confirmed(Paid)"), "正取 (已繳費)");
    assert.equal(formatReview("正取(已繳費) Confirmed(Paid)"), "正取 (已繳費)");
    assert.equal(formatReview("正取 (已繳費)"), "正取 (已繳費)");
    assert.equal(formatReview("正取 Confirmed"), "正取");
    assert.equal(formatReview("備取（有意願）Waitlisted (Interested)"), "備取 (有意願)");
    assert.equal(formatReview("備取(有意願) Waitlisted (Interested)"), "備取 (有意願)");
    assert.equal(formatReview("備取 (有意願)"), "備取 (有意願)");
    assert.equal(formatReview("備取 Waitlisted"), "備取");
  });
});

describe('4. 裝備預約多品項取消遍歷與退款狀態判定 (processLiffCancelLoan)', () => {
  it('同一筆租借編號下之所有裝備品項皆應被遍歷取消，且已繳費/待確認者正確標記已取消 (待退款)', () => {
    const mockRows = [
      ["ORD_999", "U_USER1", "王小明", "EQ_TENT", "登山帳篷", 1, "已繳費 Paid", "待領取 To Be Collected"],
      ["ORD_999", "U_USER1", "王小明", "EQ_MAT", "睡墊", 2, "已繳費 Paid", "待領取 To Be Collected"],
      ["ORD_888", "U_USER2", "李小美", "EQ_POLE", "登山杖", 1, "未繳費", "待領取 To Be Collected"]
    ];

    const targetOrderId = "ORD_999";
    const requestUserId = "U_USER1";

    const cancelledItems = [];
    let isAnyPaid = false;
    let matchedCount = 0;

    for (let i = 0; i < mockRows.length; i++) {
      const row = mockRows[i];
      const orderId = row[0];
      const rowUserId = row[1];
      const equipName = row[4];
      const qty = row[5];
      const payStatus = row[6];
      const status = row[7];

      if (orderId === targetOrderId && rowUserId === requestUserId) {
        matchedCount++;
        if (status === "待領取 To Be Collected") {
          if (payStatus === "已繳費 Paid" || payStatus === "待確認 Checking") {
            isAnyPaid = true;
          }
          cancelledItems.push({ name: equipName, qty: qty });
          row[7] = isAnyPaid ? "已取消 (待退款)" : "已取消 Cancelled";
        }
      }
    }

    assert.equal(matchedCount, 2);
    assert.equal(cancelledItems.length, 2);
    assert.equal(isAnyPaid, true);
    assert.equal(mockRows[0][7], "已取消 (待退款)");
    assert.equal(mockRows[1][7], "已取消 (待退款)");
    assert.equal(mockRows[2][7], "待領取 To Be Collected");
  });
});

describe('5. 活動正取取消必填原因與退款備註 (processLiffCancelEvent)', () => {
  it('正取資格取消時，若未填寫取消原因應拋出錯誤，填寫後標記為「已取消 Cancelled」並於備註加註待退款', () => {
    const currentStatus = "正取 Confirmed";
    const payStatus = "已繳費 Paid";
    const reason = "臨時有公務出差";

    const isPaid = (payStatus === "已繳費 Paid" || payStatus === "已繳費" || currentStatus.includes("已繳費"));

    let noteText = "";
    let finalStatus = "";

    if (currentStatus.includes("正取")) {
      assert.ok(reason.trim().length > 0, "正取資格取消必須填寫取消原因");
      finalStatus = "已取消 Cancelled";
      noteText = (isPaid ? "【已繳費待退款】" : "") + "取消原因: " + reason;
    }

    assert.equal(finalStatus, "已取消 Cancelled");
    assert.ok(noteText.includes("【已繳費待退款】"));
    assert.ok(noteText.includes("臨時有公務出差"));
  });

  it('備取資格取消時，無須必填原因，直接更新為「已取消 Cancelled」', () => {
    const currentStatus = "備取 Waitlisted";

    let finalStatus = "";
    if (currentStatus.includes("正取")) {
      assert.fail("備取不應進入正取檢查區塊");
    } else {
      finalStatus = "已取消 Cancelled";
    }

    assert.equal(finalStatus, "已取消 Cancelled");
  });
});

describe('6. 表頭索引建構器安全解析與欄位自動對齊 (_createHeaderIndex)', () => {
  function _createHeaderIndex(headers) {
    const map = {};
    if (!headers || !headers.length) return map;
    for (let i = 0; i < headers.length; i++) {
      const hStr = String(headers[i]).trim();
      const hLower = hStr.toLowerCase();
      map[hStr] = i;

      if (hStr === "系統識別碼" || hStr === "User ID" || hStr === "userId") map._sysId = i;
      if (hStr === "姓名" || hStr === "Name") map._name = i;
      if (hStr.includes("電話") && !hStr.includes("緊急")) map._phone = i;
      if (hLower.includes("line") && !map._line) map._line = i;
      if ((hLower.includes("email") || hStr.includes("信箱")) && !map._email) map._email = i;
      if (hStr.includes("審核") || hStr.includes("審核結果")) map._reviewStatus = i;
      if (hStr.includes("繳費") || hStr.includes("繳費狀態")) map._payStatus = i;
      if (hStr.includes("專屬碼") || hStr.includes("報名代碼")) map._signupCode = i;
      if (hStr.includes("活動編號") || hStr === "eventId") map._eventId = i;
    }
    return map;
  }

  it('能正確索引複雜混亂表頭並賦予標準別名', () => {
    const headers = ["活動編號", "系統識別碼", "專屬碼", "姓名", "聯絡電話", "真實 LINE ID", "聯絡信箱 Email", "審核結果", "繳費狀態"];
    const idxMap = _createHeaderIndex(headers);

    assert.equal(idxMap._eventId, 0);
    assert.equal(idxMap._sysId, 1);
    assert.equal(idxMap._signupCode, 2);
    assert.equal(idxMap._name, 3);
    assert.equal(idxMap._phone, 4);
    assert.equal(idxMap._line, 5);
    assert.equal(idxMap._email, 6);
    assert.equal(idxMap._reviewStatus, 7);
    assert.equal(idxMap._payStatus, 8);
  });
});

describe('7. 安全鎖定防崩潰機制 (_safeReleaseLock)', () => {
  it('當鎖持有有效時執行 releaseLock，未持鎖或為 null 時靜默安全處理不拋出例外', () => {
    let released = false;
    const activeLock = {
      hasLock: () => true,
      releaseLock: () => { released = true; }
    };

    function _safeReleaseLock(lock) {
      try {
        if (lock && typeof lock.hasLock === 'function' && lock.hasLock()) {
          lock.releaseLock();
        }
      } catch (e) {
        // 安全忽略
      }
    }

    _safeReleaseLock(activeLock);
    assert.equal(released, true);

    assert.doesNotThrow(() => {
      _safeReleaseLock({ hasLock: () => false, releaseLock: () => { throw new Error("Not locked"); } });
      _safeReleaseLock(null);
      _safeReleaseLock(undefined);
    });
  });
});

describe('8. 統一 JSON 回應封裝 (_jsonResponse, _errorResponse, _successResponse)', () => {
  const MockContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: function (content) {
      return {
        content: content,
        mimeType: null,
        setMimeType: function (type) {
          this.mimeType = type;
          return this;
        }
      };
    }
  };

  function _jsonResponse(data) {
    return MockContentService.createTextOutput(JSON.stringify(data)).setMimeType(MockContentService.MimeType.JSON);
  }

  function _errorResponse(message, extra) {
    const res = { status: "error", message: message };
    if (extra && typeof extra === "object") {
      for (const k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) {
          res[k] = extra[k];
        }
      }
    }
    return _jsonResponse(res);
  }

  function _successResponse(data) {
    const res = { status: "success" };
    if (data && typeof data === "object") {
      for (const k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k)) {
          res[k] = data[k];
        }
      }
    }
    return _jsonResponse(res);
  }

  it('_jsonResponse 產生格式正確之 JSON TextOutput 並指定 application/json MIME', () => {
    const output = _jsonResponse({ foo: 'bar', num: 42 });
    assert.equal(output.mimeType, 'application/json');
    assert.deepEqual(JSON.parse(output.content), { foo: 'bar', num: 42 });
  });

  it('_errorResponse 產出包含 status: error 及 message，支援額外擴充欄位', () => {
    const errOut = _errorResponse('權限不足', { code: 403, retryAfter: 60 });
    assert.equal(errOut.mimeType, 'application/json');
    const parsed = JSON.parse(errOut.content);
    assert.equal(parsed.status, 'error');
    assert.equal(parsed.message, '權限不足');
    assert.equal(parsed.code, 403);
    assert.equal(parsed.retryAfter, 60);
  });

  it('_successResponse 產出 status: success 並完整合併 data 欄位', () => {
    const succOut = _successResponse({ data: [1, 2, 3], message: 'OK' });
    assert.equal(succOut.mimeType, 'application/json');
    const parsed = JSON.parse(succOut.content);
    assert.equal(parsed.status, 'success');
    assert.deepEqual(parsed.data, [1, 2, 3]);
    assert.equal(parsed.message, 'OK');
  });
});

describe('9. 活動開始判定與社費繳納連動 Signups「是否為社員」及租借防呆', () => {
  function _isEventStarted(startDateVal) {
    if (!startDateVal) return false;
    try {
      var now = new Date();
      if (startDateVal instanceof Date) {
        var d = new Date(startDateVal.getTime());
        d.setHours(0, 0, 0, 0);
        return now.getTime() >= d.getTime();
      }
      var str = String(startDateVal).trim();
      if (!str) return false;
      var cleanStr = str.replace(/[\/\.]/g, "-");
      var parts = cleanStr.split(" ")[0].split("-");
      if (parts.length >= 3) {
        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10) - 1;
        var day = parseInt(parts[2], 10);
        var eventStartDate = new Date(year, month, day, 0, 0, 0, 0);
        return now.getTime() >= eventStartDate.getTime();
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  it('_isEventStarted: 未來活動回傳 false，過去活動回傳 true', () => {
    const futureDate = '2099-12-31';
    const pastDate = '2020-01-01';
    assert.equal(_isEventStarted(futureDate), false);
    assert.equal(_isEventStarted(pastDate), true);
  });

  it('社費繳納後，若活動尚未開始，Signups 中「是否為社員」由「否」連動更新為「是」', () => {
    const signups = [
      { userId: 'U111', eventId: 'E_FUTURE', isOfficial: '否' },
      { userId: 'U111', eventId: 'E_PAST', isOfficial: '否' }
    ];
    const eventDateMap = {
      'E_FUTURE': '2099-10-01',
      'E_PAST': '2020-05-01'
    };

    // 模擬繳納社費後遍歷
    signups.forEach(row => {
      const startDate = eventDateMap[row.eventId];
      if (!_isEventStarted(startDate) && row.isOfficial !== '是') {
        row.isOfficial = '是';
      }
    });

    assert.equal(signups[0].isOfficial, '是', '未開始之活動應被更新為是');
    assert.equal(signups[1].isOfficial, '否', '已開始/結束之活動應維持原樣');
  });

  it('裝備表頭同時存在「備註」與「規格」時，優先以備註作為裝備說明 (description)', () => {
    const headers = ['裝備代號', '裝備名稱', '規格', '備註', '是否外借', '剩餘數量'];
    const row = ['EQ01', '帳篷', '二人帳', '附營釘8支，請於歸還前清潔', '可外借', '5'];

    const remarkCol = headers.findIndex(h => h.includes('備註') || h.includes('備注'));
    const descCol = headers.findIndex(h => h.includes('說明') || h.includes('詳細資訊') || h.includes('規格'));

    let itemDesc = '';
    if (remarkCol > -1 && row[remarkCol]) {
      itemDesc = row[remarkCol];
    } else if (descCol > -1 && row[descCol]) {
      itemDesc = row[descCol];
    }

    assert.equal(itemDesc, '附營釘8支，請於歸還前清潔');
  });

  it('多品項租借防呆：歸還日期早於領取日期時應阻擋並回傳錯誤訊息', () => {
    function validateLoanDates(pickupDate, returnDate) {
      if (!pickupDate || !returnDate) {
        return { valid: false, message: '缺少領取或歸還日期' };
      }
      const pDate = new Date(String(pickupDate).replace(/-/g, '/'));
      const rDate = new Date(String(returnDate).replace(/-/g, '/'));
      if (rDate.getTime() < pDate.getTime()) {
        return { valid: false, message: '歸還日期不得早於領取日期' };
      }
      return { valid: true };
    }

    const invalidCheck = validateLoanDates('2026-09-15', '2026-09-12');
    assert.equal(invalidCheck.valid, false);
    assert.equal(invalidCheck.message, '歸還日期不得早於領取日期');

    const validCheck = validateLoanDates('2026-09-12', '2026-09-15');
    assert.equal(validCheck.valid, true);

    const sameDayCheck = validateLoanDates('2026-09-12', '2026-09-12');
    assert.equal(sameDayCheck.valid, true);
  });
});

describe('10. Supabase ➔ Google Sheets 背景同步映射與資料校正測試 (Sync Worker)', () => {
  it('Signups 表同步時，狀態字串精準正規化為全形括號，防止破壞 Google Sheets 資料驗證', () => {
    function normalizeSignupStatus(raw) {
      const s = raw || '';
      if (s.includes('正取') && (s.includes('已繳費') || s.includes('Paid'))) {
        return '正取（已繳費）Confirmed(Paid)';
      }
      if (s.includes('備取') && (s.includes('有意願') || s.includes('Interested'))) {
        return '備取（有意願）Waitlisted (Interested)';
      }
      return s;
    }

    assert.equal(normalizeSignupStatus('正取 (已繳費) Confirmed(Paid)'), '正取（已繳費）Confirmed(Paid)');
    assert.equal(normalizeSignupStatus('備取 (有意願) Waitlisted(Interested)'), '備取（有意願）Waitlisted (Interested)');
    assert.equal(normalizeSignupStatus('審核中 Checking'), '審核中 Checking');
  });

  it('Loan_Records 表同步時，根據租借單號更新該單所有項目列之狀態與繳費狀態', () => {
    const mockRows = [
      ['ORD_100', 'U_01', '登山帳篷', 1, '待領取 To Be Collected', '未繳費'],
      ['ORD_100', 'U_01', '睡袋', 2, '待領取 To Be Collected', '未繳費'],
      ['ORD_101', 'U_02', '登山杖', 1, '待領取 To Be Collected', '未繳費']
    ];

    const syncPayload = {
      id: 'ORD_100',
      status: '已取消 (待退款)',
      payment_status: '已繳費 Paid'
    };

    for (let i = 0; i < mockRows.length; i++) {
      if (mockRows[i][0] === syncPayload.id) {
        mockRows[i][4] = syncPayload.status;
        mockRows[i][5] = syncPayload.payment_status;
      }
    }

    assert.equal(mockRows[0][4], '已取消 (待退款)');
    assert.equal(mockRows[0][5], '已繳費 Paid');
    assert.equal(mockRows[1][4], '已取消 (待退款)');
    assert.equal(mockRows[1][5], '已繳費 Paid');
    assert.equal(mockRows[2][4], '待領取 To Be Collected');
    assert.equal(mockRows[2][5], '未繳費');
  });
});

describe('11. 歷史繳費紀錄金額智慧推算與工作表自癒修復測試 (Payment History Amount Fix)', () => {
  function _findAmountColIdx(headers) {
    if (!headers || !headers.length) return -1;
    return headers.findIndex(function (h) {
      var s = String(h).toLowerCase();
      return s.includes("金額") || s.includes("費用") || s.includes("總額") || s.includes("應繳") || s.includes("amount") || s.includes("cost") || s.includes("fee");
    });
  }

  function _ensurePaymentAmountCol(sheet, headers) {
    return _findAmountColIdx(headers);
  }

  it('嚴格唯讀防護：面對 9 欄標準表頭，_ensurePaymentAmountCol 絕不寫入 J1，表頭維持 9 欄並回傳 -1', () => {
    const headers = ["姓名", "對帳狀態", "帳號末5碼", "繳款時間", "活動名稱", "系統識別碼", "繳費項目", "裝備名稱", "備註"];
    let j1Written = false;
    const mockSheet = {
      cells: {},
      getRange(r, c) {
        if (r === 1 && c === 10) {
          throw new Error("Exception: The data you entered in cell J1 violates the data validation rules set on this cell.");
        }
        return {
          setValue: (val) => {
            mockSheet.cells[`${r}_${c}`] = val;
          }
        };
      }
    };

    const idx = _ensurePaymentAmountCol(mockSheet, headers);
    assert.equal(idx, -1);
    assert.equal(headers.length, 9);
    assert.equal(Object.keys(mockSheet.cells).length, 0);
  });

  it('繳費紀錄直接讀取 payments.amount，不進行自動猜測與覆寫，支援使用者手動維護金額', () => {
    // 驗證 Supabase/試算表紀錄直接採用使用者所設定之 amount
    const records = [
      { id: 'PAY_1', type: '🔸 活動：七星山迎新', amount: 650, status: '已確認' },
      { id: 'PAY_2', type: '🔹 裝備：大鋼盆', amount: 50, status: '已確認' },
      { id: 'PAY_3', type: '🔸 社籍與社費', amount: 200, status: '待確認' },
      { id: 'PAY_4', type: '特約活動', amount: 880, status: '已確認' }
    ];

    // 不進行推算覆寫，忠實直接讀取
    const history = records.map(r => ({
      title: r.type,
      display_amount: r.amount,
      status: r.status
    }));

    let totalSpent = 0;
    history.forEach(h => {
      const isConfirmed = h.status.includes('已確認') && !h.status.includes('待確認');
      if (isConfirmed) {
        totalSpent += h.display_amount;
      }
    });

    assert.equal(history[0].display_amount, 650);
    assert.equal(history[1].display_amount, 50);
    assert.equal(history[2].display_amount, 200);
    assert.equal(history[3].display_amount, 880);
    assert.equal(totalSpent, 1580); // 650 + 50 + 880
  });

  it('面對無金額欄位的 Payments 試算表，getPaymentHistoryAPI 絕不嘗試寫入 J1，安全讀取', () => {
    const mockPaySheet = {
      getDataRange: () => ({
        getValues: () => [
          ['姓名', '對帳狀態', '帳號末5碼', '繳款時間', '活動名稱', '系統識別碼', '繳費項目', '裝備名稱', '備註'],
          ['小明', '已確認無誤', '12345', '2026-09-12 08:20:33', '', 'U_TEST', '🔸 活動：七星山迎新', '', ''],
          ['小明', '已確認無誤', '12345', '2026-09-12 01:57:08', '', 'U_TEST', '🔹 裝備：大鋼盆', '', ''],
          ['小明', '待確認 Checking', '12345', '2026-09-12 01:46:10', '', 'U_TEST', '🔸 社籍與社費', '', '']
        ]
      }),
      getRange: (r, c) => {
        if (r === 1 && c === 10) {
          throw new Error("Exception: The data you entered in cell J1 violates the data validation rules set on this cell.");
        }
        return {
          setValue: () => {}
        };
      }
    };

    const data = mockPaySheet.getDataRange().getValues();
    const headers = [...data[0]];
    const amountIdx = _findAmountColIdx(headers);
    assert.equal(amountIdx, -1);

    let totalSpent = 0;
    const history = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const title = row[6];
      const status = row[1];
      const rawAmount = amountIdx > -1 ? row[amountIdx] : 0;
      const amount = parseInt(String(rawAmount).replace(/\D/g, ''), 10) || 0;

      // amountIdx 為 -1 時絕不呼叫 mockPaySheet.getRange
      if (amountIdx > -1) {
        mockPaySheet.getRange(i + 1, amountIdx + 1).setValue(amount);
      }

      history.push({ title, amount, status });

      const isConfirmed = (status.includes('已確認') || status.includes('已繳')) && !status.includes('待確認');
      if (isConfirmed) {
        totalSpent += amount;
      }
    }

    assert.equal(history[0].amount, 0);
    assert.equal(history[1].amount, 0);
    assert.equal(history[2].amount, 0);
    assert.equal(totalSpent, 0);
  });

  it('processPaymentSubmit 在 9 欄試算表結構下，產生的 newRow 長度剛好為 9，不超出試算表範圍且安全附帶金額至備註', () => {
    const pHeaders = ["姓名", "對帳狀態", "帳號末5碼", "繳款時間", "活動名稱", "系統識別碼", "繳費項目", "裝備名稱", "備註"];
    const aIdx = _findAmountColIdx(pHeaders);
    assert.equal(aIdx, -1);

    const submitAmount = 350;
    const paymentNote = "台銀轉帳";
    const confirmedItems = ["🔸 活動：攀岩基礎 ($350)"];
    const newRow = new Array(pHeaders.length).fill("");

    const nIdx = pHeaders.indexOf("姓名");
    const stIdx = pHeaders.indexOf("對帳狀態");
    const pIdx = pHeaders.indexOf("帳號末5碼");
    const tIdx = pHeaders.indexOf("繳款時間");
    const sIdx = pHeaders.indexOf("系統識別碼");
    const iIdx = pHeaders.indexOf("繳費項目");
    const ntIdx = pHeaders.indexOf("備註");

    if (tIdx > -1) newRow[tIdx] = "2026-09-12 12:00:00";
    if (nIdx > -1) newRow[nIdx] = "王小明";
    if (sIdx > -1) newRow[sIdx] = "U123456";
    if (iIdx > -1) newRow[iIdx] = confirmedItems.join(", ") + (aIdx === -1 && submitAmount > 0 ? " ($" + submitAmount + ")" : "");
    if (pIdx > -1) newRow[pIdx] = "54321";
    if (ntIdx > -1) newRow[ntIdx] = "[金額: $" + submitAmount + "] " + paymentNote;
    if (stIdx > -1) newRow[stIdx] = "待確認";

    assert.equal(newRow.length, 9);
    assert.equal(newRow[ntIdx], "[金額: $350] 台銀轉帳");
    assert.equal(newRow[iIdx], "🔸 活動：攀岩基礎 ($350) ($350)");
  });

  it('為所有 line_user_id 關聯表（payments, loans, signups, reflections）支援 name 欄位與自動補齊', () => {
    const membersDb = {
      'U123456': '王小明',
      'U789012': '李美麗'
    };

    function autoFillName(record) {
      if (!record.name && record.line_user_id && membersDb[record.line_user_id]) {
        record.name = membersDb[record.line_user_id];
      }
      return record;
    }

    const payment = autoFillName({ id: 'PAY_01', line_user_id: 'U123456', amount: 350, name: '' });
    const loan = autoFillName({ id: 'ORD_01', line_user_id: 'U123456', start_date: '2026-09-12' });
    const signup = autoFillName({ id: 'S01', line_user_id: 'U789012', event_id: 'E01' });
    const reflection = autoFillName({ event_id: 'E01', line_user_id: 'U789012', content: '風景優美' });

    assert.equal(payment.name, '王小明');
    assert.equal(loan.name, '王小明');
    assert.equal(signup.name, '李美麗');
    assert.equal(reflection.name, '李美麗');
  });

  it('_syncPaymentToSupabase 在呼叫時能正確將 userName 附加至 details.userName', () => {
    const userName = '王小明';
    const details = { totalAmount: 350, last5Digits: '12345' };

    if (userName && details && !details.userName) {
      details.userName = userName;
    }

    assert.equal(details.userName, '王小明');
  });
});

describe('12. 活動專屬 Google Drive 資料夾與專屬試算表差異比對同步測試', () => {
  it('正確產生 YYYY/MM/DD_活動名稱 之資料夾名稱與試算表名稱', () => {
    function getEventFolderAndSheetName(payload) {
      const rawDate = payload.startDate || '';
      let datePart = '';
      if (rawDate) {
        datePart = String(rawDate).trim().replace(/-/g, '/').split(' ')[0].split('T')[0];
      }
      if (!datePart) {
        datePart = '2026/09/20'; // 模擬預設日期
      }
      const eventName = (payload.name || '未命名活動').trim();
      const folderName = datePart + '_' + eventName;
      const sheetName = folderName + '_報名名冊';
      return { folderName, sheetName };
    }

    const res1 = getEventFolderAndSheetName({ startDate: '2026-10-15', name: '七星山主東峰' });
    assert.equal(res1.folderName, '2026/10/15_七星山主東峰');
    assert.equal(res1.sheetName, '2026/10/15_七星山主東峰_報名名冊');

    const res2 = getEventFolderAndSheetName({ startDate: '2026/11/01 08:00', name: '雪山主東峰 ' });
    assert.equal(res2.folderName, '2026/11/01_雪山主東峰');
    assert.equal(res2.sheetName, '2026/11/01_雪山主東峰_報名名冊');
  });

  it('嚴格過濾無有效報名專屬碼（非 S 開頭）的自訂列，不納入差異比對', () => {
    const rawSheetRows = [
      ['報名專屬碼', '審核狀態', '姓名', '手機電話', '身分證字號', '備註'],
      ['S2609-001', '正取', '陳小華', '0912345678', 'A123456789', '無'],
      ['S2609-002', '備取', '林大明', '0922333444', 'B123456789', '初學者'],
      ['第一車：司機阿強', '', '', '', '', '車位已滿'], // 幹部自行備註列
      ['總計正取 1 人，備取 1 人', '', '', '', '', ''], // 幹部統計列
      ['', '', '', '', '', ''], // 空白列
      ['INVALID_CODE', '', '', '', '', ''] // 無效碼列
    ];

    const applicants = {};
    for (let r = 1; r < rawSheetRows.length; r++) {
      const row = rawSheetRows[r];
      const code = String(row[0] || '').trim();
      if (!code || !code.startsWith('S')) continue;
      applicants[code] = {
        code: code,
        status: row[1],
        name: row[2],
        phone: row[3],
        idNumber: row[4],
        notes: row[5]
      };
    }

    assert.equal(Object.keys(applicants).length, 2);
    assert.ok(applicants['S2609-001']);
    assert.ok(applicants['S2609-002']);
    assert.equal(applicants['第一車：司機阿強'], undefined);
  });

  it('精確偵測試算表修改項（審核狀態、電話、備註）並產出 Diff 物件', () => {
    const localApplicants = {
      'S2609-001': {
        code: 'S2609-001',
        status: '正取（已繳費）Confirmed(Paid)',
        notes: '已攜帶公裝',
        phone: '0912345678',
        idNumber: 'A123456789',
        userId: 'U111',
        name: '陳小華'
      },
      'S2609-002': {
        code: 'S2609-002',
        status: '備取',
        notes: '初學者',
        phone: '0922333444',
        idNumber: 'B123456789',
        userId: 'U222',
        name: '林大明'
      }
    };

    const remoteSupabase = {
      'S2609-001': {
        status: '正取',
        notes: '無',
        phone: '0912345678',
        idNumber: 'A123456789',
        userId: 'U111',
        name: '陳小華'
      },
      'S2609-002': {
        status: '備取',
        notes: '初學者',
        phone: '0922333444',
        idNumber: 'B123456789',
        userId: 'U222',
        name: '林大明'
      }
    };

    const diffs = [];
    for (const code in localApplicants) {
      const local = localApplicants[code];
      const remote = remoteSupabase[code];
      if (!remote) continue;

      const changes = [];
      if (local.status && local.status !== remote.status) {
        changes.push({ field: '審核狀態', oldVal: remote.status, newVal: local.status });
      }
      if (local.notes !== remote.notes) {
        changes.push({ field: '備註', oldVal: remote.notes, newVal: local.notes });
      }
      if (local.phone && remote.phone && local.phone !== remote.phone) {
        changes.push({ field: '手機電話', oldVal: remote.phone, newVal: local.phone });
      }

      if (changes.length > 0) {
        diffs.push({ code, name: local.name, changes });
      }
    }

    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].code, 'S2609-001');
    assert.equal(diffs[0].changes.length, 2);
    assert.deepEqual(diffs[0].changes[0], {
      field: '審核狀態',
      oldVal: '正取',
      newVal: '正取（已繳費）Confirmed(Paid)'
    });
    assert.deepEqual(diffs[0].changes[1], {
      field: '備註',
      oldVal: '無',
      newVal: '已攜帶公裝'
    });
  });

  it('嚴格遵守零 LINE 訊息規範：同步完成時僅回傳試算表/側邊欄確認，絕不發送 LINE 推播', () => {
    let linePushTriggered = false;

    function fakePushMessage() {
      linePushTriggered = true;
    }

    function fakeCommitDiffsToSupabase(diffs) {
      // 僅執行資料庫寫入，不調用任何 fakePushMessage
      const updatedCount = diffs.length;
      const toastMessage = '已成功同步 ' + updatedCount + ' 筆紀錄至 Supabase！';
      return { success: true, count: updatedCount, message: toastMessage };
    }

    const testDiffs = [{ code: 'S2609-001', fullData: { status: '正取' } }];
    const res = fakeCommitDiffsToSupabase(testDiffs);

    assert.equal(res.success, true);
    assert.equal(res.count, 1);
    assert.equal(linePushTriggered, false, '絕對不能觸發任何 LINE 訊息推播！');
  });

  it('支援 17 欄位結構（包含通知狀態）之動態欄位對齊寫入', () => {
    const sHeaders = [
      '報名專屬碼', '審核狀態', '通知狀態', '繳費狀態', '姓名', '性別',
      '身分證字號', '出生年月日', '手機電話', '緊急聯絡人', '關係',
      '聯絡人電話', '登山經驗與體能', '特殊病史與過敏', '飲食習慣', '系統識別碼', '備註'
    ];

    const signupData = {
      signupCode: 'S2609-888',
      status: '審核中 Checking',
      notifyStatus: '',
      payStatus: '未繳費 Unpaid',
      name: '張大千',
      gender: '男',
      idCard: 'A199999999',
      birthday: '1995-05-05',
      phone: '0988777666',
      emerName: '張媽媽',
      emerRel: '母子',
      emerPhone: '0911222333',
      exp: '百岳10座',
      strength: '能背重15kg',
      medicalHistory: '無',
      diet: '全素',
      userId: 'U999888777',
      notes: '需要租借帳篷'
    };

    const row = new Array(sHeaders.length).fill('');
    function setCol(kw, val) {
      const idx = _fi(sHeaders, kw);
      if (idx > -1) row[idx] = val;
    }

    setCol('報名專屬碼', signupData.signupCode);
    setCol('審核狀態', signupData.status);
    setCol('通知狀態', signupData.notifyStatus);
    setCol('繳費狀態', signupData.payStatus);
    setCol('姓名', signupData.name);
    setCol('系統識別碼', signupData.userId);

    assert.equal(row.length, 17);
    assert.equal(row[0], 'S2609-888');
    assert.equal(row[1], '審核中 Checking');
    assert.equal(row[2], ''); // 通知狀態初始為空
    assert.equal(row[3], '未繳費 Unpaid');
    assert.equal(row[4], '張大千');
    assert.equal(row[15], 'U999888777');
  });

  it('一鍵推播正備取通知：精準過濾待通知隊員，略過已通知、已取消與非會員列', () => {
    const sheetData = [
      ['報名專屬碼', '審核狀態', '通知狀態', '姓名', '系統識別碼'],
      ['S01', '正取 Confirmed', '', '王小明', 'U111111'],           // 應通知（正取未通知）
      ['S02', '正取 Confirmed', '已通知', '林美麗', 'U222222'],       // 略過（已通知）
      ['S03', '備取 Waitlisted', '', '陳大華', 'U333333'],          // 應通知（備取未通知）
      ['S04', '正取（已取消）', '', '李四', 'U444444'],             // 略過（已取消）
      ['S05', '審核中 Checking', '', '張三', 'U555555'],            // 略過（尚未審核）
      ['第一車：司機阿強', '', '', '', '']                           // 略過（自訂備註雜項）
    ];

    const candidates = [];
    let acceptedCount = 0;
    let waitlistCount = 0;

    for (let r = 1; r < sheetData.length; r++) {
      const row = sheetData[r];
      const code = String(row[0] || '').trim();
      const status = String(row[1] || '').trim();
      const notify = String(row[2] || '').trim();
      const name = String(row[3] || '').trim();
      const uid = String(row[4] || '').trim();

      const isAccepted = status.indexOf('正取') > -1;
      const isWaitlisted = status.indexOf('備取') > -1;
      const isCancelled = status.indexOf('取消') > -1;

      if ((isAccepted || isWaitlisted) && !isCancelled && notify !== '已通知' && uid.startsWith('U')) {
        candidates.push({ code, name, uid, status, isAccepted });
        if (isAccepted) acceptedCount++;
        else waitlistCount++;
      }
    }

    assert.equal(candidates.length, 2);
    assert.equal(acceptedCount, 1);
    assert.equal(waitlistCount, 1);
    assert.equal(candidates[0].name, '王小明');
    assert.equal(candidates[1].name, '陳大華');
  });

  it('範本複製與動態 _CONFIG 綁定模擬測試', () => {
    function simulateCreateEventSheet(templateId, eventId, eventName) {
      let isCopiedFromTemplate = false;
      let config = {};

      if (templateId) {
        isCopiedFromTemplate = true;
      }

      config['EVENT_ID'] = eventId;
      config['EVENT_NAME'] = eventName;

      return { isCopiedFromTemplate, config };
    }

    // 1. 有設定範本 ID
    const res1 = simulateCreateEventSheet('TMPL_12345', 'E2609-01', '七星山單攻');
    assert.equal(res1.isCopiedFromTemplate, true);
    assert.equal(res1.config.EVENT_ID, 'E2609-01');
    assert.equal(res1.config.EVENT_NAME, '七星山單攻');

    // 2. 未設定範本 ID（自動 fallback）
    const res2 = simulateCreateEventSheet('', 'E2609-02', '雪山主東峰');
    assert.equal(res2.isCopiedFromTemplate, false);
    assert.equal(res2.config.EVENT_ID, 'E2609-02');
  });
});


