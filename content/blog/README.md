# Blog Publishing Guide

Your blog lives in `content/blog`.

## Fast workflow

1. Duplicate `_template.mdx`.
2. Rename it to your new URL slug, for example `my-new-article.mdx`.
3. Update the frontmatter at the top:
   - `title`: the article title
   - `description`: used for Google and social previews
   - `publishedAt`: use `YYYY-MM-DD`
   - `updatedAt`: optional but recommended when you revise a post
   - `tags`: short keyword phrases
   - `excerpt`: the short summary shown on `/blog`
   - `featured`: optional for future use; it is not used by the current blog layout
4. Write the article below the `---` frontmatter block in normal markdown or MDX.
5. Start the site locally with `npm run dev` and open `/blog`.
6. When the article looks right, deploy the site.

## URL format

- `content/blog/my-new-article.mdx` becomes `/blog/my-new-article`

## Tips

- Keep titles specific and searchable.
- Write the `excerpt` like a clean 1-2 sentence preview for the card.
- Add 3 to 5 tags only.
- Use one main topic per article so Google understands the page clearly.
- Update `updatedAt` whenever you significantly improve an article.
