import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder_set_env_var");
const FROM_EMAIL = process.env.FROM_EMAIL || "hello@know.help";
const BASE_URL = process.env.BASE_URL || "https://know.help";

export interface PurchaseEmailData {
  to: string;
  packName: string;
  downloadToken: string;
  expiresAt: string;
}

export async function sendPurchaseConfirmation(
  data: PurchaseEmailData
): Promise<void> {
  const downloadUrl = `${BASE_URL}/download/${data.downloadToken}`;
  const expiresDate = new Date(data.expiresAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `Your ${data.packName} is ready to install`,
      html: `
        <div style="font-family: 'IBM Plex Mono', monospace; max-width: 600px; margin: 0 auto; padding: 40px; background: #f5f2eb;">
          <h1 style="font-family: Georgia, serif; color: #1a4a2e; font-weight: 400;">Your pack is ready</h1>
          <p style="color: #4a4642; line-height: 1.8;">
            <strong>${data.packName}</strong> has been purchased successfully.
          </p>
          <p style="color: #4a4642; line-height: 1.8;">
            Download your pack:
          </p>
          <a href="${downloadUrl}" style="display: inline-block; background: #1a4a2e; color: #f5f2eb; padding: 12px 28px; text-decoration: none; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase;">
            Download Pack
          </a>
          <p style="color: #8a8278; font-size: 12px; margin-top: 24px;">
            This link expires on ${expiresDate}.
          </p>
          <p style="color: #4a4642; line-height: 1.8; margin-top: 24px;">
            Or install via CLI:
          </p>
          <code style="background: #ede9e0; padding: 8px 16px; display: block; color: #1a4a2e;">
            know install --token ${data.downloadToken}
          </code>
          <hr style="border: none; border-top: 1px solid #d8d3c8; margin: 32px 0;" />
          <p style="color: #8a8278; font-size: 11px;">
            Questions? Reply to this email or contact support@know.help
          </p>
        </div>
      `,
    });
  } catch (err: any) {
    console.error("Failed to send purchase email:", err.message);
  }
}

export async function sendOtpEmail(
  to: string,
  otp: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Your know.help login code: ${otp}`,
      html: `
        <div style="font-family: 'IBM Plex Mono', monospace; max-width: 600px; margin: 0 auto; padding: 40px; background: #f5f2eb;">
          <h1 style="font-family: Georgia, serif; color: #1a4a2e; font-weight: 400;">Your login code</h1>
          <p style="color: #4a4642; line-height: 1.8;">
            Enter this code to sign in to know.help:
          </p>
          <div style="background: #1a4a2e; color: #f5f2eb; padding: 20px 40px; text-align: center; font-size: 32px; letter-spacing: 0.3em; margin: 24px 0;">
            ${otp}
          </div>
          <p style="color: #8a8278; font-size: 12px;">
            This code expires in 10 minutes. If you didn't request this, ignore this email.
          </p>
        </div>
      `,
    });
  } catch (err: any) {
    console.error("Failed to send OTP email:", err.message);
  }
}

export async function sendTeamInvitation(
  to: string,
  teamName: string,
  inviterName: string,
  joinUrl: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You've been invited to join ${teamName} on know.help`,
      html: `
        <div style="font-family: 'IBM Plex Mono', monospace; max-width: 600px; margin: 0 auto; padding: 40px; background: #f5f2eb;">
          <h1 style="font-family: Georgia, serif; color: #1a4a2e; font-weight: 400;">Team invitation</h1>
          <p style="color: #4a4642; line-height: 1.8;">
            <strong>${inviterName}</strong> has invited you to join <strong>${teamName}</strong> on know.help.
          </p>
          <a href="${joinUrl}" style="display: inline-block; background: #1a4a2e; color: #f5f2eb; padding: 12px 28px; text-decoration: none; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 16px;">
            Join Team
          </a>
          <p style="color: #8a8278; font-size: 12px; margin-top: 24px;">
            This invitation expires in 72 hours.
          </p>
        </div>
      `,
    });
  } catch (err: any) {
    console.error("Failed to send invitation email:", err.message);
  }
}

export async function sendAdminNotification(
  subject: string,
  body: string
): Promise<void> {
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").filter(Boolean);
  for (const email of adminEmails) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email.trim(),
        subject,
        html: `
          <div style="font-family: 'IBM Plex Mono', monospace; max-width: 600px; margin: 0 auto; padding: 40px; background: #f5f2eb;">
            <h1 style="font-family: Georgia, serif; color: #1a4a2e; font-weight: 400;">${subject}</h1>
            <p style="color: #4a4642; line-height: 1.8;">${body}</p>
          </div>
        `,
      });
    } catch (err: any) {
      console.error("Failed to send admin notification:", err.message);
    }
  }
}
