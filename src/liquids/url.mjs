import {LIQUID_SCENES, defaultSceneProcesses} from './scenes.mjs';
import {WALL_MATERIALS} from './view-data.mjs';

export function readLiquidSetup(href, materials) {
  const params = new URL(href).searchParams;
  const requested = params.get('material');
  return {
    material: materials.some(material => material.id === requested) ? requested
      : materials.find(material => material.id === 'water')?.id ?? materials[0]?.id ?? '',
    scene: LIQUID_SCENES.some(scene => scene.id === params.get('scene')) ? params.get('scene') : 'density',
    wall: WALL_MATERIALS.some(material => material.id === params.get('wall')) ? params.get('wall') : 'rock_static',
    ...(['0', '1'].includes(params.get('interactions')) ? {interactions: params.get('interactions') === '1'} : {}),
  };
}

export function liquidSetupUrl(href, setup) {
  const url = new URL(href);
  url.searchParams.delete('material');
  url.searchParams.delete('scene');
  url.searchParams.delete('wall');
  url.searchParams.delete('interactions');
  if (setup.material) url.searchParams.set('material', setup.material);
  if (setup.scene && setup.scene !== 'density') url.searchParams.set('scene', setup.scene);
  if (setup.wall && setup.wall !== 'rock_static') url.searchParams.set('wall', setup.wall);
  if (typeof setup.interactions === 'boolean' && setup.interactions !== defaultSceneProcesses(setup.scene || 'density')) {
    url.searchParams.set('interactions', setup.interactions ? '1' : '0');
  }
  return url.href;
}
