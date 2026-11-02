import { generateTrackingToken } from '@service-orders/infrastructure/security/tracking-token.util';
import {
  buildBudgetDecisionLink,
  generateBudgetDecisionToken,
  verifyBudgetDecisionToken,
} from '@service-orders/infrastructure/security/budget-decision-token.util';

describe('budget-decision-token.util', () => {
  const id = crypto.randomUUID();

  beforeAll(() => {
    process.env.TRACKING_TOKEN_SECRET = 'test-secret-for-budget-decision';
  });

  it('deve validar o token gerado e devolver OS e ação', () => {
    const token = generateBudgetDecisionToken(id, 'approve');

    expect(verifyBudgetDecisionToken(token)).toEqual({ serviceOrderId: id, action: 'approve' });
  });

  it('deve distinguir aprovar de recusar', () => {
    const token = generateBudgetDecisionToken(id, 'reject');

    expect(verifyBudgetDecisionToken(token)?.action).toBe('reject');
  });

  it('deve rejeitar token expirado', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const token = generateBudgetDecisionToken(id, 'approve', eightDaysAgo);

    expect(verifyBudgetDecisionToken(token)).toBeNull();
  });

  it('deve rejeitar assinatura adulterada', () => {
    const [payload] = generateBudgetDecisionToken(id, 'approve').split('.');

    expect(verifyBudgetDecisionToken(`${payload}.assinatura-falsa`)).toBeNull();
  });

  it('deve rejeitar payload adulterado (trocar approve por reject)', () => {
    const [, signature] = generateBudgetDecisionToken(id, 'approve').split('.');
    const forged = Buffer.from(
      JSON.stringify({ id, a: 'reject', exp: Date.now() + 100000 }),
    ).toString('base64url');

    expect(verifyBudgetDecisionToken(`${forged}.${signature}`)).toBeNull();
  });

  it.each(['', 'abc', 'a.b.c'])('deve rejeitar token malformado: "%s"', (token) => {
    expect(verifyBudgetDecisionToken(token)).toBeNull();
  });

  it('não deve aceitar o token de acompanhamento como token de decisão', () => {
    expect(verifyBudgetDecisionToken(generateTrackingToken(id))).toBeNull();
  });

  it('deve montar o link com a URL base', () => {
    const link = buildBudgetDecisionLink('http://localhost:3000', id, 'approve');

    expect(link).toMatch(/^http:\/\/localhost:3000\/budget-decisions\/.+\..+$/);
  });

  it('retorna null, sem lançar erro, quando o segredo não está configurado', () => {
    const token = generateBudgetDecisionToken('so-1', 'approve');
    const secret = process.env.TRACKING_TOKEN_SECRET;
    delete process.env.TRACKING_TOKEN_SECRET;

    try {
      expect(verifyBudgetDecisionToken(token)).toBeNull();
    } finally {
      process.env.TRACKING_TOKEN_SECRET = secret;
    }
  });
});
