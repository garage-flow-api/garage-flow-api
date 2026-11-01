export const makeFakeNotificationGateway = () => ({
  sendStatusUpdate: jest.fn().mockResolvedValue(undefined),
  sendBudget: jest.fn().mockResolvedValue(undefined),
});
