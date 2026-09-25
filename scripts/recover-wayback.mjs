// Recover wernerlow.com content from pinned Wayback Machine captures.
//
// Raw HTML is cached in recovery/raw/ (delete a file, or pass --refresh, to refetch).
// Extracted Markdown goes to recovery/extracted/. That output is machine-generated and
// can be regenerated, so proofread copies live in src/ and are never overwritten here.
//
// Only pre-2016 captures are used: spam was injected into the site in 2016.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW_DIR = path.join(ROOT, 'recovery/raw');
const OUT_DIR = path.join(ROOT, 'recovery/extracted');
const REFRESH = process.argv.includes('--refresh');

// kind: post = WordPress post, page = WordPress page, archive = category listing, legacy = 2007 hand-built site
const PAGES = [
  { name: 'about-2014', kind: 'page', ts: '20141218155151', url: 'http://wernerlow.com/' },
  { name: 'about-2013', kind: 'page', ts: '20130719093736', url: 'http://wernerlow.com/' },
  { name: 'commercial-work-page', kind: 'page', ts: '20140307072148', url: 'http://wernerlow.com:80/commercial-work-page/' },
  { name: 'contact', kind: 'page', ts: '20140128054339', url: 'http://wernerlow.com:80/contact/' },
  { name: 'author-werner', kind: 'archive', ts: '20140128054332', url: 'http://wernerlow.com:80/author/werner/' },
  { name: 'literary-work', kind: 'archive', ts: '20140128145815', url: 'http://wernerlow.com:80/category/literary-work/' },
  { name: 'literary-work-page-2', kind: 'archive', ts: '20140128094041', url: 'http://wernerlow.com:80/category/literary-work/page/2/' },
  { name: '180', kind: 'post', ts: '20140128075605', url: 'http://wernerlow.com:80/180/' },
  { name: 'coyote-a-short-story', kind: 'post', ts: '20140128094046', url: 'http://wernerlow.com:80/coyote-a-short-story/' },
  { name: 'ditch-lilies', kind: 'post', ts: '20140128094051', url: 'http://wernerlow.com:80/ditch-lilies/' },
  { name: 'dont-worry-dandelo-an-excerpt-from-a-novel', kind: 'post', ts: '20140128094056', url: 'http://wernerlow.com:80/dont-worry-dandelo-an-excerpt-from-a-novel/' },
  { name: 'fever-tree-a-short-story', kind: 'post', ts: '20140128094101', url: 'http://wernerlow.com:80/fever-tree-a-short-story/' },
  { name: 'here-and-found-pen-two-very-short-stories', kind: 'post', ts: '20140128094106', url: 'http://wernerlow.com:80/here-and-found-pen-two-very-short-stories/' },
  { name: 'my-dining-room-table-a-short-story', kind: 'post', ts: '20140128094111', url: 'http://wernerlow.com:80/my-dining-room-table-a-short-story/' },
  { name: 'not-brian-a-very-short-story', kind: 'post', ts: '20140309082131', url: 'http://wernerlow.com:80/not-brian-a-very-short-story/' },
  { name: 'pitching-marilyn-a-short-story', kind: 'post', ts: '20140128094122', url: 'http://wernerlow.com:80/pitching-marilyn-a-short-story/' },
  { name: 'the-prophet-of-essaouira-an-excerpt-from-the-novel', kind: 'post', ts: '20140128095036', url: 'http://wernerlow.com:80/the-prophet-of-essaouira-an-excerpt-from-the-novel/' },
  { name: 'avalanche', kind: 'legacy', ts: '20080420101540', url: 'http://www.wernerlow.com:80/avalanche.htm', encoding: 'windows-1252' },
];

const turndown = new TurndownService({ headingStyle: 'atx', emDelimiter: '*', hr: '* * *' });
// Keep underline (used for in-story titles) as plain text rather than dropping it.
turndown.addRule('underline', {
  filter: (node) => node.nodeName === 'U' || /underline/.test(node.getAttribute?.('style') ?? ''),
  replacement: (content) => content,
});

