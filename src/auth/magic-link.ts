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
    if (!header || !body || !sig) return null;
    const expected = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    // Timing-safe signature comparison
    const sigBuf = Buffer.from(sig, "utf-8");
    const expectedBuf = Buffer.from(expected, "utf-8");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

const OTP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const OTP_MAX_ATTEMPTS = 5;

function checkOtpRateLimit(email: string): boolean {
  const since = new Date(Date.now() - OTP_RATE_LIMIT_WINDOW_MS).toISOString();
  try {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM otp_attempts WHERE email = ? AND attempted_at > ?"
    ).get(email, since) as any;
    return (row?.cnt || 0) < OTP_MAX_ATTEMPTS;
  } catch {
    // Table may not exist yet — allow the request
    return true;
  }
}

function recordOtpAttempt(email: string): void {
  try {
    db.prepare("INSERT INTO otp_attempts (email, attempted_at) VALUES (?, ?)").run(
      email,
      new Date().toISOString()
    );
  } catch {
    // Non-fatal
  }
}

export async function requestMagicLink(email: string): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  // Rate limit OTP requests
  if (!checkOtpRateLimit(normalizedEmail)) {
    return { success: false, message: "Too many login attempts. Try again later." };
  }
  recordOtpAttempt(normalizedEmail);

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

  // DB-side session validation: ensure token hasn't been revoked
  const email = payload.email as string;
  if (email) {
    try {
      const creator = db.prepare("SELECT session_token_hash FROM creators WHERE email = ?").get(email) as any;
      if (!creator || !creator.session_token_hash) {
        return { authenticated: false };
      }
      // Verify the token hash matches the stored session
      const tokenHash = hashString(token);
      if (tokenHash !== creator.session_token_hash) {
        return { authenticated: false };
      }
    } catch {
      // If DB check fails, fall back to JWT-only validation
    }
  }

  return {
    authenticated: true,
    handle: payload.handle as string,
    email,
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
