import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { ClientModule } from '@client/client.module';
import { PrismaModule } from '@infra/database/prisma/prisma.module';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { JwtAuthGuard } from '@auth/infrastructure/security/jwt-auth.guard';
import { RolesGuard } from '@auth/infrastructure/security/roles.guard';
import { JwtStrategy } from '@auth/infrastructure/security/jwt.strategy';
import { truncateAllTables } from '../../../support/truncate-database';
import { signAuthToken } from '../../../support/auth-token.helper';

describe('ClientController (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const adminAuthHeader = () => signAuthToken(jwtService, 'admin-id', 'ADMIN');

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PrismaModule,
        ClientModule,
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

  describe('POST /clients', () => {
    it('creates a client with a valid CPF', async () => {
      const response = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', adminAuthHeader())
        .send({
          cpfCnpj: '52998224725',
          name: 'João da Silva',
          phone: '11999998888',
          address: 'Rua das Flores, 123',
        })
        .expect(201);

      expect(response.body).toMatchObject({ documentType: 'CPF', name: 'João da Silva' });
    });

    it('creates a client with a valid CNPJ', async () => {
      const response = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', adminAuthHeader())
        .send({
          cpfCnpj: '11222333000181',
          name: 'Oficina LTDA',
          phone: '11988887777',
          address: 'Av. Central, 500',
        })
        .expect(201);

      expect(response.body).toMatchObject({ documentType: 'CNPJ' });
    });

    it('accepts a punctuated CPF and normalizes it', async () => {
      const response = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', adminAuthHeader())
        .send({
          cpfCnpj: '529.982.247-25',
          name: 'João da Silva',
          phone: '11999998888',
          address: 'Rua das Flores, 123',
        })
        .expect(201);

      expect(response.body.cpfCnpj).toBe('529.982.247-25');

      const stored = await prisma.client.findUnique({ where: { id: response.body.id } });
      expect(stored?.cpfCnpj).toBe('52998224725');
    });

    it('returns 400 for an invalid CPF/CNPJ', async () => {
      await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', adminAuthHeader())
        .send({
          cpfCnpj: '11111111111',
          name: 'João da Silva',
          phone: '11999998888',
          address: 'Rua das Flores, 123',
        })
        .expect(400);
    });

    it('returns 409 when the CPF/CNPJ is already registered', async () => {
      const payload = {
        cpfCnpj: '52998224725',
        name: 'João da Silva',
        phone: '11999998888',
        address: 'Rua das Flores, 123',
      };

      await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', adminAuthHeader())
        .send(payload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', adminAuthHeader())
        .send({ ...payload, phone: '11977776666' })
        .expect(409);
    });

    it('returns 409 when the phone is already registered', async () => {
      const payload = {
        cpfCnpj: '52998224725',
        name: 'João da Silva',
        phone: '11999998888',
        address: 'Rua das Flores, 123',
      };

      await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', adminAuthHeader())
        .send(payload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', adminAuthHeader())
        .send({ ...payload, cpfCnpj: '11222333000181' })
        .expect(409);

      expect(response.body.message).toBe('Client with the same CPF/CNPJ or phone already exists');
    });
  });

  describe('GET /clients', () => {
    it('lists all clients', async () => {
      await prisma.client.create({
        data: {
          cpfCnpj: '52998224725',
          name: 'João da Silva',
          phone: '11999998888',
          address: 'Rua das Flores, 123',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/clients')
        .set('Authorization', adminAuthHeader())
        .expect(200);

      expect(response.body).toHaveLength(1);
    });
  });

  describe('GET /clients/:id', () => {
    it('returns a client by id', async () => {
      const client = await prisma.client.create({
        data: {
          cpfCnpj: '52998224725',
          name: 'João da Silva',
          phone: '11999998888',
          address: 'Rua das Flores, 123',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/clients/${client.id}`)
        .set('Authorization', adminAuthHeader())
        .expect(200);

      expect(response.body).toMatchObject({ id: client.id, name: 'João da Silva' });
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .get('/clients/00000000-0000-0000-0000-000000000000')
        .set('Authorization', adminAuthHeader())
        .expect(404);
    });
  });

  describe('PATCH /clients/:id', () => {
    it('updates the allowed fields', async () => {
      const client = await prisma.client.create({
        data: {
          cpfCnpj: '52998224725',
          name: 'João da Silva',
          phone: '11999998888',
          address: 'Rua das Flores, 123',
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/clients/${client.id}`)
        .set('Authorization', adminAuthHeader())
        .send({ name: 'João Pereira', phone: '11955554444' })
        .expect(200);

      expect(response.body).toMatchObject({ name: 'João Pereira', phone: '11955554444' });
    });

    it('returns 409 when the new phone belongs to another client', async () => {
      await prisma.client.create({
        data: { cpfCnpj: '11222333000181', name: 'Outro', phone: '11955554444', address: 'Rua B' },
      });
      const client = await prisma.client.create({
        data: {
          cpfCnpj: '52998224725',
          name: 'João da Silva',
          phone: '11999998888',
          address: 'Rua das Flores, 123',
        },
      });

      await request(app.getHttpServer())
        .patch(`/clients/${client.id}`)
        .set('Authorization', adminAuthHeader())
        .send({ phone: '11955554444' })
        .expect(409);
    });

    it('returns 400 when the body includes cpfCnpj (not part of the update DTO)', async () => {
      const client = await prisma.client.create({
        data: {
          cpfCnpj: '52998224725',
          name: 'João da Silva',
          phone: '11999998888',
          address: 'Rua das Flores, 123',
        },
      });

      await request(app.getHttpServer())
        .patch(`/clients/${client.id}`)
        .set('Authorization', adminAuthHeader())
        .send({ cpfCnpj: '11222333000181' })
        .expect(400);
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/clients/00000000-0000-0000-0000-000000000000')
        .set('Authorization', adminAuthHeader())
        .send({ name: 'João Pereira' })
        .expect(404);
    });
  });

  describe('DELETE /clients/:id', () => {
    it('soft-deletes a client', async () => {
      const client = await prisma.client.create({
        data: {
          cpfCnpj: '52998224725',
          name: 'João da Silva',
          phone: '11999998888',
          address: 'Rua das Flores, 123',
        },
      });

      await request(app.getHttpServer())
        .delete(`/clients/${client.id}`)
        .set('Authorization', adminAuthHeader())
        .expect(204);

      const stored = await prisma.client.findUnique({ where: { id: client.id } });
      expect(stored?.deleted_at).not.toBeNull();
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .delete('/clients/00000000-0000-0000-0000-000000000000')
        .set('Authorization', adminAuthHeader())
        .expect(404);
    });
  });
});
