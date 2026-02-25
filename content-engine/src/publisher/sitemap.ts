import fs from 'fs';
import path from 'path';
import { readJsonl, ContentPiece, PUBLISHED_FILE, ROOT_DIR, ensureDir } from '../config';

const SITE_URL = 'https://know.help';

function buildSitemapXml(urls: { loc: string; lastmod: string; priority: string }[]): string {
  const entries = urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${entries}
</urlset>`;
}

export function generateSitemap(outputDir?: string): string {
  const pieces = readJsonl<ContentPiece>(PUBLISHED_FILE);
  const urls: { loc: string; lastmod: string; priority: string }[] = [];

  for (const piece of pieces) {
    const lastmod = piece.published_at.split('T')[0];

    switch (piece.type) {
      case 'blog':
        urls.push({
          loc: `${SITE_URL}/blog/${piece.slug}`,
          lastmod,
          priority: '0.8',
        });
        break;
      case 'landing':
        urls.push({
          loc: `${SITE_URL}/${piece.slug.replace('for-', 'for/')}`,
          lastmod,
          priority: '0.9',
        });
        break;
      case 'pack':
        urls.push({
          loc: `${SITE_URL}/marketplace/${piece.slug}`,
          lastmod,
          priority: '0.7',
        });
        break;
    }
  }

  const xml = buildSitemapXml(urls);
  const targetDir = outputDir || path.join(ROOT_DIR, 'content');
  ensureDir(targetDir);
  const sitemapPath = path.join(targetDir, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, xml);

  console.log(`[Sitemap] Generated with ${urls.length + 1} URLs → ${sitemapPath}`);
  return sitemapPath;
}
