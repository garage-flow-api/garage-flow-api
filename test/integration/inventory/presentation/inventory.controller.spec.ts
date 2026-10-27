import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { InventoryModule } from '@inventory/inventory.module';
import { PrismaModule } from '@infra/database/prisma/prisma.module';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { JwtAuthGuard } from '@auth/infrastructure/security/jwt-auth.guard';
import { RolesGuard } from '@auth/infrastructure/security/roles.guard';
import { JwtStrategy } from '@auth/infrastructure/security/jwt.strategy';
import { truncateAllTables } from '../../../support/truncate-database';
import { signAuthToken } from '../../../support/auth-token.helper';

describe('InventoryController (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const adminAuthHeader = () => signAuthToken(jwtService, 'admin-id', 'ADMIN');

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PrismaModule,
        InventoryModule,
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
  });

  describe('POST /inventory', () => {
    it('creates a part with a valid unit of measure', async () => {
      const response = await request(app.getHttpServer())
        .post('/inventory')
        .set('Authorization', adminAuthHeader())
        .send({ name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10 })
        .expect(201);

      expect(response.body).toMatchObject({ name: 'Óleo', unitOfMeasure: 'ML', quantity: 10 });
    });

    it('defaults quantity to 0 when omitted', async () => {
      const response = await request(app.getHttpServer())
        .post('/inventory')
        .set('Authorization', adminAuthHeader())
        .send({ name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30 })
        .expect(201);

      expect(response.body.quantity).toBe(0);
    });

    it('returns 400 for an invalid unit of measure', async () => {
      await request(app.getHttpServer())
        .post('/inventory')
        .set('Authorization', adminAuthHeader())
        .send({ name: 'Óleo', unitOfMeasure: 'LITER', unitPrice: 30 })
        .expect(400);
    });
  });

  describe('GET /inventory', () => {
    it('lists all inventory items', async () => {
      await prisma.inventory.create({
        data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10 },
      });

      const response = await request(app.getHttpServer())
        .get('/inventory')
        .set('Authorization', adminAuthHeader())
        .expect(200);

      expect(response.body).toHaveLength(1);
    });
  });

  describe('GET /inventory/low-stock', () => {
    it('lists parts whose stock is below the configured minimum', async () => {
      const lowStockPart = await prisma.inventory.create({
        data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 2, minQuantity: 5 },
      });
      await prisma.inventory.create({
        data: {
          name: 'Filtro',
          unitOfMeasure: 'UNIT',
          unitPrice: 20,
          quantity: 10,
          minQuantity: 5,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/inventory/low-stock')
        .set('Authorization', adminAuthHeader())
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: lowStockPart.id,
        physicalQuantity: 2,
        reservedQuantity: 0,
        availableQuantity: 2,
        minQuantity: 5,
      });
    });

    it('returns an empty list when no part is below the minimum', async () => {
      await prisma.inventory.create({
        data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10, minQuantity: 5 },
      });

      const response = await request(app.getHttpServer())
        .get('/inventory/low-stock')
        .set('Authorization', adminAuthHeader())
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('PATCH /inventory/:id', () => {
    it('updates name and unit price', async () => {
      const part = await prisma.inventory.create({
        data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10 },
      });

      const response = await request(app.getHttpServer())
        .patch(`/inventory/${part.id}`)
        .set('Authorization', adminAuthHeader())
        .send({ name: 'Óleo sintético', unitPrice: 45 })
        .expect(200);

      expect(response.body).toMatchObject({ name: 'Óleo sintético', unitPrice: 45 });
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/inventory/00000000-0000-0000-0000-000000000000')
        .set('Authorization', adminAuthHeader())
        .send({ name: 'Óleo sintético', unitPrice: 45 })
        .expect(404);
    });
  });

  describe('PATCH /inventory/:id/restock', () => {
    it('increases the stock quantity', async () => {
      const part = await prisma.inventory.create({
        data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10 },
      });

      const response = await request(app.getHttpServer())
        .patch(`/inventory/${part.id}/restock`)
        .set('Authorization', adminAuthHeader())
        .send({ quantity: 5 })
        .expect(200);

      expect(response.body.quantity).toBe(15);
    });

    it('returns 400 for a non-positive quantity', async () => {
      const part = await prisma.inventory.create({
        data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10 },
      });

      await request(app.getHttpServer())
        .patch(`/inventory/${part.id}/restock`)
        .set('Authorization', adminAuthHeader())
        .send({ quantity: 0 })
        .expect(400);
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/inventory/00000000-0000-0000-0000-000000000000/restock')
        .set('Authorization', adminAuthHeader())
        .send({ quantity: 5 })
        .expect(404);
    });
  });

  describe('PATCH /inventory/:id/consume', () => {
    it('allows consuming exactly the available stock', async () => {
      const part = await prisma.inventory.create({
        data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10 },
      });

      const response = await request(app.getHttpServer())
        .patch(`/inventory/${part.id}/consume`)
        .set('Authorization', adminAuthHeader())
        .send({ quantity: 10 })
        .expect(200);

      expect(response.body.quantity).toBe(0);
    });

    it('returns 422 when consuming more than the available stock', async () => {
      const part = await prisma.inventory.create({
        data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10 },
      });

      await request(app.getHttpServer())
        .patch(`/inventory/${part.id}/consume`)
        .set('Authorization', adminAuthHeader())
        .send({ quantity: 11 })
        .expect(422);
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/inventory/00000000-0000-0000-0000-000000000000/consume')
        .set('Authorization', adminAuthHeader())
        .send({ quantity: 5 })
        .expect(404);
    });
  });

  describe('DELETE /inventory/:id', () => {
    it('soft-deletes a part', async () => {
      const part = await prisma.inventory.create({
        data: { name: 'Óleo', unitOfMeasure: 'ML', unitPrice: 30, quantity: 10 },
      });

      await request(app.getHttpServer())
        .delete(`/inventory/${part.id}`)
        .set('Authorization', adminAuthHeader())
        .expect(204);

      const stored = await prisma.inventory.findUnique({ where: { id: part.id } });
      expect(stored?.deleted_at).not.toBeNull();
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .delete('/inventory/00000000-0000-0000-0000-000000000000')
        .set('Authorization', adminAuthHeader())
        .expect(404);
    });
  });
});
