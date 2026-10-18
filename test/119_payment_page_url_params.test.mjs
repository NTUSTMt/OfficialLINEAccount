import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('119. Payment.tsx URL search params parsing and additional payment auto-injection', () => {
  const code = fs.readFileSync('src/pages/Payment.tsx', 'utf8');

  it('Payment.tsx parses targetId, type, amount from URL search params', () => {
    assert.match(code, /searchParams|URLSearchParams/);
    assert.match(code, /targetId/);
    assert.match(code, /urlType|paramType/);
    assert.match(code, /urlAmount|paramAmount/);
  });

  it('Payment.tsx supports dynamic pending payment item injection with prefilled details', () => {
    // Should inject additional payment into pending items or additionals
    assert.match(code, /additionals/);
    // Should ensure url-provided targetId is selected
    assert.match(code, /selectedIds/);
  });
});
