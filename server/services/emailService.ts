import { SendApi, Configuration } from "hostinger-mail-api-sdk";

const SENDER_EMAIL = process.env.HOSTINGER_SENDER_EMAIL || "invites@viadia.in";
const SENDER_NAME = process.env.HOSTINGER_SENDER_NAME || "Viadia";
const MAILBOX_RESOURCE_ID = process.env.HOSTINGER_MAILBOX_RESOURCE_ID || "";

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

// Dummy HTML shell -- the trip owner will supply the real, image-based templates later. Kept
// intentionally simple (one shared wrapper, per-template body content) so swapping in the real
// design later means replacing this one function, not every call site.
function wrapHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; background-color: #f4f4f7; padding: 24px; margin: 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
      <tr>
        <td style="padding: 32px;">
          <!-- TODO: replace with real logo/header image once provided -->
          <h2 style="margin: 0 0 16px; color: #4338ca;">Viadia</h2>
          ${bodyHtml}
          <p style="margin-top: 32px; font-size: 12px; color: #94a3b8;">This is a placeholder email template -- final design pending.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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

// Case 1: recipient already has a Viadia account. They'll see the invite the next time they open
// the app (in their notification panel), this email is just a heads-up.
export async function sendExistingAccountInviteEmail(params: {
  toEmail: string;
  inviterName: string;
  tripTitle: string;
}): Promise<void> {
  const { toEmail, inviterName, tripTitle } = params;
  const subject = `${inviterName} invited you to "${tripTitle}" on Viadia`;
  const bodyHtml = `
    <p style="color: #334155; font-size: 15px; line-height: 1.5;">
      <strong>${inviterName}</strong> invited you to join <strong>${tripTitle}</strong> on Viadia.
    </p>
    <p style="color: #334155; font-size: 15px; line-height: 1.5;">
      Open the Viadia app and check your notifications to accept.
    </p>
  `;
  const text = `${inviterName} invited you to join "${tripTitle}" on Viadia. Open the app and check your notifications to accept.`;
  await sendMail(toEmail, subject, wrapHtml(bodyHtml), text);
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
  const bodyHtml = `
    <p style="color: #334155; font-size: 15px; line-height: 1.5;">
      <strong>${inviterName}</strong> invited you to join <strong>${tripTitle}</strong> on Viadia --
      a travel planner for organizing trips together.
    </p>
    <p style="color: #334155; font-size: 15px; line-height: 1.5;">
      You don't have an account yet. Sign up with this email address and your invite will be
      waiting for you.
    </p>
  `;
  const text = `${inviterName} invited you to join "${tripTitle}" on Viadia. Sign up with this email address and your invite will be waiting for you.`;
  await sendMail(toEmail, subject, wrapHtml(bodyHtml), text);
}
