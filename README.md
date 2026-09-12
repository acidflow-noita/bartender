# <a href="https://bartender.runfast.stream"><img src="https://github.com/user-attachments/assets/361c6fad-4b66-4ae9-993f-3470aa6a5612" width="200"> https://bartender.runfast.stream</a>

Explore Noita materials and mixology

Built with [Observable Framework](https://observablehq.com/framework/).

### How to

Install

```bash
git submodule update --init --recursive
npm install
```

Launch local dev copy

```bash
npm run clean && npm run build && npm run dev
```

### Fungal source updates

The fungal logic comes from the pinned Git submodule at
`src/vendor/noita-fungal`. Clone with `git clone --recurse-submodules` or run
the initialization command above. Deployments must initialize submodules too.

Observable Framework 1.13 preview serves local `.js` modules, but upstream uses
`.mjs`. The `predev`, `prebuild`, `pretest`, and `predeploy` hooks automatically
run `scripts/prepare-fungal.mjs`. This creates ignored files in
`src/fungal/_upstream/`, changing **only relative import extensions**. Do not edit
these generated files; the submodule is the source of truth. To regenerate while
a preview server is already running, use `npm run fungal:prepare`.

To pull a new upstream revision deliberately:

```bash
git submodule update --init --remote -- src/vendor/noita-fungal
git diff --submodule=log -- src/vendor/noita-fungal
```

Review its patches and adapt the UI to any changed data shape. Then regenerate
the source-only reference fixtures with `node tests/generate-fungal-ui-fixtures.mjs`
and run `npm test` and `npm run build`. Review the fixture changes before committing
the submodule pointer and adapters together. Do not edit the submodule or make
hand-maintained copies of its solver. Normal builds use the committed revision, not the
latest remote branch. See [parity checks](tests/FUNGAL_PARITY.md).
