import * as cron from "node-cron";
import { runCrawl } from "./crawler";
import { appendJsonl } from "../utils/jsonl";
import { KNOWLEDGE_DIR } from "../utils/paths";
import * as path from "path";

const CRAWL_LOG = path.join(KNOWLEDGE_DIR, "log", "crawl.jsonl");

type ScheduleOption = "every_hour" | "every_6_hours" | "every_12_hours";

const CRON_EXPRESSIONS: Record<ScheduleOption, string> = {
  every_hour: "0 * * * *",
  every_6_hours: "0 */6 * * *",
  every_12_hours: "0 */12 * * *",
};

/**
 * Start the intelligence crawler on a schedule.
 * On first run, crawls immediately, then schedules recurring.
 */
export function startScheduler(schedule: ScheduleOption = "every_6_hours"): void {
  const cronExpr = CRON_EXPRESSIONS[schedule] || CRON_EXPRESSIONS.every_6_hours;

  console.log(
    `[scheduler] Starting with schedule: ${schedule} (${cronExpr})`
  );

  // Run immediately on start
  executeCrawl().catch((err) => {
    console.error("[scheduler] Initial crawl failed:", err.message);
  });

  // Schedule recurring
  cron.schedule(cronExpr, () => {
    executeCrawl().catch((err) => {
      console.error("[scheduler] Scheduled crawl failed:", err.message);
    });
  });
}

async function executeCrawl(): Promise<void> {
  const startTime = new Date().toISOString();
  console.log(`[scheduler] Crawl started at ${startTime}`);

  try {
    const result = await runCrawl();
    const endTime = new Date().toISOString();

    appendJsonl(
      CRAWL_LOG,
      {
        start_time: startTime,
        end_time: endTime,
        sources_crawled: result.sourcesCrawled,
        signals_found: result.signalsFound,
        signals_written: result.signalsWritten,
        signals_skipped: result.signalsSkipped,
        errors: result.errors,
      },
      {
        _schema: "crawl_run",
        _version: "1.0",
        _description: "Log of each intelligence crawl run",
      }
    );

    console.log(
      `[scheduler] Crawl complete: ${result.signalsFound} found, ${result.signalsWritten} written, ${result.signalsSkipped} skipped`
    );
  } catch (err: any) {
    const endTime = new Date().toISOString();
    appendJsonl(
      CRAWL_LOG,
      {
        start_time: startTime,
        end_time: endTime,
        sources_crawled: 0,
        signals_found: 0,
        signals_written: 0,
        signals_skipped: 0,
        errors: [err.message],
      },
      {
        _schema: "crawl_run",
        _version: "1.0",
        _description: "Log of each intelligence crawl run",
      }
    );
    console.error(`[scheduler] Crawl error: ${err.message}`);
  }
}
