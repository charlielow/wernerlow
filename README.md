# wernerlow.com

A static archive of Werner Low's writing, built with [Eleventy](https://www.11ty.dev/) and hosted on GitHub Pages.

```sh
npm install
npm start            # dev server at http://localhost:8080
npm run build        # build to _site/
npm run check-links  # check internal links in _site/
```

## Layout

- `src/writing/*.md`: one file per story. The front matter holds the title, form, date, first publication and permalink (the old WordPress slug).
- `src/index.md`, `src/commercial.md`, `src/writing.njk`: About, Commercial Work and the writing list.
- `src/_data/redirects.json`: old WordPress URLs that now redirect with a meta-refresh (Pages has no server redirects).
- `src/_includes/`: `base.njk` page shell and `story.njk` story layout. Styles are in `src/css/site.css`.

## Content recovery

The original WordPress database is lost, so the text was recovered from the Wayback Machine (pre-2016 captures only, because the site was spammed in 2016) and from local EPUBs.

- `npm run recover`: fetch the pinned captures into `recovery/raw/` and extract them to `recovery/extracted/`.
- `npm run recover:epub`: convert the EPUBs to `recovery/epub/`.
- `npm run normalize`: turn `recovery/extracted/` into `src/writing/`. It skips existing files because those are hand-edited; use `-- --force` to overwrite.

`root/` is the old WordPress install, kept for reference. It is gitignored because `wp-config.php` contains credentials.
