export const CARD_ORIGIN = 'https://bartender.runfast.stream';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function recipeCard(id, catalog) {
  const record = catalog[id];
  if (!record) return null;
  const asset = CARD_ORIGIN + '/recipe-media/' + id + '-' + record.version;
  return {title: record.title, description: record.description, canonical: CARD_ORIGIN + '/reactions/' + id,
    animation: asset + '.webp', poster: asset + '.png', alt: record.title + '. Material icons appear above the simulation tank.'};
}

export function withRecipeMetadata(html, card) {
  if (!card) return html;
  const og = {'og:type':'website','og:site_name':'Noita Bartender','og:title':card.title,'og:description':card.description,'og:url':card.canonical,
    'og:image':card.animation,'og:image:type':'image/webp','og:image:width':'960','og:image:height':'480','og:image:alt':card.alt};
  const twitter = {'twitter:card':'summary_large_image','twitter:title':card.title,'twitter:description':card.description,'twitter:image':card.poster,'twitter:image:alt':card.alt};
  const tags = [`<link rel="canonical" href="${escape(card.canonical)}">`, `<meta name="description" content="${escape(card.description)}">`];
  for (const [key, value] of Object.entries(og)) tags.push(`<meta property="${key}" content="${escape(value)}">`);
  for (const [key, value] of Object.entries(twitter)) tags.push(`<meta name="${key}" content="${escape(value)}">`);
  return html.replace(/<meta\b[^>]*\bdata-site-card\b[^>]*>\s*/gi, '')
    .replace(/<title>[^<]*<\/title>/i, () => '<title>' + escape(card.title) + ' - Noita Bartender</title>')
    .replace('</head>', () => tags.join('\n') + '\n</head>');
}
