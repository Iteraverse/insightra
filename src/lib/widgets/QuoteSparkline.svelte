<script lang="ts">
  import type { PricePoint } from './types';
  let {
    points,
    label,
    change = 0,
    volume = false,
  } = $props<{ points: PricePoint[]; label: string; change?: number; volume?: boolean }>();
  const color = $derived(
    change > 0 ? 'var(--market-up)' : change < 0 ? 'var(--market-down)' : 'var(--muted)',
  );
  const path = $derived.by(() => {
    const values = points.map((p: PricePoint) => p.close),
      min = Math.min(...values),
      max = Math.max(...values),
      range = max - min;
    return points
      .map(
        (p: PricePoint, i: number) =>
          `${i ? 'L' : 'M'}${4 + (i / Math.max(1, points.length - 1)) * 192},${range ? 48 - ((p.close - min) / range) * 40 : 28}`,
      )
      .join(' ');
  });
  const maxVol = $derived(Math.max(1, ...points.map((p: PricePoint) => p.vol ?? 0)));
</script>

{#if points.length > 1}<svg
    class="quote-sparkline"
    viewBox={`0 0 200 ${volume ? 78 : 56}`}
    preserveAspectRatio="none"
    role="img"
    aria-label={label}
  >
    <path d={`${path} L196,52 L4,52 Z`} fill={color} opacity="0.08" />
    <path
      d={path}
      fill="none"
      stroke={color}
      stroke-width="1.7"
      vector-effect="non-scaling-stroke"
    />
    {#if volume}{#each points as p, i}{#if p.vol != null}<rect
            x={(i / points.length) * 200}
            y={78 - (p.vol / maxVol) * 19}
            width={Math.max(0.5, 200 / points.length - 1)}
            height={(p.vol / maxVol) * 19}
            fill={color}
            opacity="0.35"
          />{/if}{/each}{/if}
  </svg>{:else}<span class="trend-missing">历史不足</span>{/if}
