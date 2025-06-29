import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Define paths
const inputFilePath = './material_associations.json';
const outputDir = './src/data/jsons/tags/';

async function generateTagFiles() {
    try {
        // Ensure the output directory exists
        await mkdir(outputDir, { recursive: true });

        // Read and parse the input file
        const data = JSON.parse(await readFile(inputFilePath, 'utf8'));

        // Group material_ids by tags
        const tagsMap = {};
        data.forEach(({ material_id, tag }) => {
            if (!tagsMap[tag]) {
                tagsMap[tag] = [];
            }
            if (!tagsMap[tag].includes(material_id)) {
                tagsMap[tag].push(material_id);
            }
        });

        // Write each tag's materials to a separate file
        await Promise.all(
            Object.entries(tagsMap).map(([tag, materialIds]) => {
                const filePath = join(outputDir, `${tag}.json`);
                return writeFile(filePath, JSON.stringify(materialIds, null, 2), 'utf8');
            })
        );

        console.log('Files created successfully!');
    } catch (error) {
        console.error('Error processing the file:', error);
    }
}

generateTagFiles();
