// crypto.randomUUID exists only in secure contexts (HTTPS or localhost). The
// server reader is opened over plain HTTP on the LAN, where the upstream
// highlight code would throw on every text selection, so fill it in from
// getRandomValues, which works everywhere.
type Bytes = Uint8Array<ArrayBuffer>;
type RandomSource = (bytes: Bytes) => Bytes;

export function uuidV4(random: RandomSource): string {
  const bytes = random(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type CryptoLike = Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string };

export function ensureRandomUUID(target: CryptoLike) {
  if (typeof target.randomUUID === 'function') return;
  target.randomUUID = () => uuidV4((bytes) => target.getRandomValues(bytes));
}
