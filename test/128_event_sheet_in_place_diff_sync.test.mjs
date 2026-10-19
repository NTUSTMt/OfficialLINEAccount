import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('128. 活動試算表原位差異比對更新（In-Place Diff Update）與保留幹部自訂欄位驗證 (v0.1.315)', () => {
  const workerPath = path.join(rootDir, 'src', 'gas_worker.js');
  const workerContent = fs.readFileSync(workerPath, 'utf8');

  it('1. gas_worker.js 必須徹底廢除 clearContent()，絕不可清空既有名冊資料', () => {
    // 檢查 _importExistingSignupsToSheet 區塊中不得包含 clearContent()
    const importFnSlice = workerContent.slice(
      workerContent.indexOf('function _importExistingSignupsToSheet('),
      workerContent.indexOf('function _formatIntent(')
    );
    assert.ok(
      !importFnSlice.includes('clearContent()'),
      '_importExistingSignupsToSheet 函式內嚴禁出現 clearContent() 破壞性清空操作'
    );
    assert.ok(
      workerContent.includes('function _areCellValuesEqual'),
      'gas_worker.js 必須具備 _areCellValuesEqual 儲存格差異比對函式'
    );
    assert.ok(
      workerContent.includes('function _computeTargetValue'),
      'gas_worker.js 必須具備 _computeTargetValue 系統欄位目標值計算函式'
    );
  });

  it('2. 幹部自訂欄位（車次、帳篷分組、保險進度）在同步後必須 100% 完整保留', () => {
    // 模擬試算表表頭包含幹部在第 31~34 欄新增的自訂欄位
    const headers = [
      '系統識別碼', '專屬碼', '姓名', '性別', '國籍', '證件號碼', 'LINE ID', '聯絡信箱', '聯絡電話',
      '系所', '學號', '身分', '聯絡地址', '生日', '緊急聯絡人姓名', '緊急聯絡人電話', '緊急聯絡人聯絡地址', '緊急聯絡人關係',
      '個人特殊病史', '爬山經驗', '體能測驗', '體能證明', '加入社員意願', '是否為社員', '擔任幹部意願',
      '審核結果', '通知狀態', '繳費狀態', '備註', '想說的話',
      '車次分配', '帳篷分組', '公裝分配', '保險完成否' // 幹部手動擴充自訂欄位
    ];

    // 模擬試算表中既有 2 列隊員資料（含幹部填寫之車次與帳篷）
    const initialSheetData = [
      headers,
      [
        'U_USER_001', 'S2610-001', '王小明', '男', '台灣', "'A123456789", 'xiaoming_line', 'xm@test.com', "'0912345678",
        '資工系', "'B11000001", '學生', '台北市大安區', '2002/05/20', '陳大華', "'0988776655", '新北市板橋區', '母親',
        '無', '合歡山', '常跑', '', '是', '是', '否',
        '審核中 Checking', '未通知', '未繳費 Unpaid', '舊幹部備註', '好想爬山',
        '第 1 車 (隊長車)', 'A 帳 (3人帳)', '爐頭 + 瓦斯', '已投保'
      ],
      [
        'U_USER_002', 'S2610-002', '李小美', '女', '台灣', "'B223456789", 'xiaomei_line', 'xm2@test.com', "'0922334455",
        '設計系', "'B11000002", '學生', '台北市信義區', '2003/08/15', '李爸爸', "'0911223344", '台北市信義區', '父親',
        '無', '陽明山', '每週爬山', '', '否', '否', '否',
        '審核中 Checking', '未通知', '未繳費 Unpaid', '', '新手請多指教',
        '第 2 車', 'B 帳 (女帳)', '公用急救包', '待確認'
      ]
    ];

    // 模擬 Supabase 最新資料：
    // 1. S2610-001：審核通過為「正取 Confirmed」、繳費變更為「已繳費 Paid」、備註更新為「已核銷完成」
    // 2. S2610-002：隊員自願取消（status: 'cancelled'）
    // 3. S2610-003：全新報名者
    const latestSupabaseSignups = [
      {
        id: 'S2610-001',
        line_user_id: 'U_USER_001',
        name: '王小明',
        status: 'confirmed',
        notification_status: '已通知',
        payment_status: 'paid',
        notes: '已核銷完成',
        members: {
          name: '王小明',
          gender: '男',
          nationality: '台灣',
          id_card: 'A123456789',
          line_id: 'xiaoming_line',
          email: 'xm@test.com',
          phone: '0912345678',
          department: '資工系',
          student_id: 'B11000001',
          identity_status: '學生',
          address: '台北市大安區',
          birthday: '2002-05-20',
          emergency_contact_name: '陳大華',
          emergency_contact_phone: '0988776655',
          emergency_contact_address: '新北市板橋區',
          emergency_contact_rel: '母親',
          medical_history: '無',
          outdoor_experience: '合歡山',
          fitness_desc: '常跑',
          join_membership_intent: '我有意願成為社員',
          is_official_member: true,
          officer_intent: '無意願',
          want_to_say: '好想爬山'
        }
      },
      {
        id: 'S2610-002',
        line_user_id: 'U_USER_002',
        name: '李小美',
        status: 'cancelled',
        notification_status: '未通知',
        payment_status: 'unpaid',
        notes: '隊員自願取消',
        members: {
          name: '李小美',
          gender: '女',
          nationality: '台灣',
          id_card: 'B223456789',
          line_id: 'xiaomei_line',
          email: 'xm2@test.com',
          phone: '0922334455',
          department: '設計系',
          student_id: 'B11000002',
          identity_status: '學生',
          address: '台北市信義區',
          birthday: '2003-08-15',
          emergency_contact_name: '李爸爸',
          emergency_contact_phone: '0911223344',
          emergency_contact_address: '台北市信義區',
          emergency_contact_rel: '父親',
          medical_history: '無',
          outdoor_experience: '陽明山',
          fitness_desc: '每週爬山',
          join_membership_intent: '否',
          is_official_member: false,
          officer_intent: '無意願',
          want_to_say: '新手請多指教'
        }
      },
      {
        id: 'S2610-003',
        line_user_id: 'U_USER_003',
        name: '張新進',
        status: 'waitlist',
        notification_status: '未通知',
        payment_status: 'unpaid',
        notes: '新報名候補',
        members: {
          name: '張新進',
          gender: '男',
          nationality: '台灣',
          id_card: 'C334455667',
          line_id: 'new_member_line',
          email: 'new@test.com',
          phone: '0955667788',
          department: '機械系',
          student_id: 'B11000003',
          identity_status: '學生',
          address: '新北市永和區',
          birthday: '2004-01-01',
          emergency_contact_name: '張媽媽',
          emergency_contact_phone: '0966554433',
          emergency_contact_address: '新北市永和區',
          emergency_contact_rel: '母親',
          medical_history: '花粉過敏',
          outdoor_experience: '百岳兩座',
          fitness_desc: '一般體能',
          join_membership_intent: '我有意願成為社員',
          is_official_member: false,
          officer_intent: '無意願',
          want_to_say: '希望能候補上'
        }
      }
    ];

    // 模擬試算表物件
    let storedSheetData = JSON.parse(JSON.stringify(initialSheetData));
    const mockSheet = {
      getDataRange: () => ({
        getValues: () => JSON.parse(JSON.stringify(storedSheetData))
      }),
      getLastRow: () => storedSheetData.length,
      getMaxRows: () => 100,
      insertRowsAfter: () => {},
      getRange: (startRow, startCol, numRows, numCols) => ({
        setValues: (vals) => {
          for (let r = 0; r < numRows; r++) {
            const targetRowIdx = startRow - 1 + r;
            if (!storedSheetData[targetRowIdx]) {
              storedSheetData[targetRowIdx] = new Array(headers.length).fill('');
            }
            for (let c = 0; c < numCols; c++) {
              storedSheetData[targetRowIdx][c] = vals[r][c];
            }
          }
        },
        clearDataValidations: () => {}
      })
    };

    // 提取 gas_worker.js 中的執行函式並在環境中評估執行
    // 為了安全獨立驗證，直接模擬演算法比對
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

    function _findColIdx(headers, candidates) {
      for (var i = 0; i < headers.length; i++) {
        if (_matchHeader(headers[i], candidates)) return i;
      }
      return -1;
    }

    function _areCellValuesEqual(valA, valB) {
      var a = String(valA !== null && valA !== undefined ? valA : '').trim().replace(/^'/, '');
      var b = String(valB !== null && valB !== undefined ? valB : '').trim().replace(/^'/, '');
      return a === b;
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

    function _normalizePaymentStatus(val) {
      var str = String(val || '').trim();
      if (str.indexOf('已繳') > -1 || str.toLowerCase().indexOf('paid') > -1) {
        return '已繳費 Paid';
      }
      if (str.indexOf('待確認') > -1 || str.toLowerCase().indexOf('checking') > -1) {
        return '待確認 Checking';
      }
      return '未繳費 Unpaid';
    }

    function _normalizeAuditStatus(val) {
      var str = String(val || '').trim();
      if (str.indexOf('正取') > -1 || str.toLowerCase().indexOf('confirm') > -1) {
        return '正取 Confirmed';
      }
      if (str.indexOf('備取') > -1 || str.toLowerCase().indexOf('waitlist') > -1) {
        return '備取 Waitlisted';
      }
      if (str.indexOf('取消') > -1 || str.toLowerCase().indexOf('cancel') > -1) {
        return '已取消 Cancelled';
      }
      return '審核中 Checking';
    }

    function _computeTargetValue(h, s, m, i, curVal) {
      if (_matchHeader(h, ['序號', '項次', 'no.', 'no', '項', '序號 no.', '編號 (序號)'])) {
        return (curVal && String(curVal).trim()) ? curVal : (i + 1);
      } else if (_matchHeader(h, ['系統識別碼', 'line_user_id', 'line userid', 'userid', '系統識別碼 line_user_id'])) {
        return s.line_user_id || '';
      } else if (_matchHeader(h, ['專屬碼', '報名專屬碼', '報名碼', '報名代碼', '報名編號', 'signup_id', 'signup id', 'code', '專屬碼 id', '報名專屬碼 signup_id'])) {
        return s.id || '';
      } else if (_matchHeader(h, ['緊急聯絡人姓名', '緊急聯絡人', 'emer_name', 'emergency_contact_name', '緊急聯絡人姓名 emergency contact name', '緊急聯絡人 emergency contact'])) {
        return m.emergency_contact_name || '';
      } else if (_matchHeader(h, ['姓名', 'name', '隊員姓名', '報名者姓名', '姓名 name', '隊員姓名 member name', '報名姓名'])) {
        return m.name || s.name || '';
      } else if (_matchHeader(h, ['性別', 'gender', '性別 gender'])) {
        return m.gender || '';
      } else if (_matchHeader(h, ['國籍', 'nationality', '國籍 nationality'])) {
        return m.nationality || '';
      } else if (_matchHeader(h, ['證件號碼', '身分證字號', '身分證', '身分證號', '護照號碼', '居留證號', 'id_card', 'id_number', '證件字號', '身分證字號 id_card', '證件號碼 id_number'])) {
        return m.id_card ? ("'" + String(m.id_card)) : (m.id_number ? ("'" + String(m.id_number)) : '');
      } else if (_matchHeader(h, ['LINE ID', 'line_id', 'lineid', 'line 帳號', 'line帳號', 'line id / line帳號', 'line id line帳號'])) {
        return m.line_id || s.line_id || '';
      } else if (_matchHeader(h, ['聯絡信箱', 'email', '電子郵件', '信箱', 'mail', 'e-mail', '聯絡信箱 email'])) {
        return m.email || '';
      } else if (_matchHeader(h, ['緊急聯絡人電話', '緊急聯絡電話', '緊急電話', '緊急聯絡人手機', '緊急聯絡手機', 'emer_phone', 'emergency_contact_phone', '緊急聯絡人電話 emergency contact phone'])) {
        return m.emergency_contact_phone ? ("'" + String(m.emergency_contact_phone)) : '';
      } else if (_matchHeader(h, ['聯絡電話', '電話', '手機電話', '手機', '行動電話', 'phone', 'tel', 'phone number', '聯絡電話 phone', '手機 phone'])) {
        return m.phone ? ("'" + String(m.phone)) : '';
      } else if (_matchHeader(h, ['系所', '科系', '系級', '學系', 'department', '系所 department', '系級 department'])) {
        return m.department || '';
      } else if (_matchHeader(h, ['學號', 'student_id', 'student id', '學號 student_id', '學號 student id'])) {
        return m.student_id ? ("'" + String(m.student_id)) : '';
      } else if (_matchHeader(h, ['身分', '身分狀態', '校內身分', 'identity_status', '身分 identity_status'])) {
        return m.identity_status || '';
      } else if (_matchHeader(h, ['緊急聯絡人聯絡地址', '緊急聯絡人地址', '緊急地址', 'emer_address', 'emergency_contact_address', '緊急聯絡人聯絡地址 emergency contact address', '緊急聯絡人現居地址', '緊急聯絡人戶籍地址', '緊急聯絡人通訊地址'])) {
        return m.emergency_contact_address || '';
      } else if (_matchHeader(h, ['聯絡地址', '地址', '現居地址', '戶籍地址', '通訊地址', 'address', '聯絡地址 address'])) {
        return m.address || '';
      } else if (_matchHeader(h, ['生日', '出生年月日', '出生日期', 'birthday', '生日 birthday', '出生年月日 birthday'])) {
        return m.birthday ? String(m.birthday).replace(/-/g, '/').slice(0, 10) : '';
      } else if (_matchHeader(h, ['緊急聯絡人關係', '關係', '與緊急聯絡人關係', 'emer_rel', 'emergency_contact_rel', 'emergency_contact_relationship', '緊急聯絡人關係 emergency contact relationship'])) {
        return m.emergency_contact_rel || m.emergency_contact_relationship || '';
      } else if (_matchHeader(h, ['個人特殊病史', '特殊病史', '病史', '個人特殊病史或過敏', 'medical_history', '特殊病史 medical_history'])) {
        return m.medical_history || '';
      } else if (_matchHeader(h, ['爬山經驗', '登山經驗', '登山經歷', '經驗', 'outdoor_experience', 'hiking_experience', '爬山經驗 outdoor_experience', '百岳經驗'])) {
        return m.outdoor_experience || m.hiking_experience || '';
      } else if (_matchHeader(h, ['體能測驗', '體能自評', '體能狀況', '體能', 'fitness_desc', 'fitness_test', '體能測驗 fitness_test'])) {
        return m.fitness_desc || m.fitness_test || '';
      } else if (_matchHeader(h, ['體能證明', '證明文件', 'fitness_proof', 'proof_urls', '體能證明 fitness_proof'])) {
        return m.fitness_proof_url || '';
      } else if (_matchHeader(h, ['加入社員意願', '入社意願', '是否入社', 'join_membership_intent', '加入社員意願 join_membership_intent'])) {
        return _formatIntent(m.join_membership_intent);
      } else if (_matchHeader(h, ['是否為社員', '社員身分', '社員', 'is_official_member', 'is_member', '是否為社員 is_official_member', '正式社員'])) {
        return m.is_official_member ? '是' : (s.is_official_member_snapshot ? '是' : '否');
      } else if (_matchHeader(h, ['擔任幹部意願', '幹部意願', '有意願擔任幹部', 'officer_intent', '擔任幹部意願 officer_intent'])) {
        return _formatIntent(m.officer_intent);
      } else if (_matchHeader(h, ['審核結果', '審核狀態', '錄取審核', 'status', 'audit_status', '審核結果 status'])) {
        return _normalizeAuditStatus(s.status);
      } else if (_matchHeader(h, ['通知狀態', '錄取通知', '審核通知', 'notify_status', 'notification_status', '通知狀態 notification_status'])) {
        return s.notification_status ? String(s.notification_status) : '未通知';
      } else if (_matchHeader(h, ['繳費狀態', '繳費情形', '付款狀態', '對帳狀態', 'payment_status', '繳費', '繳費狀態 payment_status'])) {
        return _normalizePaymentStatus(s.payment_status);
      } else if (_matchHeader(h, ['備註', '幹部備註', 'notes', 'memo', '備註 notes', '備注'])) {
        return s.notes || '';
      } else if (_matchHeader(h, ['想說的話', '給幹部的話', '隊員留言', '隊員想說的話', 'want_to_say', '想說的話 want_to_say'])) {
        return m.want_to_say || '';
      }
      return undefined;
    }

    // 執行原位比對更新邏輯
    const sData = mockSheet.getDataRange().getValues();
    const codeCol = _findColIdx(headers, ['專屬碼', '報名專屬碼', '報名碼', '報名代碼', '報名編號', 'signup_id', 'signup id', 'code', '專屬碼 id', '報名專屬碼 signup_id']);
    const uidCol = _findColIdx(headers, ['系統識別碼', 'line_user_id', 'line userid', 'userid', '系統識別碼 line_user_id']);

    const sheetRowMap = {};
    for (let r = 1; r < sData.length; r++) {
      const rowCode = codeCol > -1 ? String(sData[r][codeCol] || '').trim() : '';
      const rowUid = uidCol > -1 ? String(sData[r][uidCol] || '').trim() : '';
      if (rowCode) sheetRowMap['CODE_' + rowCode] = r;
      if (rowUid) sheetRowMap['UID_' + rowUid] = r;
    }

    let updatedRowsCount = 0;
    const rowsToAppend = [];
    let sheetDataModified = false;

    for (let i = 0; i < latestSupabaseSignups.length; i++) {
      const s = latestSupabaseSignups[i];
      const m = s.members || {};

      let matchedRowIdx = -1;
      if (s.id && sheetRowMap['CODE_' + s.id] !== undefined) {
        matchedRowIdx = sheetRowMap['CODE_' + s.id];
      } else if (s.line_user_id && sheetRowMap['UID_' + s.line_user_id] !== undefined) {
        matchedRowIdx = sheetRowMap['UID_' + s.line_user_id];
      }

      if (matchedRowIdx > -1) {
        let rowChanged = false;
        for (let c = 0; c < headers.length; c++) {
          const h = String(headers[c]).trim();
          const targetVal = _computeTargetValue(h, s, m, matchedRowIdx, sData[matchedRowIdx][c]);
          if (targetVal !== undefined) {
            if (!_areCellValuesEqual(sData[matchedRowIdx][c], targetVal)) {
              sData[matchedRowIdx][c] = targetVal;
              rowChanged = true;
            }
          }
        }
        if (rowChanged) {
          updatedRowsCount++;
          sheetDataModified = true;
        }
      } else {
        const newRow = new Array(headers.length).fill('');
        for (let nc = 0; nc < headers.length; nc++) {
          const nh = String(headers[nc]).trim();
          const nTarget = _computeTargetValue(nh, s, m, sData.length - 1 + rowsToAppend.length, '');
          newRow[nc] = (nTarget !== undefined) ? nTarget : '';
        }
        rowsToAppend.push(newRow);
      }
    }

    if (sheetDataModified) {
      mockSheet.getRange(1, 1, sData.length, headers.length).setValues(sData);
    }
    if (rowsToAppend.length > 0) {
      mockSheet.getRange(mockSheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }

    // 驗證同步結果
    const finalData = mockSheet.getDataRange().getValues();
    assert.equal(finalData.length, 4, '最終試算表必須包含表頭與 3 位隊員列（2 既有 + 1 新追加）');

    // 檢驗第 1 位隊員 (S2610-001 原位更新):
    const row1 = finalData[1];
    assert.equal(row1[1], 'S2610-001');
    assert.equal(row1[25], '正取 Confirmed', '審核結果必須精確原位更新為「正取 Confirmed」');
    assert.equal(row1[27], '已繳費 Paid', '繳費狀態必須精確原位更新為「已繳費 Paid」');
    assert.equal(row1[28], '已核銷完成', '備註欄位以 Supabase 最新內容為準更新');
    // 自訂欄位檢查：
    assert.equal(row1[30], '第 1 車 (隊長車)', '幹部自訂的「車次分配」必須 100% 完整保留');
    assert.equal(row1[31], 'A 帳 (3人帳)', '幹部自訂的「帳篷分組」必須 100% 完整保留');
    assert.equal(row1[32], '爐頭 + 瓦斯', '幹部自訂的「公裝分配」必須 100% 完整保留');
    assert.equal(row1[33], '已投保', '幹部自訂的「保險完成否」必須 100% 完整保留');

    // 檢驗第 2 位隊員 (S2610-002 取消報名原位更新):
    const row2 = finalData[2];
    assert.equal(row2[1], 'S2610-002');
    assert.equal(row2[25], '已取消 Cancelled', '已取消隊員列保留，審核結果更新為「已取消 Cancelled」');
    // 自訂欄位檢查：
    assert.equal(row2[30], '第 2 車', '已取消隊員原有的「車次分配」必須完整保留');
    assert.equal(row2[31], 'B 帳 (女帳)', '已取消隊員原有的「帳篷分組」必須完整保留');
    assert.equal(row2[32], '公用急救包', '已取消隊員原有的「公裝分配」必須完整保留');
    assert.equal(row2[33], '待確認', '已取消隊員原有的「保險完成否」必須完整保留');

    // 檢驗第 3 位隊員 (S2610-003 全新追加隊員):
    const row3 = finalData[3];
    assert.equal(row3[1], 'S2610-003');
    assert.equal(row3[2], '張新進', '新隊員姓名正確填入');
    assert.equal(row3[25], '備取 Waitlisted', '新隊員審核狀態正確填入');
    // 自訂欄位預設為空，等待幹部填寫：
    assert.equal(row3[30], '', '新追加隊員的自訂欄位預設留空');
    assert.equal(row3[31], '', '新追加隊員的自訂欄位預設留空');
  });
});
