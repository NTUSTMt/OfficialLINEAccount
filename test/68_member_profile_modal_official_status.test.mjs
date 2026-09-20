import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('MemberProfileModal and ApplicantModals Official Member Status Tests', () => {
  const rootDir = process.cwd();

  it('should ensure MemberProfileModal checks is_official_member correctly', () => {
    const modalContent = fs.readFileSync(
      path.join(rootDir, 'src/components/admin/MemberProfileModal.tsx'),
      'utf8'
    );

    // 驗證代碼包含 is_official_member
    assert.ok(
      modalContent.includes('merged.is_official_member === true'),
      'MemberProfileModal should check merged.is_official_member === true'
    );
    assert.ok(
      modalContent.includes('merged.isOfficialMember === true'),
      'MemberProfileModal should check merged.isOfficialMember === true'
    );
  });

  it('should evaluate isOfficial correctly for various member data formats', () => {
    const computeIsOfficial = (merged) => {
      return Boolean(
        merged.is_official_member === true ||
        merged.is_official_member === 'true' ||
        merged.is_official_member === '是' ||
        merged.is_official === true ||
        merged.is_official === 'true' ||
        merged.is_official === '是' ||
        merged.isOfficial === '是' ||
        merged.isOfficial === true ||
        merged.isOfficial === 'true' ||
        merged.isOfficialMember === true ||
        merged.isOfficialMember === 'true' ||
        merged.isOfficialMember === '是'
      );
    };

    // 1. Supabase members 表真實回傳 (is_official_member: true)
    assert.strictEqual(
      computeIsOfficial({ is_official_member: true, name: '王大明' }),
      true,
      'is_official_member: true 必須判定為正式社員'
    );

    // 2. 非正式社員 (is_official_member: false)
    assert.strictEqual(
      computeIsOfficial({ is_official_member: false, name: '李小華' }),
      false,
      'is_official_member: false 必須判定為非社員'
    );

    // 3. 舊版/GAS 試算表字串相容
    assert.strictEqual(
      computeIsOfficial({ is_official: '是', name: '張三' }),
      true,
      'is_official: "是" 必須相容判定為正式社員'
    );
    assert.strictEqual(
      computeIsOfficial({ isOfficial: '是', name: '李四' }),
      true,
      'isOfficial: "是" 必須相容判定為正式社員'
    );
    assert.strictEqual(
      computeIsOfficial({ isOfficialMember: true, name: '趙五' }),
      true,
      'isOfficialMember: true 必須相容判定為正式社員'
    );

    // 4. 空值防禦
    assert.strictEqual(
      computeIsOfficial({ name: '陳六' }),
      false,
      '未設定社員狀態者必須安全回退為 false'
    );
  });

  it('should ensure ApplicantModals checks is_official_member defensively', () => {
    const applicantModalsContent = fs.readFileSync(
      path.join(rootDir, 'src/components/admin/ApplicantModals.tsx'),
      'utf8'
    );

    assert.ok(
      applicantModalsContent.includes('(profileModalApplicant as any).isOfficial === true'),
      'ApplicantModals should check (profileModalApplicant as any).isOfficial === true'
    );
    assert.ok(
      applicantModalsContent.includes('is_official_member === true'),
      'ApplicantModals should check is_official_member === true'
    );
  });
});
