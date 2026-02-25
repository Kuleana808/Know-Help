/**
 * know logout — Clear stored credentials
 */

import { clearCredentials } from "./auth";

export async function logoutCommand(): Promise<void> {
  await clearCredentials();
  console.log("\n\u2713 Logged out.");
}