const exists = (p) => access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCapture({ name, ts, url, encoding = 'utf-8' }) {
  const file = path.join(RAW_DIR, `${name}.html`);
  if (!REFRESH && (await exists(file))) return new TextDecoder(encoding).decode(await readFile(file));

  // id_ returns the original bytes without the Wayback toolbar or rewritten links.
  const captureUrl = `https://web.archive.org/web/${ts}id_/${url}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(captureUrl);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(file, buf);
      await sleep(1500); // be polite to archive.org
      return new TextDecoder(encoding).decode(buf);
    }
    if (attempt >= 4) throw new Error(`${name}: HTTP ${res.status} for ${captureUrl}`);
    await sleep(5000 * attempt);
  }
}

// Turn absolute wernerlow.com links into site-relative paths; leave external links alone.
function localizeLinks($, $root) {
  $root.find('a[href]').each((_, a) => {
    const href = $(a).attr('href').replace(/^https?:\/\/(www\.)?wernerlow\.com(:80)?/, '');
    $(a).attr('href', href || '/');
  });
}

function toMarkdown($, $el) {
  localizeLinks($, $el);
  $el.find('script, style, .sharedaddy, .wpcf7').remove();
  return turndown
    .turndown($.html($el))
    .replace(/ /g, ' ')
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// "October 21, 2011" -> "2011-10-21", without timezone shifts.
function isoDate(text) {
  const m = text?.match(/([A-Z][a-z]+) (\d{1,2})(?:st|nd|rd|th)?, (\d{4})/);
  if (!m) return undefined;
  const month = new Date(`${m[1]} 1, 2000`).getMonth() + 1;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

const cleanTitle = (t) => t.replace(/\s+/g, ' ').trim();

function frontMatter(data) {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

function extract(page, html) {
  const $ = cheerio.load(html);
  const source = `https://web.archive.org/web/${page.ts}/${page.url}`;

  if (page.kind === 'legacy') {
    const $story = $('#story');
    const title = cleanTitle($story.find('h1').first().text());
    $story.find('h1').first().remove();
    return { meta: { title, source, captured: page.ts }, body: toMarkdown($, $story) };
  }

  if (page.kind === 'archive') {
    const entries = $('.hentry')
      .map((_, el) => {
        const $a = $(el).find('.entry-title a').first();
        return {
          title: cleanTitle($a.text()),
          slug: $a.attr('href')?.replace(/^https?:\/\/(www\.)?wernerlow\.com(:80)?/, ''),
          date: isoDate($(el).find('abbr.published').text()),
        };
      })
      .get();
    return { meta: { source, captured: page.ts }, entries };
  }

  const $entry = $('.hentry').first();
  const title = cleanTitle($entry.find('.entry-title').first().text());
  const date = isoDate($entry.find('abbr.published').text());
  const categories = $entry.find('.entry-meta .category a').map((_, a) => $(a).text().trim()).get();
  const body = toMarkdown($, $entry.find('.entry-content').first());
  return {
    meta: { title, date, categories: categories.length ? categories : undefined, source, captured: page.ts },
    body,
  };
}

// Common spam markers, to catch a bad (post-hack) capture sneaking in.
const SPAM = /\b(sex|porn|viagra|cialis|casino|milf|payday)\b/i;

await mkdir(RAW_DIR, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });

const report = [];
for (const page of PAGES) {
  const html = await fetchCapture(page);
  const result = extract(page, html);

  if (result.entries) {
    await writeFile(path.join(OUT_DIR, `${page.name}.json`), JSON.stringify(result, null, 2) + '\n');
    report.push(`${page.name.padEnd(52)} ${result.entries.length} entries`);
    continue;
  }

  const words = result.body.split(/\s+/).filter(Boolean).length;
  const spam = SPAM.test(result.body) ? '  <-- SPAM MATCH' : '';
  await writeFile(path.join(OUT_DIR, `${page.name}.md`), `${frontMatter(result.meta)}\n${result.body}\n`);
  report.push(`${page.name.padEnd(52)} ${String(words).padStart(6)} words  ${result.meta.date ?? ''}${spam}`);
}

console.log(report.join('\n'));
