<script lang="ts">
  import type { MarketRow } from './types';
  import { signed, money } from './types';
  let { rows } = $props<{ rows: MarketRow[] }>();
  let order = $state('gain'),
    query = $state(''),
    selected = $state('');
  const records: MarketRow[] = $derived(rows);
  const sectors = $derived.by(() => {
    const map = new Map<
      string,
      { name: string; sum: number; count: number; amount: number; up: number }
    >();
    for (const r of records) {
      const s = map.get(r.industry) || { name: r.industry, sum: 0, count: 0, amount: 0, up: 0 };
      s.sum += r.pct_chg;
      s.count++;
      s.amount += r.amount ?? 0;
      if (r.pct_chg > 0) s.up++;
      map.set(r.industry, s);
    }
    return [...map.values()].map((s) => ({ ...s, change: s.sum / s.count }));
  });
  const displayed = $derived(
    sectors
      .filter((s) => s.name.includes(query))
      .sort((a, b) =>
        order === 'gain'
          ? b.change - a.change
          : order === 'loss'
            ? a.change - b.change
            : b.amount - a.amount,
      ),
  );
  const companies = $derived(
    records.filter((r) => r.industry === selected).sort((a, b) => b.pct_chg - a.pct_chg),
  );
</script>

<div class="industry-board-widget">
  <div class="industry-widget-controls">
    <input aria-label="查找细分行业" placeholder="查找行业" bind:value={query} /><select
      aria-label="行业排序"
      bind:value={order}
      ><option value="gain">涨幅优先</option><option value="loss">跌幅优先</option><option
        value="amount">成交额优先</option
      ></select
    >
  </div>
  <div class="sector-scroll">
    {#each displayed as s}<button
        class:sector-selected={selected === s.name}
        onclick={() => (selected = selected === s.name ? '' : s.name)}
        ><span><strong>{s.name}</strong><small>{s.count} 家 · 上涨 {s.up} 家</small></span>
        <div class="sector-bar">
          <i
            style={`width:${Math.min(Math.abs(s.change) / 10, 1) * 100}%;background:${s.change >= 0 ? 'var(--market-up)' : 'var(--market-down)'}`}
          ></i>
        </div>
        <b class:positive={s.change > 0} class:negative={s.change < 0}>{signed(s.change)}</b
        ></button
      >{/each}
  </div>
  {#if selected}<div class="sector-constituents">
      <strong>{selected} · 成分涨幅前 8</strong>{#each companies.slice(0, 8) as row}<div>
          <span>{row.name}</span><b
            class:positive={row.pct_chg > 0}
            class:negative={row.pct_chg < 0}>{signed(row.pct_chg)}</b
          >
        </div>{/each}
    </div>{/if}
  <p class="widget-note">
    共 {sectors.length} 个 Tushare 行业分类。行业涨跌为成分股等权均值，不是官方行业指数。
  </p>
</div>
