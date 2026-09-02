import { SendApi, Configuration } from "hostinger-mail-api-sdk";
import fs from "fs";
import path from "path";

const SENDER_EMAIL = process.env.HOSTINGER_SENDER_EMAIL || "invites@viadia.in";
const SENDER_NAME = process.env.HOSTINGER_SENDER_NAME || "Viadia";
const MAILBOX_RESOURCE_ID = process.env.HOSTINGER_MAILBOX_RESOURCE_ID || "";

const SUPPORT_URL = process.env.VIADIA_SUPPORT_URL || "https://viadia.in/support";
const PRIVACY_URL = process.env.VIADIA_PRIVACY_URL || "https://viadia.in/privacy";

// Resolved relative to the process's working directory, not the module's own location --
// neither __dirname (unavailable in this project's ESM source) nor import.meta.url (esbuild
// strips it to empty when bundling to CJS for production, confirmed via a real build run) work
// reliably across both contexts this file runs in. The server is always started from its own
// project root (Dockerfile's WORKDIR /app in production, same convention locally), so cwd-relative
// resolution is reliable here.
const TEMPLATES_DIR = path.join(process.cwd(), "emailTemplates");

let sendApiInstance: SendApi | null = null;

function getSendApi(): SendApi {
  if (!sendApiInstance) {
    const configuration = new Configuration({
      accessToken: process.env.HOSTINGER_MAIL_API_TOKEN,
    });
    sendApiInstance = new SendApi(configuration);
  }
  return sendApiInstance;
}

// Loads an HTML file from emailTemplates/ and replaces every {{TOKEN}} with its value. Every
// template automatically gets SUPPORT_URL/PRIVACY_URL/YEAR on top of whatever's passed in, since
// every template's footer references them -- no need to repeat these at every call site.
function renderTemplate(fileName: string, tokens: Record<string, string>): string {
  const templatePath = path.join(TEMPLATES_DIR, fileName);
  let html = fs.readFileSync(templatePath, "utf8");
  const allTokens: Record<string, string> = {
    SUPPORT_URL,
    PRIVACY_URL,
    YEAR: String(new Date().getFullYear()),
    ...tokens,
  };
  for (const [key, value] of Object.entries(allTokens)) {
    html = html.split(`{{${key}}}`).join(value ?? "");
  }
  return html;
}

async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!MAILBOX_RESOURCE_ID) {
    console.error("[emailService] HOSTINGER_MAILBOX_RESOURCE_ID is not configured -- email not sent.");
    return;
  }
  try {
    await getSendApi().sendEmail(MAILBOX_RESOURCE_ID, {
      to: [to],
      cc: [],
      bcc: [],
      displayName: SENDER_NAME,
      subject,
      text,
      html,
      attachments: [],
    } as any);
    console.log(`[emailService] Sent "${subject}" to ${to}`);
  } catch (e) {
    console.error(`[emailService] Failed sending "${subject}" to ${to}:`, e);
  }
}

// Sent once, right after a brand-new account finishes signing up -- not tied to any specific
// trip or inviter. Not yet called from anywhere; wire this in wherever the signup flow's genuine
// first-time-account hook lives.
export async function sendWelcomeEmail(params: {
  toEmail: string;
  userName: string;
}): Promise<void> {
  const { toEmail, userName } = params;
  const subject = `Welcome to Viadia, ${userName}! 👋`;
  const html = renderTemplate("welcome-email.html", { USER_NAME: userName });
  const text = `Hey ${userName}! Welcome to Viadia. We're so glad you're here -- let's make your next trip the easiest one to plan yet. Get started at https://viadia.in`;
  await sendMail(toEmail, subject, html, text);
}

// Case 1: recipient already has a Viadia account. They'll see the invite the next time they open
// the app (in their notification panel), this email is just a heads-up.
export async function sendExistingAccountInviteEmail(params: {
  toEmail: string;
  inviterName: string;
  tripTitle: string;
}): Promise<void> {
  const { toEmail, inviterName, tripTitle } = params;
  const subject = `${inviterName} invited you to "${tripTitle}" on Viadia`;
  const html = renderTemplate("invite-existing-account.html", {
    INVITER_NAME: inviterName,
    TRIP_TITLE: tripTitle,
  });
  const text = `${inviterName} invited you to join "${tripTitle}" on Viadia. Open the app and check your notifications to accept.`;
  await sendMail(toEmail, subject, html, text);
}

// Case 2: recipient has no Viadia account yet. Encourages sign-up -- the actual invite gets
// created automatically once they do (see joinRequestService.processUnmappedEmailSignup),
// scoped to whichever of the inviter's trips are still upcoming/ongoing at that point.
export async function sendSignupInviteEmail(params: {
  toEmail: string;
  inviterName: string;
  tripTitle: string;
}): Promise<void> {
  const { toEmail, inviterName, tripTitle } = params;
  const subject = `${inviterName} invited you to plan "${tripTitle}" on Viadia`;
  const html = renderTemplate("invite-signup.html", {
    INVITER_NAME: inviterName,
    TRIP_TITLE: tripTitle,
  });
  const text = `${inviterName} invited you to join "${tripTitle}" on Viadia. Sign up with this email address and your invite will be waiting for you.`;
  await sendMail(toEmail, subject, html, text);
}
