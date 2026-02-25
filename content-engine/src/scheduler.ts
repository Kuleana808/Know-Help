import cron from 'node-cron';
import { runFullScan } from './scanner/orchestrator';
import { runBlogFactory } from './factory/blog';
import { runLandingFactory } from './factory/landing';
import { runThreadFactory } from './factory/thread';
import { runPackFactory } from './factory/pack';
import { runRedditDraftFactory } from './factory/reddit-post';
import { generateSitemap } from './publisher/sitemap';
import { getWeeklyCost, WEEKLY_SPEND_ALERT } from './config';
import { getContentStats } from './publisher/files';
import { markVerticalProcessed, getUnprocessedVerticals } from './scanner/orchestrator';

async function weeklySccan(): Promise<void> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`WEEKLY SCAN — ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  try {
    const verticals = await runFullScan();
    console.log(`\nScan complete. ${verticals.length} new verticals found.`);
  } catch (err) {
    console.error('Scan failed:', err);
  }
}

async function contentGeneration(): Promise<void> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`CONTENT GENERATION — ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  // Check cost budget
  const weeklyCost = getWeeklyCost();
  if (weeklyCost >= WEEKLY_SPEND_ALERT) {
    console.warn(`\n⚠ Weekly spend: $${weeklyCost.toFixed(2)} (alert threshold: $${WEEKLY_SPEND_ALERT})`);
    console.warn('Skipping content generation to stay within budget.\n');
    return;
  }

  const verticals = getUnprocessedVerticals(3);
  if (verticals.length === 0) {
    console.log('No unprocessed verticals above threshold. Run a scan first.');
    return;
  }

  try {
    // Generate all content types
    const blogs = await runBlogFactory(3);
    const landings = await runLandingFactory(3);
    const redditDrafts = await runRedditDraftFactory(3);

    // Mark verticals as processed
    for (const v of verticals) {
      markVerticalProcessed(v.vertical);
    }

    // Regenerate sitemap
    generateSitemap();

    console.log(`\nGeneration complete:`);
    console.log(`  Blog posts: ${blogs.length}`);
    console.log(`  Landing pages: ${landings.length}`);
    console.log(`  Reddit drafts: ${redditDrafts.length}`);
    console.log(`  Weekly cost so far: $${getWeeklyCost().toFixed(2)}`);
  } catch (err) {
    console.error('Content generation failed:', err);
  }
}

async function threadGeneration(): Promise<void> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`THREAD GENERATION — ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  try {
    const threads = await runThreadFactory(3);
    console.log(`\nGenerated ${threads.length} threads.`);
  } catch (err) {
    console.error('Thread generation failed:', err);
  }
}

async function packGeneration(): Promise<void> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`PACK GENERATION — ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  try {
    const packs = await runPackFactory(3);

    // Regenerate sitemap
    generateSitemap();

    console.log(`\nGenerated ${packs.length} knowledge packs.`);
  } catch (err) {
    console.error('Pack generation failed:', err);
  }
}

// --- Cron Schedule ---
// Every Sunday 9am: full vertical scan
// Every Monday 6am: content factory (blog + landing + reddit drafts)
// Every Wednesday 6am: thread factory
// Every Friday 6am: pack factory

export function startScheduler(): void {
  console.log('Content Engine Scheduler started\n');
  console.log('Schedule:');
  console.log('  Sunday    9:00 AM — Vertical scan');
  console.log('  Monday    6:00 AM — Content generation (blog, landing, reddit)');
  console.log('  Wednesday 6:00 AM — Thread generation');
  console.log('  Friday    6:00 AM — Pack generation');
  console.log('');

  const stats = getContentStats();
  console.log('Current content:', stats);
  console.log(`Weekly cost: $${getWeeklyCost().toFixed(2)}\n`);

  // Sunday 9am
  cron.schedule('0 9 * * 0', () => {
    weeklySccan();
  });

  // Monday 6am
  cron.schedule('0 6 * * 1', () => {
    contentGeneration();
  });

  // Wednesday 6am
  cron.schedule('0 6 * * 3', () => {
    threadGeneration();
  });

  // Friday 6am
  cron.schedule('0 6 * * 5', () => {
    packGeneration();
  });
}

// If run directly, start the scheduler
if (require.main === module) {
  startScheduler();
}
