<script lang="ts">
  import { onMount } from 'svelte';
  import { cloudColor, rgb, type CloudPalette } from './cloud-theme';
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
    pointerX = $state(0),
    pointerY = $state(0),
    viewportWidth = $state(1280),
    viewportHeight = $state(800),
    tipWidth = $state(244),
    tipHeight = $state(210),
    canvas: HTMLCanvasElement;
  const tipId = $props.id();
  const tipLeft = $derived(
    Math.max(
      8,
      Math.min(
        pointerX + 16 + tipWidth > viewportWidth ? pointerX - tipWidth - 16 : pointerX + 16,
        viewportWidth - tipWidth - 8,
      ),
    ),
  );
  const tipTop = $derived(
    Math.max(
      8,
      Math.min(
        pointerY + 16 + tipHeight > viewportHeight ? pointerY - tipHeight - 16 : pointerY + 16,
        viewportHeight - tipHeight - 8,
      ),
    ),
  );
  const price = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2));
  function dismiss() {
    hover = null;
    pinned = false;
  }
  function showTip(node: HTMLElement) {
    node.showPopover();
    return {
      destroy() {
        if (node.matches(':popover-open')) node.hidePopover();
      },
    };
  }
  onMount(() => {
    const shell = canvas.closest('.app-shell');
    const observer = new MutationObserver(() => themeVersion++);
    if (shell) observer.observe(shell, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('blur', dismiss);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('blur', dismiss);
    };
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
  type Tree = {
    name: string;
    children?: Tree[];
    stock?: MarketRow;
    value?: number;
    change?: number;
  };
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
        change: stocks.reduce((sum, r) => sum + r.pct_chg, 0) / stocks.length,
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
      .paddingOuter(0)
      .paddingInner(0)
      .paddingTop((n) =>
        n.depth === 1 &&
        (n as HierarchyRectangularNode<Tree>).y1 - (n as HierarchyRectangularNode<Tree>).y0 > 60 &&
        (n as HierarchyRectangularNode<Tree>).x1 - (n as HierarchyRectangularNode<Tree>).x0 > 52
          ? 24
          : 0,
      )
      .round(false)(root);
  });
  const activeLeaf = $derived(
    hover ? tiles.leaves().find((n) => n.data.stock?.ts_code === hover?.ts_code) : undefined,
  );
  // Reconcile a pinned company against refreshed data without keeping stale values.
  $effect(() => {
    if (hover) {
      const current = scoped.find((r) => r.ts_code === hover?.ts_code);
      if (!current) dismiss();
      else if (current !== hover) hover = current;
    }
  });
  $effect(() => {
    if (!canvas) return;
    themeVersion;
    const colors = palette();
    const dark = rgb(colors.neutral).reduce((sum, v) => sum + v, 0) < 300;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(width, 280) * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, Math.max(width, 280), height);
    ctx.textBaseline = 'middle';
    for (const sector of tiles.children ?? []) {
      const sectorTint = cloudColor(sector.data.change ?? 0, colors);
      ctx.fillStyle = sectorTint.fill;
      ctx.fillRect(sector.x0, sector.y0, sector.x1 - sector.x0, sector.y1 - sector.y0);
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
      if (w >= 10 && h >= 12) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(leaf.x0 + 1, leaf.y0 + 1, w - 2, h - 2);
        ctx.clip();
        ctx.fillStyle = tint.text;
        ctx.textAlign = 'center';
        const available = w - 4;
        let fontSize = Math.max(8.5, Math.min(22, Math.sqrt(w * h) / 7, (h - 4) / 2));
        const setFont = () => {
          ctx.font = `500 ${fontSize}px "Microsoft YaHei",sans-serif`;
        };
        setFont();
        while (fontSize > 8.5 && ctx.measureText(row.name).width > available) {
          fontSize = Math.max(8.5, fontSize - 0.5);
          setFont();
        }
        let lines = [row.name],
          complete = true;
        if (ctx.measureText(row.name).width > available) {
          const chars = [...row.name];
          const split = Math.ceil(chars.length / 2);
          const wrapped = [chars.slice(0, split).join(''), chars.slice(split).join('')];
          if (
            h >= 2 * (fontSize + 1) + 4 &&
            wrapped.every((line) => ctx.measureText(line).width <= available)
          )
            lines = wrapped;
          else {
            lines = [chars[0]];
            complete = false;
          }
        }
        const percentFont = Math.max(8, Math.min(13, fontSize * 0.8));
        const showChange =
          complete &&
          h >= lines.length * (fontSize + 1) + percentFont + 7 &&
          available >= signed(row.pct_chg).length * percentFont * 0.57;
        const total = lines.length * (fontSize + 1) + (showChange ? percentFont + 3 : 0);
        const top = (leaf.y0 + leaf.y1 - total) / 2;
        setFont();
        lines.forEach((line, i) =>
          ctx.fillText(line, (leaf.x0 + leaf.x1) / 2, top + fontSize / 2 + i * (fontSize + 1)),
        );
        if (showChange) {
          ctx.font = `${percentFont}px sans-serif`;
          ctx.fillText(
            signed(row.pct_chg),
            (leaf.x0 + leaf.x1) / 2,
            top + lines.length * (fontSize + 1) + 3 + percentFont / 2,
          );
        }
        ctx.restore();
        ctx.textAlign = 'start';
      }
    }
    // Sector chrome is painted last, in a dedicated reserved strip.
    for (const sector of tiles.children ?? []) {
      const w = sector.x1 - sector.x0,
        h = sector.y1 - sector.y0;
      if (w > 52 && h > 60) {
        const tint = cloudColor(sector.data.change ?? 0, colors);
        ctx.fillStyle = tint.fill;
        ctx.fillRect(sector.x0, sector.y0, w, 24);
        ctx.fillStyle = dark ? 'rgba(12,17,23,.23)' : 'rgba(255,255,255,.18)';
        ctx.fillRect(sector.x0, sector.y0, w, 24);
        ctx.save();
        ctx.beginPath();
        ctx.rect(sector.x0 + 4, sector.y0, w - 8, 24);
        ctx.clip();
        ctx.font = '600 10px "Microsoft YaHei",sans-serif';
        ctx.fillStyle = dark ? '#ffffff' : '#24343b';
        ctx.textAlign = 'left';
        ctx.fillText(sector.data.name, sector.x0 + 5, sector.y0 + 12);
        if (w > 135) {
          ctx.textAlign = 'right';
          ctx.font = '9px sans-serif';
          ctx.fillText(signed(sector.data.change ?? 0), sector.x1 - 5, sector.y0 + 12);
        }
        ctx.restore();
        ctx.textAlign = 'start';
        ctx.strokeStyle = dark ? '#6685a7' : '#a0b9d2';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sector.x0 + 0.75, sector.y0 + 24);
        ctx.lineTo(sector.x1 - 0.75, sector.y0 + 24);
        ctx.stroke();
      }
      // One enclosing frame, painted after the header so its edges stay continuous.
      ctx.strokeStyle = dark ? '#6685a7' : '#a0b9d2';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        sector.x0 + 0.75,
        sector.y0 + 0.75,
        Math.max(0, w - 1.5),
        Math.max(0, h - 1.5),
      );
    }
  });
  function pick(e: PointerEvent) {
    if (pinned) return;
    pointerX = e.clientX;
    pointerY = e.clientY;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * Math.max(width, 280)) / rect.width,
      y = ((e.clientY - rect.top) * height) / rect.height;
    hover =
      tiles.leaves().find((n) => x >= n.x0 && x < n.x1 && y >= n.y0 && y < n.y1)?.data.stock ??
      null;
  }
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
  onkeydown={(e) => {
    if (e.key === 'Escape') dismiss();
  }}
  onresize={dismiss}
