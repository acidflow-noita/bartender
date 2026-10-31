import * as Plot from '@observablehq/plot';

// Plot inserts an unlayered --plot-background:white rule into every SVG.
// Set the variable on the SVG itself so Bootstrap's dark palette also reaches
// implicit pointer tips, whose text is painted with currentColor.
export function themedPlot(options) {
  const plot = Plot.plot({...options, labelArrow: false,
    y: {...options.y, labelAnchor: 'top'},
    fy: {...options.fy, labelAnchor: 'top'},
    style: {
    ...options.style,
    color: 'var(--fg-body)',
    background: 'transparent',
    fontFamily: 'var(--body-font-family)',
    fontSize: '12px',
  }});
  // Plot assigns style objects with Object.assign; CSS custom properties need
  // setProperty. A plot with a legend may return a figure containing the SVG.
  const svgs = plot.tagName.toLowerCase() === 'svg' ? [plot] : plot.querySelectorAll('svg');
  for (const svg of svgs) svg.style.setProperty('--plot-background', 'var(--bg-2)');
  return plot;
}
