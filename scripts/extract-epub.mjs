// Convert Werner's local EPUBs to Markdown, one file per book, in spine (reading) order.
//
// Output goes to recovery/epub/<book>.md, with the cover copied alongside.
// The EPUBs are calibre exports from 2012 and are better sources than the Wayback excerpts.

import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = '/Users/clow/Documents/BOOKS/E-BOOKS/Werner';
const OUT_DIR = path.join(ROOT, 'recovery/epub');

const BOOKS = [
  { slug: 'dont-worry-dandelo', dir: "Don't Worry, Dandelo (4)", epub: "Don't Worry, Dandelo - Werner.epub" },
  { slug: 'hidden-driveway-2', dir: 'Hidden Driveway 2 (3)', epub: 'Hidden Driveway 2 - Werner.epub' },
];

const turndown = new TurndownService({ headingStyle: 'atx', emDelimiter: '*', hr: '* * *' });

await mkdir(OUT_DIR, { recursive: true });

for (const book of BOOKS) {
  const tmp = await mkdtemp(path.join(tmpdir(), 'epub-'));
  try {
    execFileSync('unzip', ['-q', '-o', path.join(SRC_DIR, book.dir, book.epub), '-d', tmp]);

    // container.xml points at the OPF; the OPF spine gives reading order.
    const container = cheerio.load(await readFile(path.join(tmp, 'META-INF/container.xml'), 'utf8'), { xml: true });
    const opfPath = path.join(tmp, container('rootfile').attr('full-path'));
    const opf = cheerio.load(await readFile(opfPath, 'utf8'), { xml: true });
    const manifest = Object.fromEntries(opf('manifest item').toArray().map((el) => [opf(el).attr('id'), opf(el).attr('href')]));

    const title = opf('dc\\:title').first().text().trim();
    const chapters = [];
    for (const el of opf('spine itemref').toArray()) {
      const href = manifest[opf(el).attr('idref')];
      if (!href || /titlepage/i.test(href)) continue;
      const $ = cheerio.load(await readFile(path.join(path.dirname(opfPath), decodeURIComponent(href)), 'utf8'));
      $('script, style').remove();
      chapters.push(turndown.turndown($('body').html() ?? ''));
    }

    // calibre splits files at arbitrary points, so spine files are joined as plain paragraphs.
    // Leading spaces (typed paragraph indents) are stripped so Markdown doesn't read them as code blocks.
    const body = chapters
      .join('\n\n')
      .replace(/ /g, ' ')
      .replace(/^[ \t]+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const words = body.split(/\s+/).filter(Boolean).length;
    await writeFile(path.join(OUT_DIR, `${book.slug}.md`), `---\ntitle: ${JSON.stringify(title)}\nsource: ${JSON.stringify(path.join(SRC_DIR, book.dir, book.epub))}\n---\n\n${body}\n`);
    await copyFile(path.join(SRC_DIR, book.dir, 'cover.jpg'), path.join(OUT_DIR, `${book.slug}-cover.jpg`));
    console.log(`${book.slug.padEnd(22)} ${chapters.length} spine files, ${words} words`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
