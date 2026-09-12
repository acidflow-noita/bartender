// Node tests of the table adapter against small data/element records, not a browser.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source = readFileSync(new URL("../src/fungal/table.js", import.meta.url), "utf8");
const compile = (Inputs = {}) => runInNewContext(source.replace(/^import .*;\n/gm, "").replace(/^export /gm, "") + "\n({consecutiveGroups, lockTableOrder, spanTableGroups, staticTable});", {Inputs});
const classes = () => ({values: [], add(...names) {this.values.push(...names);}});
const cell = () => ({hidden: false, rowSpan: 1, classList: classes()});
function rootFor(data, columns) {
  const headers = Array.from({length: columns.length + 1}, () => ({
    onclick() {throw new Error("sorting must have been removed");},
    removed: [], indicatorRemoved: false,
    removeAttribute(name) {this.removed.push(name);},
    querySelector() {return {remove: () => {this.indicatorRemoved = true;}};},
  }));
  const rows = data.map(() => ({children: Array.from({length: columns.length + 1}, cell), classList: classes()}));
  return {headers, rows, classList: classes(), querySelectorAll(selector) {return selector === "thead th" ? headers : rows;}};
}

test("groups join only consecutive alternatives of the same shift without reordering", () => {
  const {consecutiveGroups} = compile();
  const input = [{iteration: 1}, {iteration: 1}, {iteration: 2}, {iteration: 3}, {iteration: 3}, {iteration: 1}];
  assert.deepEqual(JSON.parse(JSON.stringify(consecutiveGroups(input, "iteration"))), [
    {value: 1, start: 0, length: 2}, {value: 2, start: 2, length: 1},
    {value: 3, start: 3, length: 2}, {value: 1, start: 5, length: 1},
  ]);
});

test("native table sorting handlers and indicators are removed, not merely hidden by CSS", () => {
  const root = rootFor([], ["iteration", "from"]);
  compile().lockTableOrder(root);
  for (const header of root.headers) {
    assert.equal(header.onclick, null);
    assert.equal(header.scope, "col");
    assert.ok(header.removed.includes("aria-sort"));
    assert.ok(header.indicatorRemoved);
  }
});

test("row spans preserve every branch and keep column positions aligned", () => {
  const columns = ["iteration", "held", "from", "to"];
  const data = [{iteration: 1}, {iteration: 1}, {iteration: 1}, {iteration: 2}, {iteration: 2}];
  const root = rootFor(data, columns);
  compile().spanTableGroups(root, data, columns, "iteration");
  assert.equal(root.rows[0].children[1].rowSpan, 3);
  assert.equal(root.rows[3].children[1].rowSpan, 2);
  for (const i of [1, 2, 4]) assert.equal(root.rows[i].children[1].hidden, true);
  for (const row of root.rows) {
    assert.equal(row.children.length, columns.length + 1);
    assert.equal(row.children[2].hidden, false, "held-material alternatives stay visible");
    assert.equal(row.children[3].hidden, false, "source material groups stay visible");
  }
  assert.ok(root.rows[0].classList.values.includes("fs-group-start"));
  assert.ok(root.rows[3].classList.values.includes("fs-group-alt"));
});

test("Observable tables render every branch before merging rows, with no sorting or selections", () => {
  const data = Array.from({length: 900}, (_, i) => ({iteration: Math.floor(i / 5) + 1}));
  const columns = ["iteration", "held", "from", "to"];
  let received;
  const adapter = compile({table(rows, options) {received = {rows, options}; return rootFor(rows, columns);}});
  const table = adapter.staticTable(data, {columns, height: 500, sort: "to"}, {groupBy: "iteration"});
  assert.equal(received.rows, data);
  assert.equal(received.options.rows, data.length);
  assert.equal(received.options.select, false);
  assert.equal(received.options.sort, undefined);
  assert.equal(received.options.height, 500);
  assert.equal(table.rows[895].children[1].rowSpan, 5);
});
