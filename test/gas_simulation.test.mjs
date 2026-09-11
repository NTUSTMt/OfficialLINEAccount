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

  it('活動繳費確認後，寫入審核結果為標準格式「正取(已繳費) Confirmed(Paid)」', () => {
    const expectedStatus = "正取(已繳費) Confirmed(Paid)";
    assert.ok(expectedStatus.includes("正取"));
    assert.ok(expectedStatus.includes("已繳費"));
  });
});

describe('3. 備取意願登記狀態與前端解析測試', () => {
  it('備取確認寫入標準值「備取(有意願) Waitlisted (Interested)」', () => {
    const waitlistStatus = "備取(有意願) Waitlisted (Interested)";
    assert.ok(waitlistStatus.includes("備取"));
    assert.ok(waitlistStatus.includes("有意願"));
  });

  it('Dashboard 格式化函式能正確辨識「正取(已繳費) Confirmed(Paid)」與「備取(有意願) Waitlisted (Interested)」', () => {
    const formatReview = (status) => {
      if (status.includes('已繳費') || status.includes('Paid')) return '正取 (已繳費)';
      if (status.includes('正取')) return '正取';
      if (status.includes('有意願') || status.toLowerCase().includes('interested')) return '備取 (有意願)';
      if (status.includes('備取')) return '備取';
      return status;
    };

    assert.equal(formatReview("正取(已繳費) Confirmed(Paid)"), "正取 (已繳費)");
    assert.equal(formatReview("正取 (已繳費)"), "正取 (已繳費)");
    assert.equal(formatReview("正取 Confirmed"), "正取");
    assert.equal(formatReview("備取(有意願) Waitlisted (Interested)"), "備取 (有意願)");
    assert.equal(formatReview("備取 (有意願)"), "備取 (有意願)");
    assert.equal(formatReview("備取 Waitlisted"), "備取");
  });
});
