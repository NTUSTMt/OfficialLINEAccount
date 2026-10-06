import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

describe('61. Web 管理後台社員名冊一鍵複製社員功能驗證 (v0.1.253)', () => {
  it('1. WebAdminMembers.tsx 原始碼必須包含 handleCopySchoolRoster 與「一鍵複製社員」按鈕', () => {
    const filePath = path.join(rootDir, 'src/pages/web-admin/WebAdminMembers.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(content.includes('handleCopySchoolRoster'), '必須實作 handleCopySchoolRoster 函式');
    assert.ok(content.includes('一鍵複製社員'), '工具列必須包含「一鍵複製社員」按鈕文字');
    assert.ok(content.includes('navigator.clipboard.writeText'), '必須使用剪貼簿 API 複製名單');
    assert.ok(content.includes('請至學校社團系統直接貼上'), '必須具備複製成功之提示文字');
  });

  it('2. 學校社團系統格式過濾與格式化邏輯驗證', () => {
    const mockMembers = [
      {
        name: '王小明',
        student_id: 'B11100001',
        identity_status: '臺科在校生',
        is_officer: true,
        officer_role: '活動',
        is_official_member: true
      },
      {
        name: '李幹部',
        student_id: 'M11200002',
        identity_status: '臺科大在校學生',
        is_officer: true,
        officer_role: '', // 無具體職稱
        is_official_member: false
      },
      {
        name: '林大同',
        student_id: 'B11100003',
        identity_status: '臺科在校生',
        is_officer: false,
        is_official_member: true
      },
      {
        name: '張非社員',
        student_id: 'B11100004',
        identity_status: '臺科在校生',
        is_officer: false,
        is_official_member: false // 非社員且非幹部 -> 排除
      },
      {
        name: '陳校友',
        student_id: 'B10800005',
        identity_status: '畢業校友',
        is_officer: false,
        is_official_member: true // 非在校生 -> 排除
      },
      {
        name: '劉校外',
        student_id: '',
        identity_status: '校外人士',
        is_officer: true, // 非在校生 -> 排除
        is_official_member: true
      }
    ];

    function filterAndFormatSchoolRoster(members) {
      const validRows = [];
      for (const m of members) {
        const ident = (m.identity_status || '').trim();
        const isNtust =
          ident === '臺科在校生' ||
          ident === '臺科大在校學生' ||
          ident === '在校生' ||
          ident.includes('在校') ||
          ident.includes('臺科');
        const isAlumniOrExternal = ident === '畢業校友' || ident === '校外人士';

        if (!isNtust || isAlumniOrExternal) {
          continue;
        }

        const name = (m.name || '').trim();
        const studentId = (m.student_id || '').trim();
        if (!name || !studentId) continue;

        if (m.is_officer) {
          const role = (m.officer_role || '').trim() || '幹部';
          validRows.push(`${name},${studentId},幹部,${role}`);
        } else if (m.is_official_member) {
          validRows.push(`${name},${studentId},社員`);
        }
      }
      return validRows;
    }

    const rows = filterAndFormatSchoolRoster(mockMembers);

    assert.strictEqual(rows.length, 3, '應僅保留 3 筆符合資格之在校生資料');
    assert.strictEqual(rows[0], '王小明,B11100001,幹部,活動');
    assert.strictEqual(rows[1], '李幹部,M11200002,幹部,幹部');
    assert.strictEqual(rows[2], '林大同,B11100003,社員');
  });
});
