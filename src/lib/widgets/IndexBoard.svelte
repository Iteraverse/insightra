<script lang="ts">
  import type { IndexRow } from './types';
  import { signed } from './types';
  let { rows } = $props<{ rows: IndexRow[] }>();
  const indices = $derived.by(() => {
    const map = new Map<string, IndexRow[]>();
    for (const row of rows) {
      if (!map.has(row.ts_code)) map.set(row.ts_code, []);
      map.get(row.ts_code)!.push(row);
    }
    return [...map.values()]
      .slice(0, 8)
      .map((series) => series.sort((a, b) => a.trade_date.localeCompare(b.trade_date)));
  });
  const path = (series: IndexRow[]) => {
    const min = Math.min(...series.map((r) => r.close)),
      max = Math.max(...series.map((r) => r.close));
    return series
      .map(
        (r, i) =>
          `${i ? 'L' : 'M'}${(i / Math.max(1, series.length - 1)) * 160},${48 - ((r.close - min) / Math.max(1, max - min)) * 39}`,
      )
      .join(' ');
  };
</script>

<div class="index-board-widget">
  {#each indices as series}{@const last = series.at(-1)!}
    <div class="index-tile">
      <div><strong>{last.name}</strong><small>{last.ts_code}</small></div>
      <b
        >{last.close.toLocaleString('zh-CN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}</b
      ><span class:positive={last.pct_chg > 0} class:negative={last.pct_chg < 0}
        >{signed(last.pct_chg)}</span
      ><svg
        viewBox="0 0 160 54"
        role="img"
        aria-label={`${last.name}历史收盘走势，${series.length}个交易日`}
        ><path d={path(series)} fill="none" stroke="var(--accent)" stroke-width="1.7" /></svg
      ><small>{last.trade_date} 收盘 · {series.length} 个交易日</small>
    </div>{/each}
</div>
