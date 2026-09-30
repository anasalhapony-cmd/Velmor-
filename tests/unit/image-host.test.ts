import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canOptimizeImage, supabaseHostFromEnv } from '@/lib/utils/image-host';

const HOST = 'abcd1234.supabase.co';

test('same-origin files go through the optimiser', () => {
  assert.equal(canOptimizeImage('/images/products/noir.webp', HOST), true);
  assert.equal(canOptimizeImage('/images/brand/hero-bottle.webp', null), true);
});

test('the project public bucket goes through the optimiser', () => {
  assert.equal(canOptimizeImage(`https://${HOST}/storage/v1/object/public/product-images/a/b.webp`, HOST), true);
});

test('anything else renders as a plain <img> (never an unconfigured-host error)', () => {
  // other host, other project, private/signed path, http, protocol-relative, junk
  assert.equal(canOptimizeImage('https://example.com/a.jpg', HOST), false);
  assert.equal(canOptimizeImage('https://other.supabase.co/storage/v1/object/public/x/y.webp', HOST), false);
  assert.equal(canOptimizeImage(`https://${HOST}/storage/v1/object/sign/x/y.webp?token=1`, HOST), false);
  assert.equal(canOptimizeImage(`http://${HOST}/storage/v1/object/public/x/y.webp`, HOST), false);
  assert.equal(canOptimizeImage('//evil.example/a.jpg', HOST), false);
  assert.equal(canOptimizeImage('javascript:alert(1)', HOST), false);
  assert.equal(canOptimizeImage('', HOST), false);
  assert.equal(canOptimizeImage(`https://${HOST}/storage/v1/object/public/x/y.webp`, null), false);
});

test('host is derived from NEXT_PUBLIC_SUPABASE_URL', () => {
  assert.equal(supabaseHostFromEnv('https://abcd1234.supabase.co'), 'abcd1234.supabase.co');
  assert.equal(supabaseHostFromEnv(undefined), null);
  assert.equal(supabaseHostFromEnv('not a url'), null);
});
