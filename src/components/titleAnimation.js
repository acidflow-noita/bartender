import { gsap } from "gsap";
import { ExpoScaleEase } from "gsap/EasePack";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";

gsap.registerPlugin(ScrambleTextPlugin, ExpoScaleEase);

export function initializeTitleAnimation(titleId = "acidTitle") {
  const element = document.getElementById(titleId);
  if (!element) return;

  const animation = gsap.to(element, {
    duration: 3,
    scrambleText: {
      delay: 0.5,
      text: "{original}",
      chars: "upperAndLowerCase",
      revealDelay: 1,
      speed: 0.3,
      tweenLength: true,
      ease: "slow(0.7,0.7,false)",
    },
  });

  element.onclick = function () {
    animation.restart(true);
  };

  return animation;
}
