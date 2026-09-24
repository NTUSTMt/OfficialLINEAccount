import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('82. 活動卡片已報名人數 (Registered Count Badge on Event Cards) 驗證', () => {
  const gasPath = path.resolve('src/gas.js');
  const gasContent = fs.readFileSync(gasPath, 'utf8');

  const flexPath = path.resolve('gas_modules/03_Flex_Templates.js');
  const flexContent = fs.readFileSync(flexPath, 'utf8');

  it('應驗證 sendEventList 具備批次查詢 event_signups 與排除取消狀態之計數邏輯', () => {
    assert.ok(
      gasContent.includes('event_id: "in.(" + eventIds.join(",") + ")"'),
      'sendEventList 必須使用 in.(...) 批次查詢 event_signups'
    );
    assert.ok(
      gasContent.includes('sStatus.indexOf("取消") === -1 && sStatus.indexOf("cancel") === -1'),
      'sendEventList 統計時必須嚴格排除取消狀態'
    );
    assert.ok(
      gasContent.includes('signupCounts[eid] = (signupCounts[eid] || 0) + 1;'),
      'sendEventList 必須以 event_id 累計報名人數'
    );
  });

  it('應驗證 sendEventList 與 sendEventDetail 頂部包含淺天藍膠囊徽章 (#f0f9ff / #0284c7)', () => {
    assert.ok(
      gasContent.includes('"backgroundColor": "#f0f9ff"'),
      '膠囊徽章背景色必須為 #f0f9ff'
    );
    assert.ok(
      gasContent.includes('"color": "#0284c7"'),
      '膠囊徽章文字顏色必須為 #0284c7'
    );
    assert.ok(
      gasContent.includes('"cornerRadius": "md"'),
      '膠囊徽章必須為圓角 md'
    );
    assert.ok(
      gasContent.includes('"justifyContent": "space-between"'),
      '狀態列佈局必須為 space-between 水平分開對齊'
    );
  });

  it('應驗證 sendEventDetail 具備獨立查詢活動有效報名人數與膠囊徽章', () => {
    assert.ok(
      gasContent.includes('event_id: "eq." + String(eventId).trim()'),
      'sendEventDetail 必須查詢指定活動之 event_signups'
    );
    assert.ok(
      gasContent.includes('dStatus.indexOf("取消") === -1 && dStatus.indexOf("cancel") === -1'),
      'sendEventDetail 統計時必須排除取消狀態'
    );
  });

  it('應驗證報名人數標籤支援中文、英文與雙語安全回退', () => {
    assert.ok(
      gasContent.includes('var regCountStrZh = "已報名：" + regCount + " 人";'),
      '必須支援繁體中文格式：已報名：X 人'
    );
    assert.ok(
      gasContent.includes('var regCountStrEn = "Registered: " + regCount;'),
      '必須支援英文格式：Registered: X'
    );
    assert.ok(
      gasContent.includes('(regCountStrZh + " / " + regCountStrEn)'),
      '無偏好語言時必須提供中英雙語安全回退'
    );
  });

  it('應驗證 gas_modules/03_Flex_Templates.js 同步更新 sendEventList 與 sendEventDetail', () => {
    assert.ok(
      flexContent.includes('event_id: "in.(" + eventIds.join(",") + ")"'),
      '03_Flex_Templates.js 必須具備批次查詢'
    );
    assert.ok(
      flexContent.includes('"backgroundColor": "#f0f9ff"'),
      '03_Flex_Templates.js 必須具備 #f0f9ff 膠囊徽章'
    );
    assert.ok(
      flexContent.includes('"color": "#0284c7"'),
      '03_Flex_Templates.js 必須具備 #0284c7 深藍文字'
    );
  });

  it('應模擬測試報名人數計算器，精準過濾取消狀態且 0 人亦正確回傳', () => {
    const mockSignups = [
      { event_id: 'EV-01', status: '正取 Confirmed' },
      { event_id: 'EV-01', status: '備取 Waitlisted' },
      { event_id: 'EV-01', status: '審核中 Checking' },
      { event_id: 'EV-01', status: '已取消 Cancelled' },
      { event_id: 'EV-01', status: '正取（已繳費）Confirmed (Paid)' },
      { event_id: 'EV-02', status: '已取消 Cancelled' },
    ];

    const counts = {};
    for (const su of mockSignups) {
      const sStatus = String(su.status || '').trim().toLowerCase();
      if (sStatus.indexOf('取消') === -1 && sStatus.indexOf('cancel') === -1) {
        counts[su.event_id] = (counts[su.event_id] || 0) + 1;
      }
    }

    assert.equal(counts['EV-01'], 4, 'EV-01 扣除 1 筆已取消後應為 4 人');
    assert.equal(counts['EV-02'] || 0, 0, 'EV-02 僅有已取消紀錄應為 0 人');
    assert.equal(counts['EV-03'] || 0, 0, 'EV-03 無任何紀錄應為 0 人');
  });
});
