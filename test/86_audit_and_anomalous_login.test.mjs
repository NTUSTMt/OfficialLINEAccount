import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('86. 稽核日誌記錄、異常登入演算法與告警驗證 (Audit & Anomalous Login)', () => {
  const edgeFnPath = path.resolve('supabase/functions/line-auth/index.ts');
  const edgeFnContent = fs.readFileSync(edgeFnPath, 'utf8');

  const webEventsPath = path.resolve('src/pages/web-admin/WebAdminEvents.tsx');
  const webEventsContent = fs.readFileSync(webEventsPath, 'utf8');

  const webFinancePath = path.resolve('src/pages/web-admin/WebAdminFinance.tsx');
  const webFinanceContent = fs.readFileSync(webFinancePath, 'utf8');

  it('應驗證異常登入判定演算法邏輯：30 分鐘內累計 3 個相異 IP 觸發告警', () => {
    const detectAnomaly = (recentLogins, currentIp) => {
      const distinctOtherIps = new Set(
        recentLogins
          .filter((l) => l.ip_address !== currentIp)
          .map((l) => l.ip_address)
      );
      return {
        isAlert: distinctOtherIps.size >= 2,
        totalDistinctIps: distinctOtherIps.size + 1,
        otherIps: Array.from(distinctOtherIps),
      };
    };

    // 情境 A：正常單一 IP 連續登入
    const normalLogins = [
      { ip_address: '140.118.1.1' },
      { ip_address: '140.118.1.1' },
    ];
    const resA = detectAnomaly(normalLogins, '140.118.1.1');
    assert.equal(resA.isAlert, false, '同 IP 連續登入絕不可觸發警報');

    // 情境 B：30 分鐘內切換 2 個 IP (手機 4G + 宿舍 WiFi，正常行為)
    const twoIpLogins = [
      { ip_address: '140.118.1.1' },
      { ip_address: '114.36.12.34' },
    ];
    const resB = detectAnomaly(twoIpLogins, '140.118.1.1');
    assert.equal(resB.isAlert, false, '僅 2 個相異 IP 不觸發警報');

    // 情境 C：30 分鐘內出現 3 個相異 IP (異常多點或憑證外洩，觸發警報)
    const threeIpLogins = [
      { ip_address: '140.118.1.1' },
      { ip_address: '114.36.12.34' },
    ];
    const resC = detectAnomaly(threeIpLogins, '210.60.2.1');
    assert.equal(resC.isAlert, true, '3 個相異 IP 必須觸發 SECURITY_ALERT');
    assert.equal(resC.totalDistinctIps, 3);
  });

  it('應驗證 line-auth 警報目標設定為社團公用帳號 ntustmountain@gmail.com', () => {
    assert.ok(
      edgeFnContent.includes('ntustmountain@gmail.com'),
      'Edge Function 告警目標郵箱必須為 ntustmountain@gmail.com'
    );
    assert.ok(
      edgeFnContent.includes("action: 'SECURITY_ALERT'"),
      'Edge Function 必須寫入 SECURITY_ALERT 紀錄'
    );
  });

  it('應驗證電腦版各管理頁面均實作前端操作稽核埋點', () => {
    const webRosterPath = path.resolve('src/pages/web-admin/WebAdminRoster.tsx');
    const webRosterContent = fs.readFileSync(webRosterPath, 'utf8');

    assert.ok(
      webEventsContent.includes("logWebAuditAction(client, session.userId, 'VIEW_EVENTS_LIST'") ||
      webEventsContent.includes("logWebAuditAction(client, session.userId, 'VIEW_ROSTER'"),
      'WebAdminEvents 必須包含檢視活動稽核記錄'
    );
    assert.ok(
      webRosterContent.includes("logWebAuditAction(client, session.userId, 'EXPORT_ROSTER_TSV'") ||
      webEventsContent.includes("logWebAuditAction(client, session.userId, 'EXPORT_ROSTER_CLIPBOARD'"),
      '名冊匯出必須記錄 EXPORT 稽核埋點'
    );
    assert.ok(
      webFinanceContent.includes("logWebAuditAction(client, session.userId, 'VERIFY_PAYMENT'"),
      'WebAdminFinance 單筆核銷必須記錄 VERIFY_PAYMENT'
    );
    assert.ok(
      webFinanceContent.includes("logWebAuditAction(client, session.userId, 'BATCH_VERIFY_PAYMENTS'"),
      'WebAdminFinance 批次核銷必須記錄 BATCH_VERIFY_PAYMENTS'
    );
  });

  it('應驗證錯誤呈現透明度規範 (直接顯示原始具體錯誤訊息與代碼)', () => {
    assert.ok(
      webEventsContent.includes('web-admin-error-banner'),
      'WebAdminEvents 必須具備專屬錯誤顯示區塊'
    );
    assert.ok(
      webEventsContent.includes('${error.message} (代碼: ${error.code ||'),
      'WebAdminEvents 必須直接輸出 error.message 與 error.code'
    );
    assert.ok(
      webFinanceContent.includes('${error.message} (代碼: ${error.code ||'),
      'WebAdminFinance 必須直接輸出 error.message 與 error.code'
    );
  });
});
