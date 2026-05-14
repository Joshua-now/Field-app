/**
 * GoHighLevel CRM Adapter
 * Uses LeadConnector API v2021-07-28
 * Requires: pitToken (GHL Private Integration Token) + locationId
 */

import axios from "axios";
import type { CrmAdapter, CrmContact, CrmOpportunity, CrmSearchResult } from "./types";

const BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

export class GhlAdapter implements CrmAdapter {
  private headers: Record<string, string>;
  private locationId: string;

  constructor(pitToken: string, locationId: string) {
    this.locationId = locationId;
    this.headers = {
      Authorization: `Bearer ${pitToken}`,
      "Content-Type": "application/json",
      Version: VERSION,
    };
  }

  async searchContacts(query: string): Promise<CrmSearchResult> {
    try {
      const resp = await axios.get(`${BASE}/contacts/search`, {
        headers: this.headers,
        params: { locationId: this.locationId, query, limit: 5 },
        timeout: 10000,
      });

      const raw: any[] = resp.data?.contacts || [];

      const contacts: CrmContact[] = (await Promise.allSettled(
        raw.map(async (c: any) => {
          // Fetch notes for each contact
          let notes: string[] = [];
          try {
            const noteResp = await axios.get(`${BASE}/contacts/${c.id}/notes`, {
              headers: this.headers,
              timeout: 5000,
            });
            notes = (noteResp.data?.notes || [])
              .slice(0, 3)
              .map((n: any) => n.body || "");
          } catch {}

          // Fetch opportunities
          let opportunities: CrmOpportunity[] = [];
          try {
            const oppResp = await axios.get(`${BASE}/opportunities/search`, {
              headers: this.headers,
              params: { location_id: this.locationId, contact_id: c.id, limit: 3 },
              timeout: 5000,
            });
            opportunities = (oppResp.data?.opportunities || []).map((o: any) => ({
              id: o.id,
              name: o.name,
              stage: o.pipelineStageId || o.status,
              value: o.monetaryValue,
              createdAt: o.createdAt,
            }));
          } catch {}

          return {
            id: c.id,
            firstName: c.firstName || "",
            lastName: c.lastName || "",
            phone: c.phone,
            email: c.email,
            tags: c.tags || [],
            stage: c.customField?.stage || c.type,
            source: c.source,
            notes,
            opportunities,
            raw: c,
          };
        })
      )).filter(r => r.status === "fulfilled").map(r => (r as PromiseFulfilledResult<CrmContact>).value);

      return { ok: true, contacts, source: "ghl" };
    } catch (err: any) {
      return {
        ok: false,
        contacts: [],
        error: err?.response?.data?.message || err.message,
        source: "ghl",
      };
    }
  }

  async addNote(contactId: string, note: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await axios.post(
        `${BASE}/contacts/${contactId}/notes`,
        { body: note, userId: "bob-ai" },
        { headers: this.headers, timeout: 8000 }
      );
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.response?.data?.message || err.message };
    }
  }

  async updateStage(contactId: string, stage: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await axios.put(
        `${BASE}/contacts/${contactId}`,
        { customField: { stage } },
        { headers: this.headers, timeout: 8000 }
      );
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.response?.data?.message || err.message };
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      // contacts/search only needs contacts.readonly — no locations scope required
      await axios.get(`${BASE}/contacts/search`, {
        headers: this.headers,
        params: { locationId: this.locationId, query: "test", limit: 1 },
        timeout: 8000,
      });
      return { ok: true };
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        return { ok: false, error: "Invalid API token — check your GHL Private Integration Token." };
      }
      return { ok: false, error: err?.response?.data?.message || err.message };
    }
  }
}
