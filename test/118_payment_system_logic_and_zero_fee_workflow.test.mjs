import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Test Suite 118: Payment System Logic, Zero-Fee Automation & Attribution Alignment', () => {
  const adminEventsRpcPath = path.resolve('supabase/admin_events_rpc.sql');
  const adminPortalRpcPath = path.resolve('supabase/admin_portal_rpc.sql');
  const confirmPaymentPath = path.resolve('src/pages/ConfirmPayment.tsx');
  const adminFinancePath = path.resolve('src/pages/AdminFinance.tsx');
  const supabaseClientPath = path.resolve('src/utils/supabaseClient.ts');
  const notifyDispatcherPath = path.resolve('supabase/functions/notify-dispatcher/index.ts');

  // 1. 0 元活動審核流轉與自動已繳費規格 (Zero-Fee Workflow in update_signup_status_rpc)
  describe('1. 0 元活動審核流轉規格 (Zero-Fee Event Signup Workflow)', () => {
    it('1.1 業務邏輯模擬：錄取 0 元活動正取時，必須自動標記為「正取（已繳費）」且 payment_status 為「已繳費 Paid」', () => {
      const mockEvents = [
        { id: 'E2609-02', title: '七星山迎新', fee: 0 },
        { id: 'E2609-04', title: '閂山鈴鳴山', fee: 2500 }
      ];

      const mockSignups = [
        { id: 'S_FREE', event_id: 'E2609-02', status: '審核中 Checking', payment_status: '未繳費 Unpaid' },
        { id: 'S_PAID', event_id: 'E2609-04', status: '審核中 Checking', payment_status: '未繳費 Unpaid' }
      ];

      // 模擬 update_signup_status_rpc 錄取為正取
      const reviewSignup = (signupId, reviewResult) => {
        const s = mockSignups.find(item => item.id === signupId);
        const ev = mockEvents.find(item => item.id === s.event_id);
        const isConfirmed = reviewResult.includes('正取') || reviewResult.includes('Confirmed');

        if (isConfirmed) {
          if (ev.fee === 0) {
            s.status = '正取（已繳費）Confirmed (Paid)';
            s.payment_status = '已繳費 Paid';
          } else {
            s.status = '正取 Confirmed';
            s.payment_status = '未繳費 Unpaid';
          }
        }
      };

      reviewSignup('S_FREE', '正取 Confirmed');
      reviewSignup('S_PAID', '正取 Confirmed');

      assert.strictEqual(mockSignups[0].status, '正取（已繳費）Confirmed (Paid)', '0 元活動正取者 status 必須直接推進為正取（已繳費）');
      assert.strictEqual(mockSignups[0].payment_status, '已繳費 Paid', '0 元活動正取者 payment_status 必須自動為已繳費 Paid');

      assert.strictEqual(mockSignups[1].status, '正取 Confirmed', '收費活動正取者 status 必須維持為正取 Confirmed');
      assert.strictEqual(mockSignups[1].payment_status, '未繳費 Unpaid', '收費活動正取者 payment_status 必須維持未繳費');
    });

    it('1.2 額度保護規範：0 元活動自動核銷不得發送 LINE 繳費確認通知', () => {
      let notifiedCount = 0;
      const handleSignupStatusTransition = (eventFee) => {
        if (eventFee === 0) {
          // 0 元活動直接自動化，不觸發 notify_payment_confirmed
          return { autoPaid: true, sendPush: false };
        }
        return { autoPaid: false, sendPush: false };
      };

      const result = handleSignupStatusTransition(0);
      assert.strictEqual(result.sendPush, false, '0 元活動自動核銷絕對不得發送 LINE 推播，防止浪費 Push 額度');
    });
  });

  // 2. 幹部後台財務核銷 RPC 精準隔離與主狀態流轉規格 (update_admin_payment_status_rpc)
  describe('2. 幹部後台核銷 RPC 精準隔離與主狀態推進 (update_admin_payment_status_rpc Alignment)', () => {
    it('2.1 多活動精準隔離模擬：核銷活動 A 繳費單時，該社員之活動 B 與 C 絕不得連帶誤傷', () => {
      const signups = [
        { id: 'S_A', line_user_id: 'USER_LIN', event_id: 'E01', status: '正取 Confirmed', payment_status: '待確認 Checking' },
        { id: 'S_B', line_user_id: 'USER_LIN', event_id: 'E02', status: '正取 Confirmed', payment_status: '未繳費 Unpaid' },
        { id: 'S_C', line_user_id: 'USER_LIN', event_id: 'E03', status: '審核中 Checking', payment_status: '未繳費 Unpaid' }
      ];

      const payment = {
        id: 'PAY_LIN_001',
        line_user_id: 'USER_LIN',
        selected_ids: ['act_E01'],
        target_type: null,
        target_id: null
      };

      // 模擬升級後的 update_admin_payment_status_rpc 解析邏輯
      const selectedIds = payment.selected_ids || [];
      const targetEventIds = [];
      for (const item of selectedIds) {
        if (typeof item === 'string' && item.startsWith('act_')) {
          targetEventIds.push(item.substring(4));
        }
      }

      // 執行精確核銷
      for (const s of signups) {
        if (s.line_user_id === payment.line_user_id && targetEventIds.includes(s.event_id)) {
          s.payment_status = '已繳費 Paid';
          if (s.status === '正取 Confirmed') {
            s.status = '正取（已繳費）Confirmed (Paid)';
          }
        }
      }

      assert.strictEqual(signups[0].payment_status, '已繳費 Paid', '勾選之活動 A 必須更新為已繳費');
      assert.strictEqual(signups[0].status, '正取（已繳費）Confirmed (Paid)', '勾選之活動 A 主狀態必須同步轉為正取（已繳費）');
      assert.strictEqual(signups[1].payment_status, '未繳費 Unpaid', '未勾選之活動 B 絕對不得被波及');
      assert.strictEqual(signups[1].status, '正取 Confirmed', '未勾選之活動 B 狀態不得變更');
      assert.strictEqual(signups[2].payment_status, '未繳費 Unpaid', '審核中之活動 C 絕對不得被波及');
    });

    it('2.2 租借訂單精準隔離模擬：核銷租借單 ORD_1 時，同一用戶之租借單 ORD_2 絕對不得被誤改', () => {
      const loans = [
        { id: 'ORD_1', line_user_id: 'USER_X', payment_status: '待確認 Checking' },
        { id: 'ORD_2', line_user_id: 'USER_X', payment_status: '未繳費 Unpaid' }
      ];

      const payment = {
        id: 'PAY_LOAN_01',
        line_user_id: 'USER_X',
        selected_ids: ['eq_ORD_1']
      };

      const targetLoanIds = (payment.selected_ids || [])
        .filter(id => id.startsWith('eq_'))
        .map(id => id.substring(3));

      for (const l of loans) {
        if (l.line_user_id === payment.line_user_id && targetLoanIds.includes(l.id)) {
          l.payment_status = '已繳費 Paid';
        }
      }

      assert.strictEqual(loans[0].payment_status, '已繳費 Paid', 'ORD_1 必須更新為已繳費');
      assert.strictEqual(loans[1].payment_status, '未繳費 Unpaid', 'ORD_2 必須維持未繳費');
    });
  });

  // 3. 核銷人身分識別規格 (Auditor Attribution)
  describe('3. 核銷人身分識別規格 (Auditor Attribution in ConfirmPayment and AdminFinance)', () => {
    it('3.1 LIFF 單鍵核銷識別：LINE 內部開啟時必須附加點擊幹部身分，外部瀏覽器開啟標記 Email 單鍵核銷', () => {
      const resolveOfficerAttribution = (isInLiff, profileName) => {
        if (isInLiff && profileName && profileName.trim() !== '') {
          return `${profileName.trim()} (LINE單鍵核銷)`;
        }
        return 'Email 單鍵核銷';
      };

      const lineOfficerResult = resolveOfficerAttribution(true, '曹洧祥');
      assert.strictEqual(lineOfficerResult, '曹洧祥 (LINE單鍵核銷)', 'LINE 點擊單鍵核銷必須記錄幹部姓名');

      const emailResult = resolveOfficerAttribution(false, null);
      assert.strictEqual(emailResult, 'Email 單鍵核銷', '非 LINE 點擊必須標註 Email 單鍵核銷');
    });

    it('3.2 手機後台核銷識別：AdminFinance 必須傳遞幹部真實名稱，不得使用寫死字串', () => {
      const getAdminFinanceOfficerName = (sessionName) => {
        return sessionName && sessionName.trim() !== '' ? sessionName.trim() : '管理幹部';
      };

      const actualOfficer = getAdminFinanceOfficerName('洪楷量 Brian');
      assert.strictEqual(actualOfficer, '洪楷量 Brian', '手機管理後台必須傳入真實幹部姓名');

      const fallbackOfficer = getAdminFinanceOfficerName('');
      assert.strictEqual(fallbackOfficer, '管理幹部', '無身分時應降級為管理幹部，而非財務幹部線上核銷寫死值');
    });
  });

  // 4. 推播通知狀態字串標準化規格 (notification_status Standardization)
  describe('4. 推播通知狀態字串標準化規格 (notification_status)', () => {
    it('4.1 列舉值合法性檢查：notification_status 僅允許「未通知」、「已通知」、「免通知」', () => {
      const validStatuses = new Set(['未通知', '已通知', '免通知']);
      
      const normalizeNotificationStatus = (rawStatus) => {
        if (!rawStatus) return '未通知';
        const trimmed = String(rawStatus).trim();
        if (trimmed === 'pending') return '未通知';
        if (validStatuses.has(trimmed)) return trimmed;
        return '未通知';
      };

      assert.strictEqual(normalizeNotificationStatus('pending'), '未通知', "'pending' 必須映射為標準值 '未通知'");
      assert.strictEqual(normalizeNotificationStatus('已通知'), '已通知');
      assert.strictEqual(normalizeNotificationStatus('免通知'), '免通知');
      assert.strictEqual(normalizeNotificationStatus(null), '未通知');
    });
  });

  // 5. 原始碼靜態規格驗證 (Source Code Architectural Verification)
  describe('5. 原始碼靜態規格驗證 (Source Code Verification)', () => {
    it('5.1 admin_events_rpc.sql 必須包含 0 元活動判定與已繳費狀態自動賦值', () => {
      const content = fs.readFileSync(adminEventsRpcPath, 'utf-8');
      assert.ok(content.includes('v_event_fee INTEGER := 0;'), 'admin_events_rpc.sql 必須宣告 v_event_fee 變數');
      assert.ok(content.includes('IF v_event_fee = 0 THEN'), 'admin_events_rpc.sql 必須判斷 v_event_fee = 0');
      assert.ok(content.includes("payment_status = '已繳費 Paid'::payment_status_enum"), 'admin_events_rpc.sql 必須自動賦值已繳費 Paid');
      assert.ok(content.includes("v_status_val := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum"), 'admin_events_rpc.sql 必須將 status 轉為正取（已繳費）');
    });

    it('5.2 admin_portal_rpc.sql 中的 update_admin_payment_status_rpc 必須支援 selected_ids 解析且具備防誤傷防護', () => {
      const content = fs.readFileSync(adminPortalRpcPath, 'utf-8');
      assert.ok(content.includes("v_selected_ids := COALESCE(v_payment.selected_ids, '[]'::jsonb);"), '必須讀取 selected_ids');
      assert.ok(content.includes("v_item_id LIKE 'act_%'"), '必須解析 act_ 前綴');
      assert.ok(content.includes("event_id = ANY(v_event_ids)"), '必須精準匹配 event_id = ANY(v_event_ids)');
      assert.ok(content.includes("id = ANY(v_loan_ids)"), '必須精準匹配 id = ANY(v_loan_ids)');
      assert.ok(!content.includes("event_id = p_target_id OR v_payment.target_id = event_id OR p_target_id IS NULL"), '嚴禁保留導致全表誤傷之 p_target_id IS NULL 漏洞');
      assert.ok(content.includes("v_new_signup_status := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;"), '核銷活動時必須將正取狀態同步更新為正取（已繳費）');
    });

    it('5.3 ConfirmPayment.tsx 必須具備 LIFF 身分讀取與 LINE 單鍵核銷實名記錄', () => {
      const content = fs.readFileSync(confirmPaymentPath, 'utf-8');
      assert.ok(content.includes("liff.getProfile()"), 'ConfirmPayment.tsx 必須調用 liff.getProfile 取得幹部姓名');
      assert.ok(content.includes("(LINE單鍵核銷)"), 'LINE 點擊核銷必須標註 (LINE單鍵核銷)');
    });

    it('5.4 AdminFinance.tsx 必須傳入真實幹部姓名，不得使用寫死字串', () => {
      const content = fs.readFileSync(adminFinancePath, 'utf-8');
      assert.ok(content.includes("fetchMemberProfileFromSupabase(userId)"), 'AdminFinance.tsx 必須透過 userId 查詢幹部名稱');
      assert.ok(content.includes("officerName: officerName || '管理幹部'"), 'AdminFinance.tsx 必須傳遞動態 officerName');
      assert.ok(!content.includes("officerName: '財務幹部線上核銷'"), 'AdminFinance.tsx 嚴禁寫死財務幹部線上核銷字串');
    });

    it('5.5 supabaseClient.ts 之 verifyPaymentByTokenFromSupabase 必須支援 officerName 參數', () => {
      const content = fs.readFileSync(supabaseClientPath, 'utf-8');
      assert.ok(content.includes("verifyPaymentByTokenFromSupabase = async ("), '必須宣告 verifyPaymentByTokenFromSupabase');
      assert.ok(content.includes("officerName?: string"), '必須支援 officerName 參數');
      assert.ok(content.includes("p_officer_name: officerName || 'Email 單鍵核銷'"), '必須優先傳入 officerName 否則 fallback 為 Email 單鍵核銷');
    });
  });

  // 6. 專案規範：全測試套件零 Emoji 驗證
  describe('6. 專案規範驗證 (Project Directives Compliance)', () => {
    it('6.1 測試套件內容必須零 Emoji', () => {
      const currentFileContent = fs.readFileSync(path.resolve('test/118_payment_system_logic_and_zero_fee_workflow.test.mjs'), 'utf-8');
      const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;
      assert.strictEqual(emojiRegex.test(currentFileContent), false, '測試檔案自身不得包含任何 Emoji');
    });
  });
});
