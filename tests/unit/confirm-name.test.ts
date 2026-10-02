import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmNameMatches, normalizeConfirmName } from '@/lib/admin/confirm-name';

test('normalises like the SQL function: trim, collapse spaces, lower-case', () => {
  assert.equal(normalizeConfirmName('  Noir   Absolu '), 'noir absolu');
  assert.equal(normalizeConfirmName('عود\t  ملكي'), 'عود ملكي');
  assert.equal(normalizeConfirmName(null), '');
});

test('matches the Arabic or the Latin name, ignoring case and extra spaces', () => {
  assert.equal(confirmNameMatches('عود ملكي', 'عود ملكي', 'Royal Oud'), true);
  assert.equal(confirmNameMatches('  royal   OUD ', 'عود ملكي', 'Royal Oud'), true);
});

test('does not match a different, partial or empty name', () => {
  assert.equal(confirmNameMatches('عود', 'عود ملكي', 'Royal Oud'), false);
  assert.equal(confirmNameMatches('Royal Oud 2', 'عود ملكي', 'Royal Oud'), false);
  assert.equal(confirmNameMatches('', 'عود ملكي'), false);
  assert.equal(confirmNameMatches('   ', '', null, undefined), false, 'blank never matches blank');
});

test('an empty accepted name is never matched by typing nothing', () => {
  assert.equal(confirmNameMatches('', ''), false);
  assert.equal(confirmNameMatches('x', null, undefined, ''), false);
});
