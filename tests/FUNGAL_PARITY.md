# Fungal source and UI verification

Source hashes use LF line endings so Windows checkouts produce the same
expectations as other platforms.

The current reference is `liquidcake1/noita-fungal` revision
`233955ea2bb48fe6fb3bd58dd9936da023d84b2d`, pinned at
`src/vendor/noita-fungal`. Runtime and worker imports use the pinned `.mjs`
modules directly, without generated copies or import rewrites.

This upstream update changes the shift data to held-material branch maps, adds
reroll-aware search, and searches all 200 Hyper shifts (20 in other modes).

- Hash checks verify the submodule's RNG, probability tables, shift engine, and
  solver against the reviewed reference fixtures. No hand-maintained local copies
  are used.
- Fixtures include 60 RNG sequences and eight full / first-scenario solver runs.
  All results, their order, final world states, and job counts must match.
- Source UI fixtures record 11 Air/goal validation cases, 60 prediction tables,
  11 solution/world tables, and five option-list journeys. Plain data collectors
  execute the upstream functions in Node; this is not browser or layout testing.
- HTTP tests start the real Vite dev server and fetch every app/worker
  dependency, checking status and JavaScript content type. This catches preview
  routing errors that a successful production build cannot detect.
- Worker tests exercise all four modes and the model → worker → model path.
- Model tests cover selected solutions inside Simulation, manual edits, NG+
  transitions, 200-shift controls, copied-link reproduction, mode changes,
  cancellation, source-derived options, and Air's non-shiftable sentinel role.
- URL tests cover readable material IDs instead of escaped JSON, older query/hash
  links, immediate/coalesced address updates, History API errors, and copy fallback.
- Table tests use Bootstrap tables without row selection or sorting, preserving
  source order and spanning shift numbers across all held branches.

Initialize dependencies and run:

```bash
git submodule update --init --recursive
npm test
npm run build
```

Manual browser testing is left to the user. `npm test` requires no `task/` clone.

## Updating the reference

1. Update the submodule intentionally and review upstream changes.
2. Adapt the UI to the new contracts without editing the upstream mathematics.
3. Run `node tests/generate-fungal-ui-fixtures.mjs` to record the new source
   expectations; review the revision, source hashes, and expected result changes.
4. Run the tests and build; commit the submodule pointer and matching adapters
   together. Never regenerate fixtures just to conceal an implementation failure.

Air remains available and is explicitly labeled **not shiftable**. Empty controls
remain visually empty while using the source Air sentinel. Material options come
from generated shifts plus explicit additions, not the metadata database. Copies
of a solution retain its held materials and NG+ transition in the readable URL.
