import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('127. 活動試算表 30 欄位純精確比對、防撞名與括號正規化驗證 (v0.1.314)', () => {
  const workerPath = path.join(rootDir, 'src', 'gas_worker.js');
  const sheetScriptPath = path.join(rootDir, 'supabase', 'event_sheet_script.js');
  const workerContent = fs.readFileSync(workerPath, 'utf8');
  const sheetScriptContent = fs.readFileSync(sheetScriptPath, 'utf8');

  it('1. gas_worker.js 與 event_sheet_script.js 必須具備 _normalizeHeader 與純精確 _matchHeader', () => {
    assert.ok(workerContent.includes('function _normalizeHeader'), 'gas_worker.js 必須包含 _normalizeHeader');
    assert.ok(workerContent.includes('function _matchHeader'), 'gas_worker.js 必須包含 _matchHeader');
    assert.ok(sheetScriptContent.includes('function _normalizeHeader'), 'event_sheet_script.js 必須包含 _normalizeHeader');
    assert.ok(sheetScriptContent.includes('function _matchHeader'), 'event_sheet_script.js 必須包含 _matchHeader');

    // 驗證已徹底廢除包含比對 indexOf(c) > -1
    assert.ok(
      !workerContent.includes('!exactOnly && h.indexOf(c) > -1'),
      'gas_worker.js 不得再保留不安全的模糊 indexOf 比對'
    );
  });

  it('2. _normalizeHeader 必須正確清除全半形括號內容並標準化空白', () => {
    function _normalizeHeader(header) {
      if (header === null || header === undefined) return { raw: '', stripped: '' };
      var raw = String(header).trim().toLowerCase().replace(/\s+/g, ' ');
      var stripped = raw.replace(/\s*[\(\[（【〔][^\)\]）】〕]*[\)\]）】〕]\s*/g, '').trim().replace(/\s+/g, ' ');
      return { raw: raw, stripped: stripped };
    }

    assert.equal(_normalizeHeader('緊急聯絡人姓名 (必填)').stripped, '緊急聯絡人姓名');
    assert.equal(_normalizeHeader('LINE ID（選填）').stripped, 'line id');
    assert.equal(_normalizeHeader('身分證字號 [居留證/護照]').stripped, '身分證字號');
    assert.equal(_normalizeHeader('  姓名   Name  ').raw, '姓名 name');
  });

  it('3. 使用者目前 30 欄位完整模擬：各欄位必須 100% 精準填入對應資料，絕無撞名污染', () => {
    const userHeaders = [
      '系統識別碼', '專屬碼', '姓名', '性別', '國籍', '證件號碼', 'LINE ID', '聯絡信箱', '聯絡電話',
      '系所', '學號', '身分', '聯絡地址', '生日', '緊急聯絡人姓名', '緊急聯絡人電話', '緊急聯絡人聯絡地址', '緊急聯絡人關係',
      '個人特殊病史', '爬山經驗', '體能測驗', '體能證明', '加入社員意願', '是否為社員', '擔任幹部意願',
      '審核結果', '通知狀態', '繳費狀態', '備註', '想說的話'
    ];

    assert.equal(userHeaders.length, 30, '必須涵蓋使用者目前之 30 欄位');

    // 模擬一名隊員資料
    const mockSignup = {
      id: 'S2610-099',
      line_user_id: 'U_TEST_USER_999',
      name: '王小明',
      status: 'confirmed',
      notification_status: '已通知',
      payment_status: 'paid',
      notes: '幹部已審核通過',
      members: {
        name: '王小明',
        gender: '男',
        nationality: '台灣',
        id_card: 'A123456789',
        line_id: 'xiaoming_line',
        email: 'xiaoming@example.com',
        phone: '0912345678',
        department: '資訊工程系',
        student_id: 'B11000001',
        identity_status: '學生',
        address: '台北市大安區基隆路四段43號',
        birthday: '2002-05-20',
        emergency_contact_name: '陳大華',
        emergency_contact_phone: '0988776655',
        emergency_contact_address: '新北市板橋區縣民大道',
        emergency_contact_rel: '母親',
        medical_history: '無特殊病史',
        outdoor_experience: '合歡群峰、玉山前峰',
        fitness_desc: '每週跑步三次',
        fitness_proof_url: 'https://example.com/proof.jpg',
        join_membership_intent: '我有意願成為社員',
        is_official_member: false,
        officer_intent: '無意願',
        want_to_say: '期待與大家一起爬山！'
      }
    };

    function _normalizeHeader(header) {
      if (header === null || header === undefined) return { raw: '', stripped: '' };
      var raw = String(header).trim().toLowerCase().replace(/\s+/g, ' ');
      var stripped = raw.replace(/\s*[\(\[（【〔][^\)\]）】〕]*[\)\]）】〕]\s*/g, '').trim().replace(/\s+/g, ' ');
      return { raw: raw, stripped: stripped };
    }

    function _matchHeader(header, candidates) {
      if (!candidates || !candidates.length) return false;
      var norm = _normalizeHeader(header);
      if (!norm.raw && !norm.stripped) return false;
      for (var i = 0; i < candidates.length; i++) {
        var c = String(candidates[i]).trim().toLowerCase().replace(/\s+/g, ' ');
        if (norm.raw === c || norm.stripped === c) return true;
      }
      return false;
    }

    function _formatIntent(val) {
      if (!val) return '否';
      if (val === true || val === '是') return '是';
      var str = String(val).trim();
      if (str === '是' || str.toLowerCase() === 'true') return '是';
      if (str.indexOf('無') > -1 || str.indexOf('否') > -1 || str.indexOf('沒有') > -1 || str.indexOf('不') > -1) {
        return '否';
      }
      if (str.indexOf('有意願') > -1 || str.indexOf('我有意願') > -1 || str === '意願' || str.indexOf('想') > -1) {
        return '是';
      }
      return '否';
    }

    const m = mockSignup.members;
    const s = mockSignup;
    const row = new Array(userHeaders.length).fill('');

    for (let c = 0; c < userHeaders.length; c++) {
      const h = userHeaders[c];
      if (_matchHeader(h, ['序號', '項次', 'no.', 'no', '項', '序號 no.', '編號 (序號)'])) {
        row[c] = 1;
      } else if (_matchHeader(h, ['系統識別碼', 'line_user_id', 'line userid', 'userid', '系統識別碼 line_user_id'])) {
        row[c] = s.line_user_id || '';
      } else if (_matchHeader(h, ['專屬碼', '報名專屬碼', '報名碼', '報名代碼', '報名編號', 'signup_id', 'signup id', 'code', '專屬碼 id', '報名專屬碼 signup_id'])) {
        row[c] = s.id || '';
      } else if (_matchHeader(h, ['緊急聯絡人姓名', '緊急聯絡人', 'emer_name', 'emergency_contact_name', '緊急聯絡人姓名 emergency contact name', '緊急聯絡人 emergency contact'])) {
        row[c] = m.emergency_contact_name || '';
      } else if (_matchHeader(h, ['姓名', 'name', '隊員姓名', '報名者姓名', '姓名 name', '隊員姓名 member name', '報名姓名'])) {
        row[c] = m.name || s.name || '';
      } else if (_matchHeader(h, ['性別', 'gender', '性別 gender'])) {
        row[c] = m.gender || '';
      } else if (_matchHeader(h, ['國籍', 'nationality', '國籍 nationality'])) {
        row[c] = m.nationality || '';
      } else if (_matchHeader(h, ['證件號碼', '身分證字號', '身分證', '身分證號', '護照號碼', '居留證號', 'id_card', 'id_number', '證件字號', '身分證字號 id_card', '證件號碼 id_number'])) {
        row[c] = m.id_card ? ("'" + String(m.id_card)) : (m.id_number ? ("'" + String(m.id_number)) : '');
      } else if (_matchHeader(h, ['LINE ID', 'line_id', 'lineid', 'line 帳號', 'line帳號', 'line id / line帳號', 'line id line帳號'])) {
        row[c] = m.line_id || s.line_id || '';
      } else if (_matchHeader(h, ['聯絡信箱', 'email', '電子郵件', '信箱', 'mail', 'e-mail', '聯絡信箱 email'])) {
        row[c] = m.email || '';
      } else if (_matchHeader(h, ['緊急聯絡人電話', '緊急聯絡電話', '緊急電話', '緊急聯絡人手機', '緊急聯絡手機', 'emer_phone', 'emergency_contact_phone', '緊急聯絡人電話 emergency contact phone'])) {
        row[c] = m.emergency_contact_phone ? ("'" + String(m.emergency_contact_phone)) : '';
      } else if (_matchHeader(h, ['聯絡電話', '電話', '手機電話', '手機', '行動電話', 'phone', 'tel', 'phone number', '聯絡電話 phone', '手機 phone'])) {
        row[c] = m.phone ? ("'" + String(m.phone)) : '';
      } else if (_matchHeader(h, ['系所', '科系', '系級', '學系', 'department', '系所 department', '系級 department'])) {
        row[c] = m.department || '';
      } else if (_matchHeader(h, ['學號', 'student_id', 'student id', '學號 student_id', '學號 student id'])) {
        row[c] = m.student_id ? ("'" + String(m.student_id)) : '';
      } else if (_matchHeader(h, ['身分', '身分狀態', '校內身分', 'identity_status', '身分 identity_status'])) {
        row[c] = m.identity_status || '';
      } else if (_matchHeader(h, ['緊急聯絡人聯絡地址', '緊急聯絡人地址', '緊急地址', 'emer_address', 'emergency_contact_address', '緊急聯絡人聯絡地址 emergency contact address', '緊急聯絡人現居地址', '緊急聯絡人戶籍地址', '緊急聯絡人通訊地址'])) {
        row[c] = m.emergency_contact_address || '';
      } else if (_matchHeader(h, ['聯絡地址', '地址', '現居地址', '戶籍地址', '通訊地址', 'address', '聯絡地址 address'])) {
        row[c] = m.address || '';
      } else if (_matchHeader(h, ['生日', '出生年月日', '出生日期', 'birthday', '生日 birthday', '出生年月日 birthday'])) {
        row[c] = m.birthday ? String(m.birthday).replace(/-/g, '/').slice(0, 10) : '';
      } else if (_matchHeader(h, ['緊急聯絡人關係', '關係', '與緊急聯絡人關係', 'emer_rel', 'emergency_contact_rel', 'emergency_contact_relationship', '緊急聯絡人關係 emergency contact relationship'])) {
        row[c] = m.emergency_contact_rel || m.emergency_contact_relationship || '';
      } else if (_matchHeader(h, ['個人特殊病史', '特殊病史', '病史', '個人特殊病史或過敏', 'medical_history', '特殊病史 medical_history'])) {
        row[c] = m.medical_history || '';
      } else if (_matchHeader(h, ['爬山經驗', '登山經驗', '登山經歷', '經驗', 'outdoor_experience', 'hiking_experience', '爬山經驗 outdoor_experience', '百岳經驗'])) {
        row[c] = m.outdoor_experience || m.hiking_experience || '';
      } else if (_matchHeader(h, ['體能測驗', '體能自評', '體能狀況', '體能', 'fitness_desc', 'fitness_test', '體能測驗 fitness_test'])) {
        row[c] = m.fitness_desc || m.fitness_test || '';
      } else if (_matchHeader(h, ['體能證明', '證明文件', 'fitness_proof', 'proof_urls', '體能證明 fitness_proof'])) {
        row[c] = m.fitness_proof_url || '';
      } else if (_matchHeader(h, ['加入社員意願', '入社意願', '是否入社', 'join_membership_intent', '加入社員意願 join_membership_intent'])) {
        row[c] = _formatIntent(m.join_membership_intent);
      } else if (_matchHeader(h, ['是否為社員', '社員身分', '社員', 'is_official_member', 'is_member', '是否為社員 is_official_member', '正式社員'])) {
        row[c] = m.is_official_member ? '是' : '否';
      } else if (_matchHeader(h, ['擔任幹部意願', '幹部意願', '有意願擔任幹部', 'officer_intent', '擔任幹部意願 officer_intent'])) {
        row[c] = _formatIntent(m.officer_intent);
      } else if (_matchHeader(h, ['審核結果', '審核狀態', '錄取審核', 'status', 'audit_status', '審核結果 status'])) {
        row[c] = '正取 Confirmed';
      } else if (_matchHeader(h, ['通知狀態', '錄取通知', '審核通知', 'notify_status', 'notification_status', '通知狀態 notification_status'])) {
        row[c] = s.notification_status || '未通知';
      } else if (_matchHeader(h, ['繳費狀態', '繳費情形', '付款狀態', '對帳狀態', 'payment_status', '繳費', '繳費狀態 payment_status'])) {
        row[c] = '已繳費 Paid';
      } else if (_matchHeader(h, ['備註', '幹部備註', 'notes', 'memo', '備註 notes', '備注'])) {
        row[c] = s.notes || '';
      } else if (_matchHeader(h, ['想說的話', '給幹部的話', '隊員留言', '隊員想說的話', 'want_to_say', '想說的話 want_to_say'])) {
        row[c] = m.want_to_say || '';
      }
    }

    // 關鍵防撞名檢驗
    assert.equal(row[userHeaders.indexOf('緊急聯絡人姓名')], '陳大華', '緊急聯絡人姓名不可被隊員本人姓名污染');
    assert.equal(row[userHeaders.indexOf('姓名')], '王小明', '姓名欄必須為隊員本人姓名');
    assert.equal(row[userHeaders.indexOf('LINE ID')], 'xiaoming_line', 'LINE ID 不可被報名專屬碼污染');
    assert.equal(row[userHeaders.indexOf('專屬碼')], 'S2610-099', '專屬碼必須為 S2610-099');
    assert.equal(row[userHeaders.indexOf('學號')], "'B11000001", '學號不可被專屬碼污染');
    assert.equal(row[userHeaders.indexOf('加入社員意願')], '是', '加入社員意願不可被是否為社員污染');
    assert.equal(row[userHeaders.indexOf('是否為社員')], '否', '是否為社員必須保持真實社員狀態');
    assert.equal(row[userHeaders.indexOf('擔任幹部意願')], '否', '擔任幹部意願必須正確判斷');
    assert.equal(row[userHeaders.indexOf('國籍')], '台灣', '國籍必須正確填入');
    assert.equal(row[userHeaders.indexOf('身分')], '學生', '身分必須正確填入');
    assert.equal(row[userHeaders.indexOf('想說的話')], '期待與大家一起爬山！', '想說的話必須正確填入');
    assert.equal(row[userHeaders.indexOf('緊急聯絡人電話')], "'0988776655", '緊急聯絡人電話必須正確填入');
    assert.equal(row[userHeaders.indexOf('聯絡電話')], "'0912345678", '聯絡電話必須為本人電話');
  });
});
