/**
 * ServiceTitan CRM Adapter — STUB
 * ServiceTitan uses OAuth2 client credentials flow.
 * Requires: clientId + clientSecret (from their Developer Portal) + tenantId.
 *
 * TODO: Implement when first ServiceTitan client onboards.
 * Docs: https://developer.servicetitan.io/docs/get-started/
 *
 * Note: ServiceTitan partner approval is required before API access is granted.
 * This stub lets us accept ST credentials during onboarding and
 * test connectivity once credentials are available.
 */

import type { CrmAdapter, CrmSearchResult } from "./types";

const NOT_YET = "ServiceTitan integration is coming soon. Your credentials are saved — once the connector is fully activated, Bob will be able to pull your ServiceTitan customers, jobs, and invoices.";

export class ServiceTitanAdapter implements CrmAdapter {
  private clientId: string;
  private clientSecret: string;
  private stTenantId: string;

  constructor(clientId: string, clientSecret: string, stTenantId: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.stTenantId = stTenantId;
  }

  async searchContacts(_query: string): Promise<CrmSearchResult> {
    return {
      ok: false,
      contacts: [],
      error: NOT_YET,
      source: "servicetitan",
    };
  }

  async addNote(_contactId: string, _note: string) {
    return { ok: false, error: NOT_YET };
  }

  async updateStage(_contactId: string, _stage: string) {
    return { ok: false, error: NOT_YET };
  }

  async testConnection() {
    // Attempt OAuth token exchange to verify credentials
    try {
      const res = await fetch("https://auth.servicetitan.io/connect/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json() as any;
      if (data.access_token) return { ok: true };
      return { ok: false, error: data.error_description || "Invalid ServiceTitan credentials." };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}
