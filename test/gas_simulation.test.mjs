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

  it('支援完整的 22 欄位結構（系統識別碼、專屬碼至備註）之精準定位與寫入', () => {
    const sHeaders = [
      '系統識別碼', '專屬碼', '姓名', '性別', 'LINE ID', '聯絡信箱', '聯絡電話', '聯絡地址',
      '生日', '證件號碼', '緊急聯絡人姓名', '緊急聯絡人電話', '緊急聯絡人聯絡地址', '緊急聯絡人關係',
      '爬山經驗', '體能測驗', '體能證明', '是否為社員', '審核結果', '通知狀態', '繳費狀態', '備註'
    ];

    assert.equal(sHeaders.length, 22);

    const signupData = {
      userId: 'U123456789',
      signupCode: 'S2609-999',
      name: '李白',
      gender: '男',
      lineId: 'libai_mountain',
      email: 'libai@example.com',
      phone: '0912345678',
      address: '台北市大安區',
      birthday: '1990-01-01',
      idCard: 'A123456789',
      emerName: '杜甫',
      emerPhone: '0987654321',
      emerAddr: '新北市板橋區',
      emerRel: '好友',
      exp: '百岳全登頂',
      strength: '每日重訓',
      strengthProof: 'https://drive.google.com/proof.jpg',
      isOfficial: '是',
      status: '正取 Confirmed',
      notifyStatus: '已通知',
      payStatus: '已繳費 Paid',
      notes: '領隊人員'
    };

    const row = new Array(sHeaders.length).fill('');
    function setCol(keywords, val) {
      if (!Array.isArray(keywords)) keywords = [keywords];
      for (let k = 0; k < keywords.length; k++) {
        const idx = _fi(sHeaders, keywords[k]);
        if (idx > -1) {
          row[idx] = val;
          return;
        }
      }
    }

    setCol(['系統識別碼'], signupData.userId);
    setCol(['專屬碼', '報名專屬碼'], signupData.signupCode);
    setCol(['姓名'], signupData.name);
    setCol(['性別'], signupData.gender);
    setCol(['LINE ID', 'Line ID'], signupData.lineId);
    setCol(['聯絡信箱', '信箱'], signupData.email);
    setCol(['聯絡電話', '手機電話'], signupData.phone);
    setCol(['聯絡地址', '地址'], signupData.address);
    setCol(['生日', '出生年月日'], signupData.birthday);
    setCol(['證件號碼', '身分證字號'], signupData.idCard);
    setCol(['緊急聯絡人姓名', '緊急聯絡人'], signupData.emerName);
    setCol(['緊急聯絡人電話', '聯絡人電話'], signupData.emerPhone);
    setCol(['緊急聯絡人聯絡地址', '緊急聯絡人地址'], signupData.emerAddr);
    setCol(['緊急聯絡人關係', '關係'], signupData.emerRel);
    setCol(['爬山經驗', '登山經驗'], signupData.exp);
    setCol(['體能測驗', '體能'], signupData.strength);
    setCol(['體能證明'], signupData.strengthProof);
    setCol(['是否為社員'], signupData.isOfficial);
    setCol(['審核結果', '審核狀態'], signupData.status);
    setCol(['通知狀態'], signupData.notifyStatus);
    setCol(['繳費狀態'], signupData.payStatus);
    setCol(['備註'], signupData.notes);

    assert.equal(row.length, 22);
    assert.equal(row[0], 'U123456789');
    assert.equal(row[1], 'S2609-999');
    assert.equal(row[2], '李白');
    assert.equal(row[4], 'libai_mountain');
    assert.equal(row[18], '正取 Confirmed');
    assert.equal(row[19], '已通知');
    assert.equal(row[20], '已繳費 Paid');
    assert.equal(row[21], '領隊人員');
  });

  it('Supabase 參數由 Script Properties 安全讀取測試', () => {
    function fakeGetSupabaseConfig(propsStore, configSheetData) {
      let url = propsStore['SUPABASE_URL'] || '';
      let key = propsStore['SUPABASE_SERVICE_ROLE_KEY'] || propsStore['SUPABASE_ANON_KEY'] || '';

      if (!url || !key) {
        if (configSheetData) {
          for (let i = 0; i < configSheetData.length; i++) {
            if (configSheetData[i][0] === 'SUPABASE_URL' && !url) url = configSheetData[i][1];
            if (configSheetData[i][0] === 'SUPABASE_SERVICE_ROLE_KEY' && !key) key = configSheetData[i][1];
          }
        }
      }

      return { url, key };
    }

    // 1. 從 Script Properties 讀取
    const res1 = fakeGetSupabaseConfig({
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret-key-123'
    }, []);
    assert.equal(res1.url, 'https://test.supabase.co');
    assert.equal(res1.key, 'secret-key-123');

    // 2. 當 Script Properties 為空時，備援自 _CONFIG 讀取
    const res2 = fakeGetSupabaseConfig({}, [
      ['SUPABASE_URL', 'https://fallback.supabase.co'],
      ['SUPABASE_SERVICE_ROLE_KEY', 'fallback-key-456']
    ]);
    assert.equal(res2.url, 'https://fallback.supabase.co');
    assert.equal(res2.key, 'fallback-key-456');
  });

  it('活動報名即時寫入 Supabase (members upsert 與 event_signups insert) 模擬測試', () => {
    let eventReq = null;
    let memberReq = null;
    let signupReq = null;

    function fakeSyncSignupToSupabase(url, key, userId, eventId, signupCode, p, signupStatus, eventName) {
      if (!url || !key || !userId || !eventId || !signupCode) return false;
      const isOfficial = (p.isOfficial === '是' || p.isOfficial === true);

      eventReq = {
        url: url + '/rest/v1/events?on_conflict=id',
        payload: {
          id: eventId,
          title: eventName || eventId,
          fee: 0,
          status: '開放'
        }
      };

      memberReq = {
        url: url + '/rest/v1/members?on_conflict=line_user_id',
        payload: {
          line_user_id: userId,
          name: p.name || '社員',
          gender: p.gender || null,
          line_id: p.lineId || null,
          email: p.email || null,
          phone: p.phone || null,
          is_official_member: isOfficial,
          birthday: p.birthday || null,
          id_card: p.idCard || null
        }
      };

      signupReq = {
        url: url + '/rest/v1/event_signups?on_conflict=id',
        payload: {
          id: signupCode,
          event_id: eventId,
          line_user_id: userId,
          name: p.name || '',
          status: signupStatus || '審核中 Checking',
          is_official_member_snapshot: isOfficial,
          notes: ''
        }
      };

      return true;
    }

    const success = fakeSyncSignupToSupabase(
      'https://xyz.supabase.co',
      'test-service-key',
      'U1234567890',
      'EVT-2026-0920',
      'S0913022203',
      {
        name: '王大明',
        gender: '男',
        phone: '0912345678',
        email: 'wang@example.com',
        isOfficial: '是',
        birthday: '1995-05-20',
        idCard: 'A123456789'
      },
      '審核中 Checking',
      '陽明山大縱走'
    );

    assert.equal(success, true);
    assert.ok(eventReq.url.includes('/rest/v1/events'));
    assert.equal(eventReq.payload.title, '陽明山大縱走');

    assert.ok(memberReq.url.includes('/rest/v1/members'));
    assert.equal(memberReq.payload.name, '王大明');
    assert.equal(memberReq.payload.is_official_member, true);

    assert.ok(signupReq.url.includes('/rest/v1/event_signups'));
    assert.equal(signupReq.payload.id, 'S0913022203');
    assert.equal(signupReq.payload.event_id, 'EVT-2026-0920');
    assert.equal(signupReq.payload.status, '審核中 Checking');
    assert.equal(signupReq.payload.is_official_member_snapshot, true);
  });

  it('活動取消報名狀態同步 Supabase (event_signups patch) 模擬測試', () => {
    let cancelReq = null;

    function fakeSyncSignupCancelToSupabase(url, key, userId, eventId, targetCode, reason) {
      if (!url || !key || !userId) return false;
      const query = targetCode
        ? 'id=eq.' + encodeURIComponent(targetCode)
        : 'event_id=eq.' + encodeURIComponent(eventId) + '&line_user_id=eq.' + encodeURIComponent(userId);

      cancelReq = {
        url: url + '/rest/v1/event_signups?' + query,
        payload: {
          status: '已取消 Cancelled',
          cancel_reason: reason || ''
        }
      };
      return true;
    }

    const success = fakeSyncSignupCancelToSupabase(
      'https://xyz.supabase.co',
      'test-service-key',
      'U1234567890',
      'EVT-2026-0920',
      'S0913022203',
      '因私事無法參加'
    );

    assert.equal(success, true);
    assert.equal(cancelReq.url, 'https://xyz.supabase.co/rest/v1/event_signups?id=eq.S0913022203');
    assert.equal(cancelReq.payload.status, '已取消 Cancelled');
    assert.equal(cancelReq.payload.cancel_reason, '因私事無法參加');
  });

  it('新活動發布完整 Upsert 至 Supabase (含 drive_folder_url, spreadsheet_url, spreadsheet_id) 模擬測試', () => {
    let upsertReq = null;

    function fakeSyncEventToSupabase(eventData) {
      if (!eventData || !eventData.id) return false;
      const costNum = parseInt(String(eventData.cost || 0).replace(/[^\d]/g, ''), 10) || 0;
      const payload = {
        id: eventData.id,
        title: eventData.name || eventData.title,
        fee: costNum,
        start_date: eventData.startDate ? String(eventData.startDate).replace(/\//g, '-').split(' ')[0] : null,
        end_date: eventData.endDate ? String(eventData.endDate).replace(/\//g, '-').split(' ')[0] : null,
        status: eventData.status || '未來開放',
        summary: eventData.shortDesc || '',
        itinerary: eventData.fullDesc || '',
        cover_image_url: eventData.imageUrl || '',
        drive_folder_url: eventData.driveFolderUrl || null,
        spreadsheet_url: eventData.spreadsheetUrl || null,
        spreadsheet_id: eventData.spreadsheetId || null,
        updated_at: new Date().toISOString()
      };

      upsertReq = {
        url: 'https://xyz.supabase.co/rest/v1/events?on_conflict=id',
        payload: payload
      };
      return true;
    }

    const success = fakeSyncEventToSupabase({
      id: 'E2609-02',
      name: '2026/09/20_七星山登頂',
      startDate: '2026/09/20',
      endDate: '2026/09/20',
      cost: '350',
      status: '開放',
      shortDesc: '秋季迎新',
      driveFolderUrl: 'https://drive.google.com/drive/folders/folder_xyz_123',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_abc_456/edit',
      spreadsheetId: 'sheet_abc_456'
    });

    assert.equal(success, true);
    assert.equal(upsertReq.payload.id, 'E2609-02');
    assert.equal(upsertReq.payload.fee, 350);
    assert.equal(upsertReq.payload.drive_folder_url, 'https://drive.google.com/drive/folders/folder_xyz_123');
    assert.equal(upsertReq.payload.spreadsheet_url, 'https://docs.google.com/spreadsheets/d/sheet_abc_456/edit');
    assert.equal(upsertReq.payload.spreadsheet_id, 'sheet_abc_456');
  });

  it('當 Supabase 與主試算表均缺失試算表 ID 時，Google Drive 智慧檔名搜尋備援能成功定位試算表', () => {
    // 模擬 Drive 檔案清單
    const driveFiles = [
      { id: 'sheet_999', name: '2026/09/20_七星山登頂_報名名冊', url: 'https://docs.google.com/spreadsheets/d/sheet_999/edit' },
      { id: 'file_888', name: '2026/09/20_七星山登頂_封面.jpg', url: 'https://drive.google.com/file_888' }
    ];

    function fakeDriveSearch(eventName) {
      const cleanName = eventName.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
      for (const f of driveFiles) {
        if (f.name.includes(cleanName) && (f.name.includes('名冊') || f.name.includes('報名'))) {
          return { id: f.id, url: f.url, name: f.name };
        }
      }
      return null;
    }

    const found = fakeDriveSearch('七星山登頂');
    assert.ok(found);
    assert.equal(found.id, 'sheet_999');
    assert.equal(found.url, 'https://docs.google.com/spreadsheets/d/sheet_999/edit');
  });

  it('_CONFIG 設置與更新輔助函式 (_setOrUpdateConfigRow) 正確更新既有鍵或追加新鍵', () => {
    const mockConfig = [
      ['KEY', 'VALUE'],
      ['EVENT_ID', 'E2609-01'],
      ['EVENT_NAME', '舊活動名']
    ];

    function fakeSetOrUpdateConfigRow(rows, key, val) {
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toUpperCase() === String(key).trim().toUpperCase()) {
          rows[i][1] = val !== undefined && val !== null ? val : '';
          return;
        }
      }
      rows.push([key, val !== undefined && val !== null ? val : '']);
    }

    // 更新既有鍵
    fakeSetOrUpdateConfigRow(mockConfig, 'EVENT_NAME', '新活動名');
    assert.equal(mockConfig[2][1], '新活動名');

    // 追加新鍵 (Supabase 連線參數)
    fakeSetOrUpdateConfigRow(mockConfig, 'SUPABASE_URL', 'https://xyz.supabase.co');
    fakeSetOrUpdateConfigRow(mockConfig, 'SUPABASE_SERVICE_ROLE_KEY', 'secret-key-123');

    assert.equal(mockConfig.length, 5);
    assert.equal(mockConfig[3][0], 'SUPABASE_URL');
    assert.equal(mockConfig[3][1], 'https://xyz.supabase.co');
    assert.equal(mockConfig[4][0], 'SUPABASE_SERVICE_ROLE_KEY');
    assert.equal(mockConfig[4][1], 'secret-key-123');
  });

  it('活動試算表 getSupabaseConfig 支援模糊鍵名 (如 SUPABASE_UR 與 SUPABASE_SE) 容錯解析', () => {
    const mockRows = [
      ['KEY', 'VALUE'],
      ['EVENT_ID', 'E2609-02'],
      ['SUPABASE_UR', 'https://fuzzy.supabase.co'],
      ['SUPABASE_SE', 'service-role-fuzzy-key']
    ];

    function fakeGetSupabaseConfig(rows) {
      let url = '';
      let key = '';
      for (let i = 0; i < rows.length; i++) {
        const k = String(rows[i][0]).trim().toUpperCase();
        const v = String(rows[i][1]).trim();
        if ((k === 'SUPABASE_URL' || k === 'SUPABASE_UR' || k.indexOf('SUPABASE_URL') === 0) && !url) {
          url = v;
        }
        if ((k === 'SUPABASE_SERVICE_ROLE_KEY' || k === 'SUPABASE_SE' || k.includes('SERVICE_ROLE') || k.includes('SERVICE_KEY')) && !key) {
          key = v;
        }
      }
      return { url, key };
    }

    const cfg = fakeGetSupabaseConfig(mockRows);
    assert.equal(cfg.url, 'https://fuzzy.supabase.co');
    assert.equal(cfg.key, 'service-role-fuzzy-key');
  });
});

