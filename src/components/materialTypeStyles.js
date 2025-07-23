export const materialTypeColors = [
  { type: "Solid", color: "oklch(70.9% 0.01 56.259)", symbol: "square2" },
  { type: "Liquid", color: "oklch(80.9% 0.105 251.813)", symbol: "circle" },
  { type: "Powder", color: "oklch(91% 0.096 180.426)", symbol: "triangle2" },
  { type: "Gas", color: "oklch(83.3% 0.145 321.434)", symbol: "asterisk" },
  { type: "Fire", color: "oklch(80.8% 0.114 19.571)", symbol: "plus" },
  { type: "N/A", color: "oklch(98.5% 0 0)", symbol: "times" },
];

// Helper function to get symbol configuration for Plot.js
export function getSymbolConfig() {
  return {
    domain: materialTypeColors.map((d) => d.type),
    range: materialTypeColors.map((d) => d.symbol),
  };
}
