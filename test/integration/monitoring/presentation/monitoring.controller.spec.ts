import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MonitoringController } from '@infra/monitoring/monitoring.controller';
import { MonitoringService } from '@infra/monitoring/monitoring.service';
import { PrismaService } from '@infra/database/prisma/prisma.service';

describe('MonitoringController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonitoringController],
      providers: [
        MonitoringService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
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

  describe('GET /read', () => {
    it('returns 200 and ready when database responds', async () => {
      const response = await request(app.getHttpServer()).get('/read').expect(200);

      expect(response.body).toMatchObject({ status: 'ready' });
      expect(response.body.timestamp).toEqual(expect.any(String));
    });
  });
});
