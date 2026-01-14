export const appConfig = {
  companyName: process.env.COMPANY_NAME || "FieldTech",
  companyTagline: process.env.COMPANY_TAGLINE || "Field Service Management",
  primaryColor: process.env.PRIMARY_COLOR || "hsl(220 70% 50%)",
  supportEmail: process.env.SUPPORT_EMAIL || "support@example.com",
  supportPhone: process.env.SUPPORT_PHONE || "",
  timezone: process.env.TIMEZONE || "America/New_York",
  dateFormat: process.env.DATE_FORMAT || "MM/dd/yyyy",
  serviceTypes: (process.env.SERVICE_TYPES || "hvac_repair,hvac_maintenance,plumbing_repair,plumbing_leak,electrical,other").split(","),
};

export type AppConfig = typeof appConfig;
