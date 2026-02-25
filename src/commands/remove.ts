/**
 * know remove — Remove an installed Mindset
 */

import * as readline from "readline";
import { removeMindset } from "../mindsets/installer";

export async function removeCommand(creatorSlug: string): Promise<void> {
  // Confirm
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(
      `Remove ${creatorSlug}? This deletes all local files. [y/N] `,
      (ans: string) => resolve(ans.trim())
    );
  });
  rl.close();

  if (answer.toLowerCase() !== "y") {
    console.log("Cancelled.");
    return;
  }

  const result = removeMindset(creatorSlug);

  if (result.success) {
    console.log(`\n\u2713 ${result.message}`);
    console.log("Note: to stop being charged, cancel your subscription at know.help/settings");
  } else {
    console.log(`\n\u2717 ${result.message}`);
  }
}
