import * as fs from "fs";

// Fetch data from the API
const response = await fetch(
  "https://noita.wiki.gg/api.php?action=cargoquery&tables=Reactions&fields=Reactions.reactionRate,Reactions.reagent1,Reactions.reagent2,Reactions.reagent3,Reactions.product1,Reactions.product2,Reactions.product3,Reactions.notes&limit=500&offset=0&format=json"
);

if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
let data = await response.json();

data = data.cargoquery.map((item) => item.title);

// Save to file as an array of objects
fs.writeFileSync("./src/data/reactions.json", JSON.stringify(data, null, 2), "utf-8");
