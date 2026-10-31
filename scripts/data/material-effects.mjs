import {csvParseRows} from 'd3';

export function parseMaterialEffectNames(lua, translations) {
  const english = new Map(csvParseRows(translations).slice(1).map(row => [row[0], row[1]]));
  const source = lua.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');
  const entries = [...source.matchAll(/^\s*id\s*=\s*"([^"]+)"/gm)];
  if (!entries.length || entries.length !== [...source.matchAll(/^\s*id\s*=/gm)].length) throw new Error('Unsupported status-effect definitions');
  return entries.map((entry, index) => {
    const block = source.slice(entry.index, entries[index + 1]?.index);
    const nameKey = block.match(/\bui_name\s*=\s*"\$([^"]+)"/)?.[1];
    const descriptionKey = block.match(/\bui_description\s*=\s*"\$([^"]+)"/)?.[1];
    return {symbol: entry[1], name: english.get(nameKey) || entry[1],
      threshold: Number(block.match(/\bmin_threshold_normalized\s*=\s*([\d.]+)/)?.[1] ?? 0),
      description: (english.get(descriptionKey) || '').replaceAll('\\n', '\n')};
  });
}

const array = value => value == null ? [] : Array.isArray(value) ? value : [value];

export function resolveMaterialEffects(records, names) {
  const bindings = new Map();
  // Material effect numbers are not positions in status_list.lua. Resolve only
  // single named declarations whose amount matches the extracted float32 value.
  for (const record of records) {
    if (record.xml.length !== 1) continue;
    const definition = record.xml[0].definition;
    for (const [field, channel] of [['stain_effects', 'Stains'], ['ingestion_effects', 'Ingestion']]) {
      const actual = record.native[field] ?? [];
      const declared = [
        ...(field === 'stain_effects' && definition['@status_effects']
          ? definition['@status_effects'].split(',').map(symbol => ({symbol: symbol.trim(), amount: 1})) : []),
        ...array(definition.StatusEffects?.[channel]?.StatusEffect).map(effect => ({symbol: effect['@type'], amount: Number(effect['@amount'] ?? 1)})),
      ];
      if (actual.length !== 1 || declared.length !== 1 || !declared[0].symbol
        || Math.fround(declared[0].amount) !== actual[0].duration) continue;
      const id = actual[0].id, symbol = declared[0].symbol;
      if (bindings.has(id) && bindings.get(id) !== symbol) throw new Error(`Conflicting material effect ${id}: ${bindings.get(id)} / ${symbol}`);
      bindings.set(id, symbol);
    }
  }
  const metadata = new Map();
  for (const effect of names) {
    if (!metadata.has(effect.symbol)) metadata.set(effect.symbol, []);
    metadata.get(effect.symbol).push(effect);
  }
  const describe = effect => {
    const symbol = bindings.get(effect.id) ?? null;
    const variants = metadata.get(symbol) ?? [];
    return {...effect, symbol, name: variants.length ? [...new Set(variants.map(variant => variant.name))].join(' / ') : symbol ?? `Unknown effect (${effect.id})`,
      description: variants.length > 1 ? 'Effects vary with accumulated amount.' : variants[0]?.description ?? '', variants};
  };
  return records.map(record => ({...record, effects: {
    stain: (record.native.stain_effects ?? []).map(describe),
    ingestion: (record.native.ingestion_effects ?? []).map(describe),
  }}));
}
