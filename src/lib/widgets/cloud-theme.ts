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
  const dark = rgb(palette.neutral).reduce((sum, v) => sum + v, 0) < 300;
  const neutral = dark ? [43, 49, 59] : rgb(palette.neutral);
  const target = dark
    ? change >= 0
      ? [204, 54, 65]
      : [37, 164, 84]
    : change >= 0
      ? [205, 66, 83]
      : [39, 143, 100];
  const strength = Math.min(Math.abs(change) / 4, 1) ** 0.55;
  const intensity = dark ? strength : Math.abs(change) < 0.005 ? 0 : 0.16 + strength * 0.64;
  const color = neutral.map((v, i) => Math.round(v + (target[i] - v) * intensity));
  return { fill: `rgb(${color.join(',')})`, text: dark ? '#f8fafc' : '#202b33' };
}
