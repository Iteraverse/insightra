<script lang="ts">
  import { ArrowUpRight, ArrowDownRight, Minus } from '@lucide/svelte';
  import QuoteSparkline from './QuoteSparkline.svelte';
  import type { IndexRow } from './types';
  import { signed, money } from './types';
  let { rows, days = 20 } = $props<{ rows: IndexRow[]; days?: number }>();
  const indices: IndexRow[][] = $derived.by(() => {
    const map = new Map<string, IndexRow[]>();
    for (const row of rows) {
      if (!map.has(row.ts_code)) map.set(row.ts_code, []);
      map.get(row.ts_code)!.push(row);
    }
    return [...map.values()]
      .slice(0, 8)
      .map((series) => series.sort((a, b) => a.trade_date.localeCompare(b.trade_date)));
  });
  const volumeText = (v: number | null | undefined) =>
    v == null ? '—' : v >= 1e8 ? `${(v / 1e8).toFixed(2)} 亿手` : `${(v / 1e4).toFixed(2)} 万手`;
</script>

<div class="index-board-widget">
  {#each indices as series}{@const last = series.at(-1)!}{@const previous =
      series.at(-2)}{@const delta =
      last.vol != null && previous?.vol != null && previous.vol > 0
        ? (last.vol / previous.vol - 1) * 100
        : null}{@const trend = series.slice(-days)}
    <div
      class="index-tile"
      class:index-rising={last.pct_chg > 0}
      class:index-falling={last.pct_chg < 0}
    >
      <div class="index-name"><strong>{last.name}</strong><small>{last.ts_code}</small></div>
      <b
        >{last.close.toLocaleString('zh-CN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}</b
      >
      <div
        class="index-direction"
        class:positive={last.pct_chg > 0}
        class:negative={last.pct_chg < 0}
      >
        {#if last.pct_chg > 0}<ArrowUpRight size={23} />{:else if last.pct_chg < 0}<ArrowDownRight
            size={23}
          />{:else}<Minus size={23} />{/if}<strong>{signed(last.pct_chg)}</strong><small
          >{last.pct_chg > 0 ? '上涨' : last.pct_chg < 0 ? '下跌' : '平盘'}</small
        >
      </div>
      <QuoteSparkline
        points={trend}
        change={last.pct_chg}
        label={`${last.name}历史收盘走势，${trend.length}个交易日`}
      />
      <div class="index-volume">
        <span>成交量 <b>{volumeText(last.vol)}</b></span><strong
          >{delta === null
            ? '量能对比待同步'
            : `${delta > 0 ? '↑ 放量' : delta < 0 ? '↓ 缩量' : '持平'} ${Math.abs(delta).toFixed(1)}%`}</strong
        >
      </div>
      <div class="index-amount">
        <span>成交额</span><b>{last.amount == null ? '—' : money(last.amount) + ' 元'}</b>
      </div>
      <small class="index-date" title="曲线颜色表示当日涨跌；量能与前一条日线比较"
        >{last.trade_date} · {trend.length}/{days} 日</small
      >
    </div>{/each}
</div>
