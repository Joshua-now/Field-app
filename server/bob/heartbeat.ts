/**
 * Bob Heartbeat — scheduled cron jobs
 * Morning briefing (6 AM ET), Evening briefing (6 PM ET), Hourly health sweep
 */

import cron from "node-cron";
import axios from "axios";
import { db } from "../db";
import { tenants, users, bobConversations, bobMessages } from "@shared/schema";
import { eq, and } from "drizzle-orm";

async function sendSMS(to: string, body: string) {
  try {
    await axios.post(
      "https://api.telnyx.com/v2/messages",
      {
        from: process.env.TELNYX_PHONE_NUMBER,
        to,
        text: body,
      },
      { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` } }
    );
  } catch (e: any) {
    console.error("[Heartbeat] SMS error:", e?.message);
  }
}

async function makeCall(to: string, webhookUrl: string, clientState?: string) {
  const r = await axios.post(
    "https://api.telnyx.com/v2/calls",
    {
      connection_id: process.env.TELNYX_CONNECTION_ID || process.env.TELNYX_APP_ID,
      to,
      from: process.env.TELNYX_PHONE_NUMBER,
      webhook_url: webhookUrl,
      webhook_url_method: "POST",
      ...(clientState ? { client_state: clientState } : {}),
    },
    { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` } }
  );
  return r.data?.data;
}

async function checkAllServices() {
  const services = [
    { name: "n8n", url: `${process.env.N8N_BASE_URL}/healthz` },
    { name: "Switchboard", url: `${process.env.SWITCHBOARD_URL}/health` },
  ].filter(s => s.url && !s.url.startsWith("undefined"));

  const results = await Promise.all(
    services.map(async ({ name, url }) => {
      try {
        await axios.get(url, { timeout: 7000 });
        return { name, status: "ok" };
      } catch {
        return { name, status: "down" };
      }
    })
  );
  return results;
}

async function startBriefingCall(tenant: any, _user: any, briefingType: "morning" | "evening") {
  const selfUrl = process.env.SELF_URL || "https://field-app-production-d5c8.up.railway.app";
  // BRIEFING_PHONE overrides everything; fall back to the tenant's registered phone
  // Note: users table has no phone field — contact number lives on the tenant record
  const phone   = process.env.BRIEFING_PHONE || tenant?.phone;

  if (!phone) {
    console.log(`[Heartbeat] No phone for tenant ${tenant.id}, skipping briefing call`);
    return;
  }

  try {
    const clientState = Buffer.from(JSON.stringify({ tenantId: tenant.id, briefingType })).toString("base64");
    const call = await makeCall(phone, `${selfUrl}/api/voice/webhook`, clientState);
    console.log(`[Heartbeat] ${briefingType} call initiated | callControlId: ${call?.call_control_id}`);
  } catch (e: any) {
    console.error(`[Heartbeat] ${briefingType} call failed:`, e?.message);
  }
}

export function startHeartbeat() {
  console.log("[Heartbeat] Service started");

  // Morning briefing — 10:00 UTC = 6:00 AM EDT
  cron.schedule("0 10 * * *", async () => {
    console.log("[Heartbeat] Morning briefing...");
    let activeTenants: any[] = [];
    try {
      activeTenants = await db.query.tenants.findMany({
        where: (t, { eq }) => eq(t.status, "active"),
      });
    } catch (e: any) {
      console.error("[Heartbeat] Failed to load tenants for morning briefing:", e.message);
      return;
    }
    for (const tenant of activeTenants) {
      try {
        if (!tenant.bobEnabled || !(tenant as any).briefingEnabled) continue;
        const user = await db.query.users.findFirst({
          where: and(eq(users.tenantId, tenant.id), eq(users.role, "owner")),
        });
        await startBriefingCall(tenant, user, "morning");
      } catch (e: any) {
        console.error(`[Heartbeat] Morning briefing failed for tenant ${tenant.id}:`, e.message);
      }
    }
  });

  // Evening briefing — 22:00 UTC = 6:00 PM EDT
  cron.schedule("0 22 * * *", async () => {
    console.log("[Heartbeat] Evening briefing...");
    let activeTenants: any[] = [];
    try {
      activeTenants = await db.query.tenants.findMany({
        where: (t, { eq }) => eq(t.status, "active"),
      });
    } catch (e: any) {
      console.error("[Heartbeat] Failed to load tenants for evening briefing:", e.message);
      return;
    }
    for (const tenant of activeTenants) {
      try {
        if (!tenant.bobEnabled || !(tenant as any).briefingEnabled) continue;
        const user = await db.query.users.findFirst({
          where: and(eq(users.tenantId, tenant.id), eq(users.role, "owner")),
        });
        await startBriefingCall(tenant, user, "evening");
      } catch (e: any) {
        console.error(`[Heartbeat] Evening briefing failed for tenant ${tenant.id}:`, e.message);
      }
    }
  });

  // Hourly health sweep — every hour at :30
  cron.schedule("30 * * * *", async () => {
    console.log("[Heartbeat] Health sweep...");
    try {
      const results = await checkAllServices();
      const down = results.filter(r => r.status === "down");

      if (down.length > 0) {
        const activeTenants = await db.query.tenants.findMany({
          where: (t, { eq }) => eq(t.status, "active"),
        });
        for (const tenant of activeTenants) {
          try {
            if (!tenant.bobEnabled) continue;
            const phone = tenant.phone;
            if (!phone) continue;
            const msg = `Bob health sweep: ${down.map((d: any) => `${d.name} is DOWN`).join(", ")}. Check Railway.`;
            await sendSMS(phone, msg.substring(0, 320));
            console.log(`[Heartbeat] Alert SMS sent to ${phone}`);
          } catch (e: any) {
            console.error(`[Heartbeat] Health alert SMS failed for tenant ${tenant.id}:`, e.message);
          }
        }
      } else {
        console.log("[Heartbeat] All services healthy");
      }
    } catch (e: any) {
      console.error("[Heartbeat] Sweep error:", e?.message);
    }
  });
}
