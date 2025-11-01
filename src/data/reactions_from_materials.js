import { readFileSync, writeFileSync } from 'fs';

function extractAttribute(block, attributeName) {
    const pattern = new RegExp(attributeName + '="([^"]*)"', 'i');
    const match = block.match(pattern);
    return match ? match[1].trim() : null;
}

function removeComments(xml) {
    return xml.replace(/<!--[\s\S]*?-->/g, '');
}

function parseMaterialXml(xmlContent) {
    const reactions = [];
    xmlContent = removeComments(xmlContent);

    const reactionPattern = /<Reaction[^>]*>[\s\S]*?<\/Reaction>/gi;
    let match;

    while ((match = reactionPattern.exec(xmlContent)) !== null) {
        const block = match[0];
        const reaction = {
            reactionRate: extractAttribute(block, 'probability') || "0",
            reagent1: extractAttribute(block, 'input_cell1'),
            reagent2: extractAttribute(block, 'input_cell2'),
            reagent3: extractAttribute(block, 'input_cell3'),
            product1: extractAttribute(block, 'output_cell1'),
            product2: extractAttribute(block, 'output_cell2'),
            product3: extractAttribute(block, 'output_cell3'),
            notes: null
        };
        reactions.push(reaction);
    }

    return reactions;
}

const sourceFile = 'src/data/';

function main(inputFile, outputFile) {
    try {
        const xml = readFileSync(sourceFile + inputFile + ".xml", 'utf8');
        const reactions = parseMaterialXml(xml);

        if (!reactions.length) return console.log('Aucune réaction trouvée');

        writeFileSync(
            sourceFile + outputFile + ".json",
            JSON.stringify(reactions, null, 2)
        );
        console.log(`${reactions.length} réactions enregistrées`);
    } catch (e) {
        console.error('Erreur:', e.message);
    }
}

main("materials", "reactions_from_materials");
