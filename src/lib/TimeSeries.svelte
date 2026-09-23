<script lang="ts">
  let {
    values,
    labels = [],
    unit = '',
    title = '趋势',
    secondary = [],
    secondaryLabel = '参照',
    color = 'var(--accent)',
    area = true,
  } = $props<{
    values: number[];
    labels?: string[];
    unit?: string;
    title?: string;
    secondary?: number[];
    secondaryLabel?: string;
    color?: string;
    area?: boolean;
  }>();
  let width = $state(700);
  let hover = $state<number | null>(null);
  const w = $derived(Math.max(300, width));
  const h = 260,
    left = 52,
    top = 23,
    bottom = 36,
    right = 24;
  const all = $derived([...values, ...secondary].filter(Number.isFinite));
  const min = $derived(all.length ? Math.min(...all) : 0);
  const max = $derived(all.length ? Math.max(...all) : 1);
  const pad = $derived(Math.max((max - min) * 0.18, Math.abs(max) * 0.01, 0.01));
  const low = $derived(min - pad),
    high = $derived(max + pad);
  const x = (i: number) => left + (i / Math.max(1, values.length - 1)) * (w - left - right);
  const y = (v: number) => top + ((high - v) / (high - low)) * (h - top - bottom);
  const path = (items: number[]) =>
    items.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const ticks = $derived(Array.from({ length: 4 }, (_, i) => low + ((high - low) * i) / 3));
  const xticks = $derived(
    [...new Set([0, Math.floor((values.length - 1) / 2), values.length - 1])].filter((i) => i >= 0),
  );
  const active = $derived(hover === null ? values.length - 1 : Math.min(hover, values.length - 1));
  function move(event: PointerEvent) {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    hover = Math.max(
      0,
      Math.min(
        values.length - 1,
        Math.round(((event.clientX - rect.left - left) / (w - left - right)) * (values.length - 1)),
      ),
    );
  }
</script>

<div class="series" bind:clientWidth={width}>
  {#if values.length}
    <div class="series-readout">
      <span>{labels[active] ?? `第 ${active + 1} 个观测`}</span><strong
        >{values[active]?.toFixed(2)} <small>{unit}</small></strong
      >{#if secondary.length}<span class="secondary-readout"
          >{secondaryLabel} {secondary[active]?.toFixed(2)}</span
        >{/if}
    </div>
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`${title}，${values.length}个观测值，最低${min.toFixed(2)}，最高${max.toFixed(2)}${unit}`}
      onpointermove={move}
      onpointerleave={() => (hover = null)}
    >
      {#each ticks as tick}<line
          x1={left}
          y1={y(tick)}
          x2={w - right}
          y2={y(tick)}
          class="chart-grid"
        /><text x={left - 10} y={y(tick) + 4} text-anchor="end" class="chart-label"
          >{tick.toFixed(max > 100 ? 0 : 1)}</text
        >{/each}
      {#if area}<path
          d={`${path(values)} L${x(values.length - 1)},${h - bottom} L${left},${h - bottom} Z`}
          fill={color}
          opacity=".07"
        />{/if}
      {#if secondary.length}<path
          d={path(secondary)}
          fill="none"
          stroke="var(--faint)"
          stroke-width="1.5"
          stroke-dasharray="5 5"
        />{/if}
      <path
        d={path(values)}
        fill="none"
        stroke={color}
        stroke-width="2.2"
        stroke-linejoin="round"
      />
      {#each xticks as index}<text
          x={x(index)}
          y={h - 11}
          text-anchor={index === 0 ? 'start' : index === values.length - 1 ? 'end' : 'middle'}
          class="chart-label">{labels[index] ?? index + 1}</text
        >{/each}
      {#if active >= 0}<line
          x1={x(active)}
          y1={top}
          x2={x(active)}
          y2={h - bottom}
          stroke="var(--line)"
          stroke-dasharray="3 4"
        /><circle
          cx={x(active)}
          cy={y(values[active])}
          r="4"
          fill={color}
          stroke="var(--surface)"
          stroke-width="2"
        />{/if}
    </svg>
    <details class="chart-data">
      <summary>查看图表数据</summary>
      <div class="table-scroll">
        <table>
          <thead
            ><tr
              ><th>时间 / 序号</th><th>{title} {unit}</th>{#if secondary.length}<th
                  >{secondaryLabel}</th
                >{/if}</tr
            ></thead
          ><tbody
            >{#each values as value, i}<tr
                ><td>{labels[i] ?? i + 1}</td><td>{value.toFixed(2)}</td>{#if secondary.length}<td
                    >{secondary[i]?.toFixed(2)}</td
                  >{/if}</tr
              >{/each}</tbody
          >
        </table>
      </div>
    </details>
  {:else}<div class="chart-empty">暂无可绘制的观测记录</div>{/if}
</div>
