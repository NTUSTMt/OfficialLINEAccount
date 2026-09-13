import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 模擬 01_Config_Auth.js 與 src/gas.js 中的表頭比對邏輯
function _fi(headers, keyword) {
  if (!headers || !headers.length) return -1;
  return headers.findIndex(function (h) {
    return String(h).includes(keyword);
  });
}

function _findColByEnglishName(headers, colName) {
  if (!headers || !headers.length || !colName) return -1;
  var pattern = new RegExp("(^|[^a-zA-Z0-9_])" + colName + "([^a-zA-Z0-9_]|$)", "i");
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || "").trim();
    if (pattern.test(h)) {
      return i;
    }
  }
  return -1;
}

function _findHeaderCol(headers, englishName, aliases) {
  var idx = _findColByEnglishName(headers, englishName);
  if (idx > -1) return idx;
  if (aliases) {
    if (!Array.isArray(aliases)) aliases = [aliases];
    for (var a = 0; a < aliases.length; a++) {
      var aIdx = _fi(headers, aliases[a]);
      if (aIdx > -1) return aIdx;
    }
  }
  return -1;
}

describe('中英混用表頭智慧匹配與防子字串碰撞測試 (_findColByEnglishName & _findHeaderCol)', () => {
  it('純英文表頭能正確匹配索引', () => {
    const headers = ['id', 'line_user_id', 'event_id', 'name', 'status', 'payment_status', 'created_at'];
    assert.equal(_findColByEnglishName(headers, 'id'), 0);
    assert.equal(_findColByEnglishName(headers, 'line_user_id'), 1);
    assert.equal(_findColByEnglishName(headers, 'event_id'), 2);
    assert.equal(_findColByEnglishName(headers, 'name'), 3);
    assert.equal(_findColByEnglishName(headers, 'status'), 4);
    assert.equal(_findColByEnglishName(headers, 'payment_status'), 5);
    assert.equal(_findColByEnglishName(headers, 'created_at'), 6);
  });

  it('英文在前、中文在後能精確匹配', () => {
    const headers = ['id (專屬碼)', 'status 審核狀態', 'payment_status 繳費狀態', 'notes 備註資訊'];
    assert.equal(_findColByEnglishName(headers, 'id'), 0);
    assert.equal(_findColByEnglishName(headers, 'status'), 1);
    assert.equal(_findColByEnglishName(headers, 'payment_status'), 2);
    assert.equal(_findColByEnglishName(headers, 'notes'), 3);
  });

  it('中文在前、英文在後能精確匹配', () => {
    const headers = ['報名專屬碼 [id]', '審核結果 (status)', '繳費進度 payment_status', '緊急聯絡人 emergency_contact_name'];
    assert.equal(_findColByEnglishName(headers, 'id'), 0);
    assert.equal(_findColByEnglishName(headers, 'status'), 1);
    assert.equal(_findColByEnglishName(headers, 'payment_status'), 2);
    assert.equal(_findColByEnglishName(headers, 'emergency_contact_name'), 3);
  });

  it('絕對杜絕 id 誤判 line_user_id 或 event_id', () => {
    const headers = ['line_user_id', 'event_id', 'id (報名碼)'];
    assert.equal(_findColByEnglishName(headers, 'id'), 2);
    assert.equal(_findColByEnglishName(headers, 'event_id'), 1);
    assert.equal(_findColByEnglishName(headers, 'line_user_id'), 0);
  });

  it('絕對杜絕 status 誤判 payment_status', () => {
    const headers = ['payment_status 繳費狀態', 'status 審核結果'];
    assert.equal(_findColByEnglishName(headers, 'status'), 1);
    assert.equal(_findColByEnglishName(headers, 'payment_status'), 0);
  });

  it('不分大小寫 (Case-Insensitive) 均能識別', () => {
    const headers = ['STATUS 審核狀態', 'Payment_Status', 'ID'];
    assert.equal(_findColByEnglishName(headers, 'status'), 0);
    assert.equal(_findColByEnglishName(headers, 'payment_status'), 1);
    assert.equal(_findColByEnglishName(headers, 'id'), 2);
  });

  it('純中文表頭能透過別名安全回退', () => {
    const headers = ['專屬碼', '審核結果', '繳費狀態', '系統識別碼'];
    assert.equal(_findHeaderCol(headers, 'id', ['專屬碼', '編號']), 0);
    assert.equal(_findHeaderCol(headers, 'status', ['審核結果', '狀態']), 1);
    assert.equal(_findHeaderCol(headers, 'payment_status', ['繳費狀態']), 2);
    assert.equal(_findHeaderCol(headers, 'line_user_id', ['系統識別碼']), 3);
  });
});
