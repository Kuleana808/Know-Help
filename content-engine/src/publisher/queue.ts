import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { QueueItem, QUEUE_FILE, CONTENT_DIR, readJsonl, ensureDir } from '../config';

export function getPendingItems(): QueueItem[] {
  return readJsonl<QueueItem>(QUEUE_FILE).filter(item => item.status === 'pending');
}

export function getAllItems(): QueueItem[] {
  return readJsonl<QueueItem>(QUEUE_FILE);
}

function updateItemStatus(itemId: string, status: QueueItem['status'], editedBody?: string): void {
  const items = readJsonl<QueueItem>(QUEUE_FILE);
  const updated = items.map(item => {
    if (item.id === itemId) {
      const updatedItem = { ...item, status };
      if (editedBody) updatedItem.body = editedBody;
      return updatedItem;
    }
    return item;
  });

  fs.writeFileSync(QUEUE_FILE, updated.map(i => JSON.stringify(i)).join('\n') + '\n');
}

function approveItem(item: QueueItem): void {
  updateItemStatus(item.id, 'approved');

  // Copy to approved directory
  const approvedDir = path.join(CONTENT_DIR, 'approved');
  ensureDir(approvedDir);

  const filename = `${item.id}.json`;
  fs.writeFileSync(
    path.join(approvedDir, filename),
    JSON.stringify(item, null, 2),
  );
}

function rejectItem(item: QueueItem): void {
  updateItemStatus(item.id, 'rejected');
}

export async function runApprovalQueue(): Promise<void> {
  const pending = getPendingItems();

  if (pending.length === 0) {
    console.log('\nNo pending items in queue.\n');
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> =>
    new Promise(resolve => rl.question(question, resolve));

  console.log(`\n— APPROVAL QUEUE (${pending.length} items) —\n`);

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];

    console.log(`[${i + 1}/${pending.length}] ${item.type} — ${item.platform}${item.subreddit ? ` r/${item.subreddit}` : ''}`);
    console.log(`Vertical: ${item.vertical}`);
    console.log(`Title: ${item.title}`);
    console.log(`\n${item.body}\n`);

    const answer = await ask('Approve? (y)es / (n)o / (e)dit / (s)kip: ');

    switch (answer.toLowerCase().charAt(0)) {
      case 'y':
        approveItem(item);
        console.log('→ Approved\n');
        break;
      case 'n':
        rejectItem(item);
        console.log('→ Rejected\n');
        break;
      case 'e': {
        console.log('Opening in editor is not supported in this environment.');
        console.log('Enter replacement body (end with a line containing only "END"):');
        const lines: string[] = [];
        let line = await ask('');
        while (line !== 'END') {
          lines.push(line);
          line = await ask('');
        }
        if (lines.length > 0) {
          const newBody = lines.join('\n');
          updateItemStatus(item.id, 'approved', newBody);
          const updatedItem = { ...item, body: newBody, status: 'approved' as const };
          const approvedDir = path.join(CONTENT_DIR, 'approved');
          ensureDir(approvedDir);
          fs.writeFileSync(
            path.join(approvedDir, `${item.id}.json`),
            JSON.stringify(updatedItem, null, 2),
          );
          console.log('→ Edited & Approved\n');
        } else {
          console.log('→ No changes, skipping\n');
        }
        break;
      }
      case 's':
        console.log('→ Skipped\n');
        break;
      default:
        console.log('→ Skipped (unrecognized input)\n');
    }
  }

  rl.close();
  console.log('— Queue processing complete —\n');
}
