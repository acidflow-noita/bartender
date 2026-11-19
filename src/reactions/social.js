export const CARD_ORIGIN = 'https://bartender.runfast.stream';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function recipeMediaUrls(id, version, origin = CARD_ORIGIN) {
  const asset = origin + '/recipe-media/' + id + '-' + version;
  return {animation: asset + '.webp', poster: asset + '.png'};
}

export function recipeCard(id, catalog) {
  const record = catalog[id];
  if (!record) return null;
  return {title: record.title, description: record.description, canonical: CARD_ORIGIN + '/reactions/' + id,
    ...recipeMediaUrls(id, record.version)};
}

function discordGallery(card) {
  const component = {
    type: 17,
    components: [
      {type: 12, items: [{media: {url: card.animation}}]},
      {type: 1, components: [
        {type: 2, style: 5, label: 'Open recipe', url: card.canonical},
        {type: 2, style: 5, label: 'Open animation', url: card.animation},
      ]},
    ],
  };
  // Script text is raw HTML even for application/json. Escape '<' before
  // checking Discord's byte limit so a value cannot close the script.
  const json = JSON.stringify({component}).replaceAll('<', '\\u003c');
  if (new TextEncoder().encode(json).byteLength > 3000) throw new Error('Discord component embed exceeds 3,000 bytes for ' + card.canonical);
  return `<script id="discord:component-embed" type="application/json">${json}</script>`;
}

export function withRecipeMetadata(html, card) {
  if (!card) return html;
  const og = {'og:type':'website','og:site_name':'Noita Bartender','og:title':card.title,'og:description':card.description,'og:url':card.canonical,
    'og:image':card.animation,'og:image:type':'image/webp','og:image:width':'960','og:image:height':'480'};
  const twitter = {'twitter:card':'summary_large_image','twitter:title':card.title,'twitter:description':card.description,'twitter:image':card.poster};
  const tags = [`<link rel="canonical" href="${escape(card.canonical)}">`, `<meta name="description" content="${escape(card.description)}">`];
  for (const [key, value] of Object.entries(og)) tags.push(`<meta property="${key}" content="${escape(value)}">`);
  for (const [key, value] of Object.entries(twitter)) tags.push(`<meta name="${key}" content="${escape(value)}">`);
  tags.push(discordGallery(card));
  return html.replace(/<meta\b[^>]*\bdata-site-card\b[^>]*>\s*/gi, '')
    .replace(/<title>[^<]*<\/title>/i, () => '<title>' + escape(card.title) + ' - Noita Bartender</title>')
    .replace('</head>', () => tags.join('\n') + '\n</head>');
}
