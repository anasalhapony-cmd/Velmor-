import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storagePathFromPublicUrl } from '@/lib/admin/storage-path';

const HOST = 'abcd1234.supabase.co';
const B = 'product-images';
const base = `https://${HOST}/storage/v1/object/public/${B}`;

test('maps a public URL of this project / bucket to its object path', () => {
  assert.equal(storagePathFromPublicUrl(`${base}/3f2b/aa11.webp`, HOST, B), '3f2b/aa11.webp');
  assert.equal(storagePathFromPublicUrl(`${base}/a%20b/c.jpg`, HOST, B), 'a b/c.jpg');
});

test('refuses other hosts, buckets, schemes and non-storage paths', () => {
  assert.equal(storagePathFromPublicUrl(`https://evil.example/storage/v1/object/public/${B}/x.webp`, HOST, B), null);
  assert.equal(storagePathFromPublicUrl(`https://${HOST}/storage/v1/object/public/other/x.webp`, HOST, B), null);
  assert.equal(storagePathFromPublicUrl(`http://${HOST}/storage/v1/object/public/${B}/x.webp`, HOST, B), null);
  assert.equal(storagePathFromPublicUrl(`https://${HOST}/images/x.webp`, HOST, B), null);
  assert.equal(storagePathFromPublicUrl('/images/products/noir.webp', HOST, B), null, 'bundled site images are never touched');
});

test('refuses traversal, empty and malformed paths', () => {
  assert.equal(storagePathFromPublicUrl(`${base}/../other/x.webp`, HOST, B), null);
  // The URL parser resolves dot-segments (also when percent-encoded) BEFORE we look at the
  // prefix, so an attempt to climb out of the bucket no longer starts with it → refused.
  assert.equal(storagePathFromPublicUrl(`${base}/%2e%2e/other/x.webp`, HOST, B), null);
  assert.equal(storagePathFromPublicUrl(`${base}/a/%2e%2e/%2e%2e/other/x.webp`, HOST, B), null);
  // A dot-segment that stays inside the bucket resolves to the same object the URL really serves.
  assert.equal(storagePathFromPublicUrl(`${base}/a/%2e%2e/x.webp`, HOST, B), 'x.webp');
  assert.equal(storagePathFromPublicUrl(`${base}/a//x.webp`, HOST, B), null);
  assert.equal(storagePathFromPublicUrl(`${base}/`, HOST, B), null);
  assert.equal(storagePathFromPublicUrl(`${base}/%E0%A4%A`, HOST, B), null);
  assert.equal(storagePathFromPublicUrl('not a url', HOST, B), null);
  assert.equal(storagePathFromPublicUrl('', HOST, B), null);
});

test('without a configured Supabase host nothing is ever deleted', () => {
  assert.equal(storagePathFromPublicUrl(`${base}/x.webp`, null, B), null);
});
