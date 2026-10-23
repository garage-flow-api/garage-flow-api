import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

export function buildSignature(rawBody: Buffer | string, secret: string): string {
  return SIGNATURE_PREFIX + createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function isValidSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
): boolean {
  const expected = Buffer.from(buildSignature(rawBody, secret));
  const received = Buffer.from(header ?? '');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
