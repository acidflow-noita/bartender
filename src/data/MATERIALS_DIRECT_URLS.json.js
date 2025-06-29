import * as fs from "fs";

// Read and process MATERIALS_RAW_IMAGES_URLS_RESPONSES.txt
const responseText = fs.readFileSync("./data/images_downloader/MATERIALS_RAW_IMAGES_URLS_RESPONSES.txt", "utf8");
const responseJson = JSON.parse(responseText.replace(/.*--- End of Response ---/g, ""));

let directUrls = {
  allimages: [],
};

responseJson.query.allimages.forEach(image => {
  directUrls.allimages.push(image.url);
});

fs.writeFileSync("./src/data/DIRECT_URLS.json", JSON.stringify(directUrls));

// Read materials.json
const materialsText = fs.readFileSync("materials.json", "utf8");
const materialsJson = JSON.parse(materialsText);

// Match and update materials.json
directUrls.allimages.forEach(url => {
  const imageName = url
    .replace(/https?:\/\/\//, "")
    .split("/")[2]
    .replace(".png", "");
  const matchingMaterial = materialsJson.find(material => material.name === imageName);

  if (matchingMaterial) {
    matchingMaterial.url = url;

    if (materialsJson.indexOf(matchingMaterial) !== directUrls.allimages.indexOf(url)) {
      // Check if image or icon matches
      const imagePath = `https://noita.wiki.gg/images/${directUrls.allimages[materialsJson.indexOf(url)]}`;
      const iconPath = materialsJson.find(material => material.name === imageName).icon;

      if (imagePath in matchingMaterial.image) {
        // Image matches
        matchingMaterial.url = imagePath;
      } else if (iconPath || iconPath === `File:${imageName}.png`) {
        // Icon matches
        matchingMaterial.url = iconPath;
      }
    }

    fs.writeFileSync("FULL_MATERIALS_FINAL.json", JSON.stringify(materialsJson, null, 2));
  }
});
