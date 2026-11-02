import {
  renderBudgetEmail,
  renderStatusUpdateEmail,
} from '@notification/infrastructure/email-templates';

describe('email-templates', () => {
  it('o e-mail de status traz o status e o link de acompanhamento', () => {
    const email = renderStatusUpdateEmail({
      to: 'a@b.com',
      recipientName: 'Maria',
      status: 'Diagnóstico',
      trackingLink: 'http://localhost:3000/service-orders/track/abc',
    });

    expect(email.subject).toContain('Diagnóstico');
    expect(email.html).toContain('http://localhost:3000/service-orders/track/abc');
    expect(email.text).toContain('Maria');
  });

  it('escapa HTML no nome do cliente', () => {
    const email = renderStatusUpdateEmail({
      to: 'a@b.com',
      recipientName: '<script>alert(1)</script>',
      status: 'Recebida',
      trackingLink: 'http://x',
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('rejeita protocolo não seguro no link de acompanhamento', () => {
    expect(() =>
      renderStatusUpdateEmail({
        to: 'a@b.com',
        recipientName: 'Maria',
        status: 'Recebida',
        trackingLink: 'javascript:alert(1)',
      }),
    ).toThrow('Only HTTP and HTTPS URLs are allowed');
  });

  it('o e-mail de orçamento traz itens, total e os links de aprovar e recusar', () => {
    const email = renderBudgetEmail({
      to: 'a@b.com',
      recipientName: 'Maria',
      lines: [{ description: 'Troca de óleo', amount: 150 }],
      totalAmount: 150,
      approveUrl: 'http://x/approve',
      rejectUrl: 'http://x/reject',
      trackingLink: 'http://x/track',
    });

    expect(email.html).toContain('Troca de óleo');
    expect(email.html).toContain('http://x/approve');
    expect(email.html).toContain('http://x/reject');
    expect(email.text).toContain('Total:');
  });

  it.each(['approveUrl', 'rejectUrl', 'trackingLink'] as const)(
    'rejeita protocolo não seguro em %s',
    (field) => {
      const notification = {
        to: 'a@b.com',
        recipientName: 'Maria',
        lines: [{ description: 'Troca de óleo', amount: 150 }],
        totalAmount: 150,
        approveUrl: 'https://example.com/approve',
        rejectUrl: 'https://example.com/reject',
        trackingLink: 'https://example.com/track',
      };
      notification[field] = 'data:text/html,<script>alert(1)</script>';

      expect(() => renderBudgetEmail(notification)).toThrow('Only HTTP and HTTPS URLs are allowed');
    },
  );
});
