<script lang="ts">
  import { untrack } from 'svelte';
  import { ZoomIn, ZoomOut, Scan, LocateFixed, X } from '@lucide/svelte';
  import { hull, type Chain, type Topology, type Position, type Company } from './topology';
  let {
    data,
    topology,
    selected,
    query = '',
    metric = 'degree',
    showInferred = true,
    onselect,
  } = $props<{
    data: Chain;
    topology: Topology;
    selected: string;
    query?: string;
    metric?: 'degree' | 'bridge';
    showInferred?: boolean;
    onselect: (id: string) => void;
  }>();
  let width = $state(900),
    height = $state(660),
    scale = $state(1),
    tx = $state(0),
    ty = $state(0),
    hover = $state(''),
    initialized = $state(false);
  let svg: SVGSVGElement;
  let pan: { x: number; y: number; tx: number; ty: number; id: number; moved: boolean } | null =
    null;
  const companyNodes: Company[] = $derived(data.nodes);
  const positionedNodes: Position[] = $derived(topology.positions);
  const communities: Topology['communities'] = $derived(topology.communities);
  const components: Topology['components'] = $derived(topology.components);
  const companies = $derived(new Map<string, Company>(companyNodes.map((n) => [n.id, n])));
  const positions = $derived(new Map<string, Position>(positionedNodes.map((p) => [p.id, p])));
  const focus = $derived(hover || selected);
  const relatives = $derived.by(() => {
    const set = new Set<string>();
    if (focus) {
      set.add(focus);
      for (const e of data.edges) {
        if (e.s === focus) set.add(e.t);
        if (e.t === focus) set.add(e.s);
      }
    }
    return set;
  });
  const matches = $derived(
    new Set(
      companyNodes
        .filter(
          (n) =>
            !query ||
            [n.n, n.c, ...(data.tags[n.id] ?? [])].some((t) =>
              t.toLowerCase().includes(query.toLowerCase()),
            ),
        )
        .map((n) => n.id),
    ),
  );
  const palette = [
    'var(--chart-blue)',
    'var(--chart-green)',
    'var(--chart-purple)',
    'var(--chart-warm)',
    'var(--chart-red)',
    'var(--accent)',
  ];
  const color = (p: Position) => palette[p.community % palette.length];
  const radius = (p: Position) =>
    metric === 'degree' ? 3.5 + Math.sqrt(p.degree) * 1.3 : 4 + Math.sqrt(p.bridge) * 24;
  const directed = $derived.by(() => {
    const map = new Map<string, { s: string; t: string; products: string[]; disclosed: boolean }>();
    for (const edge of data.edges) {
      if (!showInferred && edge.w !== 'd') continue;
      const key = edge.s + ':' + edge.t;
      const entry = map.get(key) || {
        s: edge.s,
        t: edge.t,
        products: [] as string[],
        disclosed: false,
      };
      entry.products.push(edge.p);
      entry.disclosed ||= edge.w === 'd';
      map.set(key, entry);
    }
    return [...map.values()];
  });
  const envelopes = $derived(
    communities.map((c) => ({
      ...c,
      points: hull(c.members.map((id) => positions.get(id)!).filter(Boolean)),
    })),
  );
  const bounds = $derived.by(() => {
    const p = positionedNodes;
    return {
      minX: Math.min(...p.map((n) => n.x)) - 80,
      minY: Math.min(...p.map((n) => n.y)) - 90,
      maxX: Math.max(...p.map((n) => n.x)) + 100,
      maxY: Math.max(...p.map((n) => n.y)) + 80,
    };
  });
  const componentTitles = $derived(
    components.map((c) => {
      const nodes = c.members.map((id) => companies.get(id)!);
      return {
        id: c.id,
        x: Math.min(...c.members.map((id) => positions.get(id)!.x)) - 30,
        y: Math.min(...c.members.map((id) => positions.get(id)!.y)) - 65,
        title: nodes.some((n) => n.s === 'cell')
          ? '新能源 · 电池与汽车'
          : nodes.some((n) => n.s === 'pharma')
            ? '医药 · 研发与制造'
            : `供应网络 ${c.id + 1}`,
        count: nodes.length,
      };
    }),
  );
  const active = (id: string) => (focus ? relatives.has(id) : !query || matches.has(id));
  const labels = $derived.by(() => {
    const candidates = [...positionedNodes]
      .filter((p) => {
        const x = p.x * scale + tx,
          y = p.y * scale + ty;
        return x > 5 && x < width - 5 && y > 20 && y < height - 20;
      })
      .sort(
        (a, b) =>
          Number(b.id === focus) - Number(a.id === focus) ||
          Number(relatives.has(b.id)) - Number(relatives.has(a.id)) ||
          (metric === 'degree' ? b.degree - a.degree : b.bridge - a.bridge) ||
          a.id.localeCompare(b.id),
      );
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const result: { id: string; x: number; y: number; anchor: 'start' | 'end'; text: string }[] =
      [];
    for (const p of candidates) {
      if (scale < 0.85 && result.length >= 34 && p.id !== focus && !relatives.has(p.id)) continue;
      if (!active(p.id)) continue;
      const text = companies.get(p.id)!.n,
        font = 12,
        w = [...text].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? font : font * 0.58), 0),
        x = p.x * scale + tx,
        y = p.y * scale + ty,
        r = radius(p) * scale + 5;
      const options = [
        { x: x + r, y: y - 7, w, h: 15, anchor: 'start' as const },
        { x: x - r - w, y: y - 7, w, h: 15, anchor: 'end' as const },
        { x: x - w / 2, y: y - r - 17, w, h: 15, anchor: 'start' as const },
        { x: x - w / 2, y: y + r + 2, w, h: 15, anchor: 'start' as const },
      ];
      const box = options.find(
        (b) =>
          b.x >= 3 &&
          b.x + b.w < width - 3 &&
          b.y > 32 &&
          b.y + b.h < height - 8 &&
          !boxes.some(
            (o) =>
              b.x < o.x + o.w + 6 &&
              b.x + b.w + 6 > o.x &&
              b.y < o.y + o.h + 4 &&
              b.y + b.h + 4 > o.y,
          ),
      );
      if (box) {
        boxes.push(box);
        result.push({
          id: p.id,
          x: (box.x + (box.anchor === 'end' ? w : 0) - tx) / scale,
          y: (box.y + 12 - ty) / scale,
          anchor: box.anchor,
          text,
        });
      }
    }
    return result;
  });
  function fit() {
    const k = Math.min(
      (width - 55) / (bounds.maxX - bounds.minX),
      (height - 90) / (bounds.maxY - bounds.minY),
    );
    scale = Math.max(0.1, k);
    tx = (width - (bounds.maxX + bounds.minX) * scale) / 2;
    ty = (height - (bounds.maxY + bounds.minY) * scale) / 2 + 14;
  }
  $effect(() => {
    width;
    topology;
    untrack(fit);
  });
  function zoom(factor: number, x = width / 2, y = height / 2) {
    const next = Math.max(0.12, Math.min(3.5, scale * factor));
    tx = x - ((x - tx) * next) / scale;
    ty = y - ((y - ty) * next) / scale;
    scale = next;
  }
  function locate() {
    const p = positions.get(selected);
    if (!p) return;
    scale = Math.max(scale, 1.15);
    tx = width / 2 - p.x * scale;
    ty = height / 2 - p.y * scale;
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
  }
  function wheelZoom(node: SVGSVGElement) {
    node.addEventListener('wheel', wheel, { passive: false });
    return {
      destroy() {
        node.removeEventListener('wheel', wheel);
      },
    };
  }
  function start(e: PointerEvent) {
    if (e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    pan = { x: e.clientX, y: e.clientY, tx, ty, id: e.pointerId, moved: false };
  }
  function move(e: PointerEvent) {
    if (!pan) return;
    const dx = e.clientX - pan.x,
      dy = e.clientY - pan.y;
    if (Math.hypot(dx, dy) > 3) pan.moved = true;
    tx = pan.tx + dx;
    ty = pan.ty + dy;
  }
  function end(e: PointerEvent) {
    if (!pan) return;
    const wasMoved = pan.moved;
    pan = null;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    if (!wasMoved) onselect('');
  }
  function path(edge: (typeof directed)[number]) {
    const a = positions.get(edge.s)!,
      b = positions.get(edge.t)!;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      l = Math.hypot(dx, dy) || 1;
    const ar = radius(a) + 2,
      br = radius(b) + 3;
    const sx = a.x + (dx / l) * ar,
      sy = a.y + (dy / l) * ar,
      ex = b.x - (dx / l) * br,
      ey = b.y - (dy / l) * br;
    return `M${sx},${sy} Q${(sx + ex) / 2 - dy * 0.035},${(sy + ey) / 2 + dx * 0.035} ${ex},${ey}`;
  }
</script>

<div class="atlas-stage" bind:clientWidth={width}>
  <svg
    bind:this={svg}
    width="100%"
    {height}
    viewBox={`0 0 ${width} ${height}`}
    role="img"
    aria-label="全行业公司供应网络，包含全部公司与供应关系"
    use:wheelZoom
    onpointerdown={start}
    onpointermove={move}
    onpointerup={end}
    onpointercancel={() => (pan = null)}
  >
    <defs
      ><marker
        id="atlas-arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto"><path d="M0 0L10 5L0 10Z" fill="var(--accent)" /></marker
      ></defs
    >
    <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
      {#each envelopes as group}<polygon
          class="atlas-community"
          points={group.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={palette[group.id % palette.length]}
          stroke={palette[group.id % palette.length]}
          stroke-width={0.7 / scale}
        />{/each}
      {#each componentTitles as c}<text
          x={c.x}
          y={c.y}
          font-size={13 / scale}
          class="atlas-component-title"
          >{c.title}<tspan font-size={10 / scale}>　{c.count} 公司</tspan></text
        >{/each}
      <g class="atlas-edges"
        >{#each directed as edge}{@const highlighted =
            !!focus && (edge.s === focus || edge.t === focus)}<path
            data-source={edge.s}
            data-target={edge.t}
            d={path(edge)}
            fill="none"
            stroke={highlighted ? 'var(--accent)' : 'var(--muted)'}
            stroke-width={(highlighted ? 1.5 : 0.75) / scale}
            opacity={focus ? (highlighted ? 0.85 : 0.065) : edge.disclosed ? 0.46 : 0.28}
            stroke-dasharray={edge.disclosed ? undefined : `${3 / scale} ${3 / scale}`}
            marker-end={highlighted ? 'url(#atlas-arrow)' : undefined}
            ><title
              >{companies.get(edge.s)?.n} → {companies.get(edge.t)?.n}：{edge.products.join(
                '、',
              )}</title
            ></path
          >{/each}</g
      >
      {#each topology.positions as p}<g
          class="atlas-company"
          data-company={p.id}
          data-x={p.x}
          data-y={p.y}
          role="button"
          tabindex="0"
          aria-label={`选择公司 ${companies.get(p.id)?.n}`}
          aria-pressed={selected === p.id}
          opacity={active(p.id) ? 1 : 0.18}
          onpointerdown={(e) => e.stopPropagation()}
          onclick={() => onselect(p.id)}
          onpointerenter={() => (hover = p.id)}
          onpointerleave={() => (hover = '')}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onselect(p.id);
            }
          }}
        >
          <circle cx={p.x} cy={p.y} r={Math.max(radius(p) + 3, 8 / scale)} fill="transparent" />
          {#if selected === p.id}<circle
              cx={p.x}
              cy={p.y}
              r={radius(p) + 6 / scale}
              fill="none"
              stroke="var(--accent)"
              stroke-width={1.6 / scale}
            />{/if}
          <circle
            class="atlas-node-dot"
            cx={p.x}
            cy={p.y}
            r={radius(p)}
            fill={color(p)}
            stroke="var(--surface)"
            stroke-width={1.1 / scale}
          /><title
            >{companies.get(p.id)?.n} · {p.degree} 家关联公司 · 桥接中心性 {(
              p.bridge * 100
            ).toFixed(1)}%</title
          >
        </g>{/each}
      <g pointer-events="none"
        >{#each labels as l}<text
            x={l.x}
            y={l.y}
            text-anchor={l.anchor}
            font-size={12 / scale}
            class="atlas-company-label"
            class:label-selected={l.id === selected}
            stroke-width={3 / scale}>{l.text}</text
          >{/each}</g
      >
    </g>
  </svg>
  <div class="atlas-navigation">
    <button class="icon-button" aria-label="放大网络" onclick={() => zoom(1.35)}
      ><ZoomIn size={17} /></button
    ><button class="icon-button" aria-label="缩小网络" onclick={() => zoom(1 / 1.35)}
      ><ZoomOut size={17} /></button
    ><button class="icon-button" aria-label="适配全行业" onclick={fit}><Scan size={17} /></button
    ><button class="icon-button" aria-label="定位选中公司" disabled={!selected} onclick={locate}
      ><LocateFixed size={17} /></button
    >
  </div>
  <div class="atlas-guidance">拖动平移 · 滚轮缩放 · 点选公司追踪上下游</div>
  {#if selected}<button class="atlas-clear" onclick={() => onselect('')}
      ><X size={12} />取消选择，查看全貌</button
    >{/if}
</div>
