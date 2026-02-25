import { runFullScan, getUnprocessedVerticals, markVerticalProcessed } from './scanner/orchestrator';
import { runBlogFactory, generateBlogPost } from './factory/blog';
import { runLandingFactory, generateLandingPage } from './factory/landing';
import { runThreadFactory, generateThread } from './factory/thread';
import { runPackFactory, generatePack } from './factory/pack';
import { runRedditDraftFactory } from './factory/reddit-post';
import { runApprovalQueue } from './publisher/queue';
import { publishToSite, listContent, getContentStats } from './publisher/files';
import { generateSitemap } from './publisher/sitemap';
import {
  getWeeklyCost,
  WEEKLY_SPEND_ALERT,
  VERTICALS_FILE,
  readJsonl,
  VerticalSignal,
  VERTICAL_SCORE_THRESHOLD,
} from './config';

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const target = args[2];

function printUsage(): void {
  console.log(`
know.help Content Engine

Usage:
  npm run scan                         Run vertical scanner now
  npm run generate [type] [vertical]   Generate content
  npm run queue                        Show approval queue
  npm run publish                      Copy content to site

Commands:
  scan                   Run full vertical scan (Reddit + HN → Claude)
  scan status            Show scanner status and vertical counts

  generate               Generate all content for top 3 verticals
  generate blog          Generate blog posts only
  generate landing       Generate landing pages only
  generate thread        Generate X threads only
  generate pack          Generate knowledge packs only
  generate reddit        Generate Reddit post drafts only
  generate all           Generate everything (blog + landing + thread + pack + reddit)

  queue                  Interactive approval queue
  queue list             List all queue items and their status

  publish                Copy approved content to site directory
  publish sitemap        Regenerate sitemap.xml only

  status                 Show content counts, costs, and verticals
  `);
}

async function run(): Promise<void> {
  switch (command) {
    case 'scan': {
      if (subcommand === 'status') {
        const verticals = readJsonl<VerticalSignal>(VERTICALS_FILE);
        const above = verticals.filter(v => v.score >= VERTICAL_SCORE_THRESHOLD);
        const unprocessed = verticals.filter(v => !v.processed && v.score >= VERTICAL_SCORE_THRESHOLD);
        console.log(`\nVertical Scanner Status:`);
        console.log(`  Total verticals: ${verticals.length}`);
        console.log(`  Above threshold (${VERTICAL_SCORE_THRESHOLD}): ${above.length}`);
        console.log(`  Unprocessed: ${unprocessed.length}`);
        if (unprocessed.length > 0) {
          console.log(`\nTop unprocessed:`);
          for (const v of unprocessed.slice(0, 5)) {
            console.log(`  [${v.score.toFixed(2)}] ${v.vertical} — "${v.keyword_opportunity}"`);
          }
        }
      } else {
        await runFullScan();
      }
      break;
    }

    case 'generate': {
      const weeklyCost = getWeeklyCost();
      if (weeklyCost >= WEEKLY_SPEND_ALERT) {
        console.warn(`Weekly spend: $${weeklyCost.toFixed(2)} exceeds alert threshold ($${WEEKLY_SPEND_ALERT})`);
        console.warn('Proceeding anyway (manual invocation).\n');
      }

      // If a specific vertical is provided, find it
      let specificVertical: VerticalSignal | undefined;
      if (target) {
        const verticals = readJsonl<VerticalSignal>(VERTICALS_FILE);
        specificVertical = verticals.find(v =>
          v.vertical.toLowerCase().includes(target.toLowerCase()),
        );
        if (!specificVertical) {
          console.error(`Vertical "${target}" not found.`);
          process.exit(1);
        }
      }

      switch (subcommand) {
        case 'blog':
          if (specificVertical) {
            await generateBlogPost(specificVertical);
          } else {
            await runBlogFactory();
          }
          break;
        case 'landing':
          if (specificVertical) {
            await generateLandingPage(specificVertical);
          } else {
            await runLandingFactory();
          }
          break;
        case 'thread':
          if (specificVertical) {
            await generateThread(specificVertical);
          } else {
            await runThreadFactory();
          }
          break;
        case 'pack':
          if (specificVertical) {
            await generatePack(specificVertical);
          } else {
            await runPackFactory();
          }
          break;
        case 'reddit':
          await runRedditDraftFactory();
          break;
        case 'all':
        default: {
          console.log('Running full content generation pipeline...\n');

          const blogs = await runBlogFactory(3);
          const landings = await runLandingFactory(3);
          const threads = await runThreadFactory(3);
          const packs = await runPackFactory(3);
          const reddit = await runRedditDraftFactory(3);

          // Mark processed
          const processed = getUnprocessedVerticals(3);
          for (const v of processed) {
            markVerticalProcessed(v.vertical);
          }

          generateSitemap();

          console.log(`\n=== Generation Summary ===`);
          console.log(`  Blog posts: ${blogs.length}`);
          console.log(`  Landing pages: ${landings.length}`);
          console.log(`  X threads: ${threads.length}`);
          console.log(`  Knowledge packs: ${packs.length}`);
          console.log(`  Reddit drafts: ${reddit.length}`);
          console.log(`  Total cost this week: $${getWeeklyCost().toFixed(2)}`);
          break;
        }
      }
      break;
    }

    case 'queue': {
      if (subcommand === 'list') {
        const { getAllItems } = require('./publisher/queue');
        const items = getAllItems();
        if (items.length === 0) {
          console.log('\nQueue is empty.\n');
        } else {
          console.log(`\nQueue (${items.length} items):\n`);
          for (const item of items) {
            const status = item.status === 'pending' ? '⏳' :
              item.status === 'approved' ? '✓' :
              item.status === 'rejected' ? '✗' : '✎';
            console.log(`  ${status} [${item.type}] ${item.title} (${item.vertical}) — ${item.status}`);
          }
          console.log('');
        }
      } else {
        await runApprovalQueue();
      }
      break;
    }

    case 'publish': {
      if (subcommand === 'sitemap') {
        generateSitemap();
      } else {
        const siteDir = subcommand || '../site';
        console.log(`Publishing content to ${siteDir}...\n`);
        const result = publishToSite(siteDir);
        console.log(`Published: ${result.published.length}`);
        for (const p of result.published) console.log(`  ✓ ${p}`);
        if (result.skipped.length > 0) {
          console.log(`Skipped: ${result.skipped.length}`);
          for (const s of result.skipped) console.log(`  — ${s}`);
        }
        generateSitemap();
      }
      break;
    }

    case 'status': {
      const stats = getContentStats();
      const verticals = readJsonl<VerticalSignal>(VERTICALS_FILE);
      const weeklyCost = getWeeklyCost();

      console.log(`\n=== Content Engine Status ===\n`);
      console.log(`Content:`);
      for (const [type, count] of Object.entries(stats)) {
        if (type !== 'total') console.log(`  ${type}: ${count}`);
      }
      console.log(`  total: ${stats.total || 0}`);
      console.log(`\nVerticals:`);
      console.log(`  Total discovered: ${verticals.length}`);
      console.log(`  Unprocessed (above ${VERTICAL_SCORE_THRESHOLD}): ${verticals.filter(v => !v.processed && v.score >= VERTICAL_SCORE_THRESHOLD).length}`);
      console.log(`\nCosts:`);
      console.log(`  This week: $${weeklyCost.toFixed(2)}`);
      console.log(`  Alert threshold: $${WEEKLY_SPEND_ALERT}`);
      console.log('');
      break;
    }

    default:
      printUsage();
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
