import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureRandomUUID, uuidV4 } from '../client/random-uuid.ts';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fill = (byte) => (bytes) => bytes.fill(byte);

test('formats random bytes as an RFC 4122 version 4 UUID', () => {
  assert.equal(uuidV4(fill(0xff)), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(uuidV4(fill(0x00)), '00000000-0000-4000-8000-000000000000');
  assert.match(uuidV4((bytes) => crypto.getRandomValues(bytes)), V4);
});

test('adds randomUUID when the page is not a secure context', () => {
  const target = { getRandomValues: (bytes) => crypto.getRandomValues(bytes) };
  ensureRandomUUID(target);
  const first = target.randomUUID();
  assert.match(first, V4);
  assert.notEqual(target.randomUUID(), first);
});

test('keeps the native randomUUID when one exists', () => {
  const native = () => 'native';
  const target = { getRandomValues: () => {}, randomUUID: native };
  ensureRandomUUID(target);
  assert.equal(target.randomUUID, native);
});
