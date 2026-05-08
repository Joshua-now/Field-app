-- Migration: add briefing_enabled column to tenants
-- Run this in Railway's Postgres console before deploying

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS briefing_enabled boolean NOT NULL DEFAULT false;