/>
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
      aria-describedby={hover ? tipId : undefined}
      class:cloud-has-hover={!!hover}
      onpointermove={pick}
      onpointerdown={(e) => {
        const wasPinned = pinned;
        pinned = false;
        pick(e);
        pinned = !!hover && !wasPinned;
      }}
      onpointerleave={() => {
        if (!pinned) hover = null;
      }}
    ></canvas>
    {#if activeLeaf}{#key activeLeaf.data.stock?.ts_code}<div
          class="cloud-hover-outline"
          aria-hidden="true"
          style={`left:${(activeLeaf.x0 / Math.max(width, 280)) * 100}%;top:${activeLeaf.y0}px;width:${((activeLeaf.x1 - activeLeaf.x0) / Math.max(width, 280)) * 100}%;height:${activeLeaf.y1 - activeLeaf.y0}px`}
        ></div>{/key}{/if}
  </div>
  {#if hover}<div
      id={tipId}
      class="cloud-stock-tooltip"
      role="tooltip"
      popover="manual"
      use:showTip
      bind:clientWidth={tipWidth}
      bind:clientHeight={tipHeight}
      style={`left:${tipLeft}px;top:${tipTop}px`}
    >
      <header>
        <div><strong>{hover.name}</strong><span>{hover.ts_code} · {hover.industry}</span></div>
        <b class:positive={hover.pct_chg > 0} class:negative={hover.pct_chg < 0}
          >{signed(hover.pct_chg)}</b
        >
      </header>
      <dl>
        <div>
          <dt>收盘</dt>
          <dd>{price(hover.close)}</dd>
        </div>
        <div>
          <dt>开盘</dt>
          <dd>{price(hover.open)}</dd>
        </div>
        <div>
          <dt>最高</dt>
          <dd>{price(hover.high)}</dd>
        </div>
        <div>
          <dt>最低</dt>
          <dd>{price(hover.low)}</dd>
        </div>
        <div>
          <dt>成交额</dt>
          <dd>{hover.amount == null ? '—' : money(hover.amount) + ' 元'}</dd>
        </div>
        <div>
          <dt>总市值</dt>
          <dd>{hover.total_mv == null ? '—' : money(hover.total_mv) + ' 元'}</dd>
        </div>
      </dl>
      <footer>
        <span>{hover.trade_date} · 收盘数据</span><span
          >{pinned ? '已固定 · 再点取消' : '点击固定 · Esc 关闭'}</span
        >
      </footer>
    </div>{/if}
  <div class="cloud-readout" aria-live={pinned ? 'polite' : 'off'}>
    {#if hover}<strong>{hover.name}</strong><span>{hover.ts_code}</span><b
        class:positive={hover.pct_chg > 0}
        class:negative={hover.pct_chg < 0}>{signed(hover.pct_chg)}</b
      ><span>{hover.industry} · {money(hover[effectiveArea] ?? 0)}</span>{:else}<span
        >悬停查看公司，点击固定读数；也可用行业选择框查看细分区域。</span
      >{/if}
  </div>
  <div class="cloud-legend">
    <span>≤−4%</span><i></i><span>0</span><i></i><span>≥+4%</span><small
      >红涨绿跌 · 行业标题为等权涨跌</small
    >
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
