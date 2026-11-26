import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing email over SMTP. Works with Microsoft 365 (smtp.office365.com:587),
 * Google Workspace (smtp.gmail.com:587 with an app password) or any provider.
 * Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in .env.
 */
const cfg = {
  host: process.env.SMTP_HOST?.trim() ?? "",
  port: Number(process.env.SMTP_PORT ?? 587),
  user: process.env.SMTP_USER?.trim() ?? "",
  pass: process.env.SMTP_PASS ?? "",
  from: process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || "",
};

export const isMailConfigured = () => Boolean(cfg.host && cfg.from);

let transporter: Transporter | null = null;
function transport() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465, // 465 = TLS from the start; 587 = STARTTLS
      requireTLS: cfg.port !== 465 && cfg.port !== 25,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      pool: true, // reuse the connection when emailing a whole month
      maxConnections: 2,
    });
  }
  return transporter;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super("Email is not set up on the server. Add SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM to the backend .env.");
  }
}

export async function sendMail(msg: { to: string; subject: string; html: string; text: string; replyTo?: string }) {
  if (!isMailConfigured()) throw new MailNotConfiguredError();
  await transport().sendMail({ from: cfg.from, ...msg });
}

/** A short, safe reason to show an admin when a send fails (no server internals). */
export function mailErrorMessage(e: unknown) {
  if (e instanceof MailNotConfiguredError) return e.message;
  const code = (e as { code?: string; responseCode?: number })?.code;
  const response = (e as { responseCode?: number })?.responseCode;
  if (code === "EAUTH") return "The mail server rejected the sign-in. Check SMTP_USER and SMTP_PASS.";
  if (code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET" || code === "EDNS")
    return "Could not reach the mail server. Check SMTP_HOST and SMTP_PORT.";
  if (code === "EENVELOPE" || (response && response >= 550 && response < 560)) return "The recipient address was rejected.";
  return "The email could not be sent.";
}
