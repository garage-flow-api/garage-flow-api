import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuthModule } from '@auth/auth.module';
import { PrismaModule } from '@infra/database/prisma/prisma.module';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { truncateAllTables } from '../../../support/truncate-database';
import { signAuthToken } from '../../../support/auth-token.helper';

describe('AuthController (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const adminAuthHeader = () => signAuthToken(jwtService, 'admin-id', 'ADMIN');

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PrismaModule,
        AuthModule,
        JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
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

  describe('POST /auth/users', () => {
    it('creates a user without exposing the password hash', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/users')
        .set('Authorization', adminAuthHeader())
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          role: 'MECHANIC',
        })
        .expect(201);

      expect(response.body).toMatchObject({ name: 'John Doe', email: 'john@example.com' });
      expect(response.body.passwordHash).toBeUndefined();
    });

    it('returns 400 for a password without a digit', async () => {
      await request(app.getHttpServer())
        .post('/auth/users')
        .set('Authorization', adminAuthHeader())
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'PasswordOnly',
          role: 'MECHANIC',
        })
        .expect(400);
    });

    it('returns 409 when the email is already registered', async () => {
      const payload = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123',
        role: 'MECHANIC',
      };

      await request(app.getHttpServer())
        .post('/auth/users')
        .set('Authorization', adminAuthHeader())
        .send(payload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/users')
        .set('Authorization', adminAuthHeader())
        .send(payload)
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with valid credentials and the token authorizes a protected endpoint', async () => {
      await request(app.getHttpServer())
        .post('/auth/users')
        .set('Authorization', adminAuthHeader())
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          role: 'ADMIN',
        })
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'john@example.com', password: 'Password123' })
        .expect(200);

      expect(loginResponse.body.access_token).toEqual(expect.any(String));
      expect(loginResponse.body.user).toMatchObject({ email: 'john@example.com' });

      await request(app.getHttpServer())
        .get('/auth/users')
        .set('Authorization', `Bearer ${loginResponse.body.access_token}`)
        .expect(200);
    });

    it('returns 401 for an unknown email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'unknown@example.com', password: 'Password123' })
        .expect(401);
    });

    it('returns 401 for the wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/users')
        .set('Authorization', adminAuthHeader())
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          role: 'ADMIN',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'john@example.com', password: 'WrongPassword1' })
        .expect(401);
    });

    it('returns 401 for a soft-deleted user', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/auth/users')
        .set('Authorization', adminAuthHeader())
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          role: 'ADMIN',
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/auth/users/${createResponse.body.id}`)
        .set('Authorization', adminAuthHeader())
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'john@example.com', password: 'Password123' })
        .expect(401);
    });
  });

  describe('GET /auth/users', () => {
    it('lists all users and filters by role', async () => {
      await prisma.user.create({
        data: { name: 'Admin', email: 'admin@example.com', passwordHash: 'hash', role: 'ADMIN' },
      });
      await prisma.user.create({
        data: {
          name: 'Mechanic',
          email: 'mechanic@example.com',
          passwordHash: 'hash',
          role: 'MECHANIC',
        },
      });

      const all = await request(app.getHttpServer())
        .get('/auth/users')
        .set('Authorization', adminAuthHeader())
        .expect(200);
      expect(all.body).toHaveLength(2);

      const filtered = await request(app.getHttpServer())
        .get('/auth/users?role=MECHANIC')
        .set('Authorization', adminAuthHeader())
        .expect(200);
      expect(filtered.body).toHaveLength(1);
      expect(filtered.body[0]).toMatchObject({ role: 'MECHANIC' });
    });
  });

  describe('GET /auth/users/:email', () => {
    it('returns a user by email', async () => {
      await prisma.user.create({
        data: { name: 'Admin', email: 'admin@example.com', passwordHash: 'hash', role: 'ADMIN' },
      });

      const response = await request(app.getHttpServer())
        .get('/auth/users/admin@example.com')
        .set('Authorization', adminAuthHeader())
        .expect(200);

      expect(response.body).toMatchObject({ email: 'admin@example.com' });
    });

    it('returns 404 for an unknown email', async () => {
      await request(app.getHttpServer())
        .get('/auth/users/missing@example.com')
        .set('Authorization', adminAuthHeader())
        .expect(404);
    });
  });

  describe('PATCH /auth/users/:id', () => {
    it('updates the allowed fields', async () => {
      const user = await prisma.user.create({
        data: { name: 'Admin', email: 'admin@example.com', passwordHash: 'hash', role: 'ADMIN' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/auth/users/${user.id}`)
        .set('Authorization', adminAuthHeader())
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body).toMatchObject({ name: 'Updated Name' });
    });

    it('returns 409 when changing the email to one already used by another user', async () => {
      await prisma.user.create({
        data: { name: 'Admin', email: 'admin@example.com', passwordHash: 'hash', role: 'ADMIN' },
      });
      const other = await prisma.user.create({
        data: {
          name: 'Mechanic',
          email: 'mechanic@example.com',
          passwordHash: 'hash',
          role: 'MECHANIC',
        },
      });

      await request(app.getHttpServer())
        .patch(`/auth/users/${other.id}`)
        .set('Authorization', adminAuthHeader())
        .send({ email: 'admin@example.com' })
        .expect(409);
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/auth/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', adminAuthHeader())
        .send({ name: 'Updated Name' })
        .expect(404);
    });
  });

  describe('DELETE /auth/users/:id', () => {
    it('soft-deletes a user', async () => {
      const user = await prisma.user.create({
        data: { name: 'Admin', email: 'admin@example.com', passwordHash: 'hash', role: 'ADMIN' },
      });

      await request(app.getHttpServer())
        .delete(`/auth/users/${user.id}`)
        .set('Authorization', adminAuthHeader())
        .expect(204);

      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored?.deleted_at).not.toBeNull();
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .delete('/auth/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', adminAuthHeader())
        .expect(404);
    });
  });
});
