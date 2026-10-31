import {gsap} from 'gsap';
import {ScrambleTextPlugin} from 'gsap/ScrambleTextPlugin.js';

gsap.registerPlugin(ScrambleTextPlugin);

export function initializeTitleAnimation(titleId = 'acidTitle') {
  const element = typeof titleId === 'string' ? document.getElementById(titleId) : titleId;
  if (!element) return;
  const original = element.textContent;
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let animation, disposed = false;
  const replay = () => {
    if (disposed || motion?.matches) return;
    animation?.kill();
    animation = gsap.to(element, {
      duration: 3,
      scrambleText: {delay: .5, text: original, chars: 'upperAndLowerCase', revealDelay: 1, speed: .3, tweenLength: true},
    });
  };
  const preferenceChanged = () => {
    if (motion?.matches) {animation?.kill(); element.textContent = original;}
  };
  element.addEventListener('click', replay);
  motion?.addEventListener('change', preferenceChanged);
  // Wait for the original pixel face, including on a cold load.
  Promise.resolve(document.fonts?.load('1em NoitaPixel')).catch(() => {}).then(replay);
  return {restart: replay, dispose() {
    disposed = true; animation?.kill(); element.textContent = original;
    element.removeEventListener('click', replay);
    motion?.removeEventListener('change', preferenceChanged);
  }};
}
