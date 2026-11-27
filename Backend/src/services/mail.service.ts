import { env } from "../config/env.js";

const GRAPH_API = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const configuredFrom = process.env.MAIL_FROM_ADDRESS?.trim() || process.env.MAIL_FROM?.trim() || "";
const fromAddress = /<([^<>]+)>/.exec(configuredFrom)?.[1]?.trim() || configuredFrom;

type GraphRequestSource = "token" | "send";

class GraphMailError extends Error {
  constructor(
    readonly source: GraphRequestSource,
    readonly status: number,
    readonly code?: string,
  ) {
    super("Microsoft Graph mail request failed.");
  }
}

let cachedToken: { value: string; expiresAt: number } | undefined;
let tokenRequest: Promise<string> | undefined;

export const isMailConfigured = () =>
  Boolean(env.microsoftTenantId.trim() && env.microsoftClientId.trim() && env.microsoftClientSecret.trim() && fromAddress);

export class MailNotConfiguredError extends Error {
  constructor() {
    super("Microsoft Graph email is not configured. Set MICROSOFT_* (or AZURE_AD_*) app credentials and MAIL_FROM_ADDRESS in Backend/.env.");
  }
}

async function requestAccessToken() {
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(env.microsoftTenantId.trim())}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.microsoftClientId.trim(),
        client_secret: env.microsoftClientSecret.trim(),
        scope: GRAPH_SCOPE,
        grant_type: "client_credentials",
      }),
    },
  );
  if (!response.ok) throw new GraphMailError("token", response.status);

  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    !("access_token" in payload) ||
    typeof payload.access_token !== "string" ||
    !("expires_in" in payload) ||
    typeof payload.expires_in !== "number"
  ) {
    throw new GraphMailError("token", 502);
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(0, payload.expires_in - 60) * 1000,
  };
  return payload.access_token;
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (!tokenRequest) {
    tokenRequest = requestAccessToken().finally(() => {
      tokenRequest = undefined;
    });
  }
  return tokenRequest;
}

async function graphErrorCode(response: Response) {
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("error" in payload)) return undefined;
    const error = payload.error;
    if (!error || typeof error !== "object" || !("code" in error)) return undefined;
    return typeof error.code === "string" ? error.code : undefined;
  } catch {
    return undefined;
  }
}

export async function sendMail(msg: { to: string; subject: string; html: string; text: string; replyTo?: string }) {
  if (!isMailConfigured()) throw new MailNotConfiguredError();

  const token = await accessToken();
  const hasHtml = msg.html.trim().length > 0;
  const response = await fetch(`${GRAPH_API}/users/${encodeURIComponent(fromAddress)}/sendMail`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: { contentType: hasHtml ? "HTML" : "Text", content: hasHtml ? msg.html : msg.text },
        toRecipients: [{ emailAddress: { address: msg.to } }],
        ...(msg.replyTo ? { replyTo: [{ emailAddress: { address: msg.replyTo } }] } : {}),
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) throw new GraphMailError("send", response.status, await graphErrorCode(response));
}

/** A short, safe reason to show an admin when a send fails (no server internals). */
export function mailErrorMessage(error: unknown) {
  if (error instanceof MailNotConfiguredError) return error.message;
  if (!(error instanceof GraphMailError)) return "The email could not be sent through Microsoft Graph.";

  if (error.source === "token") return "Microsoft Graph authentication failed. Check the MICROSOFT_* or AZURE_AD_* app credentials.";
  if (error.code === "ErrorInvalidUser") return "Microsoft Graph could not find the sender. Set MAIL_FROM_ADDRESS to the mailbox's exact Entra UPN or object ID in the app's tenant.";
  if (error.code?.toLowerCase().includes("recipient")) return "The recipient address was rejected. Check the recipient email.";
  if (error.status === 401) return "Microsoft Graph rejected the access token. Check the MICROSOFT_* or AZURE_AD_* app credentials.";
  if (error.status === 403) return "Microsoft Graph denied permission to send. Grant the app the Mail.Send application permission with admin consent and verify MAIL_FROM_ADDRESS.";
  if (error.status === 404) return "The sender mailbox was not found. Check MAIL_FROM_ADDRESS.";
  if (error.status === 429 || error.status >= 500) return "Microsoft Graph is temporarily unavailable. Try again later.";
  if (error.status === 400) return "Microsoft Graph rejected the message. Check the recipient address and message content.";
  return "The email could not be sent through Microsoft Graph.";
}
