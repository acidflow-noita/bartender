import manifest from '../generated/data-manifest.json' with {type: 'json'};

const cache = new Map();
function loadJSON(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then(response => {
    if (!response.ok) throw new Error(`Could not load data (${response.status}).`);
    return response.json();
  }).catch(error => {cache.delete(path); throw error;}));
  return cache.get(path);
}
export function loadData(name) {
  if (typeof manifest[name] !== 'string') throw new Error(`Unknown dataset: ${name}`);
  return loadJSON(manifest[name]);
}
export async function loadMaterialDetails(id) {
  const index = await loadData('materialDetails');
  if (!Object.hasOwn(index, id)) throw new Error(`Unknown material: ${id}`);
  return loadJSON(index[id]);
}
export const loadDatasets = names => Promise.all(names.map(loadData));
