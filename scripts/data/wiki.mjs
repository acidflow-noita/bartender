export const wikiEndpoint = 'https://noita.wiki.gg/api.php';

export async function fetchCargo(query, {fetcher = fetch, pageSize = 500, maxPages = 100, retries = 3,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  const rows = [], pages = new Set();
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(wikiEndpoint);
    url.search = new URLSearchParams({action: 'cargoquery', format: 'json', ...query, limit: String(pageSize), offset: String(page * pageSize)});
    let payload;
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetcher(url, {signal: AbortSignal.timeout(30000)});
        if (!response.ok) throw new Error(`Wiki HTTP ${response.status}`);
        payload = await response.json();
        if (!Array.isArray(payload.cargoquery) || payload.error) throw new Error(`Invalid wiki response: ${payload.error?.info ?? 'missing cargoquery'}`);
        if (payload.cargoquery.some(item => !item?.title || typeof item.title !== 'object')) throw new Error('Malformed wiki row');
        break;
      } catch (error) {
        if (attempt >= retries) throw error;
        await wait(250 * 2 ** attempt);
      }
    }
    const current = payload.cargoquery.map(item => item.title);
    if (current.length) {
      const signature = JSON.stringify(current);
      if (pages.has(signature)) throw new Error('Wiki repeated a page; refusing an incomplete snapshot');
      pages.add(signature); rows.push(...current);
    }
    if (current.length < pageSize) return rows;
  }
  throw new Error(`Wiki pagination exceeded ${maxPages} pages; no snapshot was saved`);
}
