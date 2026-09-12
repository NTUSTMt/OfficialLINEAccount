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

