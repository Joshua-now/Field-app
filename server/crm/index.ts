/**
 * CRM Adapter Factory
 * Call getCrmAdapter(tenant) — returns the right adapter for the tenant's CRM,
 * or null if they haven't connected one yet.
 */

import type { Tenant } from "@shared/models/auth";
import { GhlAdapter } from "./ghl";
import { JobberAdapter } from "./jobber";
import { ServiceTitanAdapter } from "./servicetitan";
import type { CrmAdapter } from "./types";

export { type CrmAdapter, type CrmContact, type CrmSearchResult } from "./types";

export function getCrmAdapter(tenant: Tenant): CrmAdapter | null {
  const { crmType, crmApiKey, ghlLocationId } = tenant as any;

  if (!crmType || !crmApiKey) return null;

  switch (crmType) {
    case "ghl": {
      if (!ghlLocationId) return null;
      return new GhlAdapter(crmApiKey, ghlLocationId);
    }

    case "jobber": {
      return new JobberAdapter(crmApiKey);
    }

    case "servicetitan": {
      // For ServiceTitan we store "clientId::clientSecret::stTenantId" in crmApiKey
      const parts = crmApiKey.split("::");
      if (parts.length < 3) return null;
      return new ServiceTitanAdapter(parts[0], parts[1], parts[2]);
    }

    default:
      return null;
  }
}

export function crmTypeLabel(crmType: string | null): string {
  switch (crmType) {
    case "ghl": return "GoHighLevel";
    case "jobber": return "Jobber";
    case "servicetitan": return "ServiceTitan";
    default: return "None";
  }
}
