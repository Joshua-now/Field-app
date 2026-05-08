/**
 * Jobber CRM Adapter — STUB
 * Jobber uses OAuth2 + GraphQL API.
 * When a contractor connects Jobber, they paste their API access token.
 *
 * TODO: Implement full OAuth flow + GraphQL queries when first Jobber client onboards.
 * Docs: https://developer.getjobber.com/docs
 */

import type { CrmAdapter, CrmSearchResult } from "./types";

const NOT_YET = "Jobber integration is coming soon. Your account is configured for Jobber — once the connector is fully activated, Bob will be able to search your Jobber clients, jobs, and invoices directly.";

export class JobberAdapter implements CrmAdapter {
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async searchContacts(_query: string): Promise<CrmSearchResult> {
    return {
      ok: false,
      contacts: [],
      error: NOT_YET,
      source: "jobber",
    };
  }

  async addNote(_contactId: string, _note: string) {
    return { ok: false, error: NOT_YET };
  }

  async updateStage(_contactId: string, _stage: string) {
    return { ok: false, error: NOT_YET };
  }

  async testConnection() {
    // Basic reachability check — Jobber GraphQL endpoint
    try {
      const res = await fetch("https://api.getjobber.com/api/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "{ __typename }" }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok || res.status === 401) {
        return res.status === 401
          ? { ok: false, error: "Invalid Jobber API token." }
          : { ok: true };
      }
      return { ok: false, error: `Jobber returned status ${res.status}` };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}
