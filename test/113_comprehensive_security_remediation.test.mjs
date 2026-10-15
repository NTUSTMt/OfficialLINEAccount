import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('113. 核心安全漏洞修復與防禦驗證套件 (Security Remediation Suite)', () => {

  // C-1: sync_officer_cache_rpc 匿名全域幹部身分提權漏洞
  it('C-1: sync_officer_cache_rpc 嚴禁授權給 anon，且函式內部必須具備幹部或 service_role 守衛', () => {
    const adminEventsSql = fs.readFileSync(path.join(rootDir, 'supabase/admin_events_rpc.sql'), 'utf8');
    const remediationSqlPath = path.join(rootDir, 'supabase/migrations/20261011_phase2_security_remediation.sql');
    const remediationSql = fs.existsSync(remediationSqlPath) ? fs.readFileSync(remediationSqlPath, 'utf8') : '';
    const combinedSql = adminEventsSql + '\n' + remediationSql;

    // 負面檢查：不得有 GRANT 給 anon 之生效權限
    assert.strictEqual(
      remediationSql.includes('REVOKE EXECUTE ON FUNCTION sync_officer_cache_rpc') &&
      remediationSql.includes('FROM anon, public'),
      true,
      '漏洞重現：sync_officer_cache_rpc 仍授權給 anon/public，未被 REVOKE'
    );

    // 正面檢查：函式必須檢查 auth.role() = service_role 或 is_officer
    assert.ok(
      combinedSql.includes('is_officer(auth.jwt() ->> \'sub\')') || combinedSql.includes('auth.role() != \'service_role\''),
      '漏洞重現：sync_officer_cache_rpc 內部未驗證呼叫者是否為幹部或 service_role'
    );
  });

  // C-2: get_member_profile / get_my_dashboard 匿名 BOLA/IDOR 橫向越權存取
  it('C-2: get_member_profile 與 get_my_dashboard 必須強制要求 JWT 宣告，禁止匿名回退讀取他人個資', () => {
    const remediationSqlPath = path.join(rootDir, 'supabase/migrations/20261011_phase2_security_remediation.sql');
    assert.ok(fs.existsSync(remediationSqlPath), '缺少 20261011_phase2_security_remediation.sql 遷移腳本');
    const remediationSql = fs.readFileSync(remediationSqlPath, 'utf8');

    // 負面檢查：未帶 JWT 時禁止使用傳入的 p_line_user_id 查表
    assert.ok(
      remediationSql.includes('v_jwt_sub IS NULL OR trim(v_jwt_sub) = \'\'') &&
      remediationSql.includes('Unauthorized'),
      '漏洞重現：get_member_profile 於缺少 JWT 時仍未回傳 Unauthorized 阻斷'
    );

    assert.ok(
      remediationSql.includes('get_my_dashboard') &&
      remediationSql.includes('v_jwt_sub IS NULL'),
      '漏洞重現：get_my_dashboard 於缺少 JWT 時未嚴格阻斷'
    );
  });

  // C-3: submit_payment_rpc 0 元竄改自動核銷業務邏輯漏洞
  it('C-3: submit_payment_rpc 嚴禁信任客戶端傳入之 totalAmount 進行自動核銷，必須由伺服器重算金額', () => {
    const remediationSqlPath = path.join(rootDir, 'supabase/migrations/20261011_phase2_security_remediation.sql');
    assert.ok(fs.existsSync(remediationSqlPath), '缺少 20261011_phase2_security_remediation.sql 遷移腳本');
    const remediationSql = fs.readFileSync(remediationSqlPath, 'utf8');

    // 負面檢查：不得單憑客戶端傳入之 totalAmount = 0 標記已核銷
    assert.ok(
      remediationSql.includes('v_calculated_amount') || remediationSql.includes('events.fee'),
      '漏洞重現：submit_payment_rpc 未在後端重新計算活動與社費金額'
    );

    // 正面檢查：比對呼叫者身分
    assert.ok(
      remediationSql.includes('v_jwt_sub != trim(p_line_user_id)'),
      '漏洞重現：submit_payment_rpc 缺少呼叫者 JWT sub 防偽身分比對'
    );
  });

  // C-4: Google Apps Script Webhook 簽章與 Helper API 鑑權防護
  it('C-4: gas.js doPost 必須校驗 X-Line-Signature 且 handleLiffHelperApi 敏感操作需有身分安全守衛', () => {
    const gasPath = fs.existsSync(path.join(rootDir, 'src/gas.js'))
      ? path.join(rootDir, 'src/gas.js')
      : path.join(rootDir, 'src/archive/gas.js');
    const gasCode = fs.readFileSync(gasPath, 'utf8');

    // 負面檢查：doPost 必須包含簽章校驗邏輯
    assert.ok(
      gasCode.includes('x-line-signature') || gasCode.includes('validateSignature') || gasCode.includes('verifyLineSignature'),
      '漏洞重現：gas.js doPost 缺少 X-Line-Signature 簽章校驗機制'
    );

    // 檢查敏感操作 _handleDriveDeleteHelper 需有安全驗證或防護
    assert.ok(
      gasCode.includes('SECURITY_GUARD') || gasCode.includes('checkOfficerInternal') || gasCode.includes('authSecret'),
      '漏洞重現：gas.js 雲端硬碟刪除 Helper 缺乏幹部權限檢驗'
    );
  });

  // H-1: SECURITY DEFINER 缺少 SET search_path = public
  it('H-1: 所有特權 RPC 函式 (submit_equipment_loan_rpc, cancel_*, member_officer_sync) 必須包含 SET search_path = public', () => {
    const remediationSqlPath = path.join(rootDir, 'supabase/migrations/20261011_phase2_security_remediation.sql');
    assert.ok(fs.existsSync(remediationSqlPath), '缺少 20261011_phase2_security_remediation.sql 遷移腳本');
    const remediationSql = fs.readFileSync(remediationSqlPath, 'utf8');

    assert.ok(
      remediationSql.includes('FUNCTION submit_equipment_loan_rpc') &&
      remediationSql.includes('SET search_path = public'),
      '漏洞重現：submit_equipment_loan_rpc 缺少 SET search_path = public'
    );

    assert.ok(
      remediationSql.includes('FUNCTION cancel_equipment_loan_rpc') &&
      remediationSql.includes('SET search_path = public'),
      '漏洞重現：cancel_equipment_loan_rpc 缺少 SET search_path = public'
    );

    assert.ok(
      remediationSql.includes('FUNCTION cancel_event_signup_rpc') &&
      remediationSql.includes('SET search_path = public'),
      '漏洞重現：cancel_event_signup_rpc 缺少 SET search_path = public'
    );
  });

  // H-2: cancel_equipment_loan_rpc 與 cancel_event_signup_rpc 匿名 IDOR 越權取消防禦
  it('H-2: cancel_equipment_loan_rpc 與 cancel_event_signup_rpc 必須驗證 JWT sub，防止跨帳號取消', () => {
    const remediationSqlPath = path.join(rootDir, 'supabase/migrations/20261011_phase2_security_remediation.sql');
    assert.ok(fs.existsSync(remediationSqlPath), '缺少 20261011_phase2_security_remediation.sql 遷移腳本');
    const remediationSql = fs.readFileSync(remediationSqlPath, 'utf8');

    assert.ok(
      remediationSql.includes('v_jwt_sub != trim(p_line_user_id)') &&
      remediationSql.includes('Forbidden: 禁止越權取消'),
      '漏洞重現：取消 RPC 未阻絕非本人或非幹部之橫向越權呼叫'
    );
  });

  // H-4: line-webhook 密鑰缺失時 Fail-Closed
  it('H-4: line-webhook Edge Function 當缺少密鑰環境變數時必須回傳 500 拒絕處理 (Fail-Closed)', () => {
    const webhookCode = fs.readFileSync(path.join(rootDir, 'supabase/functions/line-webhook/index.ts'), 'utf8');

    assert.strictEqual(
      webhookCode.includes('暫時略過簽章校驗'),
      false,
      '漏洞重現：line-webhook 在缺少密鑰時仍採用 Fail-Open 略過簽章校驗'
    );

    assert.ok(
      webhookCode.includes('availableSecrets.length === 0') &&
      webhookCode.includes('status: 500'),
      'line-webhook 必須在缺少密鑰時立即回傳 500 Fail-Closed'
    );
  });

  // M-1: validateSignature 恆常時間比對
  it('M-1: lineClient.ts validateSignature 必須採用恆常時間 (timingSafeEqual) 比對以防範側信道攻擊', () => {
    const lineClientCode = fs.readFileSync(path.join(rootDir, 'supabase/functions/_shared/lineClient.ts'), 'utf8');

    assert.strictEqual(
      lineClientCode.includes('computedSignature !== cleanSig'),
      false,
      '漏洞重現：validateSignature 仍採用非恆常時間 !== 比對運算子'
    );

    assert.ok(
      lineClientCode.includes('timingSafeEqual'),
      'validateSignature 必須採用 timingSafeEqual 演算法'
    );
  });

  // M-2: CORS 來源動態反射收緊
  it('M-2: line-auth 與 notify-dispatcher 不得動態反射任意 Origin，未設定時必須採預設安全網域或阻斷', () => {
    const lineAuthCode = fs.readFileSync(path.join(rootDir, 'supabase/functions/line-auth/index.ts'), 'utf8');
    const notifyCode = fs.readFileSync(path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts'), 'utf8');

    assert.strictEqual(
      lineAuthCode.includes('allowOrigin = origin;'),
      false,
      '漏洞重現：line-auth 在缺少 ALLOWED_ORIGINS 時動態反射任意 origin'
    );

    assert.strictEqual(
      notifyCode.includes('allowOrigin = origin;'),
      false,
      '漏洞重現：notify-dispatcher 在缺少 ALLOWED_ORIGINS 時動態反射任意 origin'
    );
  });

  // M-3: notify-dispatcher 實作頻率限制 (Rate Limiting)
  it('M-3: notify-dispatcher 必須實作請求速率限制 (Rate Limiting) 避免 LINE 訊息額度被濫用', () => {
    const notifyCode = fs.readFileSync(path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts'), 'utf8');

    assert.ok(
      notifyCode.includes('checkRateLimit') && notifyCode.includes('429'),
      '漏洞重現：notify-dispatcher 缺少速率限制與 429 狀態碼防護'
    );
  });

  // L-4: admin_events_rpc 歷史管理 RPC 撤銷 anon 權限
  it('L-4: save_admin_event_rpc, get_admin_event_signups_rpc, update_event_status_rpc 必須撤銷 anon 權限', () => {
    const remediationSqlPath = path.join(rootDir, 'supabase/migrations/20261011_phase2_security_remediation.sql');
    assert.ok(fs.existsSync(remediationSqlPath), '缺少 20261011_phase2_security_remediation.sql 遷移腳本');
    const remediationSql = fs.readFileSync(remediationSqlPath, 'utf8');

    assert.ok(
      remediationSql.includes('REVOKE EXECUTE ON FUNCTION save_admin_event_rpc') &&
      remediationSql.includes('FROM anon, public'),
      '漏洞重現：save_admin_event_rpc 仍未從 anon 角色撤銷'
    );

    assert.ok(
      remediationSql.includes('REVOKE EXECUTE ON FUNCTION get_admin_event_signups_rpc') &&
      remediationSql.includes('FROM anon, public'),
      '漏洞重現：get_admin_event_signups_rpc 仍未從 anon 角色撤銷'
    );
  });

  // C-2 (Frontend): LIFF 啟動時向 line-auth 交換 Custom JWT 並注入 Supabase Client
  it('C-2 (Frontend): App.tsx 與 supabaseClient.ts 必須支援 LIFF Custom JWT 注入與 Bearer Header 自動附加', () => {
    const appCode = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
    const supabaseClientCode = fs.readFileSync(path.join(rootDir, 'src/utils/supabaseClient.ts'), 'utf8');

    assert.ok(
      appCode.includes('setSupabaseAuthToken') && appCode.includes('/functions/v1/line-auth'),
      'App.tsx 缺少 line-auth Custom JWT 交換或 setSupabaseAuthToken 注入機制'
    );

    assert.ok(
      supabaseClientCode.includes('setSupabaseAuthToken') &&
      supabaseClientCode.includes('getSupabaseAuthToken') &&
      supabaseClientCode.includes('Authorization') &&
      supabaseClientCode.includes('Bearer'),
      'supabaseClient.ts 缺少動態 JWT Header 注入機制'
    );
  });
});
