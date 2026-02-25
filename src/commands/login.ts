/**
 * know login — Authenticate with know.help
 */

import { saveCredentials, checkAuth } from "./auth";

export async function loginCommand(): Promise<void> {
  const existing = await checkAuth();
  if (existing?.email) {
    console.log(`Already logged in as ${existing.email}`);
    console.log("Run 'know logout' first to switch accounts.");
    return;
  }

  console.log("");
  console.log("Opening know.help/cli-auth in your browser...");
  console.log("");

  // Try to open browser
  const url = `${process.env.KNOW_HELP_API_URL || "https://know.help"}/cli-auth`;
  try {
    const { exec } = require("child_process");
    const cmd =
      process.platform === "darwin"
        ? `open "${url}"`
        : process.platform === "win32"
          ? `start "${url}"`
          : `xdg-open "${url}"`;
    exec(cmd);
  } catch {
    // Browser open failed
  }

  console.log("If your browser didn't open, visit:");
  console.log(`  ${url}`);
  console.log("");
  console.log("After authorizing, paste your token below:");
  console.log("");

  // Read token from stdin
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const token = await new Promise<string>((resolve) => {
    rl.question("Token: ", (answer: string) => {
      resolve(answer.trim());
    });
  });

  if (!token) {
    console.log("\n\u2717 No token provided. Login cancelled.");
    rl.close();
    return;
  }

  const email = await new Promise<string>((resolve) => {
    rl.question("Email: ", (answer: string) => {
      resolve(answer.trim());
    });
  });
  rl.close();

  const method = await saveCredentials(token, email || "");

  if (method === "file") {
    console.log("\n\u26A0 Token stored in ~/.know-help/auth.json (plaintext).");
    console.log("  Install keytar for secure OS keychain storage.");
  }

  console.log(`\n\u2713 Logged in as ${email || "authenticated user"}`);
}
