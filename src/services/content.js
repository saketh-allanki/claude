// Loads Markdown guides from content/blog at startup. Add a .md file to publish a new guide.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter, renderMarkdown } from '../lib/markdown.js';

const BLOG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content/blog');

export function loadContent({ dir = BLOG_DIR, now = Date.now(), brandName = 'Sitewarden' } = {}) {
  if (!fs.existsSync(dir)) return { posts: [] };
  const posts = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const source = fs.readFileSync(path.join(dir, file), 'utf8').replaceAll('{{brand}}', brandName);
      const { meta, body } = parseFrontMatter(source);
      const { html } = renderMarkdown(body);
      const words = body.split(/\s+/).filter(Boolean).length;
      return {
        slug: file.replace(/\.md$/, ''),
        title: meta.title || file,
        description: meta.description || '',
        date: meta.date || '2026-01-01',
        html,
        readingMinutes: Math.max(1, Math.round(words / 220)),
      };
    })
    // Posts dated in the future stay hidden until their date: schedule content by writing ahead.
    .filter((p) => Date.parse(p.date) <= now)
    .sort((a, b) => b.date.localeCompare(a.date));
  return { posts };
}
