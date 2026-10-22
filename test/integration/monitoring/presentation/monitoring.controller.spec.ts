import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MonitoringController } from '@infra/monitoring/monitoring.controller';
import { MonitoringService } from '@infra/monitoring/monitoring.service';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';

describe('MonitoringController (integration)', () => {
  let app: INestApplication;
  const queryRaw = jest.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonitoringController],
      providers: [
        MonitoringService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: queryRaw,
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with no Authorization header (public endpoint)', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body).toMatchObject({ status: 'ok' });
      expect(response.body.timestamp).toEqual(expect.any(String));
    });
  });

  describe('GET /ready', () => {
    it('returns 200 and ready when database responds', async () => {
      const response = await request(app.getHttpServer()).get('/ready').expect(200);

      expect(response.body).toMatchObject({ status: 'ready' });
      expect(response.body.timestamp).toEqual(expect.any(String));
    });

    it('returns the standard 503 response when database is unavailable', async () => {
      queryRaw.mockRejectedValueOnce(new Error('Database unavailable'));

      const response = await request(app.getHttpServer()).get('/ready').expect(503);

      expect(response.body).toMatchObject({
        statusCode: 503,
        message: 'API is not ready',
        path: '/ready',
      });
      expect(response.body.timestamp).toEqual(expect.any(String));
    });
  });
});
