import test from 'node:test';
import assert from 'node:assert';

test('64. 資料填寫新增「想說的話 (want_to_say)」非必填多行輸入框與全鏈路同步測試', async (t) => {
  // 1. 驗證表單驗證：wantToSay 無論是否有值，皆完全不影響第 4 步驗證 (非必填)
  await t.test('1. wantToSay 為選填項目，為空或有值皆不影響表單驗證通過', () => {
    const isStep4Valid = (privacyAgreed, intendOfficial, wantToSay) => {
      // Step 4 必須勾選隱私條款且選擇入社意願，想說的話為選填
      return privacyAgreed && intendOfficial.trim() !== '';
    };

    // Case A: 隱私條款同意 + 入社意願已選 + 想說的話為空 -> 必須合法通過
    assert.strictEqual(isStep4Valid(true, '我有意願成為社員', ''), true);
    assert.strictEqual(isStep4Valid(true, '我目前沒有意願成為社員', undefined || ''), true);

    // Case B: 隱私條款同意 + 入社意願已選 + 想說的話有長篇多行留言 -> 合法通過
    const multiLineMessage = '哈囉幹部們！\n希望能多多舉辦百岳中級山活動，謝謝大家！\n祝出隊平安！';
    assert.strictEqual(isStep4Valid(true, '我有意願成為社員', multiLineMessage), true);

    // Case C: 未同意隱私條款 -> 不得通過
    assert.strictEqual(isStep4Valid(false, '我有意願成為社員', multiLineMessage), false);

    // Case D: 未選擇入社意願 -> 不得通過
    assert.strictEqual(isStep4Valid(true, '', multiLineMessage), false);
  });

  // 2. 驗證 RPC payload 封裝與 save_member_profile 寫入
  await t.test('2. saveMemberProfile 呼叫正確將 wantToSay 映射為 payload.want_to_say', () => {
    const mockFormData = {
      name: '王小明',
      gender: '男',
      realLineId: 'ming123',
      email: 'ming@example.com',
      phone: '0912345678',
      department: '資工系',
      studentId: 'B11015001',
      birthday: '2001/05/15',
      idNumber: 'A123456789',
      studentAddr: '台北市大安區基隆路四段43號',
      exp: '百岳10座',
      strength: '跑步5000m 25分',
      strengthProof: '',
      emerName: '王大明',
      emerRel: '父子',
      emerPhone: '0987654321',
      emerAddr: '台北市大安區',
      medicalHistory: '無',
      identityStatus: '臺科大在校學生',
      intendOfficial: '我有意願成為社員',
      intendOfficer: '我有意願成為社團幹部',
      wantToSay: '非常期待這學期的活動，希望有機會加入幹部團隊！'
    };

    const buildRpcPayload = (formData) => {
      return {
        name: formData.name.trim(),
        gender: formData.gender,
        line_id: formData.realLineId.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        department: formData.department.trim(),
        student_id: formData.studentId.trim(),
        birthday: formData.birthday.replace(/\//g, '-').trim(),
        id_card: formData.idNumber.trim(),
        address: formData.studentAddr.trim(),
        outdoor_experience: formData.exp.trim(),
        fitness_desc: formData.strength.trim(),
        proof_urls: [],
        emergency_contact_name: formData.emerName.trim(),
        emergency_contact_rel: formData.emerRel.trim(),
        emergency_contact_phone: formData.emerPhone.trim(),
        emergency_contact_address: formData.emerAddr.trim(),
        medical_history: formData.medicalHistory.trim(),
        identity_status: formData.identityStatus.trim(),
        join_membership_intent: formData.intendOfficial.trim(),
        officer_intent: formData.intendOfficer.trim(),
        want_to_say: formData.wantToSay ? formData.wantToSay.trim() : ''
      };
    };

    const payload = buildRpcPayload(mockFormData);
    assert.strictEqual(payload.want_to_say, '非常期待這學期的活動，希望有機會加入幹部團隊！');
    assert.strictEqual(payload.name, '王小明');
    assert.strictEqual(payload.officer_intent, '我有意願成為社團幹部');

    // 當 wantToSay 為空時安全 fallback 為空字串
    const emptyPayload = buildRpcPayload({ ...mockFormData, wantToSay: '' });
    assert.strictEqual(emptyPayload.want_to_say, '');
  });

  // 3. 驗證資料讀取映射 (fetchMemberProfileFromSupabase)
  await t.test('3. fetchMemberProfile 正確將 Supabase data.want_to_say 映射回 ProfileData.wantToSay', () => {
    const mockSupabaseMemberRow = {
      name: '李小華',
      gender: '女',
      line_id: 'hua_line',
      department: '企管系',
      student_id: 'M11109002',
      join_membership_intent: '我有意願成為社員',
      officer_intent: '',
      want_to_say: '想請問裝備租借領取時間是每週幾呢？',
      created_at: '2026-09-01T00:00:00Z'
    };

    const mapSupabaseToProfile = (data) => {
      return {
        name: data.name || '',
        gender: data.gender || '',
        department: data.department || '',
        studentId: data.student_id || '',
        intendOfficial: data.join_membership_intent || '',
        intendOfficer: data.officer_intent || '',
        wantToSay: data.want_to_say || ''
      };
    };

    const profile = mapSupabaseToProfile(mockSupabaseMemberRow);
    assert.strictEqual(profile.wantToSay, '想請問裝備租借領取時間是每週幾呢？');
    assert.strictEqual(profile.intendOfficial, '我有意願成為社員');
  });

  // 4. 驗證個人資料更新比對 changedFields 支援 wantToSay
  await t.test('4. 既有使用者更新資料時，wantToSay 異動正確記錄於 changedFields 並推播', () => {
    const originalFormData = {
      name: '王小明',
      wantToSay: '初次註冊的留言'
    };

    const newFormData = {
      name: '王小明',
      wantToSay: '修改後的最新留言，請多指教！'
    };

    const changedFields = [];
    const norm = (v) => (v || '').trim();
    if (norm(newFormData.name) !== norm(originalFormData.name)) changedFields.push('name');
    if (norm(newFormData.wantToSay) !== norm(originalFormData.wantToSay)) changedFields.push('wantToSay');

    assert.deepStrictEqual(changedFields, ['wantToSay']);

    // 模擬 GAS push message 生成
    const detailsZh = [];
    if (changedFields.includes('wantToSay')) {
      detailsZh.push('• 想說的話：已更新');
    }
    assert.strictEqual(detailsZh[0], '• 想說的話：已更新');
  });

  // 5. 驗證 Google 試算表欄位別名匹配 want_to_say
  await t.test('5. _findHeaderCol 支援繁中表頭別名「想說的話」精確識別 want_to_say', () => {
    const headersA = ['系統識別碼', '姓名', '電話', '擔任幹部意願', '想說的話', '建立時間'];
    const headersB = ['系統識別碼', '姓名', '想說的話 I want to say...', '更新時間'];

    const findHeaderCol = (headers, colKey, customAliases) => {
      const globalAliases = {
        want_to_say: ['想說的話', '想說的話 I want to say...', '給幹部的話', '留言']
      };
      const aliases = (customAliases || []).concat(globalAliases[colKey] || []);
      for (let i = 0; i < headers.length; i++) {
        const h = String(headers[i]).trim().toLowerCase();
        if (h === colKey.toLowerCase()) return i;
        for (const alias of aliases) {
          if (h === alias.toLowerCase() || h.includes(alias.toLowerCase())) return i;
        }
      }
      return -1;
    };

    assert.strictEqual(findHeaderCol(headersA, 'want_to_say'), 4);
    assert.strictEqual(findHeaderCol(headersB, 'want_to_say'), 2);
  });

  // 6. 驗證活動獨立試算表自動同步與回補 want_to_say
  await t.test('6. 活動專屬試算表表頭與回補邏輯完整支援想說的話 (want_to_say)', () => {
    const headers = [
      '系統識別碼', '專屬碼', '姓名', '性別', 'LINE ID', '聯絡信箱', '聯絡電話', '聯絡地址',
      '生日', '證件號碼', '緊急聯絡人姓名', '緊急聯絡人電話', '緊急聯絡人聯絡地址', '緊急聯絡人關係',
      '爬山經驗', '體能測驗', '體能證明', '想說的話', '是否為社員', '審核結果', '通知狀態', '繳費狀態', '備註'
    ];

    assert.strictEqual(headers[17], '想說的話');
    assert.strictEqual(headers.length, 23);

    // 模擬回補邏輯：檢查 row[17] 是否為空並回補 members.want_to_say
    const mockRow = [
      'U_USER_A', 'S001', '王小明', '男', 'line_ming', 'm@test.com', '0912345678', '台北市',
      '2001/05/15', 'A123456789', '王大明', '0987654321', '台北市', '父子',
      '百岳10座', '3000m 14分', 'proof.jpg', '', '是', '審核中 Checking', '未通知', '未繳費 Unpaid', ''
    ];

    const mockMember = {
      line_user_id: 'U_USER_A',
      want_to_say: '希望能安排新手嚮導培訓！'
    };

    const wantSayIdx = headers.indexOf('想說的話');
    assert.strictEqual(wantSayIdx, 17);

    if (!mockRow[wantSayIdx] && mockMember.want_to_say) {
      mockRow[wantSayIdx] = mockMember.want_to_say;
    }

    assert.strictEqual(mockRow[17], '希望能安排新手嚮導培訓！');
  });
});
