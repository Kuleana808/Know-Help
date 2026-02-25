import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import {
  CONFIG_FILE,
  MINDSETS_DIR,
  mindsetManifestPath,
} from "../mindsets/paths";
import {
  getInstalledMindsets,
  cacheSubscriptionStatus,
} from "../mindsets/cache";

const API_URL = process.env.KNOW_HELP_API_URL || "https://know.help/api";

/**
 * Register the check_subscriptions MCP tool.
 * Validates all installed Mindset subscriptions against know.help API.
 */
export function registerCheckSubscriptions(server: McpServer): void {
  server.tool(
    "check_subscriptions",
    "Check subscription status for all installed Mindsets. Expired subscriptions are flagged as read-only. Cancelled subscriptions are flagged for removal.",
    {},
    async () => {
      const active: string[] = [];
      const expired: string[] = [];
      const pastDue: string[] = [];
      const cancelled: string[] = [];
      const errors: string[] = [];

      const installed = getInstalledMindsets();

      if (installed.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: "No Mindsets installed",
                active: [],
                expired: [],
                past_due: [],
                cancelled: [],
              }),
            },
          ],
        };
      }

      // Collect all install tokens
      const installTokens = installed
        .map((m) => m.install_token)
        .filter(Boolean);

      if (installTokens.length === 0) {
        // No tokens — all are free/local
        for (const m of installed) {
          active.push(m.creator_slug);
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                active,
                expired: [],
                past_due: [],
                cancelled: [],
                message: "No subscription tokens found — all Mindsets treated as active",
              }),
            },
          ],
        };
      }

      // Bulk validate with API
      try {
        const res = await fetch(`${API_URL}/mindsets/subscriptions/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ install_tokens: installTokens }),
        });

        if (!res.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `API returned ${res.status}`,
                  message: "Could not check subscriptions — treating all as active",
                  active: installed.map((m) => m.creator_slug),
                }),
              },
            ],
          };
        }

        const data = (await res.json()) as {
          results: Array<{
            token: string;
            valid: boolean;
            mindset_id?: string;
            creator_handle?: string;
            status?: string;
            expires?: string;
          }>;
        };

        // Build token → result lookup
        const resultMap = new Map<string, (typeof data.results)[0]>();
        for (const r of data.results) {
          resultMap.set(r.token, r);
        }

        for (const mindset of installed) {
          const result = resultMap.get(mindset.install_token);

          if (!result || !result.valid) {
            // Check if expired vs cancelled
            const status = result?.status || "expired";

            if (status === "cancelled") {
              cancelled.push(mindset.creator_slug);
              cacheSubscriptionStatus({
                mindset_id: mindset.id,
                creator_slug: mindset.creator_slug,
                status: "cancelled",
                current_period_end: result?.expires || "",
              });
            } else {
              expired.push(mindset.creator_slug);
              cacheSubscriptionStatus({
                mindset_id: mindset.id,
                creator_slug: mindset.creator_slug,
                status: "expired",
                current_period_end: result?.expires || "",
              });

              // Add warning to MINDSET.md
              try {
                const manifestPath = mindsetManifestPath(mindset.creator_slug);
                if (fs.existsSync(manifestPath)) {
                  let content = fs.readFileSync(manifestPath, "utf-8");
                  if (!content.includes("⚠️ SUBSCRIPTION EXPIRED")) {
                    content =
                      `⚠️ SUBSCRIPTION EXPIRED — This Mindset is read-only. Renew at know.help.\n\n` +
                      content;
                    fs.writeFileSync(manifestPath, content, "utf-8");
                  }
                }
              } catch {
                // Non-fatal
              }
            }
          } else if (result.status === "past_due") {
            pastDue.push(mindset.creator_slug);
            cacheSubscriptionStatus({
              mindset_id: mindset.id,
              creator_slug: mindset.creator_slug,
              status: "past_due",
              current_period_end: result.expires || "",
            });
          } else {
            active.push(mindset.creator_slug);
            cacheSubscriptionStatus({
              mindset_id: mindset.id,
              creator_slug: mindset.creator_slug,
              status: "active",
              current_period_end: result.expires || "",
            });
          }
        }
      } catch (err: any) {
        errors.push(err.message);
        // On network failure, don't change any status
        for (const m of installed) {
          active.push(m.creator_slug);
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              active,
              expired,
              past_due: pastDue,
              cancelled,
              errors: errors.length > 0 ? errors : undefined,
            }),
          },
        ],
      };
    }
  );
}
