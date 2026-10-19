import { Test, type TestingModule } from '@nestjs/testing';
import { MonitoringController } from '@infra/monitoring/monitoring.controller';
import { MonitoringService } from '@infra/monitoring/monitoring.service';

describe('MonitoringController', () => {
  let controller: MonitoringController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonitoringController],
      providers: [
        {
          provide: MonitoringService,
          useValue: {
            checkLiveness: jest.fn(),
            checkReadiness: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<MonitoringController>(MonitoringController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
