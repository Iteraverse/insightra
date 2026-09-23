<script lang="ts">
  import { onMount } from 'svelte';
  import { cloudColor, type CloudPalette } from './cloud-theme';
  import { hierarchy, treemap, type HierarchyRectangularNode } from 'd3-hierarchy';
  import type { MarketRow } from './types';
  import { signed, money } from './types';
  let {
    rows,
    area = 'total_mv',
    height = 340,
  } = $props<{ rows: MarketRow[]; area?: 'total_mv' | 'amount'; height?: number }>();
  let width = $state(800),
    themeVersion = $state(0),
    industry = $state(''),
    hover = $state<MarketRow | null>(null),
    pinned = $state(false),
    canvas: HTMLCanvasElement;
  onMount(() => {
    const shell = canvas.closest('.app-shell');
    const observer = new MutationObserver(() => themeVersion++);
    if (shell) observer.observe(shell, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  });
  function palette(): CloudPalette {
    const css = getComputedStyle(canvas);
    return {
      surface: css.getPropertyValue('--surface').trim(),
      neutral: css.getPropertyValue('--cloud-neutral').trim(),
      up: css.getPropertyValue('--cloud-up').trim(),
      down: css.getPropertyValue('--cloud-down').trim(),
      ink: css.getPropertyValue('--ink').trim(),
      muted: css.getPropertyValue('--muted').trim(),
      border: css.getPropertyValue('--border').trim(),
    };
  }
  type Tree = { name: string; children?: Tree[]; stock?: MarketRow; value?: number };
  const records: MarketRow[] = $derived(rows);
  const industries = $derived(
    [...new Set(records.map((r) => r.industry))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  );
  const scoped: MarketRow[] = $derived(records.filter((r) => !industry || r.industry === industry));
  const effectiveArea = $derived(
    area === 'total_mv' && scoped.every((r) => (r.total_mv ?? 0) > 0) ? 'total_mv' : 'amount',
  );
  const usable: MarketRow[] = $derived(scoped.filter((r) => (r[effectiveArea] ?? 0) > 0));
  const tiles = $derived.by(() => {
    const groups = new Map<string, MarketRow[]>();
    for (const row of usable) {
      if (!groups.has(row.industry)) groups.set(row.industry, []);
      groups.get(row.industry)!.push(row);
    }
    const tree: Tree = {
      name: 'A股',
      children: [...groups].map(([name, stocks]) => ({
        name,
        children: stocks.map((stock) => ({
          name: stock.name,
          stock,
          value: stock[effectiveArea] ?? 0,
        })),
      })),
    };
    const root = hierarchy<Tree>(tree)
      .sum((d) => d.value ?? 0)
      .sort(
        (a, b) =>
          (b.value ?? 0) - (a.value ?? 0) || a.data.name.localeCompare(b.data.name, 'zh-CN'),
      );
    return treemap<Tree>()
      .size([Math.max(width, 280), height])
      .paddingOuter(2)
      .paddingInner(2)
      .paddingTop((n) =>
        n.depth === 1 &&
        (n as HierarchyRectangularNode<Tree>).y1 - (n as HierarchyRectangularNode<Tree>).y0 > 42
          ? 20
          : 0,
      )
      .round(true)(root);
  });
  $effect(() => {
    if (!canvas) return;
    themeVersion;
    const colors = palette();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(width, 280) * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, Math.max(width, 280), height);
    ctx.textBaseline = 'middle';
    for (const sector of tiles.children ?? []) {
      ctx.fillStyle = colors.surface;
      ctx.fillRect(sector.x0, sector.y0, sector.x1 - sector.x0, sector.y1 - sector.y0);
      if (sector.x1 - sector.x0 > 42 && sector.y1 - sector.y0 > 42) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(sector.x0, sector.y0, sector.x1 - sector.x0, 20);
        ctx.clip();
        ctx.fillStyle = colors.muted;
        ctx.font = '11px "Microsoft YaHei",sans-serif';
        ctx.fillText(sector.data.name, sector.x0 + 4, sector.y0 + 10);
        ctx.restore();
      }
    }
    for (const leaf of tiles.leaves()) {
      const row = leaf.data.stock;
      if (!row) continue;
      const w = leaf.x1 - leaf.x0,
        h = leaf.y1 - leaf.y0;
      if (w <= 0 || h <= 0) continue;
      const tint = cloudColor(row.pct_chg, colors);
      ctx.fillStyle = tint.fill;
      ctx.fillRect(leaf.x0, leaf.y0, w, h);
      if (w > 46 && h > 22) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(leaf.x0 + 2, leaf.y0 + 2, w - 4, h - 4);
        ctx.clip();
        ctx.fillStyle = tint.text;
        ctx.font = `${w > 90 && h > 50 ? 13 : 10}px "Microsoft YaHei",sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(row.name, (leaf.x0 + leaf.x1) / 2, (leaf.y0 + leaf.y1) / 2 - (h > 38 ? 7 : 0));
        if (h > 38) {
          ctx.font = '10px sans-serif';
          ctx.fillText(signed(row.pct_chg), (leaf.x0 + leaf.x1) / 2, (leaf.y0 + leaf.y1) / 2 + 11);
        }
        ctx.restore();
        ctx.textAlign = 'start';
      }
    }
  });
  function pick(e: PointerEvent) {
    if (pinned) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * Math.max(width, 280)) / rect.width,
      y = ((e.clientY - rect.top) * height) / rect.height;
    hover =
      tiles.leaves().find((n) => x >= n.x0 && x <= n.x1 && y >= n.y0 && y <= n.y1)?.data.stock ??
      null;
  }
</script>

<div class="market-map-widget">
  <div class="cloud-controls">
    <label
      >行业<select
        aria-label="云图行业"
        bind:value={industry}
        onchange={() => {
          hover = null;
          pinned = false;
        }}
        ><option value="">全部细分行业</option>{#each industries as name}<option>{name}</option
          >{/each}</select
      ></label
    ><span>{usable.length} 家 · 面积：{effectiveArea === 'total_mv' ? '总市值' : '成交额'}</span>
  </div>
  <div
    class="cloud-canvas"
    style={`height:${height}px;min-height:${height}px`}
    bind:clientWidth={width}
  >
    <canvas
      bind:this={canvas}
      style={`height:${height}px`}
      aria-label={`A股大盘云图，${usable.length}家公司，面积表示${effectiveArea === 'total_mv' ? '总市值' : '成交额'}，红涨绿跌`}
      onpointermove={pick}
      onpointerdown={(e) => {
        const wasPinned = pinned;
        pinned = false;
        pick(e);
        pinned = !wasPinned;
      }}
      onpointerleave={() => {
        if (!pinned) hover = null;
      }}
    ></canvas>
  </div>
  <div class="cloud-readout" aria-live={pinned ? 'polite' : 'off'}>
    {#if hover}<strong>{hover.name}</strong><span>{hover.ts_code}</span><b
        class:positive={hover.pct_chg > 0}
        class:negative={hover.pct_chg < 0}>{signed(hover.pct_chg)}</b
      ><span>{hover.industry} · {money(hover[effectiveArea] ?? 0)}</span>{:else}<span
        >悬停查看公司，点击固定读数；也可用行业选择框查看细分区域。</span
      >{/if}
  </div>
  <div class="cloud-legend">
    <span>−10%</span><i></i><span>0</span><i></i><span>+10%</span><small>固定色阶 · 红涨绿跌</small>
  </div>
  {#if usable.length !== scoped.length || effectiveArea !== area}<p class="widget-note">
      {effectiveArea !== area ? '市值覆盖不完整，已使用成交额作为面积。' : ''}{scoped.length -
        usable.length} 家无有效面积值，未进入云图。
    </p>{/if}
  <details class="cloud-accessible">
    <summary>查看所选范围的个股数据</summary>
    <div class="widget-table-scroll">
      <table class="data-table">
        <thead><tr><th>公司</th><th>涨跌幅</th><th>行业</th></tr></thead><tbody
          >{#each [...scoped].sort((a, b) => b.pct_chg - a.pct_chg).slice(0, 100) as row}<tr
              ><td>{row.name}</td><td
                class:positive={row.pct_chg > 0}
                class:negative={row.pct_chg < 0}>{signed(row.pct_chg)}</td
              ><td>{row.industry}</td></tr
            >{/each}</tbody
        >
      </table>
    </div>
    <p class="widget-note">表格展示涨幅前 100 家；完整数据可在数据管理导出。</p>
  </details>
</div>
