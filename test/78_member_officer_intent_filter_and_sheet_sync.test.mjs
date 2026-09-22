import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('78. 社員幹部意願篩選、個人資料編輯元件與獨立試算表欄位動態同步驗證', () => {
  it('1. AdminMemberListItem 與 supabaseClient 必須完整包含 officer_intent 欄位', () => {
    const adminTypesPath = path.join(rootDir, 'src', 'types', 'admin.ts');
    const adminTypesContent = fs.readFileSync(adminTypesPath, 'utf8');

    assert.ok(
      adminTypesContent.includes('officer_intent?: string | null;'),
      'AdminMemberListItem 必須宣告 officer_intent 欄位'
    );

    const sbClientPath = path.join(rootDir, 'src', 'utils', 'supabaseClient.ts');
    const sbClientContent = fs.readFileSync(sbClientPath, 'utf8');

    assert.ok(
      sbClientContent.includes('officer_intent') &&
      sbClientContent.includes('fetchAdminMembersFromSupabase'),
      'fetchAdminMembersFromSupabase 直讀備援必須 select officer_intent'
    );
  });

  it('2. AdminMembers.tsx 必須具備幹部意願篩選器、過濾運算與卡片標籤', () => {
    const adminMembersPath = path.join(rootDir, 'src', 'pages', 'AdminMembers.tsx');
    const adminMembersContent = fs.readFileSync(adminMembersPath, 'utf8');

    assert.ok(
      adminMembersContent.includes("key: 'officerIntent'") &&
      adminMembersContent.includes("label: '幹部意願'"),
      'filters 必須包含幹部意願 FilterGroup'
    );

    assert.ok(
      adminMembersContent.includes("officerIntentFilter !== 'all'") &&
      adminMembersContent.includes("hasIntent === wantYes"),
      'filteredMembers 必須依據 officerIntentFilter 進行正確過濾'
    );

    assert.ok(
      adminMembersContent.includes("m.officer_intent") &&
      adminMembersContent.includes('幹部意願'),
      '卡片標籤必須在第一行呈現幹部意願'
    );
  });

  it('3. MemberDetailEdit.tsx 必須在正式社員身分正下方包含擔任幹部意願編輯勾選框', () => {
    const editPath = path.join(rootDir, 'src', 'pages', 'MemberDetailEdit.tsx');
    const editContent = fs.readFileSync(editPath, 'utf8');

    const officialIdx = editContent.indexOf('>正式社員身分<');
    const intentIdx = editContent.indexOf('>擔任幹部意願<');

    assert.ok(officialIdx > -1, '必須存在正式社員身分區塊');
    assert.ok(intentIdx > -1, '必須存在擔任幹部意願區塊');
    assert.ok(intentIdx > officialIdx, '擔任幹部意願必須位於正式社員身分下方');

    assert.ok(
      editContent.includes("handleFieldChange('officer_intent', e.target.checked ? '我有意願成為社團幹部' : '')"),
      '勾選時必須將 officer_intent 設為「我有意願成為社團幹部」，取消時清空'
    );
  });

  it('4. MemberProfileModal.tsx 必須具備幹部意願標籤呈現', () => {
    const modalPath = path.join(rootDir, 'src', 'components', 'admin', 'MemberProfileModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    assert.ok(
      modalContent.includes('hasOfficerIntent') &&
      modalContent.includes('幹部意願'),
      'MemberProfileModal 必須解析 officer_intent 並顯示幹部意願徽章'
    );
  });

  it('5. gas.js 必須支援獨立試算表自動擴充與回補擔任幹部意願欄位', () => {
    const gasPath = path.join(rootDir, 'src', 'gas.js');
    const gasContent = fs.readFileSync(gasPath, 'utf8');

    assert.ok(
      gasContent.includes('"擔任幹部意願"') &&
      gasContent.includes('_handleCreateEventSheet'),
      '_handleCreateEventSheet 初始化表頭必須包含擔任幹部意願'
    );

    assert.ok(
      gasContent.includes('officerIntent: officerIntentCol') &&
      gasContent.includes('colMap.officerIntent'),
      '_backfillEventSpreadsheetMemberInfo 必須支援 officerIntent colMap'
    );

    assert.ok(
      gasContent.includes('sheet.getRange(r + 1, colMap.officerIntent + 1).setValue'),
      '既有列迴圈必須回補隊員擔任幹部意願'
    );

    assert.ok(
      gasContent.includes('setCell(colMap.officerIntent, newIntentVal)'),
      '追加新列迴圈必須寫入隊員擔任幹部意願'
    );
  });
});
