import { NotifyServiceOrderStatusChangeUseCase } from '@service-orders/application/use-cases/notify-service-order-status-change.use-case';
import { type BuildServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/build-service-order-budget.use-case';
import { toPublicStatus } from '@service-orders/domain/value-objects/public-service-order-status.vo';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type NotificationGateway } from '@notification/application/notification.gateway';
import { type FindVehicleByIdUseCase } from '@vehicle/application/use-cases/find-vehicle-by-id.use-case';
import { type FindClientByIdUseCase } from '@client/application/use-cases/find-client-by-id.use-case';
import { makeClient } from '../../client/client.factory';
import { makeVehicle } from '../../vehicle/vehicle.factory';
import { makeServiceOrder } from '../service-order.factory';

describe('NotifyServiceOrderStatusChangeUseCase', () => {
  const vehicle = makeVehicle();
  let gateway: { sendStatusUpdate: jest.Mock; sendBudget: jest.Mock };
  let findVehicleById: { execute: jest.Mock };
  let findClientById: { execute: jest.Mock };
  let buildBudget: { execute: jest.Mock };
  let useCase: NotifyServiceOrderStatusChangeUseCase;

  beforeAll(() => {
    process.env.TRACKING_TOKEN_SECRET = 'test-secret-for-notify';
  });

  beforeEach(() => {
    gateway = {
      sendStatusUpdate: jest.fn().mockResolvedValue(undefined),
      sendBudget: jest.fn().mockResolvedValue(undefined),
    };
    findVehicleById = { execute: jest.fn().mockResolvedValue(vehicle) };
    findClientById = {
      execute: jest.fn().mockResolvedValue(makeClient({ name: 'João', email: 'joao@email.com' })),
    };
    buildBudget = {
      execute: jest.fn().mockResolvedValue({
        services: [{ name: 'Troca de óleo', quantity: 1, subtotal: 100 }],
        parts: [{ name: 'Filtro', quantity: 2, subtotal: 60 }],
        totalAmount: 160,
      }),
    };

    useCase = new NotifyServiceOrderStatusChangeUseCase(
      gateway as unknown as NotificationGateway,
      findVehicleById as unknown as FindVehicleByIdUseCase,
      findClientById as unknown as FindClientByIdUseCase,
      buildBudget as unknown as BuildServiceOrderBudgetUseCase,
    );
  });

  it('deve enviar o e-mail de status com o status público e o link de acompanhamento', async () => {
    const serviceOrder = makeServiceOrder({
      vehicleId: vehicle.id,
      status: ServiceOrderStatus.IN_EXECUTION,
    });

    await useCase.execute(serviceOrder);

    expect(gateway.sendStatusUpdate).toHaveBeenCalledWith({
      to: 'joao@email.com',
      recipientName: 'João',
      status: toPublicStatus(ServiceOrderStatus.IN_EXECUTION),
      trackingLink: expect.stringContaining('/service-orders/track/'),
    });
    expect(gateway.sendBudget).not.toHaveBeenCalled();
  });

  it('deve enviar o e-mail de orçamento com links de aprovar e recusar quando aguarda aprovação', async () => {
    const serviceOrder = makeServiceOrder({
      vehicleId: vehicle.id,
      status: ServiceOrderStatus.AWAITING_APPROVAL,
    });

    await useCase.execute(serviceOrder);

    expect(gateway.sendBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'joao@email.com',
        recipientName: 'João',
        totalAmount: 160,
        lines: [
          { description: 'Troca de óleo', amount: 100 },
          { description: 'Filtro (x2)', amount: 60 },
        ],
        approveUrl: expect.stringContaining('/budget-decisions/'),
        rejectUrl: expect.stringContaining('/budget-decisions/'),
        trackingLink: expect.stringContaining('/service-orders/track/'),
      }),
    );
    const { approveUrl, rejectUrl } = gateway.sendBudget.mock.calls[0][0];
    expect(approveUrl).not.toBe(rejectUrl);
    expect(gateway.sendStatusUpdate).not.toHaveBeenCalled();
  });

  it('não deve enviar nada quando o cliente não tem e-mail', async () => {
    findClientById.execute.mockResolvedValue(makeClient({ email: null }));

    await useCase.execute(makeServiceOrder({ vehicleId: vehicle.id }));

    expect(gateway.sendStatusUpdate).not.toHaveBeenCalled();
    expect(gateway.sendBudget).not.toHaveBeenCalled();
  });

  it('não deve lançar erro quando o envio falha', async () => {
    gateway.sendStatusUpdate.mockRejectedValue(new Error('SMTP fora do ar'));

    await expect(
      useCase.execute(makeServiceOrder({ vehicleId: vehicle.id })),
    ).resolves.toBeUndefined();
  });
});
