/**
 * CRM Adapter — shared types
 * Every CRM adapter returns data in this normalized shape so Bob
 * doesn't have to know which CRM the contractor is on.
 */

export interface CrmContact {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  tags?: string[];
  stage?: string;           // pipeline stage name
  source?: string;          // lead source
  notes?: string[];         // recent notes/activity
  opportunities?: CrmOpportunity[];
  raw?: Record<string, any>; // original API payload for debugging
}

export interface CrmOpportunity {
  id: string;
  name: string;
  stage: string;
  value?: number;
  createdAt?: string;
}

export interface CrmSearchResult {
  ok: boolean;
  contacts: CrmContact[];
  error?: string;
  source: string; // 'ghl' | 'jobber' | 'servicetitan' | 'none'
}

export interface CrmAdapter {
  /** Search for contacts by name, phone, or email */
  searchContacts(query: string): Promise<CrmSearchResult>;
  /** Add a note to a contact */
  addNote(contactId: string, note: string): Promise<{ ok: boolean; error?: string }>;
  /** Move contact to a new pipeline stage */
  updateStage(contactId: string, stage: string): Promise<{ ok: boolean; error?: string }>;
  /** Verify the API key / credentials work */
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}
