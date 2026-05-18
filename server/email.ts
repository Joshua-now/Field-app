/**
 * server/email.ts
 * Lightweight email helper. Supports:
 *   1. SMTP via nodemailer (SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS)
 *   2. SendGrid via @sendgrid/mail (SENDGRID_API_KEY)
 *   3. Dev fallback — logs the email to console so local development works without SMTP
 */

// ─── Onboarding email ─────────────────────────────────────────────────────────

export async function sendOnboardingEmail(
  to: string,
  companyName: string,
  onboardUrl: string
): Promise<void> {
  const subject = `Set up your AI receptionist — ${companyName}`;
  const html = buildOnboardingHtml(companyName, onboardUrl);
  const text = buildOnboardingText(companyName, onboardUrl);

  await sendEmail({ to, subject, html, text });
}

// ─── Generic send ─────────────────────────────────────────────────────────────

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  // ── SendGrid ──────────────────────────────────────────────────────────────
  if (process.env.SENDGRID_API_KEY) {
    await sendViaSendGrid(payload);
    return;
  }

  // ── SMTP (nodemailer) ─────────────────────────────────────────────────────
  if (process.env.SMTP_HOST) {
    await sendViaSmtp(payload);
    return;
  }

  // ── Dev fallback ──────────────────────────────────────────────────────────
  console.log("\n──────────────────────────────────────────────────────────────");
  console.log("[Email] No mail provider configured — logging email to console:");
  console.log(`  To:      ${payload.to}`);
  console.log(`  Subject: ${payload.subject}`);
  console.log(`  Body:\n${payload.text}`);
  console.log("──────────────────────────────────────────────────────────────\n");
}

// ─── SendGrid ─────────────────────────────────────────────────────────────────

async function sendViaSendGrid(payload: EmailPayload): Promise<void> {
  const sgMail = (await import("@sendgrid/mail")).default;
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

  const from = process.env.EMAIL_FROM || "noreply@speedtolead.ai";

  await sgMail.send({
    to: payload.to,
    from,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });

  console.log(`[Email] Sent via SendGrid to ${payload.to}: "${payload.subject}"`);
}

// ─── SMTP (nodemailer) ────────────────────────────────────────────────────────

async function sendViaSmtp(payload: EmailPayload): Promise<void> {
  const nodemailer = (await import("nodemailer")).default;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });

  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@speedtolead.ai";

  await transporter.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });

  console.log(`[Email] Sent via SMTP to ${payload.to}: "${payload.subject}"`);
}

// ─── Templates ────────────────────────────────────────────────────────────────

function buildOnboardingHtml(companyName: string, onboardUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Set up your AI receptionist</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#1e293b;border-radius:16px;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#2563eb;padding:32px 40px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                ⚡ Speed-to-Lead
              </h1>
              <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">AI Phone Receptionist Setup</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 12px;color:#f1f5f9;font-size:20px;font-weight:600;">
                Welcome to the team, ${companyName}! 🎉
              </h2>
              <p style="margin:0 0 20px;color:#94a3b8;font-size:15px;line-height:1.6;">
                Your AI phone receptionist is almost ready. Click the button below to complete your
                5-minute setup — our bot will scan your website and configure your AI automatically.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-radius:10px;background:#2563eb;">
                    <a href="${onboardUrl}"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;
                              font-weight:600;text-decoration:none;border-radius:10px;">
                      Set up my AI receptionist →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.5;">
                This link is valid for 7 days. If it expires, reply to this email and we'll send a new one.
              </p>

              <hr style="border:none;border-top:1px solid #334155;margin:28px 0;">

              <!-- What happens next -->
              <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
                What to expect
              </p>
              <table cellpadding="0" cellspacing="0" style="width:100%;">
                ${[
                  ["🔗", "Paste your website URL"],
                  ["🤖", "We scan it automatically"],
                  ["✏️", "Answer a few quick questions"],
                  ["🎤", "Name your AI receptionist"],
                  ["✅", "Go live — calls answered instantly"],
                ]
                  .map(
                    ([icon, text]) => `
                <tr>
                  <td width="28" style="padding:4px 0;color:#f1f5f9;font-size:15px;vertical-align:top;">${icon}</td>
                  <td style="padding:4px 0;color:#94a3b8;font-size:14px;vertical-align:top;">${text}</td>
                </tr>`
                  )
                  .join("")}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1e293b;background:#0f172a;">
              <p style="margin:0;color:#475569;font-size:12px;text-align:center;">
                Questions? Reply to this email or visit
                <a href="https://speedtolead.ai" style="color:#60a5fa;text-decoration:none;">speedtolead.ai</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOnboardingText(companyName: string, onboardUrl: string): string {
  return `Welcome to Speed-to-Lead, ${companyName}!

Your AI phone receptionist is almost ready.

Complete your 5-minute setup here:
${onboardUrl}

This link is valid for 7 days.

What happens during setup:
1. Paste your website URL
2. We scan it automatically
3. Answer a few quick questions
4. Name your AI receptionist
5. Go live — calls answered instantly

Questions? Reply to this email.

— The Speed-to-Lead Team
`;
}
