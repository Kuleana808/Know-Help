import * as crypto from "crypto";
import { db } from "../db/database";
import { sendOtpEmail } from "../payments/email";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

function hashString(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function encodeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const [header, body, sig] = token.split(".");
    const expected = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function requestMagicLink(email: string): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  // Ensure creator record exists
  let creator = db.prepare("SELECT * FROM creators WHERE email = ?").get(normalizedEmail) as any;
  if (!creator) {
    const handle = normalizedEmail.split("@")[0].replace(/[^a-z0-9]/g, "-");
    db.prepare(
      "INSERT INTO creators (handle, email, created_at) VALUES (?, ?, ?)"
    ).run(handle, normalizedEmail, new Date().toISOString());
    creator = db.prepare("SELECT * FROM creators WHERE email = ?").get(normalizedEmail) as any;
  }

  const otp = generateOtp();
  const otpHash = hashString(otp);
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare("UPDATE creators SET otp_hash = ?, otp_expires_at = ? WHERE email = ?").run(
    otpHash,
    otpExpires,
    normalizedEmail
  );

  await sendOtpEmail(normalizedEmail, otp);

  return { success: true, message: "Check your email for a login code" };
}

export async function verifyOtp(
  email: string,
  otp: string
): Promise<{ success: boolean; token?: string; handle?: string; role?: string; message?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const creator = db.prepare("SELECT * FROM creators WHERE email = ?").get(normalizedEmail) as any;

  if (!creator) {
    return { success: false, message: "Email not found" };
  }

  if (!creator.otp_hash || !creator.otp_expires_at) {
    return { success: false, message: "No pending OTP. Request a new one." };
  }

  if (new Date(creator.otp_expires_at) < new Date()) {
    return { success: false, message: "OTP expired. Request a new one." };
  }

  if (hashString(otp) !== creator.otp_hash) {
    return { success: false, message: "Invalid code" };
  }

  // Clear OTP
  db.prepare("UPDATE creators SET otp_hash = NULL, otp_expires_at = NULL WHERE email = ?").run(
    normalizedEmail
  );

  const role = ADMIN_EMAILS.includes(normalizedEmail) ? "admin" : "creator";

  const token = encodeJwt({
    handle: creator.handle,
    email: normalizedEmail,
    role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Store session token hash
  db.prepare("UPDATE creators SET session_token_hash = ? WHERE email = ?").run(
    hashString(token),
    normalizedEmail
  );

  return { success: true, token, handle: creator.handle, role };
}

export function authenticateRequest(
  authHeader: string | undefined
): { authenticated: boolean; handle?: string; email?: string; role?: string } {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authenticated: false };
  }

  const token = authHeader.slice(7);
  const payload = decodeJwt(token);

  if (!payload) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    handle: payload.handle as string,
    email: payload.email as string,
    role: payload.role as string,
  };
}

export function requireAuth(role?: string) {
  return (req: any, res: any, next: any) => {
    const auth = authenticateRequest(req.headers.authorization);
    if (!auth.authenticated) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (role && auth.role !== role && auth.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    req.auth = auth;
    next();
  };
}
