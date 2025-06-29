---
title: Materials Distribution Graph
draft: true
---

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Materials Distribution Graph</h1>
<h2>Work in progress.</h2>

```js
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
```

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```js
// Update hierarchy creation to show total counts while still handling duplicates for display
const createMaterialsHierarchy = (materials) => {
  const root = {
    name: "Materials",
    children: [],
  };

  const typeGroups = {};
  const nameCounts = {};
  const typeTotalCounts = {};

  // First count duplicate names and total type counts
  materials.forEach((material) => {
    const type = material.type || "No type assigned";
    nameCounts[material.name] = (nameCounts[material.name] || 0) + 1;
    typeTotalCounts[type] = (typeTotalCounts[type] || 0) + 1;
  });

  // Group by type
  materials.forEach((material) => {
    const type = material.type || "No type assigned";
    if (!typeGroups[type]) {
      typeGroups[type] = [];
    }
    // Only add first occurrence of each name in each type for display
    if (!typeGroups[type].some((m) => m.name === material.name)) {
      typeGroups[type].push(material);
    }
  });

  // Add counts to type groups (using total counts) and material names
  root.children = Object.entries(typeGroups).map(([type, materialsOfType]) => ({
    name: `${type} (${typeTotalCounts[type]})`, // Use total count instead of unique names count
    children: materialsOfType.map((material) => ({
      name: `${material.name} (${nameCounts[material.name]})`,
      id: material.id,
    })),
  }));

  root.name = `Materials (${materials.length})`;
  return root;
};

const createRadialTree = (hierarchyData, width = 1300) => {
  const height = width;
  const margins = {
    top: 60,
    right: 60,
    bottom: 60,
    left: 60,
  };

  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = Math.min(width - margins.left - margins.right, height - margins.top - margins.bottom) / 2;

  const tree = d3
    .tree()
    .size([2 * Math.PI, radius])
    .separation((a, b) => {
      if (a.depth === 2 && b.depth === 2) {
        return 8;
      }
      if (a.depth === 1 && b.depth === 1) {
        return 3;
      }
      return (a.parent == b.parent ? 2 : 4) / a.depth;
    });

  const root = tree(d3.hierarchy(hierarchyData).sort((a, b) => d3.ascending(a.data.name, b.data.name)));

  const svg = d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-cx, -cy, width, height])
    .attr("style", `padding: ${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px`);

  // Links
  svg
    .append("g")
    .selectAll("path")
    .data(root.links())
    .join("path")
    .attr("fill", "none")
    .attr("stroke", "currentColor")
    .attr("stroke-opacity", 0.4)
    .attr("stroke-width", 0.5)
    .attr(
      "d",
      d3
        .linkRadial()
        .angle((d) => d.x)
        .radius((d) => d.y)
    );

  // Nodes
  svg
    .append("g")
    .selectAll("circle")
    .data(root.descendants())
    .join("circle")
    .attr("transform", (d) => `rotate(${(d.x * 180) / Math.PI - 90}) translate(${d.y},0)`)
    .attr("fill", "currentColor")
    .attr("r", 2);

  // Labels
  svg
    .append("g")
    .selectAll("text")
    .data(root.descendants())
    .join("text")
    .attr("transform", (d) => {
      // Center text for root node (no rotation)
      if (d.depth === 0) {
        return `translate(${-50},0)`;
      }
      return `
        rotate(${(d.x * 180) / Math.PI - 90})
        translate(${d.y},0)
        rotate(${d.x >= Math.PI ? 180 : 0})
      `;
    })
    .attr("font-size", (d) => (d.depth === 0 ? "16px" : d.depth === 1 ? "14px" : "10px"))
    .attr("fill", "currentColor")
    .attr("dy", (d) => (d.depth === 0 ? "0" : "0.31em"))
    .attr("x", (d) => {
      if (d.depth === 0) return 0;
      return d.x < Math.PI === !d.children ? 12 : -12;
    })
    .attr("text-anchor", (d) => {
      if (d.depth === 0) return "middle";
      return d.x < Math.PI === !d.children ? "start" : "end";
    })
    .text((d) => d.data.name)
    .style("font-family", "sans-serif");

  return svg.node();
};

// Create visualization
const materialsRadialTree = createRadialTree(createMaterialsHierarchy(materials));
```

<div class="grid grid-cols-4 grid-rowspan-1">
  <div class="card grid-colspan-1 grid-rowspan-1">
  
  Out of `100` liquid materials, only three materials are non-conductive: `liquid_fire`, `liquid_fire_weak`, and `oil`.
  
  </div>
</div>
<div class="card grid-colspan-4">
  <h2>Materials hierarchy</h2>
  ${materialsRadialTree}
</div>
