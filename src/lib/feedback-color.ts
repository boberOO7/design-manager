export type HsvColor = { h: number; s: number; v: number };

export function hexToHsv(hex: string, previous: HsvColor = { h: 0, s: 0, v: 0 }): HsvColor {
  const [r, g, b] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  const hue = delta === 0 ? previous.h : 60 * (max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
  // Keep the user's hue/saturation when crossing grey or black in the picker.
  return { h: hue, s: max === 0 ? previous.s : delta / max * 100, v: max * 100 };
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  const channel = (offset: number) => {
    const k = (offset + h / 60) % 6;
    return Math.round(255 * v / 100 * (1 - s / 100 * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}
