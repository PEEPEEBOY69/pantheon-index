# pantheon-index

The public catalog behind **Pantheon** (`perchance.org/pantheon-hub`): a nightly crawl of
character, lorebook and scenario sources, published as static JSON on a CDN.

- Manifest: `https://cdn.jsdelivr.net/gh/PEEPEEBOY69/pantheon-index@main/index/manifest.json`
- Fallback: `https://raw.githubusercontent.com/PEEPEEBOY69/pantheon-index/main/index/manifest.json`

Index stores metadata and pointers only — never content. Records for NSFW items carry no blurb
(fetched from the origin at display time). See the Pantheon spec §8 for the format.

`npm test` runs offline against fixtures. `npm run crawl` rebuilds `index/`. `npm run smoke`
hits live endpoints and is not part of CI's test step.
