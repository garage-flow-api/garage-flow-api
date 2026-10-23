import { createHmac } from 'node:crypto';
import {
  buildSignature,
  isValidSignature,
} from '@service-orders/infrastructure/security/webhook-signature.util';

describe('webhook-signature.util', () => {
  const secret = 'test-secret';
  const body = JSON.stringify({ serviceOrderId: 'id', decision: 'APPROVED' });

  it('gera sha256=<hex do HMAC do corpo>', () => {
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

    expect(buildSignature(body, secret)).toBe(expected);
  });

  it('aceita uma assinatura válida', () => {
    expect(isValidSignature(body, buildSignature(body, secret), secret)).toBe(true);
  });

  it('rejeita assinatura de outro segredo, de outro corpo, sem cabeçalho e de tamanho diferente', () => {
    expect(isValidSignature(body, buildSignature(body, 'other-secret'), secret)).toBe(false);
    expect(isValidSignature('{}', buildSignature(body, secret), secret)).toBe(false);
    expect(isValidSignature(body, undefined, secret)).toBe(false);
    expect(isValidSignature(body, 'sha256=abc', secret)).toBe(false);
  });
});
