import { getUncachableStripeClient } from './stripeClient';

export class StripeService {
  async createCustomer(email: string, name: string, phone?: string, metadata?: Record<string, string>) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      name,
      phone,
      metadata,
    });
  }

  async getOrCreateCustomer(email: string, name: string, phone?: string) {
    const stripe = await getUncachableStripeClient();
    const existing = await stripe.customers.list({ email, limit: 1 });
    
    if (existing.data.length > 0) {
      return existing.data[0];
    }
    
    return await this.createCustomer(email, name, phone);
  }

  async createJobInvoice(
    customerId: string,
    jobId: number,
    jobNumber: string,
    lineItems: { description: string; amount: number }[],
    dueInDays: number = 30
  ) {
    const stripe = await getUncachableStripeClient();
    
    for (const item of lineItems) {
      await stripe.invoiceItems.create({
        customer: customerId,
        amount: Math.round(item.amount * 100),
        currency: 'usd',
        description: item.description,
      });
    }
    
    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: true,
      collection_method: 'send_invoice',
      days_until_due: dueInDays,
      metadata: { 
        jobId: jobId.toString(),
        jobNumber: jobNumber,
      },
    });
    
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    
    return finalizedInvoice;
  }

  async sendInvoice(invoiceId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.invoices.sendInvoice(invoiceId);
  }

  async getInvoice(invoiceId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.invoices.retrieve(invoiceId);
  }

  async getInvoicePaymentUrl(invoiceId: string): Promise<string | null> {
    const stripe = await getUncachableStripeClient();
    const invoice = await stripe.invoices.retrieve(invoiceId);
    return invoice.hosted_invoice_url || null;
  }

  async createQuickPaymentLink(
    customerId: string,
    amount: number,
    description: string,
    jobId: number,
    jobNumber: string
  ) {
    const stripe = await getUncachableStripeClient();
    
    const baseUrl = process.env.REPLIT_DOMAINS?.split(',')[0];
    const successUrl = baseUrl ? `https://${baseUrl}/portal?paid=true` : 'https://example.com/success';
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amount * 100),
          product_data: {
            name: `Service: ${jobNumber}`,
            description: description,
          },
        },
        quantity: 1,
      }],
      metadata: {
        jobId: jobId.toString(),
        jobNumber: jobNumber,
      },
      success_url: successUrl,
      cancel_url: successUrl.replace('paid=true', 'cancelled=true'),
    });
    
    return session;
  }

  async listCustomerInvoices(customerId: string, limit: number = 10) {
    const stripe = await getUncachableStripeClient();
    return await stripe.invoices.list({
      customer: customerId,
      limit,
    });
  }
}

export const stripeService = new StripeService();
