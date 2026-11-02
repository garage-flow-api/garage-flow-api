import {
  type BudgetNotification,
  type StatusNotification,
} from '@notification/application/notification.gateway';
import { escape } from 'html-escaper';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: string): string => escape(value);

const escapeHttpUrl = (value: string): string => {
  const { protocol } = new URL(value);

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new TypeError('Only HTTP and HTTPS URLs are allowed');
  }

  return escape(value);
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function renderStatusUpdateEmail(notification: StatusNotification): RenderedEmail {
  const name = escapeHtml(notification.recipientName);
  const status = escapeHtml(notification.status);
  const link = escapeHttpUrl(notification.trackingLink);

  return {
    subject: `Garage Flow: sua OS está em "${notification.status}"`,
    text: `Olá, ${notification.recipientName}!\n\nA situação da sua ordem de serviço mudou para: ${notification.status}.\nAcompanhe em: ${notification.trackingLink}\n`,
    html: `<p>Olá, ${name}!</p>
<p>A situação da sua ordem de serviço mudou para: <strong>${status}</strong>.</p>
<p><a href="${link}">Acompanhar minha OS</a></p>`,
  };
}

export function renderBudgetEmail(notification: BudgetNotification): RenderedEmail {
  const name = escapeHtml(notification.recipientName);
  const rows = notification.lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.description)}</td><td align="right">${formatCurrency(line.amount)}</td></tr>`,
    )
    .join('');
  const textLines = notification.lines
    .map((line) => `- ${line.description}: ${formatCurrency(line.amount)}`)
    .join('\n');

  return {
    subject: 'Garage Flow: o orçamento da sua OS está pronto',
    text: `Olá, ${notification.recipientName}!\n\nOrçamento:\n${textLines}\nTotal: ${formatCurrency(notification.totalAmount)}\n\nAprovar: ${notification.approveUrl}\nRecusar: ${notification.rejectUrl}\nAcompanhar: ${notification.trackingLink}\n`,
    html: `<p>Olá, ${name}!</p>
<p>O orçamento da sua ordem de serviço está pronto:</p>
<table cellpadding="4">${rows}<tr><td><strong>Total</strong></td><td align="right"><strong>${formatCurrency(notification.totalAmount)}</strong></td></tr></table>
<p><a href="${escapeHttpUrl(notification.approveUrl)}">Aprovar orçamento</a> | <a href="${escapeHttpUrl(notification.rejectUrl)}">Recusar orçamento</a></p>
<p><a href="${escapeHttpUrl(notification.trackingLink)}">Acompanhar minha OS</a></p>`,
  };
}
