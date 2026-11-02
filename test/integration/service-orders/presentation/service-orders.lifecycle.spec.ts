import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { type Prisma } from '@generated/prisma/client';
import { ServiceOrdersModule } from '@service-orders/service-orders.module';
import { NotificationGateway } from '@notification/application/notification.gateway';
import { PrismaModule } from '@infra/database/prisma/prisma.module';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { JwtAuthGuard } from '@auth/infrastructure/security/jwt-auth.guard';
import { RolesGuard } from '@auth/infrastructure/security/roles.guard';
import { JwtStrategy } from '@auth/infrastructure/security/jwt.strategy';
import { truncateAllTables } from '../../../support/truncate-database';

type OrderStatus = NonNullable<Prisma.ServiceOrderUncheckedCreateInput['status']>;

describe('ServiceOrdersController lifecycle (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let clientId: string;
  let clientCpfCnpj: string;
  let licensePlate: string;
  let serviceId: string;
  let partId: string;
  let mechanicId: string;

  const gateway = {
    sendStatusUpdate: jest.fn().mockResolvedValue(undefined),
    sendBudget: jest.fn().mockResolvedValue(undefined),
  };

  const admin = () => `Bearer ${jwtService.sign({ sub: 'admin-id', role: 'ADMIN' })}`;
  const mechanic = () => `Bearer ${jwtService.sign({ sub: mechanicId, role: 'MECHANIC' })}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PrismaModule,
        ServiceOrdersModule,
        JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      providers: [JwtStrategy, JwtAuthGuard, RolesGuard],
    })
      .overrideProvider(NotificationGateway)
      .useValue(gateway)
      .compile();

    app = moduleRef.createNestApplication();
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
    jwtService = moduleRef.get(JwtService);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await truncateAllTables(prisma);

    const client = await prisma.client.create({
      data: {
        cpfCnpj: '52998224725',
        name: 'Cliente Teste',
        address: 'Rua X',
        phone: '11999990000',
        email: 'cliente@teste.com',
      },
    });
    clientId = client.id;
    clientCpfCnpj = client.cpfCnpj;

    const vehicle = await prisma.vehicle.create({
      data: { brand: 'Fiat', model: 'Uno', licensePlate: 'TST1234', year: 2020, clientId },
    });
    licensePlate = vehicle.licensePlate;

    serviceId = (await prisma.service.create({ data: { name: 'Troca de óleo', price: 100 } })).id;
    partId = (
      await prisma.inventory.create({
        data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10 },
      })
    ).id;
    mechanicId = (
      await prisma.user.create({
        data: {
          name: 'Mecânico Teste',
          email: 'mecanico@teste.com',
          passwordHash: 'hash',
          role: 'MECHANIC',
        },
      })
    ).id;
  });

  const openOrder = async (): Promise<string> => {
    const response = await http()
      .post('/service-orders')
      .set('Authorization', admin())
      .send({
        client: { cpfCnpj: clientCpfCnpj },
        vehicle: { licensePlate },
        description: 'Ruído',
      })
      .expect(201);
    return response.body.id as string;
  };

  const act = (id: string, action: string, authorization: string) =>
    http().patch(`/service-orders/${id}/${action}`).set('Authorization', authorization);

  const toAwaitingApproval = async (id: string): Promise<void> => {
    await act(id, 'start-diagnosis', mechanic()).expect(200);
    await http()
      .patch(`/service-orders/${id}/add-services-and-parts`)
      .set('Authorization', mechanic())
      .send({ services: [{ serviceId }], parts: [{ inventoryId: partId, quantity: 2 }] })
      .expect(200);
    await act(id, 'budget', admin()).expect(200);
  };

  const statusInDb = async (id: string): Promise<string> =>
    (await prisma.serviceOrder.findUniqueOrThrow({ where: { id } })).status;

  const stockInDb = async (): Promise<number> =>
    Number((await prisma.inventory.findUniqueOrThrow({ where: { id: partId } })).quantity);

  describe('transições de status e estoque', () => {
    it('percorre o ciclo completo até a entrega', async () => {
      const id = await openOrder();
      await toAwaitingApproval(id);
      expect(await statusInDb(id)).toBe('AWAITING_APPROVAL');

      const approved = await act(id, 'approve-budget', admin());
      expect(approved.status).toBe(200);
      expect(approved.body.status).toBe('AWAITING_EXECUTION');

      const started = await act(id, 'start-service', mechanic());
      expect(started.status).toBe(200);
      expect(started.body.status).toBe('IN_EXECUTION');

      const finished = await act(id, 'finish-service', mechanic());
      expect(finished.status).toBe(200);
      expect(finished.body.status).toBe('FINISHED');

      const delivered = await act(id, 'deliver', admin());
      expect(delivered.status).toBe(200);
      expect(delivered.body.status).toBe('DELIVERED');
    });

    it('baixa o estoque físico somente ao finalizar o serviço', async () => {
      const id = await openOrder();
      await toAwaitingApproval(id);
      await act(id, 'approve-budget', admin());
      await act(id, 'start-service', mechanic());

      expect(await stockInDb()).toBe(10);

      await act(id, 'finish-service', mechanic());

      expect(await stockInDb()).toBe(8); // 2 unidades da OS
    });

    it('cancela a OS aguardando aprovação sem mexer no estoque físico', async () => {
      const id = await openOrder();
      await toAwaitingApproval(id);

      const response = await act(id, 'cancel-service', admin());

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('CANCELED');
      expect(await stockInDb()).toBe(10);
    });

    it('não aprova o orçamento de uma OS que não aguarda aprovação', async () => {
      const id = await openOrder();

      const response = await act(id, 'approve-budget', admin());

      expect(response.status).toBe(422);
      expect(await statusInDb(id)).toBe('RECEIVED');
    });

    it.each([
      ['approve-budget', 'admin'],
      ['cancel-service', 'admin'],
      ['start-service', 'mechanic'],
      ['finish-service', 'mechanic'],
      ['deliver', 'admin'],
    ])('PATCH /service-orders/:id/%s retorna 404 se a OS não existir', async (action, role) => {
      const authorization = role === 'admin' ? admin() : mechanic();

      const response = await act('00000000-0000-0000-0000-000000000000', action, authorization);

      expect(response.status).toBe(404);
    });
  });

  describe('listagem priorizada (GET /service-orders)', () => {
    const createdIds: Record<string, string> = {};

    const seedOrder = async (key: string, status: OrderStatus, assignedMechanicId?: string) => {
      const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { licensePlate } });
      const order = await prisma.serviceOrder.create({
        data: {
          vehicleId: vehicle.id,
          description: key,
          totalAmount: 0,
          status,
          mechanicId: assignedMechanicId ?? null,
        },
      });
      createdIds[key] = order.id;
      // garante created_at distinto entre as OS, para a ordem "mais antiga primeiro" ser determinística
      await new Promise((resolve) => setTimeout(resolve, 10));
    };

    const idsOf = (body: { id: string }[]) => body.map((order) => order.id);

    beforeEach(async () => {
      // criadas em sequência: a primeira é a mais antiga
      await seedOrder('recebida-antiga', 'RECEIVED');
      await seedOrder('diagnostico', 'IN_DIAGNOSIS', mechanicId);
      await seedOrder('aguardando', 'AWAITING_APPROVAL');
      await seedOrder('execucao', 'IN_EXECUTION');
      await seedOrder('recebida-nova', 'RECEIVED');
      await seedOrder('finalizada', 'FINISHED');
      await seedOrder('entregue', 'DELIVERED');
      await seedOrder('cancelada', 'CANCELED');
    });

    it('lista só as OS abertas, por prioridade de status e depois da mais antiga', async () => {
      const response = await http().get('/service-orders').set('Authorization', admin());

      expect(response.status).toBe(200);
      expect(idsOf(response.body)).toEqual([
        createdIds['execucao'],
        createdIds['aguardando'],
        createdIds['diagnostico'],
        createdIds['recebida-antiga'],
        createdIds['recebida-nova'],
      ]);
    });

    it('com filtro de status, devolve as OS desse status, inclusive as encerradas', async () => {
      const response = await http()
        .get('/service-orders')
        .query({ status: 'FINISHED' })
        .set('Authorization', admin());

      expect(idsOf(response.body)).toEqual([createdIds['finalizada']]);
    });

    it('com status RECEIVED, devolve as mais antigas primeiro', async () => {
      const response = await http()
        .get('/service-orders')
        .query({ status: 'RECEIVED' })
        .set('Authorization', admin());

      expect(idsOf(response.body)).toEqual([
        createdIds['recebida-antiga'],
        createdIds['recebida-nova'],
      ]);
    });

    it('filtra pelo mecânico responsável', async () => {
      const response = await http()
        .get('/service-orders')
        .query({ mechanicId })
        .set('Authorization', admin());

      expect(idsOf(response.body)).toEqual([createdIds['diagnostico']]);
    });
  });

  describe('métricas (GET /service-orders/metrics/average-execution-time)', () => {
    it('calcula o tempo médio das OS finalizadas', async () => {
      const id = await openOrder();
      await toAwaitingApproval(id);
      await act(id, 'approve-budget', admin());
      await act(id, 'start-service', mechanic());
      await act(id, 'finish-service', mechanic());

      const response = await http()
        .get('/service-orders/metrics/average-execution-time')
        .set('Authorization', admin());

      expect(response.status).toBe(200);
      expect(response.body.completedServiceOrders).toBe(1);
      expect(response.body.averageExecutionTimeMinutes).toEqual(expect.any(Number));
    });

    it('retorna 400 quando "from" é posterior a "to"', async () => {
      const response = await http()
        .get('/service-orders/metrics/average-execution-time')
        .query({ from: '2026-09-01', to: '2026-08-01' })
        .set('Authorization', admin());

      expect(response.status).toBe(400);
    });
  });

  describe('e-mails de status', () => {
    it('avisa o cliente ao abrir a OS', async () => {
      await openOrder();

      expect(gateway.sendStatusUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'cliente@teste.com', status: 'Recebida' }),
      );
    });

    it('envia o orçamento com os links de aprovar e recusar ao gerá-lo', async () => {
      const id = await openOrder();
      await toAwaitingApproval(id);

      expect(gateway.sendBudget).toHaveBeenCalledTimes(1);
      expect(gateway.sendBudget).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'cliente@teste.com',
          totalAmount: 160,
          approveUrl: expect.stringContaining('/budget-decisions/'),
          rejectUrl: expect.stringContaining('/budget-decisions/'),
        }),
      );
    });

    it('não repete o e-mail de orçamento ao consultar o orçamento de novo', async () => {
      const id = await openOrder();
      await toAwaitingApproval(id);
      await act(id, 'budget', admin());

      expect(gateway.sendBudget).toHaveBeenCalledTimes(1);
    });

    it('não repete o e-mail quando o status visto pelo cliente não muda (aprovação e início da execução)', async () => {
      const id = await openOrder();
      await toAwaitingApproval(id);
      await act(id, 'approve-budget', admin()).expect(200);
      gateway.sendStatusUpdate.mockClear();

      await act(id, 'start-service', mechanic()).expect(200);

      expect(gateway.sendStatusUpdate).not.toHaveBeenCalled();
    });

    it('não envia nada e não falha quando o cliente não tem e-mail', async () => {
      await prisma.client.update({ where: { id: clientId }, data: { email: null } });

      const id = await openOrder();

      expect(id).toEqual(expect.any(String));
      expect(gateway.sendStatusUpdate).not.toHaveBeenCalled();
    });

    it('não falha a operação quando o envio do e-mail falha', async () => {
      gateway.sendStatusUpdate.mockRejectedValueOnce(new Error('SMTP fora do ar'));

      const response = await http()
        .post('/service-orders')
        .set('Authorization', admin())
        .send({ client: { cpfCnpj: clientCpfCnpj }, vehicle: { licensePlate }, description: 'X' });

      expect(response.status).toBe(201);
    });
  });

  describe('links de decisão do orçamento (/budget-decisions)', () => {
    const awaitingApprovalWithLinks = async () => {
      const id = await openOrder();
      await toAwaitingApproval(id);
      const { approveUrl, rejectUrl } = gateway.sendBudget.mock.calls[0][0] as {
        approveUrl: string;
        rejectUrl: string;
      };
      return {
        id,
        approvePath: new URL(approveUrl).pathname,
        rejectPath: new URL(rejectUrl).pathname,
      };
    };

    it('GET mostra a confirmação e não altera a OS', async () => {
      const { id, approvePath } = await awaitingApprovalWithLinks();

      const response = await http().get(approvePath);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Deseja aprovar o orçamento?');
      expect(await statusInDb(id)).toBe('AWAITING_APPROVAL');
    });

    it('POST no link de aprovar leva a OS para execução e avisa o cliente', async () => {
      const { id, approvePath } = await awaitingApprovalWithLinks();
      gateway.sendStatusUpdate.mockClear();

      const response = await http().post(approvePath);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Orçamento aprovado');
      expect(await statusInDb(id)).toBe('AWAITING_EXECUTION');
      expect(gateway.sendStatusUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Execução' }),
      );
    });

    it('POST no link de recusar cancela a OS', async () => {
      const { id, rejectPath } = await awaitingApprovalWithLinks();

      const response = await http().post(rejectPath);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Orçamento recusado');
      expect(await statusInDb(id)).toBe('CANCELED');
    });

    it('a primeira decisão vale: repetir ou usar o link oposto é ignorado', async () => {
      const { id, approvePath, rejectPath } = await awaitingApprovalWithLinks();
      await http().post(approvePath);

      const again = await http().post(approvePath);
      const opposite = await http().post(rejectPath);

      expect(again.text).toContain('Decisão já registrada');
      expect(opposite.text).toContain('Decisão já registrada');
      expect(await statusInDb(id)).toBe('AWAITING_EXECUTION');
    });

    it('rejeita token adulterado sem alterar a OS', async () => {
      const { id, approvePath } = await awaitingApprovalWithLinks();
      const tampered = approvePath.slice(0, -2) + (approvePath.endsWith('aa') ? 'bb' : 'aa');

      const get = await http().get(tampered);
      const post = await http().post(tampered);

      expect(get.text).toContain('Link inválido');
      expect(post.text).toContain('Link inválido');
      expect(await statusInDb(id)).toBe('AWAITING_APPROVAL');
    });

    it('rejeita o token de acompanhamento usado como token de decisão', async () => {
      const id = await openOrder();
      await toAwaitingApproval(id);
      const link = await http()
        .get(`/service-orders/${id}/tracking-link`)
        .set('Authorization', admin());
      const trackingToken = (link.body.trackingLink as string).split('/track/')[1];

      const response = await http().post(`/budget-decisions/${trackingToken}`);

      expect(response.text).toContain('Link inválido');
      expect(await statusInDb(id)).toBe('AWAITING_APPROVAL');
    });
  });
});
