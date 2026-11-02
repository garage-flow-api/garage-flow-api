import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { ServiceOrdersModule } from '@service-orders/service-orders.module';
import { PrismaModule } from '@infra/database/prisma/prisma.module';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { JwtAuthGuard } from '@auth/infrastructure/security/jwt-auth.guard';
import { RolesGuard } from '@auth/infrastructure/security/roles.guard';
import { JwtStrategy } from '@auth/infrastructure/security/jwt.strategy';
import { NotificationGateway } from '@notification/application/notification.gateway';
import { buildSignature } from '@service-orders/infrastructure/security/webhook-signature.util';
import { truncateAllTables } from '../../../support/truncate-database';
import { makeFakeNotificationGateway } from '../../../support/fake-notification-gateway';

const WEBHOOK_SECRET = 'test-webhook-secret';

describe('BudgetWebhookController (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let vehicleId: string;
  const originalSecret = process.env.BUDGET_WEBHOOK_SECRET;

  beforeAll(async () => {
    process.env.BUDGET_WEBHOOK_SECRET = WEBHOOK_SECRET;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PrismaModule,
        ServiceOrdersModule,
        JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      providers: [JwtStrategy, JwtAuthGuard, RolesGuard],
    })
      .overrideProvider(NotificationGateway)
      .useValue(makeFakeNotificationGateway())
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    prisma = moduleRef.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    process.env.BUDGET_WEBHOOK_SECRET = originalSecret;
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);

    const client = await prisma.client.create({
      data: {
        cpfCnpj: '52998224725',
        name: 'Cliente Teste',
        address: 'Rua X',
        phone: '11999990000',
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        brand: 'Fiat',
        model: 'Uno',
        licensePlate: 'TST1234',
        year: 2020,
        clientId: client.id,
      },
    });
    vehicleId = vehicle.id;
  });

  const createServiceOrder = (status: 'AWAITING_APPROVAL' | 'RECEIVED' = 'AWAITING_APPROVAL') =>
    prisma.serviceOrder.create({
      data: { vehicleId, description: 'Ruído no motor', totalAmount: 0, status },
    });

  const sendDecision = (body: object, signature?: string) => {
    const rawBody = JSON.stringify(body);
    return request(app.getHttpServer())
      .post('/webhooks/budget-decision')
      .set('Content-Type', 'application/json')
      .set('X-Signature', signature ?? buildSignature(rawBody, WEBHOOK_SECRET))
      .send(rawBody);
  };

  const statusOf = async (id: string) =>
    (await prisma.serviceOrder.findUniqueOrThrow({ where: { id } })).status;

  it('aprova a OS com assinatura válida e leva para execução', async () => {
    const serviceOrder = await createServiceOrder();

    const response = await sendDecision({ serviceOrderId: serviceOrder.id, decision: 'APPROVED' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ processed: true });
    expect(await statusOf(serviceOrder.id)).toBe('AWAITING_EXECUTION');
    const saved = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: serviceOrder.id } });
    expect(saved.approvedAt).not.toBeNull();
  });

  it('recusa a OS com assinatura válida e cancela', async () => {
    const serviceOrder = await createServiceOrder();

    const response = await sendDecision({ serviceOrderId: serviceOrder.id, decision: 'REJECTED' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ processed: true });
    expect(await statusOf(serviceOrder.id)).toBe('CANCELED');
  });

  it('retorna 401 para assinatura inválida e não altera a OS', async () => {
    const serviceOrder = await createServiceOrder();

    const response = await sendDecision(
      { serviceOrderId: serviceOrder.id, decision: 'APPROVED' },
      'sha256=0000',
    );

    expect(response.status).toBe(401);
    expect(await statusOf(serviceOrder.id)).toBe('AWAITING_APPROVAL');
  });

  it('retorna 401 quando o corpo é adulterado depois de assinado', async () => {
    const serviceOrder = await createServiceOrder();
    const signedBody = JSON.stringify({ serviceOrderId: serviceOrder.id, decision: 'REJECTED' });

    const response = await request(app.getHttpServer())
      .post('/webhooks/budget-decision')
      .set('Content-Type', 'application/json')
      .set('X-Signature', buildSignature(signedBody, WEBHOOK_SECRET))
      .send(JSON.stringify({ serviceOrderId: serviceOrder.id, decision: 'APPROVED' }));

    expect(response.status).toBe(401);
    expect(await statusOf(serviceOrder.id)).toBe('AWAITING_APPROVAL');
  });

  it('retorna 401 sem o cabeçalho X-Signature', async () => {
    const serviceOrder = await createServiceOrder();

    const response = await request(app.getHttpServer())
      .post('/webhooks/budget-decision')
      .send({ serviceOrderId: serviceOrder.id, decision: 'APPROVED' });

    expect(response.status).toBe(401);
  });

  it('retorna 401 quando BUDGET_WEBHOOK_SECRET não está configurado', async () => {
    const serviceOrder = await createServiceOrder();
    delete process.env.BUDGET_WEBHOOK_SECRET;

    try {
      const response = await sendDecision({
        serviceOrderId: serviceOrder.id,
        decision: 'APPROVED',
      });

      expect(response.status).toBe(401);
    } finally {
      process.env.BUDGET_WEBHOOK_SECRET = WEBHOOK_SECRET;
    }
  });

  it('não muda nada ao receber a mesma decisão duas vezes', async () => {
    const serviceOrder = await createServiceOrder();
    const body = { serviceOrderId: serviceOrder.id, decision: 'APPROVED' };

    const first = await sendDecision(body);
    const approvedAt = (
      await prisma.serviceOrder.findUniqueOrThrow({ where: { id: serviceOrder.id } })
    ).approvedAt;
    const second = await sendDecision(body);

    expect(first.body).toEqual({ processed: true });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ processed: false });
    expect(await statusOf(serviceOrder.id)).toBe('AWAITING_EXECUTION');
    const after = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: serviceOrder.id } });
    expect(after.approvedAt).toEqual(approvedAt);
  });

  it('ignora uma decisão conflitante depois da primeira', async () => {
    const serviceOrder = await createServiceOrder();

    await sendDecision({ serviceOrderId: serviceOrder.id, decision: 'APPROVED' });
    const response = await sendDecision({ serviceOrderId: serviceOrder.id, decision: 'REJECTED' });

    expect(response.body).toEqual({ processed: false });
    expect(await statusOf(serviceOrder.id)).toBe('AWAITING_EXECUTION');
  });

  it('ignora a decisão de uma OS que ainda não aguarda aprovação', async () => {
    const serviceOrder = await createServiceOrder('RECEIVED');

    const response = await sendDecision({ serviceOrderId: serviceOrder.id, decision: 'APPROVED' });

    expect(response.body).toEqual({ processed: false });
    expect(await statusOf(serviceOrder.id)).toBe('RECEIVED');
  });

  it('com duas decisões simultâneas, só uma é aplicada', async () => {
    const serviceOrder = await createServiceOrder();

    const [approved, rejected] = await Promise.all([
      sendDecision({ serviceOrderId: serviceOrder.id, decision: 'APPROVED' }),
      sendDecision({ serviceOrderId: serviceOrder.id, decision: 'REJECTED' }),
    ]);

    const processed = [approved.body.processed, rejected.body.processed];
    expect(processed.filter(Boolean)).toHaveLength(1);
    expect(['AWAITING_EXECUTION', 'CANCELED']).toContain(await statusOf(serviceOrder.id));
  });

  it('retorna 404 para uma OS inexistente', async () => {
    const response = await sendDecision({
      serviceOrderId: '00000000-0000-0000-0000-000000000000',
      decision: 'APPROVED',
    });

    expect(response.status).toBe(404);
  });

  it('retorna 400 para um payload inválido com assinatura válida', async () => {
    const response = await sendDecision({ serviceOrderId: 'not-a-uuid', decision: 'MAYBE' });

    expect(response.status).toBe(400);
  });
});
