# Fungal rebuild verification

The reference is `liquidcake1/noita-fungal` revision
`dd54fd7669b6a218e72bf500eade560173beff65`.

- SHA-256 checks require all four mathematical modules to remain identical to
  upstream, apart from relative import paths and the attribution header.
- The fixtures contain 60 original RNG sequences and eight complete / first-scenario
  solver runs. All returned recipes, their order, states and job counts must match.
- Additional fixtures execute the original `index.html` calculation functions in
  Node with a plain table-data recorder: 11 Air/goal validation cases, 60 prediction
  tables, ten recipe/world tables, and five dropdown-lifecycle journeys. The
  dropdown tests compare actual source option membership and append/sort order
  through seed changes, mode changes, custom additions, and duplicate additions.
  This is not browser or layout testing.
- Node worker tests exercise the actual worker protocol in every mode, plus the
  complete application model → worker → model result path.
- Model tests cover mode changes, spoiler visibility, cancellation/late messages,
  input preservation, Air, accumulated source-derived option sets, sliders, and URL restoration.

Run `npm test` and `npm run build`. Manual browser testing is left to the user.
The optional `node tests/generate-fungal-ui-fixtures.mjs` requires the pinned
reference clone; ordinary tests do not depend on the untracked `task/` directory.

The UI intentionally keeps the original 20-iteration Search/Show behavior in every
mode. The upstream library's separate 200-shift Hyper helper is retained unchanged.
Selector IDs come only from the original generated shifts, restored goals, and
explicit user additions. The session keeps previously added IDs across seed/mode
changes, like the source Set. Bartender metadata adds labels/images, never options.
New controls sort by material ID; additions to existing controls append in source
order. Empty fields remain visually empty while using the original Air sentinel.
