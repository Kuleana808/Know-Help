import fs from 'fs';
import path from 'path';
import { CONTENT_DIR, ensureDir, readJsonl, ContentPiece, PUBLISHED_FILE } from '../config';

/**
 * Copy approved content from content/ to a target site directory.
 * This is used when `npm run publish` is called to sync content
 * to the know.help site deployment.
 */
export function publishToSite(siteDir: string): { published: string[]; skipped: string[] } {
  const published: string[] = [];
  const skipped: string[] = [];

  const pieces = readJsonl<ContentPiece>(PUBLISHED_FILE);

  for (const piece of pieces) {
    if (!fs.existsSync(piece.file_path)) {
      skipped.push(`${piece.slug} (file missing)`);
      continue;
    }

    let targetPath: string;

    switch (piece.type) {
      case 'blog':
        targetPath = path.join(siteDir, 'blog', `${piece.slug}.md`);
        break;
      case 'landing':
        targetPath = path.join(siteDir, 'for', `${piece.slug.replace('for-', '')}.html`);
        break;
      case 'pack':
        targetPath = path.join(siteDir, 'marketplace', piece.slug);
        break;
      default:
        skipped.push(`${piece.slug} (type ${piece.type} not publishable)`);
        continue;
    }

    ensureDir(path.dirname(targetPath));

    if (piece.type === 'pack') {
      // Copy entire directory
      copyDirRecursive(piece.file_path, targetPath);
    } else {
      fs.copyFileSync(piece.file_path, targetPath);
    }

    published.push(`${piece.type}/${piece.slug}`);
  }

  return { published, skipped };
}

function copyDirRecursive(src: string, dest: string): void {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * List all generated content with status info.
 */
export function listContent(): { type: string; slug: string; vertical: string; date: string }[] {
  const pieces = readJsonl<ContentPiece>(PUBLISHED_FILE);
  return pieces.map(p => ({
    type: p.type,
    slug: p.slug,
    vertical: p.vertical,
    date: p.published_at.split('T')[0],
  }));
}

/**
 * Get content counts by type.
 */
export function getContentStats(): Record<string, number> {
  const pieces = readJsonl<ContentPiece>(PUBLISHED_FILE);
  const stats: Record<string, number> = {};
  for (const p of pieces) {
    stats[p.type] = (stats[p.type] || 0) + 1;
  }
  stats.total = pieces.length;
  return stats;
}
