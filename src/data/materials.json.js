// import * as fs from "fs";

// // Fetch data from the API
// const response = await fetch(
//   "https://noita.wiki.gg/api.php?action=cargoquery&tables=Materials&fields=Materials.name,Materials.id,Materials.image,Materials.icon,Materials.pouchIcon,Materials.type,Materials.wang,Materials.tags,Materials.density,Materials.hardness,Materials.durability,Materials.lifetime,Materials.biomes,Materials.submergeEffect,Materials.stainEffect,Materials.ingestEffect,Materials.conductive,Materials.burnable,Materials.freezes,Materials.melts,Materials.breakInto,Materials.slippery,Materials.notes,Materials._pageName=wikipage&group_by=Materials.id&order_by=Materials.name&limit=500&offset=0&format=json"
// );

// if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
// let data = await response.json();

// data = data.cargoquery.map((item) => item.title);

// // Save to file as an array of objects
// fs.writeFileSync("./src/data/materials.json", JSON.stringify(data, null, 2), "utf-8");
