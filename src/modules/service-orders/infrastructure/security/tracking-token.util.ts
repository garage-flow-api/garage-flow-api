import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { DomainError } from '@common/errors/domain.error';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class InvalidTrackingTokenError extends DomainError {
  constructor() {
    super('Invalid tracking token');
  }
}

function getKey(): Buffer {
  const secret = process.env.TRACKING_TOKEN_SECRET;
  if (!secret) {
    throw new Error('TRACKING_TOKEN_SECRET is not defined');
  }
  return createHash('sha256').update(secret).digest();
}

export function generateTrackingToken(serviceOrderId: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(serviceOrderId, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString('base64url');
}

export function buildTrackingLink(baseUrl: string, serviceOrderId: string): string {
  const token = generateTrackingToken(serviceOrderId);
  return `${baseUrl}/service-orders/track/${token}`;
}

export function resolveTrackingToken(token: string): string {
  try {
    const payload = Buffer.from(token, 'base64url');
    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, getKey(), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new InvalidTrackingTokenError();
  }
}
