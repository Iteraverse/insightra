export type CloudPalette = {
  surface: string;
  neutral: string;
  up: string;
  down: string;
  ink: string;
  muted: string;
  border: string;
};
export const rgb = (color: string): [number, number, number] => {
  const hex = color.trim().replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(hex))
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  const values = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  return values?.length === 3 ? (values as [number, number, number]) : [240, 242, 245];
};
export function cloudColor(change: number, palette: CloudPalette) {
  const base = rgb(palette.neutral),
    tone = rgb(change >= 0 ? palette.up : palette.down);
  const power = Math.abs(change) < 0.005 ? 0 : 0.12 + Math.min(Math.abs(change) / 10, 1) * 0.78;
  const color = base.map((v, i) => Math.round(v + (tone[i] - v) * power));
  const linear = color.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return { fill: `rgb(${color.join(',')})`, text: luminance > 0.22 ? '#242a34' : '#f6f7f9' };
}
