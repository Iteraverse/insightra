<script lang="ts">
  import type { MarketRow } from './types';
  import { money } from './types';
  let { rows } = $props<{ rows: MarketRow[] }>();
  const records: MarketRow[] = $derived(rows);
  const up = $derived(records.filter((r) => r.pct_chg > 0).length),
    down = $derived(records.filter((r) => r.pct_chg < 0).length),
    flat = $derived(rows.length - up - down);
  const bins = $derived(
    [
      { label: '≤−7%', min: -Infinity, max: -7 },
      { label: '−7~−3', min: -7, max: -3 },
      { label: '−3~0', min: -3, max: 0 },
      { label: '0', min: 0, max: 0 },
      { label: '0~3', min: 0, max: 3 },
      { label: '3~7', min: 3, max: 7 },
      { label: '≥7%', min: 7, max: Infinity },
    ].map((b, i) => ({
      ...b,
      n: records.filter((r) =>
        i === 3
          ? r.pct_chg === 0
          : i < 3
            ? r.pct_chg > b.min && r.pct_chg <= b.max && r.pct_chg !== 0
            : r.pct_chg >= b.min && r.pct_chg < b.max && r.pct_chg !== 0,
      ).length,
    })),
  );
  const maximum = $derived(Math.max(1, ...bins.map((b) => b.n)));
  const totalAmount = $derived(records.reduce((sum, r) => sum + (r.amount ?? 0), 0));
</script>

<div class="breadth-widget">
  <div class="breadth-headline">
    <strong>{((up / Math.max(1, rows.length)) * 100).toFixed(1)}<small>%</small></strong><span
      >有行情股票上涨占比</span
    >
  </div>
  <div class="breadth-counts">
    <div><i class="rise-dot"></i><span>上涨</span><b>{up}</b></div>
    <div><i class="fall-dot"></i><span>下跌</span><b>{down}</b></div>
    <div><i></i><span>平盘</span><b>{flat}</b></div>
  </div>
  <div class="breadth-stack">
    <i style={`flex:${up};background:var(--market-up)`}></i><i
      style={`flex:${flat};background:var(--faint)`}
    ></i><i style={`flex:${down};background:var(--market-down)`}></i>
  </div>
  <div class="breadth-histogram">
    {#each bins as b, i}<div>
        <span>{b.n}</span><i
          style={`height:${(b.n / maximum) * 100 + 2}px;background:${i < 3 ? 'var(--market-down)' : i > 3 ? 'var(--market-up)' : 'var(--faint)'}`}
        ></i><small>{b.label}</small>
      </div>{/each}
  </div>
  <div class="breadth-turnover">
    <span>样本成交额</span><strong>{money(totalAmount)}<small>元</small></strong>
  </div>
  <p class="widget-note">
    基于本数据集 {rows.length} 家股票的收盘涨跌。未返回行情的股票不计入，不将缺失视为平盘。
  </p>
</div>
