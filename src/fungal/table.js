import * as Inputs from "npm:@observablehq/inputs";

export function consecutiveGroups(data, key) {
  const groups = [];
  data.forEach((row, index) => {
    const last = groups.at(-1);
    if (last && last.value === row[key]) last.length++;
    else groups.push({value: row[key], start: index, length: 1});
  });
  return groups;
}

// Retain native Observable tables while disabling their click-to-sort behavior.
// Inputs.table has no supported "sortable: false" option.
export function lockTableOrder(root) {
  for (const header of root.querySelectorAll("thead th")) {
    header.onclick = null;
    header.removeAttribute("title");
    header.removeAttribute("aria-sort");
    header.querySelector("span")?.remove();
    header.scope = "col";
  }
}

export function spanTableGroups(root, data, columns, key) {
  const rows = root.querySelectorAll("tbody tr");
  const column = columns.indexOf(key) + 1; // native table's first column is the selection gutter
  for (const [tone, group] of consecutiveGroups(data, key).entries()) {
    for (let i = group.start; i < group.start + group.length; i++) {
      const row = rows[i];
      row.classList.add(tone % 2 ? "fs-group-alt" : "fs-group-base");
      if (i === group.start) {
        row.classList.add("fs-group-start");
        row.children[column].rowSpan = group.length;
        row.children[column].classList.add("fs-shift-number");
      } else row.children[column].hidden = true;
    }
  }
}

export function staticTable(data, options, {groupBy} = {}) {
  // Render the complete data before applying row spans; virtual/lazy rows could
  // otherwise split a shift group. Hyper has at most a few hundred branches.
  const root = Inputs.table(data, {...options, select: false, sort: undefined, rows: Math.max(data.length, 1)});
  root.classList.add("fs-readonly-table");
  lockTableOrder(root);
  if (groupBy && data.length) spanTableGroups(root, data, options.columns, groupBy);
  return root;
}
