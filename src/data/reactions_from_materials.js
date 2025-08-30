import { readFileSync, writeFileSync } from 'fs';

function extractAttribute(block, attributeName) {
    const pattern = new RegExp(attributeName + '="([^"]*)"');
    const match = block.match(pattern);
    return match ? match[1].trim() : null;
}

function parseMaterialXml(xmlContent) {
    const reactions = [];

    const reactionPattern = /<Reaction[^>]*>[^]*?<\/Reaction>/g;
    let match;

    while ((match = reactionPattern.exec(xmlContent)) !== null) {
        const reactionBlock = match[0];

        const probability = extractAttribute(reactionBlock, 'probability') || "0";
        const input1 = extractAttribute(reactionBlock, 'input_cell1');
        const input2 = extractAttribute(reactionBlock, 'input_cell2');
        const input3 = extractAttribute(reactionBlock, 'input_cell3');
        const output1 = extractAttribute(reactionBlock, 'output_cell1');
        const output2 = extractAttribute(reactionBlock, 'output_cell2');
        const output3 = extractAttribute(reactionBlock, 'output_cell3');

        const reaction = {
            reactionRate: probability,
            reagent1: input1 || null,
            reagent2: input2 || null,
            reagent3: input3 || null,
            product1: output1 || null,
            product2: output2 || null,
            product3: output3 || null,
            notes: null
        };

        reactions.push(reaction);
    }

    return reactions;
}

function main() {
    try {
        // Lire le fichier XML directement
        const xmlContent = readFileSync('src/data/materials.xml', 'utf8');

        const reactions = parseMaterialXml(xmlContent);

        if (reactions.length === 0) {
            console.log('Aucune réaction trouvée');
            return;
        }

        // Enregistrer en JSON
        writeFileSync('src/data/reactions_from_materials.json', JSON.stringify(reactions, null, 2));

        console.log(reactions.length + ' réactions enregistrées dans reactions.json');

    } catch (error) {
        console.error('Erreur:', error.message);
    }
}

main();