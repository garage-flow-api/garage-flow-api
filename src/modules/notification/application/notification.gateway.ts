export interface StatusNotification {
  to: string;
  recipientName: string;
  status: string;
  trackingLink: string;
}

export interface BudgetLine {
  description: string;
  amount: number;
}

export interface BudgetNotification {
  to: string;
  recipientName: string;
  lines: BudgetLine[];
  totalAmount: number;
  approveUrl: string;
  rejectUrl: string;
  trackingLink: string;
}

export abstract class NotificationGateway {
  abstract sendStatusUpdate(notification: StatusNotification): Promise<void>;
  abstract sendBudget(notification: BudgetNotification): Promise<void>;
}
