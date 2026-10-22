import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { ServiceOrdersModule } from '@service-orders/service-orders.module';
import { PrismaModule } from '@infra/database/prisma/prisma.module';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { JwtAuthGuard } from '@auth/infrastructure/security/jwt-auth.guard';
import { RolesGuard } from '@auth/infrastructure/security/roles.guard';
import { JwtStrategy } from '@auth/infrastructure/security/jwt.strategy';
import { truncateAllTables } from '../../../support/truncate-database';

describe('ServiceOrdersController (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let clientCpfCnpj: string;
  let licensePlate: string;
  let serviceId: string;
  let partId: string;
  let mechanicId: string;

  const adminAuthHeader = () => `Bearer ${jwtService.sign({ sub: 'admin-id', role: 'ADMIN' })}`;
  const mechanicAuthHeader = () =>
    `Bearer ${jwtService.sign({ sub: mechanicId, role: 'MECHANIC' })}`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PrismaModule,
        ServiceOrdersModule,
        JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      providers: [JwtStrategy, JwtAuthGuard, RolesGuard],
    }).compile();

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
    await truncateAllTables(prisma);

    const client = await prisma.client.create({
      data: {
        cpfCnpj: '52998224725',
        name: 'Cliente Teste',
        address: 'Rua X',
        phone: '11999990000',
      },
    });
    clientCpfCnpj = client.cpfCnpj;

    const vehicle = await prisma.vehicle.create({
      data: {
        brand: 'Fiat',
        model: 'Uno',
        licensePlate: 'TST1234',
        year: 2020,
        clientId: client.id,
      },
    });
    licensePlate = vehicle.licensePlate;

    const service = await prisma.service.create({ data: { name: 'Troca de óleo', price: 100 } });
    serviceId = service.id;

    const part = await prisma.inventory.create({
      data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10 },
    });
    partId = part.id;

    const mechanic = await prisma.user.create({
      data: {
        name: 'Mecânico Teste',
        email: 'mecanico@teste.com',
        passwordHash: 'hash',
        role: 'MECHANIC',
      },
    });
    mechanicId = mechanic.id;
  });

  const putServiceOrderInDiagnosis = async (id: string) => {
    await request(app.getHttpServer())
      .patch(`/service-orders/${id}/start-diagnosis`)
      .set('Authorization', mechanicAuthHeader());
  };

  const openServiceOrderBody = (overrides: Record<string, unknown> = {}) => ({
    client: { cpfCnpj: clientCpfCnpj },
    vehicle: { licensePlate },
    description: 'Ruído no motor',
    ...overrides,
  });

  const newClient = {
    cpfCnpj: '111.444.777-35',
    name: 'Maria Souza',
    phone: '11988887777',
    address: 'Rua B, 20',
  };

  it('POST /service-orders deve criar uma OS sem itens e com valor total zerado', async () => {
    const response = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('RECEIVED');
    expect(response.body.description).toBe('Ruído no motor');
    expect(response.body.serviceItems).toEqual([]);
    expect(response.body.partItems).toEqual([]);
    expect(response.body.totalAmount).toBe(0);
    expect(response.body.trackingLink).toMatch(/^http:\/\/[^/]+\/service-orders\/track\/.+/);
  });

  it('GET /service-orders deve retornar 400 para um status inválido', async () => {
    const response = await request(app.getHttpServer())
      .get('/service-orders')
      .set('Authorization', adminAuthHeader())
      .query({ status: 'NOT_A_REAL_STATUS' });

    expect(response.status).toBe(400);
  });

  it('POST /service-orders deve retornar um trackingLink que resolve para a mesma OS criada', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    const token = (created.body.trackingLink as string).split('/track/')[1];
    const response = await request(app.getHttpServer()).get(`/service-orders/track/${token}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Recebida');
  });

  it('deve assumir o status RECEIVED por padrão no banco quando não informado na inserção', async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { licensePlate } });

    const serviceOrder = await prisma.serviceOrder.create({
      data: {
        vehicleId: vehicle.id,
        description: 'Ruído no motor',
        totalAmount: 0,
      },
    });

    expect(serviceOrder.status).toBe('RECEIVED');
  });

  it('POST /service-orders deve criar a OS quando o CPF/CNPJ do cliente é informado com pontuação', async () => {
    const response = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody({ client: { cpfCnpj: '529.982.247-25' } }));

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('RECEIVED');
    expect(await prisma.client.count()).toBe(1);
  });

  it('POST /service-orders deve rejeitar cliente novo sem nome, telefone e endereço', async () => {
    const response = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody({ client: { cpfCnpj: '76053610097' } }));

    expect(response.status).toBe(400);
    expect(await prisma.client.count({ where: { cpfCnpj: '76053610097' } })).toBe(0);
  });

  it('POST /service-orders deve rejeitar cliente com cpf invalido', async () => {
    const response = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody({ client: { cpfCnpj: '00000000000' } }));

    expect(response.status).toBe(400);
  });

  it('GET /service-orders deve listar apenas as OS criadas neste teste', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    const response = await request(app.getHttpServer())
      .get('/service-orders')
      .set('Authorization', adminAuthHeader());

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(created.body.id);
  });

  it('POST /service-orders deve criar cliente, veículo, itens e OS em uma única chamada', async () => {
    const response = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send({
        client: newClient,
        vehicle: { licensePlate: 'XYZ9K88', brand: 'Fiat', model: 'Palio', year: 2021 },
        description: 'Revisão completa',
        services: [{ serviceId }],
        parts: [{ inventoryId: partId, quantity: 1 }],
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.serviceItems).toHaveLength(1);
    expect(response.body.partItems).toHaveLength(1);
    expect(response.body.totalAmount).toBe(130); // 100 (serviço) + 1*30 (peça)

    const client = await prisma.client.findUnique({ where: { cpfCnpj: '11144477735' } });
    expect(client).not.toBeNull();
    const vehicle = await prisma.vehicle.findUnique({ where: { licensePlate: 'XYZ9K88' } });
    expect(vehicle?.clientId).toBe(client?.id);
  });

  it('POST /service-orders deve reaproveitar cliente e veículo ao repetir o mesmo CPF e a mesma placa', async () => {
    const open = () =>
      request(app.getHttpServer())
        .post('/service-orders')
        .set('Authorization', adminAuthHeader())
        .send(openServiceOrderBody());

    const first = await open();
    const second = await open();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
    expect(await prisma.client.count({ where: { cpfCnpj: clientCpfCnpj } })).toBe(1);
    expect(await prisma.vehicle.count({ where: { licensePlate } })).toBe(1);
  });

  it('POST /service-orders não deve gravar o cliente novo se a placa for de outro cliente', async () => {
    const response = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send({ client: newClient, vehicle: { licensePlate }, description: 'Revisão' });

    expect(response.status).toBe(422);
    expect(await prisma.client.findUnique({ where: { cpfCnpj: '11144477735' } })).toBeNull();
    expect(await prisma.serviceOrder.count()).toBe(0);
  });

  it('POST /service-orders deve rejeitar telefone de outro cliente e não gravar nada', async () => {
    const response = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(
        openServiceOrderBody({
          client: { ...newClient, phone: '11999990000' }, // telefone do cliente do beforeEach
          vehicle: { licensePlate: 'XYZ9K88', brand: 'Fiat', model: 'Palio', year: 2021 },
        }),
      );

    expect(response.status).toBe(409);
    expect(await prisma.vehicle.findUnique({ where: { licensePlate: 'XYZ9K88' } })).toBeNull();
  });

  it('POST /service-orders não deve abrir a OS nem criar o cliente se a peça não tiver estoque', async () => {
    const response = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send({
        client: newClient,
        vehicle: { licensePlate: 'XYZ9K88', brand: 'Fiat', model: 'Palio', year: 2021 },
        description: 'Revisão',
        parts: [{ inventoryId: partId, quantity: 999 }],
      });

    expect(response.status).toBe(422);
    expect(await prisma.client.findUnique({ where: { cpfCnpj: '11144477735' } })).toBeNull();
    expect(await prisma.serviceOrder.count()).toBe(0);
  });

  it('POST /service-orders deve retornar 404 se o serviço não existir', async () => {
    const response = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(
        openServiceOrderBody({ services: [{ serviceId: '00000000-0000-0000-0000-000000000000' }] }),
      );

    expect(response.status).toBe(404);
    expect(await prisma.serviceOrder.count()).toBe(0);
  });

  it('PATCH /service-orders/:id deve atualizar mechanicId e approvedAt', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}`)
      .set('Authorization', adminAuthHeader())
      .send({ mechanicId, approvedAt: '2026-08-22T10:00:00.000Z' });

    expect(response.status).toBe(200);
    expect(response.body.mechanicId).toBe(mechanicId);
    expect(response.body.approvedAt).toBe('2026-08-22T10:00:00.000Z');
  });

  it('PATCH /service-orders/:id deve retornar 404 se a OS não existir', async () => {
    const response = await request(app.getHttpServer())
      .patch('/service-orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', adminAuthHeader())
      .send({ mechanicId });

    expect(response.status).toBe(404);
  });

  it('GET /service-orders/:id deve devolver o status nos termos do cliente', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send({ clientCpfCnpj, licensePlate, description: 'Ruído no motor' });

    const received = await request(app.getHttpServer())
      .get(`/service-orders/${created.body.id}`)
      .set('Authorization', adminAuthHeader());

    expect(received.status).toBe(200);
    expect(received.body.status).toBe('Recebida');

    await putServiceOrderInDiagnosis(created.body.id);

    const inDiagnosis = await request(app.getHttpServer())
      .get(`/service-orders/${created.body.id}`)
      .set('Authorization', adminAuthHeader());

    expect(inDiagnosis.body.status).toBe('Diagnóstico');
  });

  it('GET /service-orders/track/:token deve devolver o mesmo status traduzido que a consulta por ID', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send({ clientCpfCnpj, licensePlate, description: 'Ruído no motor' });
    await putServiceOrderInDiagnosis(created.body.id);

    const byId = await request(app.getHttpServer())
      .get(`/service-orders/${created.body.id}`)
      .set('Authorization', adminAuthHeader());
    const token = (created.body.trackingLink as string).split('/track/')[1];
    const byToken = await request(app.getHttpServer()).get(`/service-orders/track/${token}`);

    expect(byToken.body.status).toBe('Diagnóstico');
    expect(byToken.body.status).toBe(byId.body.status);
  });

  it('PATCH /service-orders/:id/start-diagnosis deve transicionar para IN_DIAGNOSIS e atribuir o mecânico', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/start-diagnosis`)
      .set('Authorization', mechanicAuthHeader());

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('IN_DIAGNOSIS');
    expect(response.body.mechanicId).toBe(mechanicId);
  });

  it('PATCH /service-orders/:id/start-diagnosis deve retornar 404 se a OS não existir', async () => {
    const response = await request(app.getHttpServer())
      .patch('/service-orders/00000000-0000-0000-0000-000000000000/start-diagnosis')
      .set('Authorization', mechanicAuthHeader());

    expect(response.status).toBe(404);
  });

  it('PATCH /service-orders/:id deve retornar 400 ao enviar status (campo não faz mais parte do DTO de atualização genérica)', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}`)
      .set('Authorization', adminAuthHeader())
      .send({ status: 'IN_DIAGNOSIS' });

    expect(response.status).toBe(400);
  });

  it('DELETE /service-orders/:id deve fazer soft delete', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    const response = await request(app.getHttpServer())
      .delete(`/service-orders/${created.body.id}`)
      .set('Authorization', adminAuthHeader());

    expect(response.status).toBe(204);
  });

  it('PATCH /service-orders/:id/add-services-and-parts deve adicionar serviços e peças e recalcular o total', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());
    await putServiceOrderInDiagnosis(created.body.id);

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/add-services-and-parts`)
      .set('Authorization', mechanicAuthHeader())
      .send({
        services: [{ serviceId }],
        parts: [{ inventoryId: partId, quantity: 2 }],
      });

    expect(response.status).toBe(200);
    expect(response.body.serviceItems).toHaveLength(1);
    expect(response.body.partItems).toHaveLength(1);
    expect(response.body.totalAmount).toBe(160); // 100 (serviço) + 2*30 (peça)
    expect(response.body.status).toBe('FINISHED_DIAGNOSIS');
  });

  it('PATCH /service-orders/:id/add-services-and-parts deve retornar stockAlerts quando o estoque da peça ficar abaixo do mínimo', async () => {
    await prisma.inventory.update({ where: { id: partId }, data: { minQuantity: 11 } });

    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());
    await putServiceOrderInDiagnosis(created.body.id);

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/add-services-and-parts`)
      .set('Authorization', mechanicAuthHeader())
      .send({ services: [], parts: [{ inventoryId: partId, quantity: 2 }] });

    expect(response.status).toBe(200);
    expect(response.body.stockAlerts).toHaveLength(1);
    expect(response.body.stockAlerts[0]).toMatchObject({ inventoryId: partId, minQuantity: 11 });
  });

  it('PATCH /service-orders/:id/add-services-and-parts não deve retornar stockAlerts quando o estoque está acima do mínimo', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());
    await putServiceOrderInDiagnosis(created.body.id);

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/add-services-and-parts`)
      .set('Authorization', mechanicAuthHeader())
      .send({ services: [], parts: [{ inventoryId: partId, quantity: 2 }] });

    expect(response.status).toBe(200);
    expect(response.body.stockAlerts).toEqual([]);
  });

  it('PATCH /service-orders/:id/add-services-and-parts deve adicionar serviço e peça na mesma chamada', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());
    await putServiceOrderInDiagnosis(created.body.id);

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/add-services-and-parts`)
      .set('Authorization', mechanicAuthHeader())
      .send({ services: [{ serviceId }], parts: [{ inventoryId: partId, quantity: 1 }] });

    expect(response.status).toBe(200);
    expect(response.body.serviceItems).toHaveLength(1);
    expect(response.body.partItems).toHaveLength(1);
    expect(response.body.status).toBe('FINISHED_DIAGNOSIS');
  });

  it('PATCH /service-orders/:id/add-services-and-parts deve retornar 422 ao tentar adicionar itens novamente sem voltar para IN_DIAGNOSIS', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());
    await putServiceOrderInDiagnosis(created.body.id);

    await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/add-services-and-parts`)
      .set('Authorization', mechanicAuthHeader())
      .send({ services: [{ serviceId }], parts: [] });

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/add-services-and-parts`)
      .set('Authorization', mechanicAuthHeader())
      .send({ services: [], parts: [{ inventoryId: partId, quantity: 1 }] });

    expect(response.status).toBe(422);
  });

  it('PATCH /service-orders/:id/add-services-and-parts deve retornar 404 se a OS não existir', async () => {
    const response = await request(app.getHttpServer())
      .patch('/service-orders/00000000-0000-0000-0000-000000000000/add-services-and-parts')
      .set('Authorization', mechanicAuthHeader())
      .send({ services: [{ serviceId }], parts: [] });

    expect(response.status).toBe(404);
  });

  it('PATCH /service-orders/:id/add-services-and-parts deve retornar 422 se a quantidade solicitada exceder a disponível', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());
    await putServiceOrderInDiagnosis(created.body.id);

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/add-services-and-parts`)
      .set('Authorization', mechanicAuthHeader())
      .send({ services: [], parts: [{ inventoryId: partId, quantity: 999 }] });

    expect(response.status).toBe(422);
  });

  it('PATCH /service-orders/:id/add-services-and-parts deve retornar 403 se outro mecânico tentar finalizar o diagnóstico', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());
    await putServiceOrderInDiagnosis(created.body.id);

    const otherMechanic = await prisma.user.create({
      data: {
        name: 'Outro Mecânico',
        email: 'outro@teste.com',
        passwordHash: 'hash',
        role: 'MECHANIC',
      },
    });
    const otherMechanicHeader = `Bearer ${jwtService.sign({ sub: otherMechanic.id, role: 'MECHANIC' })}`;

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/add-services-and-parts`)
      .set('Authorization', otherMechanicHeader)
      .send({ services: [{ serviceId }], parts: [] });

    expect(response.status).toBe(403);
  });

  it('PATCH /service-orders/:id/add-services-and-parts deve retornar 422 se a OS não estiver em diagnóstico', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/add-services-and-parts`)
      .set('Authorization', mechanicAuthHeader())
      .send({ services: [{ serviceId }], parts: [] });

    expect(response.status).toBe(422);
  });

  it('PATCH /service-orders/:id/budget deve gerar o orçamento quando a OS possui itens', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());
    await putServiceOrderInDiagnosis(created.body.id);
    await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/add-services-and-parts`)
      .set('Authorization', mechanicAuthHeader())
      .send({ services: [{ serviceId }], parts: [{ inventoryId: partId, quantity: 2 }] });

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/budget`)
      .set('Authorization', adminAuthHeader());

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.serviceOrderId).toBe(created.body.id);
    expect(response.body.status).toBe('AWAITING_APPROVAL');
    expect(response.body.client).toMatchObject({ name: 'Cliente Teste', address: 'Rua X' });
    expect(response.body.vehicle).toMatchObject({
      brand: 'Fiat',
      model: 'Uno',
      licensePlate: 'TST1234',
    });
    expect(response.body.services).toEqual([
      { name: 'Troca de óleo', quantity: 1, unitOfMeasure: null, unitPrice: 100, subtotal: 100 },
    ]);
    expect(response.body.parts).toEqual([
      { name: 'Óleo', quantity: 2, unitOfMeasure: 'ML', unitPrice: 30, subtotal: 60 },
    ]);
    expect(response.body.totalAmount).toBe(160);
    expect(response.body.generatedAt).toBeDefined();

    const retrievedResponse = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/budget`)
      .set('Authorization', adminAuthHeader());

    expect(retrievedResponse.status).toBe(200);
    expect(retrievedResponse.body.status).toBe('AWAITING_APPROVAL');
    expect(retrievedResponse.body).toMatchObject({
      serviceOrderId: created.body.id,
      totalAmount: 160,
    });
  });

  it('PATCH /service-orders/:id/budget deve retornar 404 se a OS não existir', async () => {
    const response = await request(app.getHttpServer())
      .patch('/service-orders/00000000-0000-0000-0000-000000000000/budget')
      .set('Authorization', adminAuthHeader());

    expect(response.status).toBe(404);
  });

  it('PATCH /service-orders/:id/budget deve retornar 422 se a OS estiver em RECEIVED', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/budget`)
      .set('Authorization', adminAuthHeader());

    expect(response.status).toBe(422);
  });

  it('PATCH /service-orders/:id/budget deve retornar 422 se a OS não possuir serviços nem peças', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());
    await putServiceOrderInDiagnosis(created.body.id);
    await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}`)
      .set('Authorization', adminAuthHeader())
      .send({ status: 'FINISHED_DIAGNOSIS' });

    const response = await request(app.getHttpServer())
      .patch(`/service-orders/${created.body.id}/budget`)
      .set('Authorization', adminAuthHeader());

    expect(response.status).toBe(422);
  });

  it('GET /service-orders/:id/tracking-link deve retornar um link público absoluto para a OS', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    const response = await request(app.getHttpServer())
      .get(`/service-orders/${created.body.id}/tracking-link`)
      .set('Authorization', adminAuthHeader());

    expect(response.status).toBe(200);
    expect(response.body.trackingLink).toMatch(/^http:\/\/[^/]+\/service-orders\/track\/.+/);
  });

  it('GET /service-orders/:id/tracking-link deve retornar 404 se a OS não existir', async () => {
    const response = await request(app.getHttpServer())
      .get('/service-orders/00000000-0000-0000-0000-000000000000/tracking-link')
      .set('Authorization', adminAuthHeader());

    expect(response.status).toBe(404);
  });

  it('GET /service-orders/track/:token deve retornar o status e a data de atualização sem autenticação', async () => {
    const created = await request(app.getHttpServer())
      .post('/service-orders')
      .set('Authorization', adminAuthHeader())
      .send(openServiceOrderBody());

    const link = await request(app.getHttpServer())
      .get(`/service-orders/${created.body.id}/tracking-link`)
      .set('Authorization', adminAuthHeader());
    const token = (link.body.trackingLink as string).split('/track/')[1];

    const response = await request(app.getHttpServer()).get(`/service-orders/track/${token}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Recebida');
    expect(response.body).not.toHaveProperty('id');
  });

  it('GET /service-orders/track/:token deve retornar 404 para um token inválido', async () => {
    const response = await request(app.getHttpServer()).get('/service-orders/track/not-a-token');

    expect(response.status).toBe(404);
  });
});