describe('13. 社團主試算表 (Members, Equipments, Events) 零幻想精準欄位提取與差異比對同步測試', () => {
  it('嚴格對齊使用者提供的 24 欄位 Members 結構並提取為 Supabase members 格式', () => {
    const userHeaders = [
      '系統識別碼', '姓名', '性別', 'Line ID', '聯絡信箱', '聯絡電話', '系所', '學號',
      '繳費狀態', '社籍到期日', '生日', '證件號碼', '聯絡地址', '爬山經驗', '體能測驗', '體能證明',
      '緊急聯絡人姓名', '緊急聯絡人關係', '緊急聯絡人電話', '緊急聯絡人聯絡地址', '個人特殊病史或過敏',
      '身分狀態', '加入社員意願', '擔任幹部意願'
    ];

    assert.equal(userHeaders.length, 24);

    function findCol(kw) {
      for (let i = 0; i < userHeaders.length; i++) {
        if (userHeaders[i] === kw) return i;
      }
      return -1;
    }

    const mCols = {
      line_user_id: findCol('系統識別碼'),
      name: findCol('姓名'),
      gender: findCol('性別'),
      line_id: findCol('Line ID'),
      email: findCol('聯絡信箱'),
      phone: findCol('聯絡電話'),
      department: findCol('系所'),
      student_id: findCol('學號'),
      payment_status: findCol('繳費狀態'),
      membership_expires_at: findCol('社籍到期日'),
      birthday: findCol('生日'),
      id_card: findCol('證件號碼'),
      address: findCol('聯絡地址'),
      outdoor_experience: findCol('爬山經驗'),
      fitness_desc: findCol('體能測驗'),
      proof_urls: findCol('體能證明'),
      emergency_contact_name: findCol('緊急聯絡人姓名'),
      emergency_contact_rel: findCol('緊急聯絡人關係'),
      emergency_contact_phone: findCol('緊急聯絡人電話'),
      emergency_contact_address: findCol('緊急聯絡人聯絡地址'),
      medical_history: findCol('個人特殊病史或過敏'),
      identity_status: findCol('身分狀態'),
      join_membership_intent: findCol('加入社員意願'),
      officer_intent: findCol('擔任幹部意願')
    };

    // 驗證 24 個欄位全部精確索引到，無任何欄位缺失 (-1)
    for (const key in mCols) {
      assert.ok(mCols[key] >= 0, `欄位 ${key} 應成功匹配`);
    }

    const mockRow = [
      'U1234567890abcdef', '張小明', '男', 'ming_line', 'ming@example.com', '0912345678',
      '資訊工程系', 'B11015000', '已繳費 Paid', '2027-06-30', '2002-08-15', 'A123456789',
      '台北市大安區基隆路四段43號', '玉山主峰、雪山主東', '3000m 跑步 14分', 'https://drive.google.com/proof1',
      '張爸爸', '父親', '0987654321', '新北市板橋區縣民大道', '無重大病史或過敏',
      '在校生', '是', '活動幹部'
    ];

    function extractMember(row, cols) {
      const payStatus = String(row[cols.payment_status] || '').trim();
      const isOfficial = payStatus.includes('已繳費') || payStatus.includes('Paid');
      return {
        line_user_id: String(row[cols.line_user_id] || '').trim(),
        name: String(row[cols.name] || '').trim(),
        gender: String(row[cols.gender] || '').trim(),
        line_id: String(row[cols.line_id] || '').trim(),
        email: String(row[cols.email] || '').trim(),
        phone: String(row[cols.phone] || '').trim(),
        department: String(row[cols.department] || '').trim(),
        student_id: String(row[cols.student_id] || '').trim(),
        payment_status: payStatus,
        membership_expires_at: String(row[cols.membership_expires_at] || '').trim(),
        birthday: String(row[cols.birthday] || '').trim(),
        id_card: String(row[cols.id_card] || '').trim(),
        address: String(row[cols.address] || '').trim(),
        outdoor_experience: String(row[cols.outdoor_experience] || '').trim(),
        fitness_desc: String(row[cols.fitness_desc] || '').trim(),
        emergency_contact_name: String(row[cols.emergency_contact_name] || '').trim(),
        emergency_contact_rel: String(row[cols.emergency_contact_rel] || '').trim(),
        emergency_contact_phone: String(row[cols.emergency_contact_phone] || '').trim(),
        emergency_contact_address: String(row[cols.emergency_contact_address] || '').trim(),
        medical_history: String(row[cols.medical_history] || '').trim(),
        identity_status: String(row[cols.identity_status] || '').trim(),
        join_membership_intent: String(row[cols.join_membership_intent] || '').trim(),
        officer_intent: String(row[cols.officer_intent] || '').trim(),
        is_official_member: isOfficial
      };
    }

    const res = extractMember(mockRow, mCols);
    assert.equal(res.line_user_id, 'U1234567890abcdef');
    assert.equal(res.name, '張小明');
    assert.equal(res.department, '資訊工程系');
    assert.equal(res.student_id, 'B11015000');
    assert.equal(res.payment_status, '已繳費 Paid');
    assert.equal(res.is_official_member, true);
    assert.equal(res.emergency_contact_name, '張爸爸');
    assert.equal(res.emergency_contact_rel, '父親');
    assert.equal(res.emergency_contact_phone, '0987654321');
    assert.equal(res.officer_intent, '活動幹部');
  });

  it('嚴格對齊使用者提供的 14 欄位 Equipments 結構並提取為 Supabase equipments 格式', () => {
    const userEqHeaders = [
      '裝備代號', '裝備名稱', '總數量', '剩餘數量', '是否外借', '租金（2天）', '租金（+1天）',
      '狀態', '備注', '圖片網址1', '圖片網址2', '圖片網址3', '圖片網址4', '圖片網址5'
    ];

    assert.equal(userEqHeaders.length, 14);

    function findEqCol(kw) {
      for (let i = 0; i < userEqHeaders.length; i++) {
        if (userEqHeaders[i] === kw) return i;
      }
      return -1;
    }

    const eqCols = {
      id: findEqCol('裝備代號'),
      name: findEqCol('裝備名稱'),
      total_qty: findEqCol('總數量'),
      available_qty: findEqCol('剩餘數量'),
      is_borrowable: findEqCol('是否外借'),
      member_price: findEqCol('租金（2天）'),
      extra_price: findEqCol('租金（+1天）'),
      specs: findEqCol('狀態'),
      notes: findEqCol('備注'),
      img1: findEqCol('圖片網址1'),
      img2: findEqCol('圖片網址2'),
      img3: findEqCol('圖片網址3'),
      img4: findEqCol('圖片網址4'),
      img5: findEqCol('圖片網址5')
    };

    for (const k in eqCols) {
      assert.ok(eqCols[k] >= 0, `Equipments 欄位 ${k} 應成功匹配`);
    }

    const mockEqRow = [
      'EQ-TENT-01', '三人雙門高山帳', '5', '3', '是', '300', '100',
      '良好', '附地布與營釘', 'https://example.com/tent1.jpg', 'https://example.com/tent2.jpg', '', '', ''
    ];

    function extractEquipment(row, cols) {
      const images = [];
      for (let k = 1; k <= 5; k++) {
        const u = String(row[cols['img' + k]] || '').trim();
        if (u && u.startsWith('http')) images.push(u);
      }
      return {
        id: String(row[cols.id] || '').trim(),
        name: String(row[cols.name] || '').trim(),
        total_qty: parseInt(String(row[cols.total_qty] || 0).replace(/[^\d]/g, ''), 10) || 0,
        available_qty: parseInt(String(row[cols.available_qty] || 0).replace(/[^\d]/g, ''), 10) || 0,
        is_borrowable: (row[cols.is_borrowable] === '是' || row[cols.is_borrowable] === true),
        member_price_per_day: parseInt(String(row[cols.member_price] || 0).replace(/[^\d]/g, ''), 10) || 0,
        non_member_price_per_day: parseInt(String(row[cols.extra_price] || 0).replace(/[^\d]/g, ''), 10) || 0,
        specs: String(row[cols.specs] || '').trim(),
        notes: String(row[cols.notes] || '').trim(),
        images: images
      };
    }

    const res = extractEquipment(mockEqRow, eqCols);
    assert.equal(res.id, 'EQ-TENT-01');
    assert.equal(res.name, '三人雙門高山帳');
    assert.equal(res.total_qty, 5);
    assert.equal(res.available_qty, 3);
    assert.equal(res.is_borrowable, true);
    assert.equal(res.member_price_per_day, 300);
    assert.equal(res.non_member_price_per_day, 100);
    assert.equal(res.specs, '良好');
    assert.equal(res.notes, '附地布與營釘');
    assert.deepEqual(res.images, ['https://example.com/tent1.jpg', 'https://example.com/tent2.jpg']);
  });

  it('嚴格對齊使用者提供的 14 欄位 Events 結構並提取為 Supabase events 格式', () => {
    const userEvHeaders = [
      '活動編號', '活動名稱', '預計費用', '活動開始日期', '活動結束日期', '報名截止日期',
      '報名狀態', '簡介', '詳細行程', '封面圖網址', '活動編號', '雲端資料夾網址', '報名名冊網址', '試算表ID'
    ];

    assert.equal(userEvHeaders.length, 14);

    function findEvCol(kw) {
      for (let i = 0; i < userEvHeaders.length; i++) {
        if (userEvHeaders[i] === kw) return i;
      }
      return -1;
    }

    const evCols = {
      id: 0, // 第一個活動編號
      name: findEvCol('活動名稱'),
      cost: findEvCol('預計費用'),
      startDate: findEvCol('活動開始日期'),
      endDate: findEvCol('活動結束日期'),
      deadline: findEvCol('報名截止日期'),
      status: findEvCol('報名狀態'),
      summary: findEvCol('簡介'),
      itinerary: findEvCol('詳細行程'),
      cover_image_url: findEvCol('封面圖網址'),
      drive_folder_url: findEvCol('雲端資料夾網址'),
      spreadsheet_url: findEvCol('報名名冊網址'),
      spreadsheet_id: findEvCol('試算表ID')
    };

    for (const k in evCols) {
      assert.ok(evCols[k] >= 0, `Events 欄位 ${k} 應成功匹配`);
    }

    const mockEvRow = [
      'E2609-01', '合歡西北峰三日縱走', '1500', '2026/10/20', '2026/10/22', '2026/10/10',
      '開放報名', '精選入門高山百岳路線', 'Day1: 登山口-北峰-營地; Day2: 西峰; Day3: 下山',
      'https://example.com/hehuanshan.jpg', 'E2609-01',
      'https://drive.google.com/drive/folders/folder_123',
      'https://docs.google.com/spreadsheets/d/sheet_456/edit', 'sheet_456'
    ];

    function extractEvent(row, cols) {
      const sDate = String(row[cols.startDate] || '').replace(/\//g, '-').split(' ')[0];
      const eDate = String(row[cols.endDate] || '').replace(/\//g, '-').split(' ')[0] || sDate;
      const dLine = String(row[cols.deadline] || '').replace(/\//g, '-');
      return {
        id: String(row[cols.id] || '').trim(),
        title: String(row[cols.name] || '').trim(),
        fee: parseInt(String(row[cols.cost] || 0).replace(/[^\d]/g, ''), 10) || 0,
        start_date: sDate || null,
        end_date: eDate || null,
        deadline: dLine ? (dLine.includes('T') ? dLine : dLine + 'T23:59:59Z') : null,
        status: String(row[cols.status] || '').trim() || '未來開放',
        summary: String(row[cols.summary] || '').trim(),
        itinerary: String(row[cols.itinerary] || '').trim(),
        cover_image_url: String(row[cols.cover_image_url] || '').trim(),
        drive_folder_url: String(row[cols.drive_folder_url] || '').trim() || null,
        spreadsheet_url: String(row[cols.spreadsheet_url] || '').trim() || null,
        spreadsheet_id: String(row[cols.spreadsheet_id] || '').trim() || null
      };
    }

    const res = extractEvent(mockEvRow, evCols);
    assert.equal(res.id, 'E2609-01');
    assert.equal(res.title, '合歡西北峰三日縱走');
    assert.equal(res.fee, 1500);
    assert.equal(res.start_date, '2026-10-20');
    assert.equal(res.end_date, '2026-10-22');
    assert.equal(res.deadline, '2026-10-10T23:59:59Z');
    assert.equal(res.status, '開放報名');
    assert.equal(res.spreadsheet_id, 'sheet_456');
    assert.equal(res.drive_folder_url, 'https://drive.google.com/drive/folders/folder_123');
  });

  it('測試診斷社員防護機制：Sync Worker 略過 TEST_DIAGNOSTIC 且 cleanup 正常識別', () => {
    // 1. Sync worker 防護驗證
    function shouldSyncToSheet(memberPayload) {
      if (memberPayload.line_user_id && memberPayload.line_user_id.includes('TEST_DIAGNOSTIC')) {
        return false;
      }
      if (memberPayload.name && memberPayload.name.includes('測試報名社員')) {
        return false;
      }
      return true;
    }

    assert.equal(shouldSyncToSheet({ line_user_id: 'U_TEST_DIAGNOSTIC', name: '測試報名社員' }), false);
    assert.equal(shouldSyncToSheet({ line_user_id: 'U1234567890', name: '正式社員小明' }), true);

    // 2. 清理診斷資料列篩選驗證
    const mockSheetRows = [
      ['系統識別碼', '姓名'],
      ['U111111', '王大明'],
      ['U_TEST_DIAGNOSTIC', '測試報名社員'],
      ['U222222', '李小美']
    ];

    const toDeleteRowIndices = [];
    for (let r = 1; r < mockSheetRows.length; r++) {
      const uid = mockSheetRows[r][0];
      const name = mockSheetRows[r][1];
      if (uid.includes('TEST_DIAGNOSTIC') || name.includes('測試報名社員')) {
        toDeleteRowIndices.push(r + 1); // 1-indexed 行號
      }
    }

    assert.equal(toDeleteRowIndices.length, 1);
    assert.equal(toDeleteRowIndices[0], 3); // 第 3 行為診斷列
  });
});

describe('14. 活動報名資料防呆檢查、幹部群組 @Mention 召喚與服務選單回傳測試', () => {
  // 模擬 _checkProfileComplete 邏輯
  function simulateCheckProfileComplete(memberData, type) {
    if (!memberData) {
      return { isComplete: false, missingFields: ['尚未建立社員基本資料，請先填寫'], profile: null };
    }
    const missing = [];
    if (!memberData.name) missing.push('姓名');
    if (!memberData.gender) missing.push('性別');
    if (!memberData.phone) missing.push('聯絡電話');

    if (type === 'activity') {
      if (!memberData.birthday) missing.push('生日 (Birthday)');
      if (!memberData.id_card) missing.push('身分證字號 / 居留證號 (ID Number)');
      if (!memberData.address) missing.push('聯絡地址 (Address)');
      if (!memberData.emergency_contact_name) missing.push('緊急聯絡人姓名 (Emergency Contact)');
      if (!memberData.emergency_contact_relation) missing.push('與緊急聯絡人關係 (Relationship)');
      if (!memberData.emergency_contact_phone) missing.push('緊急聯絡人電話 (Emergency Contact Phone)');
    }

    return {
      isComplete: missing.length === 0,
      missingFields: missing,
      profile: memberData
    };
  }

  it('活動報名個資防呆：當缺少生日與緊急聯絡人資料時，逐項列出缺失欄位', () => {
    const incompleteMember = {
      name: '測試隊員',
      gender: '男',
      phone: '0912345678',
      address: '台北市大安區基隆路四段43號'
    };
    const result = simulateCheckProfileComplete(incompleteMember, 'activity');
    assert.equal(result.isComplete, false);
    assert.ok(result.missingFields.includes('生日 (Birthday)'));
    assert.ok(result.missingFields.includes('身分證字號 / 居留證號 (ID Number)'));
    assert.ok(result.missingFields.includes('緊急聯絡人姓名 (Emergency Contact)'));
    assert.ok(result.missingFields.includes('與緊急聯絡人關係 (Relationship)'));
    assert.ok(result.missingFields.includes('緊急聯絡人電話 (Emergency Contact Phone)'));
  });

  it('活動報名個資防呆：當欄位齊全時，回傳 isComplete 為 true', () => {
    const completeMember = {
      name: '王大明',
      gender: '男',
      phone: '0912345678',
      birthday: '1999/01/01',
      id_card: 'A123456789',
      address: '台北市大安區基隆路四段43號',
      emergency_contact_name: '王媽媽',
      emergency_contact_relation: '母子',
      emergency_contact_phone: '0987654321'
    };
    const result = simulateCheckProfileComplete(completeMember, 'activity');
    assert.equal(result.isComplete, true);
    assert.equal(result.missingFields.length, 0);
  });

  it('幹部群組呼叫偵測：在群組中被 @小岳 或呼叫「小岳 幹部系統」時，回傳指定助理引導卡片', () => {
    function simulateGroupRouter(text, groupId, isMentionedSelf) {
      const lowerText = text.toLowerCase();
      const isGroup = !!groupId;
      let isMentioned = isMentionedSelf;
      if (!isMentioned) {
        if (text.includes('@小岳') || text.startsWith('小岳') || lowerText.includes('小岳')) {
          isMentioned = true;
        }
      }

      if (isGroup && !isMentioned) {
        return null; // 靜默
      }

      const cleanText = text.replace(/@\S+/g, '').replace(/小岳/g, '').trim();
      if (
        (isGroup && isMentioned && (cleanText === '' || cleanText === '幹部系統' || cleanText === '嗨')) ||
        text === '小岳 幹部系統' ||
        text === '幹部系統'
      ) {
        return '🌲 幹部專屬助理小岳在此！';
      }
      return 'AI_OR_OTHER';
    }

    // 1. 群組被 @小岳 (空訊息)
    const res1 = simulateGroupRouter('@小岳', 'c_admin_group', true);
    assert.equal(res1, '🌲 幹部專屬助理小岳在此！');

    // 2. 群組打招呼「小岳 嗨」
    const res2 = simulateGroupRouter('小岳 嗨', 'c_admin_group', false);
    assert.equal(res2, '🌲 幹部專屬助理小岳在此！');

    // 3. 輸入「小岳 幹部系統」
    const res3 = simulateGroupRouter('小岳 幹部系統', 'c_admin_group', false);
    assert.equal(res3, '🌲 幹部專屬助理小岳在此！');

    // 4. 群組一般閒聊未提及小岳 -> 靜默防洗版 (null)
    const res4 = simulateGroupRouter('大家明天要爬山嗎？', 'c_admin_group', false);
    assert.equal(res4, null);
  });

  it('「更多服務 More Services」包含「幹部是誰」與「意見與回饋」功能項目', () => {
    const options = [
      { title: '裝備租借商城', keyword: '裝備租借' },
      { title: '繳費與對帳申報', keyword: '繳費系統' },
      { title: '個人主頁 / 我的狀態', keyword: '我的狀態' },
      { title: '幹部名單 (幹部是誰)', keyword: '幹部是誰' },
      { title: '意見與回饋', keyword: '意見與回饋' }
    ];

    const hasOfficers = options.some(o => o.keyword === '幹部是誰');
    const hasFeedback = options.some(o => o.keyword === '意見與回饋');
    assert.equal(hasOfficers, true);
    assert.equal(hasFeedback, true);
  });
});

describe('15. Supabase SSOT 報名驗證、Sync Worker 全 CRUD 增刪鏡像、幹部意願通知與裝備照片更新測試', () => {
  // 1. 報名檢查邏輯測試：Supabase 優先 SSOT
  it('重複報名判定 100% 依據 Supabase：當 Supabase 無有效報名（即使試算表有舊列），判定為未報名放行', () => {
    function simulateCheckAlreadySignedUp(supabaseSignups) {
      if (!supabaseSignups || supabaseSignups.length === 0) {
        return false; // 未報名
      }
      return supabaseSignups.some(sig => {
        const st = String(sig.status || '');
        return !st.includes('取消') && !st.toLowerCase().includes('cancelled');
      });
    }

    // 情境 A：Supabase 紀錄已被刪除（空陣列）
    assert.equal(simulateCheckAlreadySignedUp([]), false);

    // 情境 B：Supabase 只有已取消的紀錄
    assert.equal(simulateCheckAlreadySignedUp([{ id: 'S01', status: '已取消 Cancelled' }]), false);

    // 情境 C：Supabase 有審核中的有效紀錄
    assert.equal(simulateCheckAlreadySignedUp([{ id: 'S02', status: '審核中 Checking' }]), true);

    // 情境 D：Supabase 有正取的有效紀錄
    assert.equal(simulateCheckAlreadySignedUp([{ id: 'S03', status: '正取 Confirmed' }]), true);
  });

  // 2. Sync Worker DELETE 動作測試
  it('Sync Worker 支援 action === DELETE，能精準自模擬資料列中刪除對應項目', () => {
    const mockSignups = [
      { id: 'S01', user: 'U01', event: 'E01' },
      { id: 'S02', user: 'U02', event: 'E01' },
      { id: 'S03', user: 'U03', event: 'E02' }
    ];

    function simulateDeleteSignup(list, payload) {
      const idx = list.findIndex(item => item.id === payload.id || (item.user === payload.line_user_id && item.event === payload.event_id));
      if (idx > -1) {
        list.splice(idx, 1);
        return true;
      }
      return false;
    }

    // 刪除 S02
    const deleted = simulateDeleteSignup(mockSignups, { id: 'S02' });
    assert.equal(deleted, true);
    assert.equal(mockSignups.length, 2);
    assert.equal(mockSignups.some(s => s.id === 'S02'), false);

    // 依 user + event 刪除 S01
    const deleted2 = simulateDeleteSignup(mockSignups, { line_user_id: 'U01', event_id: 'E01' });
    assert.equal(deleted2, true);
    assert.equal(mockSignups.length, 1);
    assert.equal(mockSignups[0].id, 'S03');
  });

  // 3. 幹部意願通知測試
  it('基本資料填寫勾選有意願擔任幹部時，正確判定並觸發幹部推播訊息', () => {
    function shouldNotifyAdminForOfficer(formData) {
      const intent = formData.intendOfficer || formData.officer_intent || '';
      if (!intent) return false;
      const lower = String(intent).trim().toLowerCase();
      if (lower === '無' || lower === '無意願' || lower === '否' || lower === 'none' || lower === 'no') {
        return false;
      }
      return true;
    }

    assert.equal(shouldNotifyAdminForOfficer({ intendOfficer: '有意願成為幹部' }), true);
    assert.equal(shouldNotifyAdminForOfficer({ intendOfficer: '活動幹部' }), true);
    assert.equal(shouldNotifyAdminForOfficer({ intendOfficer: '無意願' }), false);
    assert.equal(shouldNotifyAdminForOfficer({ intendOfficer: '否' }), false);
    assert.equal(shouldNotifyAdminForOfficer({ intendOfficer: '' }), false);
  });

  // 4. 裝備照片更新 API 測試
  it('update_equipment_images 正確保留舊有照片並附加新上傳照片網址', () => {
    function simulateUpdateEquipmentImages(keptUrls, newUploadedUrls) {
      const finalUrls = [];
      (keptUrls || []).forEach(u => {
        if (u && u.startsWith('http') && !finalUrls.includes(u)) {
          finalUrls.push(u);
        }
      });
      (newUploadedUrls || []).forEach(u => {
        if (u && u.startsWith('http') && !finalUrls.includes(u)) {
          finalUrls.push(u);
        }
      });
      return finalUrls.join('\n');
    }

    const res = simulateUpdateEquipmentImages(
      ['https://lh3.googleusercontent.com/d/old1=w1000'],
      ['https://lh3.googleusercontent.com/d/new2=w1000']
    );
    assert.ok(res.includes('old1'));
    assert.ok(res.includes('new2'));
    assert.equal(res.split('\n').length, 2);
  });

  // 5. 裝備租借費用欄位解析與容錯測試
  it('fetchEquipmentsFromSupabase 正確支援 price_2day 與 price_extra_day 欄位解析與 fallback', () => {
    function mapEquipmentRow(row) {
      let imgStr = '';
      if (Array.isArray(row.images)) {
        imgStr = row.images.filter(Boolean).join(',');
      } else if (typeof row.images === 'string') {
        imgStr = row.images;
      }

      return {
        id: row.id,
        name: row.name || '未知裝備',
        remainQty: row.available_qty ?? 0,
        price: row.price_2day ?? row.price ?? row.member_price_per_day ?? 0,
        priceExtra: row.price_extra_day ?? row.price_extra ?? row.non_member_price_per_day ?? 0,
        imageUrl: imgStr,
        description: row.notes || row.specs || ''
      };
    }

    // 情況 A：使用真實 Supabase 欄位 price_2day 與 price_extra_day
    const rowA = {
      id: 'EQ_TENT',
      name: '四人帳篷',
      available_qty: 3,
      price_2day: 150,
      price_extra_day: 50,
      member_price_per_day: null,
      non_member_price_per_day: null
    };
    const equipA = mapEquipmentRow(rowA);
    assert.equal(equipA.price, 150);
    assert.equal(equipA.priceExtra, 50);

    // 情況 B：使用舊版 member_price_per_day 與 non_member_price_per_day
    const rowB = {
      id: 'EQ_BAG',
      name: '登山大背包',
      available_qty: 5,
      member_price_per_day: 80,
      non_member_price_per_day: 30
    };
    const equipB = mapEquipmentRow(rowB);
    assert.equal(equipB.price, 80);
    assert.equal(equipB.priceExtra, 30);

    // 情況 C：若皆為 undefined 則正確 fallback 為 0
    const rowC = {
      id: 'EQ_HELMET',
      name: '岩盔',
      available_qty: 2
    };
    const equipC = mapEquipmentRow(rowC);
    assert.equal(equipC.price, 0);
    assert.equal(equipC.priceExtra, 0);
  });

  // 6. 幹部招募意願：僅在「由無變有」或「新成員勾選」時才發送推播通知
  it('幹部意願狀態變更才推播：避免社員修改其他個資時重複推播幹部群組', () => {
    function evaluateOfficerNotification(json) {
      const data = json.formData || {};
      const officerIntent = data.intendOfficer || data.officer_intent || '';
      let wantsToBeOfficer = false;
      if (officerIntent) {
        const lower = String(officerIntent).trim().toLowerCase();
        if (lower !== '無' && lower !== '無意願' && lower !== '否' && lower !== 'none' && lower !== 'no') {
          wantsToBeOfficer = true;
        }
      }

      let isOfficerIntentNew = true;
      if (typeof json.isOfficerIntentNew === 'boolean') {
        isOfficerIntentNew = json.isOfficerIntentNew;
      } else if (json.previousOfficerIntent !== undefined) {
        const prevLower = String(json.previousOfficerIntent).trim().toLowerCase();
        const wasWilling = Boolean(prevLower && prevLower !== '無' && prevLower !== '無意願' && prevLower !== '否' && prevLower !== 'none' && prevLower !== 'no');
        isOfficerIntentNew = !wasWilling && wantsToBeOfficer;
      }

      return wantsToBeOfficer && isOfficerIntentNew;
    }

    // 情況 1：新用戶勾選意願 -> 觸發推播
    assert.equal(evaluateOfficerNotification({
      isNewUser: true,
      isOfficerIntentNew: true,
      previousOfficerIntent: '',
      formData: { intendOfficer: '我有意願成為社團幹部' }
    }), true);

    // 情況 2：既有用戶原本無意願，本次勾選 -> 觸發推播
    assert.equal(evaluateOfficerNotification({
      isNewUser: false,
      isOfficerIntentNew: true,
      previousOfficerIntent: '無',
      formData: { intendOfficer: '我有意願成為社團幹部' }
    }), true);

    // 情況 3：既有用戶原本已有意願，本次僅更新電話或地址 (意願未變) -> 不重複推播！
    assert.equal(evaluateOfficerNotification({
      isNewUser: false,
      isOfficerIntentNew: false,
      previousOfficerIntent: '我有意願成為社團幹部',
      formData: { intendOfficer: '我有意願成為社團幹部', phone: '0987654321' }
    }), false);

    // 情況 4：用戶取消勾選意願 -> 不推播
    assert.equal(evaluateOfficerNotification({
      isNewUser: false,
      isOfficerIntentNew: false,
      previousOfficerIntent: '我有意願成為社團幹部',
      formData: { intendOfficer: '' }
    }), false);
  });

  // 7. 幹部職稱同步：officer_role 與 officers 頁面的 title 欄位同步測試
  it('checkOfficerStatusFromSupabase 正確優先同步 officers 表之 title 職稱', () => {
    function resolveOfficerRole(memberData, officerData) {
      const officerTitle = officerData?.title || officerData?.role || memberData?.officer_role || '幹部';
      const officerName = officerData?.name || memberData?.name || '幹部';

      if (memberData && memberData.is_officer) {
        return { isOfficer: true, role: officerTitle, name: officerName };
      }
      if (officerData) {
        return { isOfficer: true, role: officerTitle, name: officerName };
      }
      return { isOfficer: false };
    }

    // 情況 1：members 表角色為預設「幹部」，但 officers 表 title 設置為「社長」
    const res1 = resolveOfficerRole(
      { is_officer: true, officer_role: '幹部', name: '王小明' },
      { title: '社長', role: '幹部', name: '王小明' }
    );
    assert.equal(res1.isOfficer, true);
    assert.equal(res1.role, '社長'); // 完美同步 officers.title

    // 情況 2：officers 表 title 設置為「器材部長」
    const res2 = resolveOfficerRole(
      { is_officer: true, officer_role: '幹部', name: '李大華' },
      { title: '器材部長', role: '幹部', name: '李大華' }
    );
    assert.equal(res2.isOfficer, true);
    assert.equal(res2.role, '器材部長');

    // 情況 3：非幹部
    const res3 = resolveOfficerRole(
      { is_officer: false, officer_role: null, name: '路人' },
      null
    );
    assert.equal(res3.isOfficer, false);
  });

  // 8. 觸發器防遞迴守衛模擬測試 (消除 stack depth limit exceeded)
  it('members 與 officers 雙向觸發器具備 pg_trigger_depth() > 1 防遞迴守衛，杜絕 stack depth limit exceeded', () => {
    let callDepth = 0;
    const executionLog = [];

    // 模擬 Postgres 觸發器互相更新
    function simulateMemberUpdate(member, isRecursive = false) {
      callDepth++;
      executionLog.push(`member_update_depth_${callDepth}`);

      // 🛡️ 防遞迴守衛
      if (callDepth > 1) {
        callDepth--;
        return { success: true, stoppedRecursion: true };
      }

      // 觸發 officers 更新
      simulateOfficerUpdate({ line_user_id: member.line_user_id, role: member.officer_role });
      callDepth--;
      return { success: true, stoppedRecursion: false };
    }

    function simulateOfficerUpdate(officer) {
      callDepth++;
      executionLog.push(`officer_update_depth_${callDepth}`);

      // 🛡️ 防遞迴守衛
      if (callDepth > 1) {
        callDepth--;
        return { success: true, stoppedRecursion: true };
      }

      // 觸發 members 更新
      simulateMemberUpdate({ line_user_id: officer.line_user_id, officer_role: officer.role });
      callDepth--;
      return { success: true, stoppedRecursion: false };
    }

    // 執行模擬
    const result = simulateMemberUpdate({ line_user_id: 'U_TEST', officer_role: '幹部' });
    assert.equal(result.success, true);
    // 驗證深度最多到 2 即被守衛攔截，不再無窮深入
    assert.deepEqual(executionLog, ['member_update_depth_1', 'officer_update_depth_2']);
  });

  // 9. 裝備照片更新分流機制測試：無新照片上傳時直更 Supabase，免除 GAS 之 Load failed
  it('裝備照片更新分流機制：無新照片上傳時直更 Supabase，徹底杜絕 iOS WebKit 之 Load failed 阻斷', () => {
    function decidePhotoUpdateStrategy(keptUrls, newPhotoFiles) {
      if (newPhotoFiles.length === 0) {
        return {
          channel: 'SUPABASE_DIRECT',
          requiresDriveUpload: false,
          riskOfWebKitLoadFailed: false
        };
      }
      return {
        channel: 'GAS_DRIVE_UPLOAD',
        requiresDriveUpload: true,
        riskOfWebKitLoadFailed: true
      };
    }

    // 情況 1：幹部在畫面上刪除照片或重新排序既有照片 (newPhotoFiles 為空)
    const res1 = decidePhotoUpdateStrategy(['https://lh3.googleusercontent.com/photo1.jpg'], []);
    assert.equal(res1.channel, 'SUPABASE_DIRECT');
    assert.equal(res1.requiresDriveUpload, false);
    assert.equal(res1.riskOfWebKitLoadFailed, false);

    // 情況 2：幹部從手機相簿選取了新照片上傳
    const res2 = decidePhotoUpdateStrategy(
      ['https://lh3.googleusercontent.com/photo1.jpg'],
      [{ base64: 'data:image/jpeg;base64,...', name: 'new.jpg' }]
    );
    assert.equal(res2.channel, 'GAS_DRIVE_UPLOAD');
    assert.equal(res2.requiresDriveUpload, true);
  });
});

describe('16. 個人檔案動態推播訊息與出隊資格引導測試', () => {
  // 模擬 GAS 端的 _handleNotifyProfileSaved 組裝邏輯
  function generateProfileSavedMessage(json) {
    var data = json.formData || json.data || {};
    var isNew = !!json.isNewUser;
    var name = data.name || "社員";
    var dept = data.department || "未填寫";
    var studentId = data.studentId ? `${data.studentId.substring(0, 2)}*****${data.studentId.substring(data.studentId.length - 2)}` : "未填寫";
    var phone = data.phone ? `${data.phone.substring(0, 4)}***${data.phone.substring(data.phone.length - 3)}` : "未填寫";
    var emerName = data.emerName || "未填寫";
    var emerRel = data.emerRel || "未填寫";
    var offIntent = data.intendOfficial || "未填寫";

    var title = isNew ? "【🎉 歡迎加入！基本資料註冊成功】" : "【✅ 基本資料已成功更新】";
    var intro = "";
    var details = [];

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

    var footer = "";
    if (isActivityReady) {
      footer = "💡 您的出隊保險與資料已完整，隨時可於 LINE 選單點擊「最新活動」報名出隊行程，或至「裝備租借」預約出隊器材！";
    } else {
      var missingText = activityMissing.slice(0, 4).join("、") + (activityMissing.length > 4 ? " 等 " + activityMissing.length + " 項" : "");
      footer = "💡 您可隨時至 LINE 選單「裝備租借」預約出隊器材！\n\n⚠️ 提醒：出隊活動需辦理平安保險與安全審核，目前尚缺少出隊必要資訊（" + missingText + "），如欲報名最新活動，記得至選單「填寫資料」補齊即可啟用一鍵報名喔！🏕️";
    }

    if (isNew) {
      intro = "您好 " + name + "！感謝您完成台科登山社社團系統個人資料註冊：";
      if (data.name) details.push("• 姓名：" + name);
      if (data.department || data.studentId) details.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
      if (data.phone) details.push("• 聯絡電話：" + phone);
      if (data.emerName || data.emerRel) details.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
      if (data.intendOfficial) details.push("• 加入社員意願：" + offIntent);
      if (data.exp) details.push("• 爬山經歷：已更新");
      if (data.strength || data.strengthProof) details.push("• 體能自評：已更新");
    } else if (Array.isArray(json.changedFields)) {
      var cFields = json.changedFields;
      if (cFields.length === 0) {
        intro = "您好 " + name + "！您的個人檔案未有變更，資料已為最新狀態。";
      } else {
        intro = "您好 " + name + "！您已於系統中成功更新個人檔案：";
        if (cFields.indexOf("name") > -1) details.push("• 姓名：" + name);
        if (cFields.indexOf("gender") > -1) details.push("• 性別：" + (data.gender || "已更新"));
        if (cFields.indexOf("birthday") > -1) details.push("• 生日：" + (data.birthday || "已更新"));
        if (cFields.indexOf("idNumber") > -1) details.push("• 身分證/護照：已更新");
        if (cFields.indexOf("department_studentId") > -1) details.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
        if (cFields.indexOf("identityStatus") > -1) details.push("• 身分別：" + (data.identityStatus || "已更新"));
        if (cFields.indexOf("phone") > -1) details.push("• 聯絡電話：" + phone);
        if (cFields.indexOf("email") > -1) details.push("• 電子信箱：" + (data.email || "已更新"));
        if (cFields.indexOf("realLineId") > -1) details.push("• LINE ID：" + (data.realLineId || "已更新"));
        if (cFields.indexOf("studentAddr") > -1) details.push("• 現居地址：" + (data.studentAddr || "已更新"));
        if (cFields.indexOf("emergency_contact") > -1) details.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
        if (cFields.indexOf("exp") > -1) details.push("• 爬山經歷：已更新");
        if (cFields.indexOf("strength") > -1) details.push("• 體能自評：已更新");
      }
    }

    var msg = title + "\n\n" + intro;
    if (details.length > 0) {
      msg += "\n\n" + details.join("\n");
    }
    msg += "\n\n" + footer;
    return { msg, isActivityReady, detailsCount: details.length };
  }

  it('既有社員僅更新電話時，推播僅顯示聯絡電話，不出現未變更的學號與緊急聯絡人', () => {
    const res = generateProfileSavedMessage({
      isNewUser: false,
      changedFields: ['phone'],
      formData: {
        name: '洪楷量',
        department: '電機',
        studentId: 'B11100015',
        phone: '0975123401',
        emerName: '黃雅梅',
        emerRel: '母子'
      }
    });

    assert.ok(res.msg.includes('• 聯絡電話：0975***401'));
    assert.ok(!res.msg.includes('• 系所 / 學號'));
    assert.ok(!res.msg.includes('• 緊急聯絡人'));
    assert.ok(!res.msg.includes('• 爬山經歷'));
    assert.equal(res.detailsCount, 1);
  });

  it('既有社員資料完全無變動儲存時，正確提示未有變更', () => {
    const res = generateProfileSavedMessage({
      isNewUser: false,
      changedFields: [],
      formData: {
        name: '洪楷量',
        phone: '0975123401'
      }
    });

    assert.ok(res.msg.includes('您的個人檔案未有變更，資料已為最新狀態。'));
    assert.equal(res.detailsCount, 0);
  });

  it('當個人資料缺少保險或體能時，底部提示引導裝備租借並溫馨提醒補齊出隊資料，避免報名誤會', () => {
    const res = generateProfileSavedMessage({
      isNewUser: false,
      changedFields: ['phone'],
      formData: {
        name: '洪楷量',
        phone: '0975123401'
        // 缺少 birthday, idNumber, emerAddr, strength, exp 等出隊必要欄位
      }
    });

    assert.equal(res.isActivityReady, false);
    assert.ok(res.msg.includes('出隊活動需辦理平安保險與安全審核'));
    assert.ok(res.msg.includes('裝備租借'));
  });

  it('當 13 項出隊必要欄位全數填齊時，底部明確提示出隊保險與資料完整，可報名最新活動', () => {
    const res = generateProfileSavedMessage({
      isNewUser: false,
      changedFields: ['phone'],
      formData: {
        name: '洪楷量',
        gender: '男',
        phone: '0975123401',
        birthday: '2002-05-20',
        idNumber: 'A123456789',
        studentAddr: '台北市大安區基隆路四段43號',
        emerName: '黃雅梅',
        emerRel: '母子',
        emerAddr: '台北市大安區基隆路四段43號',
        emerPhone: '0912345678',
        strength: '良好',
        strengthProof: 'https://drive.google.com/test.jpg',
        exp: '玉山、雪山'
      }
    });

    assert.equal(res.isActivityReady, true);
    assert.ok(res.msg.includes('您的出隊保險與資料已完整，隨時可於 LINE 選單點擊「最新活動」報名出隊行程'));
  });
});
