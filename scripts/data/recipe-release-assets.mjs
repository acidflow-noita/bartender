import {spawnSync} from 'node:child_process';

const repo = 'acidflow-noita/bartender';

export function gh(args, optional = false) {
  const command = args[0] === 'api' ? args : [...args, '--repo', repo];
  const result = spawnSync('gh', command, {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  if (result.error) throw result.error;
  if (result.status !== 0 && !optional) throw new Error(result.stderr.trim());
  return result.status === 0 ? result.stdout : null;
}

export function releaseView(tag) {
  const result = gh(['release', 'view', tag, '--json', 'databaseId,isDraft,assets'], true);
  if (!result) return null;
  const remote = JSON.parse(result);
  // A large catalog can exceed the asset page returned by release view.
  if (remote.databaseId && remote.assets.length >= 30) {
    remote.assets = [];
    for (let page = 1;; page++) {
      const items = JSON.parse(gh(['api', 'repos/' + repo + '/releases/' + remote.databaseId + '/assets?per_page=100&page=' + page]));
      remote.assets.push(...items);
      if (items.length < 100) break;
    }
  }
  for (const asset of remote.assets) if (!asset.digest && asset.size && asset.apiUrl) {
    asset.digest = gh(['api', asset.apiUrl, '--jq', '.digest']).trim();
  }
  return remote;
}

export function openDraft(tag) {
  let remote = releaseView(tag);
  if (!remote) {
    gh(['release', 'create', tag, '--draft', '--latest=false', '--title', 'Recipe previews ' + tag.slice(-12),
      '--notes', 'Prebuilt static recipe animations and posters.', '--target', process.env.RECIPE_SOURCE_REVISION || process.env.GITHUB_SHA || 'main'], true);
    remote = releaseView(tag);
  }
  if (!remote) throw new Error('Could not open the recipe media release ' + tag);
  return remote;
}

export function assetMatches(asset, record) {
  return asset?.size === record.bytes && asset.digest === 'sha256:' + record.sha256;
}

export async function uploadVerified(tag, files) {
  const missing = remote => files.filter(file => {
    const asset = remote?.assets.find(item => item.name === file.name);
    if (assetMatches(asset, file)) return false;
    if (asset || !remote?.isDraft) throw new Error('Incomplete or conflicting release asset ' + file.name);
    return true;
  });
  for (let attempt = 1;; attempt++) {
    try {
      const pending = missing(releaseView(tag));
      if (pending.length) gh(['release', 'upload', tag, ...pending.map(f => f.path)]);
      if (missing(releaseView(tag)).length) throw new Error('Uploaded recipe assets are not ready.');
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
}
