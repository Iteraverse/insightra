<script lang="ts">
  import QuoteSparkline from './QuoteSparkline.svelte';
  import { ArrowUpRight, ArrowDownRight, Minus } from '@lucide/svelte';
  import { signed, money, type MarketRow, type WidgetInstance } from './types';
  let { rows, widget } = $props<{
    rows: MarketRow[];
    widget: WidgetInstance;
  }>();
  let ranking = $state('up');
  const symbols: string[] = $derived(widget.options.symbols ?? []);
  const expanded = $derived(widget.size === 'wide' || widget.size === 'full');
  const trends = $derived(widget.size !== 'small');
  const days = $derived(widget.options.trend_days ?? 20);
  const price = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2));
  const volume = (v: number | null | undefined) =>
    v == null ? '—' : (v / 10000).toFixed(2) + ' 万手';
  const watch = $derived(widget.kind === 'watchlist');
  const displayed = $derived(
    watch
      ? symbols
          .map((code: string) => rows.find((r: MarketRow) => r.ts_code === code))
          .filter((r: MarketRow | undefined): r is MarketRow => !!r)
      : [...rows]
          .sort((a, b) =>
            ranking === 'amount'
              ? (b.amount ?? 0) - (a.amount ?? 0)
              : ranking === 'down'
                ? a.pct_chg - b.pct_chg
                : b.pct_chg - a.pct_chg,
          )
          .slice(0, 20),
  );
</script>

<div class="stock-board">
  {#if !watch}<div class="stock-ranking">
      <label
        >排行<select aria-label="排行指标" bind:value={ranking}
          ><option value="up">涨幅优先</option><option value="down">跌幅优先</option><option
            value="amount">成交额优先</option
          ></select
        ></label
      ><span>前 20 家 · 收盘快照</span>
    </div>{/if}
  {#if displayed.length}<div class="stock-table-scroll">
      <table class="data-table">
        <thead
          ><tr
            ><th>公司</th><th>收盘价</th><th>涨跌幅</th>{#if expanded}<th>开盘</th><th>最高</th><th
                >最低</th
              ><th>成交量</th>{/if}{#if widget.size !== 'small'}<th>成交额</th><th>{days} 日走势</th
              >{/if}</tr
          ></thead
        ><tbody
          >{#each displayed as row}{@const history = Array.isArray(row.history)
              ? row.history
                  .filter(
                    (p: { close: number; trade_date: string }) =>
                      Number.isFinite(p.close) && p.trade_date <= row.trade_date,
                  )
                  .slice(-days)
              : []}<tr
              ><td><strong>{row.name}</strong><small>{row.ts_code} · {row.industry}</small></td><td
                >{row.close.toFixed(2)}</td
              ><td class:positive={row.pct_chg > 0} class:negative={row.pct_chg < 0}
                ><span class="stock-direction"
                  >{#if row.pct_chg > 0}<ArrowUpRight
                      size={16}
                    />{:else if row.pct_chg < 0}<ArrowDownRight size={16} />{:else}<Minus
                      size={16}
                    />{/if}{signed(row.pct_chg)}</span
                ></td
              >{#if expanded}<td>{price(row.open)}</td><td>{price(row.high)}</td><td
                  >{price(row.low)}</td
                ><td>{volume(row.vol)}</td>{/if}{#if trends}<td
                  >{row.amount == null ? '—' : money(row.amount)}</td
                ><td class="stock-trend-cell"
                  ><QuoteSparkline
                    points={history}
                    change={row.pct_chg}
                    label={`${row.name} ${history.length} 个交易日未复权收盘走势`}
                  /><small
                    >{history.length
                      ? `${history.length}/${days} 日 · 未复权`
                      : '保存看板后同步数据'}</small
                  ></td
                >{/if}</tr
            >{/each}</tbody
        >
      </table>
    </div>
  {:else}<div class="stock-empty">
      暂无可展示的自选股。<small>在组件标题旁的设置中添加和管理自选股。</small>
    </div>{/if}
  {#if watch && symbols.some((code: string) => !rows.some((r: MarketRow) => r.ts_code === code))}<p
      class="widget-note"
    >
      部分自选股在此数据集中没有行情，已保留代码：{symbols
        .filter((code: string) => !rows.some((r: MarketRow) => r.ts_code === code))
        .join('、')}
    </p>{/if}
</div>
