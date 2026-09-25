// Turn the machine-extracted Wayback Markdown (recovery/extracted/) into proofread-ready
// story files in src/writing/.
//
// Mechanical fixes only: the publication credit moves into front matter, duplicate in-body titles are
// dropped, "#" scene breaks become "* * *", Prophet's chapter markers become headings, and stray
// indentation/double spaces go. The words themselves are untouched.
//
// src/writing/ is hand-edited after this runs, so existing files are skipped unless --force is passed.

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const IN_DIR = path.join(ROOT, 'recovery/extracted');
const OUT_DIR = path.join(ROOT, 'src/writing');
const FORCE = process.argv.includes('--force');

// drop: number of leading paragraphs to remove (credit lines, links, duplicate title), checked by hand.
// publishedUrl: only where the original publication page still works (checked 2026-09-25).
// dropLast: trailing paragraphs to remove. subheads: paragraphs to turn into "##" headings.
const STORIES = [
  {
    slug: 'avalanche-a-short-story', from: 'avalanche', title: 'Avalanche', form: 'a short story', date: '2011-09-24',
    publishedIn: 'Void Magazine, September 2006',
    note: 'Text recovered from the 2007 version of wernerlow.com. The lightly revised 2011 version was not archived.',
    drop: 0,
  },
  {
    slug: 'coyote-a-short-story', from: 'coyote-a-short-story', title: 'Coyote', form: 'a short story',
    publishedIn: 'Terrain.org', publishedUrl: 'http://www.terrain.org/fiction/22/low.htm',
    drop: 2,
  },
  {
    slug: 'ditch-lilies', from: 'ditch-lilies', title: 'Ditch Lilies', form: 'a short story',
    publishedIn: 'Terrain.org, 2011', publishedUrl: 'http://www.terrain.org/fiction/28/low.htm',
    drop: 4,
  },
  {
    slug: 'dont-worry-dandelo-an-excerpt-from-a-novel', from: 'dont-worry-dandelo-an-excerpt-from-a-novel',
    title: 'Don’t Worry, Dandelo', form: 'an excerpt from a completed novel',
    drop: 0,
  },
  {
    slug: 'fever-tree-a-short-story', from: 'fever-tree-a-short-story', title: 'Fever Tree', form: 'a short story',
    publishedIn: 'Lily Literary Review',
    drop: 3, dropLast: 1,
  },
  {
    slug: 'here-and-found-pen-two-very-short-stories', from: 'here-and-found-pen-two-very-short-stories',
    title: 'Found Pen and Here', form: 'two very short stories',
    publishedIn: 'Slow Trains', publishedUrl: 'http://www.slowtrains.com/vol6issue2/lowvol6issue2.html',
    drop: 3, subheads: ['The Found Pen', 'Here'],
  },
  {
    slug: 'my-dining-room-table-a-short-story', from: 'my-dining-room-table-a-short-story',
    title: 'My Dining Room Table', form: 'a short story',
    publishedIn: 'The Journal (of Ohio State University)',
    drop: 2,
  },
  {
    slug: 'not-brian-a-very-short-story', from: 'not-brian-a-very-short-story', title: 'Not Brian', form: 'a very short story',
    publishedIn: 'The Pedestal Magazine',
    drop: 2,
  },
  {
    slug: 'pitching-marilyn-a-short-story', from: 'pitching-marilyn-a-short-story', title: 'Pitching Marilyn', form: 'a short story',
    publishedIn: 'Literary Laundry, Vol. 3, Issue 1, September 2012',
    drop: 4,
  },
  {
    slug: 'the-prophet-of-essaouira-an-excerpt-from-the-novel', from: 'the-prophet-of-essaouira-an-excerpt-from-the-novel',
    title: 'The Prophet of Essaouira', form: 'an excerpt from a completed novel',
    subtitle: 'Pronounced S-Oh-Air-Uh',
    drop: 2,
  },
];

const exists = (p) => access(p).then(() => true, () => false);

function parse(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = Object.fromEntries(
    m[1].split('\n').map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i), JSON.parse(line.slice(i + 1))];
    }),
  );
  return { meta, body: text.slice(m[0].length).trim() };
}

function normalize(body, story) {
  let paras = body.split(/\n{2,}/);
  const dropped = [...paras.slice(0, story.drop), ...paras.slice(paras.length - (story.dropLast ?? 0))];
  paras = paras.slice(story.drop, paras.length - (story.dropLast ?? 0));

  paras = paras.map((p) => {
    p = p.replace(/^[ \t]+/gm, '').replace(/([^\s])[ \t]{2,}/g, '$1 ');
    if (/^#(\s+#)*$/.test(p)) return '* * *';
    if (/^– \d+ –$/.test(p)) return `## ${p.match(/\d+/)[0]}`;
    if (story.subheads?.includes(p)) return `## ${p}`;
    return p;
  });

  return { body: paras.join('\n\n'), dropped };
}

function frontMatter(data) {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

await mkdir(OUT_DIR, { recursive: true });

for (const story of STORIES) {
  const out = path.join(OUT_DIR, `${story.slug}.md`);
  if (!FORCE && (await exists(out))) {
    console.log(`skip ${story.slug} (exists; --force to overwrite)`);
    continue;
  }

  const { meta, body: raw } = parse(await readFile(path.join(IN_DIR, `${story.from}.md`), 'utf8'));
  const { body, dropped } = normalize(raw, story);
  const data = {
    title: story.title,
    form: story.form,
    subtitle: story.subtitle,
    date: story.date ?? meta.date,
    publishedIn: story.publishedIn,
    publishedUrl: story.publishedUrl,
    note: story.note,
    permalink: `/${story.slug}/`,
    source: meta.source,
  };
  await writeFile(out, `${frontMatter(data)}\n${body}\n`);

  const words = body.split(/\s+/).filter(Boolean).length;
  console.log(`\n${story.slug}: ${words} words`);
  for (const d of dropped) console.log(`  dropped: ${d.replace(/\s+/g, ' ').slice(0, 110)}`);
}
