import { createHmac, timingSafeEqual } from 'node:crypto';

export type BudgetDecisionAction = 'approve' | 'reject';

export interface BudgetDecisionTokenPayload {
  serviceOrderId: string;
  action: BudgetDecisionAction;
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signingKey(): Buffer {
  const secret = process.env.TRACKING_TOKEN_SECRET;
  if (!secret) throw new Error('TRACKING_TOKEN_SECRET is not configured');
  // chave derivada com rótulo de propósito: o token de acompanhamento não serve aqui
  return createHmac('sha256', secret).update('budget-decision-token:v1').digest();
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export function generateBudgetDecisionToken(
  serviceOrderId: string,
  action: BudgetDecisionAction,
  now: number = Date.now(),
): string {
  const body = { id: serviceOrderId, a: action, exp: now + TOKEN_TTL_MS };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyBudgetDecisionToken(
  token: string,
  now: number = Date.now(),
): BudgetDecisionTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;

  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      id?: unknown;
      a?: unknown;
      exp?: unknown;
    };
    if (typeof body.id !== 'string' || typeof body.exp !== 'number' || body.exp <= now) return null;
    if (body.a !== 'approve' && body.a !== 'reject') return null;
    return { serviceOrderId: body.id, action: body.a };
  } catch {
    return null;
  }
}

export function buildBudgetDecisionLink(
  baseUrl: string,
  serviceOrderId: string,
  action: BudgetDecisionAction,
): string {
  return `${baseUrl}/budget-decisions/${generateBudgetDecisionToken(serviceOrderId, action)}`;
}
