/**
 * Bob Marketing Tools — owner/admin only
 * Role is checked BEFORE any data is returned.
 * Techs and dispatchers get a clean refusal, not an error.
 */

import { db } from "../db";
import { adLeads } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, count } from "drizzle-orm";

const OWNER_ROLES = ["owner", "admin"];

export function assertMarketingRole(role: string) {
  if (!OWNER_ROLES.includes(role)) {
    throw new Error("Marketing data is only available to owners and admins.");
  }
}

// ─── LEAD SUMMARY ─────────────────────────────────────────────────────────────

export async function getLeadSummary(
  tenantId: string,
  role: string,
  days = 7
): Promise<string> {
  assertMarketingRole(role);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      status: adLeads.status,
      platform: adLeads.sourcePlatform,
      count: count(),
    })
    .from(adLeads)
    .where(and(eq(adLeads.tenantId, tenantId), gte(adLeads.createdAt, since)))
    .groupBy(adLeads.status, adLeads.sourcePlatform);

  if (rows.length === 0) {
    return `No leads tracked in the last ${days} days. Make sure your intake webhook is connected.`;
  }

  const total   = rows.reduce((s, r) => s + Number(r.count), 0);
  const booked  = rows.filter(r => r.status === "booked" || r.status === "won").reduce((s, r) => s + Number(r.count), 0);
  const cold    = rows.filter(r => r.status === "cold").reduce((s, r) => s + Number(r.count), 0);
  const fresh   = rows.filter(r => r.status === "new" || r.status === "contacted").reduce((s, r) => s + Number(r.count), 0);

  const byPlatform: Record<string, number> = {};
  for (const r of rows) {
    const p = r.platform || "unknown";
    byPlatform[p] = (byPlatform[p] || 0) + Number(r.count);
  }

  const platformSummary = Object.entries(byPlatform)
    .map(([p, n]) => `${p}: ${n}`)
    .join(", ");

  const convRate = total > 0 ? Math.round((booked / total) * 100) : 0;

  return [
    `Lead summary — last ${days} days:`,
    `• Total leads: ${total} (${platformSummary})`,
    `• Booked: ${booked} (${convRate}% conversion)`,
    `• Cold / no response: ${cold}`,
    `• Still active: ${fresh}`,
    booked === 0 ? "⚠ No bookings yet — consider reviewing follow-up timing." : "",
    cold > booked ? `⚠ ${cold} cold leads — worth a re-engagement push.` : "",
  ].filter(Boolean).join("\n");
}

// ─── COLD LEADS FOR FOLLOW-UP ────────────────────────────────────────────────

export async function getColdLeads(
  tenantId: string,
  role: string,
  limit = 10
): Promise<string> {
  assertMarketingRole(role);

  const rows = await db
    .select()
    .from(adLeads)
    .where(
      and(
        eq(adLeads.tenantId, tenantId),
        sql`${adLeads.status} IN ('new', 'cold', 'follow_up')`
      )
    )
    .orderBy(adLeads.createdAt)
    .limit(limit);

  if (rows.length === 0) return "No cold leads right now — pipeline is clean.";

  const lines = rows.map((l, i) => {
    const name = [l.firstName, l.lastName].filter(Boolean).join(" ") || "Unknown";
    const age  = Math.floor((Date.now() - new Date(l.createdAt!).getTime()) / 86400000);
    return `${i + 1}. ${name} — ${l.serviceInterest || "service unknown"} | ${l.sourcePlatform || "?"} | ${age}d old | status: ${l.status}`;
  });

  return [`Cold leads requiring follow-up (${rows.length}):`, ...lines].join("\n");
}

// ─── LEAD INTAKE (called from API route) ─────────────────────────────────────

export async function ingestLead(
  tenantId: string,
  data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    serviceInterest?: string;
    sourcePlatform?: string;
    campaignId?: string;
    campaignName?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    gclid?: string;
    fbclid?: string;
    estimatedValue?: number;
    rawPayload?: any;
  }
): Promise<number> {
  const [lead] = await db
    .insert(adLeads)
    .values({
      tenantId,
      firstName:       data.firstName,
      lastName:        data.lastName,
      phone:           data.phone,
      email:           data.email,
      serviceInterest: data.serviceInterest,
      sourcePlatform:  data.sourcePlatform || "other",
      campaignId:      data.campaignId,
      campaignName:    data.campaignName,
      utmSource:       data.utmSource,
      utmMedium:       data.utmMedium,
      utmCampaign:     data.utmCampaign,
      gclid:           data.gclid,
      fbclid:          data.fbclid,
      estimatedValue:  data.estimatedValue?.toString(),
      rawPayload:      data.rawPayload,
      status:          "new",
    })
    .returning();

  console.log(`[Marketing] Lead ingested: ${lead.id} — ${data.firstName} ${data.lastName} via ${data.sourcePlatform}`);
  return lead.id;
}

// ─── UPDATE LEAD STATUS ───────────────────────────────────────────────────────

export async function updateLeadStatus(
  tenantId: string,
  role: string,
  leadId: number,
  status: string,
  notes?: string
): Promise<string> {
  assertMarketingRole(role);

  const validStatuses = ["new", "contacted", "follow_up", "booked", "cold", "lost", "won"];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Use: ${validStatuses.join(", ")}`);
  }

  await db
    .update(adLeads)
    .set({
      status,
      outcomeNotes: notes,
      outcome: ["booked", "won", "lost"].includes(status) ? status : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(adLeads.id, leadId), eq(adLeads.tenantId, tenantId)));

  return `Lead #${leadId} updated to "${status}"${notes ? ` — ${notes}` : ""}.`;
}
