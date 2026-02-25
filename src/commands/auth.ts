/**
 * Auth helpers for CLI credential storage.
 * Priority: KNOW_HELP_TOKEN env > keytar (OS keychain) > ~/.know-help/auth.json fallback.
 */

import * as fs from "fs";
import * as path from "path";
import { KNOW_HELP_HOME } from "../mindsets/paths";

const AUTH_FILE = path.join(KNOW_HELP_HOME, "auth.json");
const KEYTAR_SERVICE = "know-help";
const KEYTAR_ACCOUNT_TOKEN = "token";
const KEYTAR_ACCOUNT_EMAIL = "email";

interface AuthCredentials {
  token: string;
  email: string;
  createdAt: string;
}

/**
 * Try to load keytar. Returns null if unavailable.
 */
function tryKeytar(): any | null {
  try {
    return require("keytar");
  } catch {
    return null;
  }
}

/**
 * Get stored token using priority order.
 */
export async function getToken(): Promise<string | null> {
  // 1. Environment variable
  if (process.env.KNOW_HELP_TOKEN) {
    return process.env.KNOW_HELP_TOKEN;
  }

  // 2. Keytar (OS keychain)
  const keytar = tryKeytar();
  if (keytar) {
    try {
      const token = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_TOKEN);
      if (token) return token;
    } catch {
      // Keytar available but failed, fall through
    }
  }

  // 3. auth.json fallback
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const data: AuthCredentials = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
      return data.token || null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Get stored email.
 */
export async function getEmail(): Promise<string | null> {
  const keytar = tryKeytar();
  if (keytar) {
    try {
      const email = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_EMAIL);
      if (email) return email;
    } catch {}
  }

  if (fs.existsSync(AUTH_FILE)) {
    try {
      const data: AuthCredentials = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
      return data.email || null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Store credentials.
 */
export async function saveCredentials(token: string, email: string): Promise<"keytar" | "file"> {
  const keytar = tryKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_TOKEN, token);
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_EMAIL, email);
      return "keytar";
    } catch {
      // Fall through to file
    }
  }

  // Fallback: write to auth.json
  if (!fs.existsSync(KNOW_HELP_HOME)) {
    fs.mkdirSync(KNOW_HELP_HOME, { recursive: true });
  }

  const data: AuthCredentials = { token, email, createdAt: new Date().toISOString() };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), "utf-8");
  return "file";
}

/**
 * Delete stored credentials.
 */
export async function clearCredentials(): Promise<void> {
  const keytar = tryKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_TOKEN);
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_EMAIL);
    } catch {}
  }

  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
  }
}

/**
 * Check if user is authenticated. Returns { token, email } or null.
 */
export async function checkAuth(): Promise<{ token: string; email: string | null } | null> {
  const token = await getToken();
  if (!token) return null;
  const email = await getEmail();
  return { token, email };
}
