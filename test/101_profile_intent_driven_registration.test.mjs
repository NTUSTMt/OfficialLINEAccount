import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Profile Intent-Driven Registration & Dynamic Required Validation', () => {
  const registerPath = path.resolve('src/pages/Register.tsx');
  const zhPath = path.resolve('src/locales/zh.json');
  const enPath = path.resolve('src/locales/en.json');

  const registerContent = fs.readFileSync(registerPath, 'utf-8');
  const zhContent = fs.readFileSync(zhPath, 'utf-8');
  const enContent = fs.readFileSync(enPath, 'utf-8');

  it('Register.tsx should support Step 0 and intent types', () => {
    assert.ok(registerContent.includes("type ProfileIntent = 'activity' | 'gear' | 'payment' | 'browse';"));
    assert.ok(registerContent.includes("selectedIntents.includes('activity')"));
    assert.ok(registerContent.includes("selectedIntents.includes('gear')"));
    assert.ok(registerContent.includes("selectedIntents.includes('payment')"));
    assert.ok(registerContent.includes("selectedIntents.includes('browse')"));
  });

  it('Step indicator should have 5 steps (0, 1, 2, 3, 4)', () => {
    assert.ok(registerContent.includes('[0, 1, 2, 3, 4].map'));
    assert.ok(registerContent.includes('t(\'register.steps.purpose\''));
    assert.ok(registerContent.includes('t(\'register.steps.required\''));
    assert.ok(registerContent.includes('t(\'register.steps.basic\''));
    assert.ok(registerContent.includes('t(\'register.steps.safety\''));
    assert.ok(registerContent.includes('t(\'register.steps.experience\''));
  });

  it('Dynamic required classes should be correctly wired to isActivity and isBrowse', () => {
    assert.ok(registerContent.includes('const isActivity = selectedIntents.includes(\'activity\');'));
    assert.ok(registerContent.includes('const isBrowse = selectedIntents.includes(\'browse\');'));
    assert.ok(registerContent.includes('className={!isBrowse ? "required" : ""}'));
    assert.ok(registerContent.includes('className={isActivity ? "required" : ""}'));
    assert.ok(registerContent.includes('className={isActivity ? "required" : ""}>{t(\'register.step2.medicalHistoryLabel\')}'));
    assert.ok(registerContent.includes('className={isActivity ? "required" : ""} style={{ display: \'block\', marginBottom: \'4px\', fontWeight: 600 }}>\n                {t(\'register.step4.uploadProofLabel\')}'));
  });

  it('Submit validation enforces medicalHistory and totalProofsCount for activity intent', () => {
    assert.ok(registerContent.includes('formData.medicalHistory.trim() !== \'\''));
    assert.ok(registerContent.includes('totalProofsCount > 0'));
    assert.ok(registerContent.includes('setStep(1);'));
    assert.ok(registerContent.includes('register.alert.fillStep1Required'));
    assert.ok(registerContent.includes('setStep(2);'));
    assert.ok(registerContent.includes('register.alert.fillStep2Required'));
    assert.ok(registerContent.includes('setStep(3);'));
    assert.ok(registerContent.includes('register.alert.fillStep3Required'));
    assert.ok(registerContent.includes('setStep(4);'));
    assert.ok(registerContent.includes('register.alert.fillStep4Required'));
    assert.ok(registerContent.includes('register.alert.uploadProofRequired'));
    assert.ok(registerContent.includes('register.alert.agreePrivacy'));
  });

  it('Privacy consent box should be placed after willingness and wantToSay in Step 4', () => {
    const wantToSayIndex = registerContent.indexOf('name="wantToSay"');
    const privacyIndex = registerContent.indexOf('className="privacy-consent-box"');
    assert.ok(wantToSayIndex > 0, 'wantToSay field must exist');
    assert.ok(privacyIndex > 0, 'privacy-consent-box must exist');
    assert.ok(privacyIndex > wantToSayIndex, 'privacy-consent-box must be placed after wantToSay in Step 4');
  });

  it('Localization files should include purpose step and intent translations', () => {
    const zh = JSON.parse(zhContent);
    const en = JSON.parse(enContent);

    assert.strictEqual(zh.register.steps.purpose, '目的');
    assert.strictEqual(en.register.steps.purpose, 'Purpose');

    assert.ok(zh.register.intent.activity);
    assert.ok(zh.register.intent.gear);
    assert.ok(zh.register.intent.payment);
    assert.ok(zh.register.intent.browse);

    assert.ok(en.register.intent.activity);
    assert.ok(en.register.intent.gear);
    assert.ok(en.register.intent.payment);
    assert.ok(en.register.intent.browse);

    assert.ok(zh.register.alert.uploadProofRequired);
    assert.ok(en.register.alert.uploadProofRequired);
  });

  it('No emojis should be present in Register.tsx or test files', () => {
    const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;
    assert.strictEqual(emojiRegex.test(registerContent), false, 'Register.tsx must not contain emoji');
  });
});
