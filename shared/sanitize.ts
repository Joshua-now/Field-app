export function sanitizeString(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, 10000);
}

export function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return "";
  return email.trim().toLowerCase().slice(0, 255);
}

export function sanitizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/[^\d\-\+\(\)\s\.ext]/gi, "").slice(0, 30);
}

export function sanitizeNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .slice(0, 50000);
}

export function normalizeZipCode(zip: string | null | undefined): string {
  if (!zip) return "";
  const digits = zip.replace(/\D/g, "");
  if (digits.length === 9) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return digits.slice(0, 5);
}
