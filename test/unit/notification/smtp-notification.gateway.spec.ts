const mockSendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

import { SmtpNotificationGateway } from '@notification/infrastructure/smtp-notification.gateway';

describe('SmtpNotificationGateway', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
    process.env.SMTP_FROM = 'Garage Flow <teste@garageflow.local>';
  });

  it('envia o e-mail de status com remetente, destinatário e assunto', async () => {
    const gateway = new SmtpNotificationGateway();

    await gateway.sendStatusUpdate({
      to: 'cliente@example.com',
      recipientName: 'Maria',
      status: 'Execução',
      trackingLink: 'http://x/track',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Garage Flow <teste@garageflow.local>',
        to: 'cliente@example.com',
        subject: expect.stringContaining('Execução'),
      }),
    );
  });

  it('propaga a falha do SMTP para quem chamou decidir o que fazer', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP indisponível'));
    const gateway = new SmtpNotificationGateway();

    await expect(
      gateway.sendBudget({
        to: 'cliente@example.com',
        recipientName: 'Maria',
        lines: [],
        totalAmount: 0,
        approveUrl: 'a',
        rejectUrl: 'r',
        trackingLink: 't',
      }),
    ).rejects.toThrow('SMTP indisponível');
  });
});
