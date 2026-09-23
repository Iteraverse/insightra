<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Search, X, Play, Download, Grid2X2 } from '@lucide/svelte';
  import { api, errorMessage } from '../lib/api';
  import { fuzzyMatch } from '../lib/widgets/cache';
  type Stock = { code: string; name: string; industry: string };
  type Result = {
    symbols: Stock[];
    start: string;
    end: string;
    dates: string[];
    samples: number;
    matrix: (number | null)[][];
    method: string;
    warnings: string[];
    coverage: { code: string; rows: number; dataset_id: string; revision: number }[];
  };
  let stocks = $state<Stock[]>([]),
    chosen = $state<string[]>([]),
    query = $state(''),
    start = $state(''),
    end = $state(''),
    error = $state(''),
    loading = $state(true),
    busy = $state(false),
    result = $state<Result | null>(null),
    cell = $state<[number, number] | null>(null);
  let controller: AbortController | undefined;
  const matches: Stock[] = $derived(
    query.trim()
      ? stocks
          .filter((s) => fuzzyMatch(s.name + ' ' + s.code + ' ' + s.industry, query))
          .slice(0, 16)
      : [],
  );
  const stale = $derived(
    !!result &&
      (result.start !== start.replaceAll('-', '') ||
        result.end !== end.replaceAll('-', '') ||
        result.symbols.map((s) => s.code).join() !== chosen.join()),
  );
  const color = (v: number | null) =>
    v === null
      ? 'var(--soft)'
      : `color-mix(in srgb, ${v >= 0 ? '#bc555d' : '#437baf'} ${Math.round(Math.abs(v) * 76)}%, var(--surface))`;
  async function load() {
    loading = true;
    error = '';
    try {
      const data = await api<{ stocks: Stock[]; as_of?: string }>('/research/correlation/stocks');
      stocks = data.stocks;
      const raw = data.as_of ?? new Date().toISOString().slice(0, 10).replaceAll('-', '');
      end = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      const date = new Date(end + 'T12:00:00');
      date.setDate(date.getDate() - 90);
      start = date.toISOString().slice(0, 10);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void load();
  });
  onDestroy(() => controller?.abort());
  async function run() {
    controller?.abort();
    controller = new AbortController();
    busy = true;
    error = '';
    try {
      result = await api<Result>('/research/correlation', {
        method: 'POST',
        body: JSON.stringify({ symbols: chosen, start, end }),
        signal: controller.signal,
      });
      cell = null;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
  function exportMatrix() {
    if (!result) return;
    const escape = (s: string) => '"' + s.replaceAll('"', '""') + '"';
    const rows = [
      ['日涨跌幅 Pearson', ...result.symbols.map((s) => s.name + ' ' + s.code)],
      ...result.matrix.map((r, i) => [
        result!.symbols[i].name,
        ...r.map((v) => (v === null ? '' : v.toFixed(6))),
      ]),
    ];
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map(escape).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `correlation-${result.start}-${result.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<section class="correlation-view">
  <header class="correlation-heading">
    <div>
      <span class="eyebrow">RETURNS / CORRELATION</span>
      <h2>区间相关度分析</h2>
      <p>比较股票日涨跌幅的联动程度</p>
    </div>
    <span class="correlation-method">Pearson · 日涨跌幅</span>
  </header>
  {#if error}<div class="message error" role="alert">
      {error}{#if !stocks.length}<button class="text-button" onclick={load}>重试</button>{/if}
    </div>{/if}
  <fieldset class="correlation-controls" disabled={busy || loading}>
    <label class="correlation-search"
      ><Search size={16} /><input
        aria-label="搜索分析股票"
        placeholder="搜索股票名称、代码或行业"
        bind:value={query}
      /><span>{chosen.length}/20</span></label
    >
    {#if query.trim()}<div class="correlation-results">
        {#each matches as stock}<button
            disabled={chosen.includes(stock.code) || chosen.length >= 20}
            onclick={() => {
              chosen = [...chosen, stock.code];
              query = '';
            }}
            ><span>{stock.name}<small>{stock.code} · {stock.industry}</small></span><b
              >{chosen.includes(stock.code) ? '已选' : '＋'}</b
            ></button
          >{:else}<p>没有匹配的股票</p>{/each}
      </div>{/if}
    <div class="correlation-selection">
      {#each chosen as code}<button
          aria-label={`移除 ${stocks.find((s) => s.code === code)?.name ?? code}`}
          onclick={() => (chosen = chosen.filter((c) => c !== code))}
          >{stocks.find((s) => s.code === code)?.name ?? code}<X size={12} /></button
        >{:else}<span
          >{loading
            ? '正在读取股票目录…'
            : stocks.length
              ? '选择 2—20 只股票开始分析'
              : '股票目录为空，请先到数据管理同步 A 股快照。'}</span
        >{/each}
    </div>
    <div class="correlation-date-row">
      <label>开始日期<input type="date" aria-label="相关分析开始日期" bind:value={start} /></label
      ><span>—</span><label
        >结束日期<input type="date" aria-label="相关分析结束日期" bind:value={end} /></label
      ><button
        class="button primary inline-primary"
        disabled={chosen.length < 2 || !start || !end || start >= end}
        onclick={run}><Play size={13} />计算相关矩阵</button
      >
    </div>
  </fieldset>
  {#if busy}<p class="correlation-progress" role="status">
      正在读取区间日线并对齐交易日。首次分析会通过数据源采集，保存为可管理的数据集。
    </p>{/if}
  {#if result}<div class="correlation-result" aria-busy={busy}>
      <div class="correlation-result-heading">
        <div>
          <strong>{result.samples} 个共同交易日</strong><span>{result.start} — {result.end}</span>
        </div>
        <button class="text-button" onclick={exportMatrix}><Download size={14} />导出矩阵</button>
      </div>
      {#if stale}<p class="correlation-notice">
          选择已变化，下面仍是上次计算结果。点击计算更新。
        </p>{/if}
      {#each result.warnings as warning}<p class="correlation-notice">{warning}</p>{/each}
      <div class="correlation-matrix-scroll">
        <table class="correlation-matrix">
          <caption class="sr-only">股票日涨跌幅 Pearson 相关系数矩阵</caption><thead
            ><tr
              ><th scope="col">股票</th>{#each result.symbols as stock}<th scope="col"
                  ><strong>{stock.name}</strong><small>{stock.code}</small></th
                >{/each}</tr
            ></thead
          ><tbody
            >{#each result.symbols as stock, i}<tr
                ><th scope="row"><strong>{stock.name}</strong><small>{stock.code}</small></th
                >{#each result.matrix[i] as value, j}<td
                    ><button
                      class:selected={cell?.[0] === i && cell?.[1] === j}
                      style={`background:${color(value)};color:${value !== null && Math.abs(value) > 0.65 ? '#fff' : 'var(--ink)'}`}
                      aria-label={`${stock.name} 与 ${result.symbols[j].name}：${value === null ? '不可计算' : value.toFixed(3)}`}
                      onclick={() => (cell = [i, j])}
                      >{value === null ? '—' : value.toFixed(2)}</button
                    ></td
                  >{/each}</tr
              >{/each}</tbody
          >
        </table>
      </div>
      <div class="correlation-legend">
        <span>−1 反向</span><i></i><span>0</span><i></i><span>+1 同向</span><small
          >— 样本不足或零方差</small
        >
      </div>
      {#if cell}<div class="correlation-detail">
          <strong>{result.symbols[cell[0]].name} × {result.symbols[cell[1]].name}</strong><b
            >{result.matrix[cell[0]][cell[1]]?.toFixed(4) ?? '不可计算'}</b
          ><span
            >{result.samples} 个共同样本 · {result.dates[0] ?? '—'} 至 {result.dates.at(-1) ??
              '—'}</span
          >
        </div>{/if}
      <details class="correlation-sources">
        <summary>数据覆盖与来源</summary>{#each result.coverage as source}<p>
            {source.code} · {source.rows} 条日线 · {source.dataset_id} · v{source.revision}
          </p>{/each}
      </details>
    </div>{:else if !busy}<div class="correlation-empty">
      <Grid2X2 size={36} />
      <h3>观察股票之间的联动关系</h3>
      <p>选择股票和区间后生成矩阵。单击格子查看系数与样本数。</p>
    </div>{/if}
  <p class="correlation-footnote">
    使用 Tushare daily.pct_chg，按所有股票共同交易日对齐，至少 5
    个样本；不补零、不用价格水平计算。相关性不代表因果或未来表现。采集的区间日线可在数据管理中查看和导出。
  </p>
</section>
