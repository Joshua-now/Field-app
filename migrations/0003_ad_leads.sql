-- Migration: Ad Leads tracking table (owner/admin only)
-- Run in Railway Postgres console (field app DB)

CREATE TABLE IF NOT EXISTS ad_leads (
  id                  serial PRIMARY KEY,
  tenant_id           varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Lead identity
  first_name          text,
  last_name           text,
  phone               text,
  email               text,
  service_interest    text,
  estimated_value     decimal(10,2),

  -- Source tracking
  source_platform     text,        -- google | meta | organic | referral | other
  campaign_id         text,
  campaign_name       text,
  ad_group_name       text,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  gclid               text,
  fbclid              text,

  -- Status & lifecycle
  status              text NOT NULL DEFAULT 'new',
  follow_up_count     integer NOT NULL DEFAULT 0,
  last_follow_up_at   timestamp,
  next_follow_up_at   timestamp,
  booked_job_id       integer,

  -- Outcome
  outcome             text,
  outcome_notes       text,
  raw_payload         jsonb,

  created_at          timestamp DEFAULT now(),
  updated_at          timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_leads_tenant   ON ad_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ad_leads_status   ON ad_leads(status);
CREATE INDEX IF NOT EXISTS idx_ad_leads_platform ON ad_leads(source_platform);
CREATE INDEX IF NOT EXISTS idx_ad_leads_followup ON ad_leads(next_follow_up_at) WHERE status = 'follow_up';
