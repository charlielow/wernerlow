export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ 'src/css': 'css' });

  // Newest first, matching the order of the old "Literary Work" category page.
  eleventyConfig.addCollection('writing', (api) =>
    api.getFilteredByGlob('src/writing/*.md').sort((a, b) => b.date - a.date),
  );

  // Split the writing list into stories and novel excerpts, based on each piece's `form`.
  eleventyConfig.addFilter('novelExcerpts', (items, wanted) =>
    items.filter((item) => /novel/.test(item.data.form) === wanted),
  );

  // Front matter dates are plain YYYY-MM-DD, which Eleventy reads as UTC midnight.
  eleventyConfig.addFilter('year', (date) => date.getUTCFullYear());
  eleventyConfig.addFilter('longDate', (date) =>
    date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
  );

  eleventyConfig.addFilter('readingTime', (html = '') => {
    const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round(words / 250));
    return minutes < 60 ? `${minutes} min read` : `about ${Math.round(minutes / 60)} hr read`;
  });

  return {
    dir: { input: 'src', includes: '_includes', data: '_data', output: '_site' },
    // The stories are prose, not templates: don't let a stray "{{" in the text be read as Nunjucks.
    markdownTemplateEngine: false,
    htmlTemplateEngine: 'njk',
  };
}
