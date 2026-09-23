<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Search,
    RefreshCw,
    Settings2,
    Network,
    List,
    X,
    ArrowRight,
    ArrowUpRight,
    Info,
    PanelRightClose,
    PanelRightOpen,
  } from '@lucide/svelte';
  import { api, errorMessage } from '../lib/api';
  import NetworkAtlas from '../lib/network/NetworkAtlas.svelte';
  import LoadingSurface from '../lib/LoadingSurface.svelte';
  import type { Chain, Topology } from '../lib/network/topology';
  let { navigate, onsave } = $props<{ navigate: (page: string) => void; onsave: () => void }>();
  let data = $state<Chain | null>(null),
    topology = $state<Topology | null>(null),
    revision = $state(0),
    loading = $state(true),
    computing = $state(false),
    error = $state(''),
    query = $state(''),
    selected = $state(''),
    metric = $state<'degree' | 'bridge'>('degree'),
    view = $state('atlas'),
    showInferred = $state(true),
    panel = $state(true),
    page = $state(0),
    relationFilter = $state('all'),
    edgeFocus = $state(true);
  let worker: Worker | undefined,
    request = 0,
    signature = '';
  let pendingRecord: { data: Chain; revision: number } | null = null;
  let pendingSignature = '';
  const company = $derived(data?.nodes.find((n) => n.id === selected));
  const nodeMap = $derived(new Map(data?.nodes.map((n) => [n.id, n]) ?? []));
  const positionMap = $derived(new Map(topology?.positions.map((p) => [p.id, p]) ?? []));
  const selectedMetric = $derived(positionMap.get(selected));
  const ranking = $derived(
    [...(topology?.positions ?? [])].sort(
      (a, b) =>
        (metric === 'degree' ? b.degree - a.degree : b.bridge - a.bridge) || b.degree - a.degree,
    ),
  );
  const searchResults = $derived(
    (data?.nodes ?? []).filter((n) =>
      [n.n, n.c, ...(data?.tags[n.id] ?? [])].some((value) =>
        value.toLowerCase().includes(query.toLowerCase()),
      ),
    ),
  );
  const links = $derived(data?.edges.filter((e) => e.s === selected || e.t === selected) ?? []);
  const neighborIds = $derived(new Set(links.map((e) => (e.s === selected ? e.t : e.s))));
  const relationships = $derived(
    (data?.edges ?? []).filter(
      (e) =>
        (relationFilter === 'all' || e.w === relationFilter) &&
        (!selected || !edgeFocus || e.s === selected || e.t === selected) &&
        (!query ||
          nodeMap.get(e.s)?.n.includes(query) ||
          nodeMap.get(e.t)?.n.includes(query) ||
          nodeMap.get(e.s)?.c.includes(query) ||
          nodeMap.get(e.t)?.c.includes(query)),
    ),
  );
  function compute(record: { data: Chain; revision: number }) {
    if (!worker) return;
    const next = record.data;
    const key = JSON.stringify([
      next.nodes.map((n) => n.id).sort(),
      next.edges.map((e) => [e.s, e.t]).sort(),
    ]);
    if (key === signature && topology) {
      data = next;
      revision = record.revision;
      request++;
      computing = false;
      pendingRecord = null;
      return;
    }
    pendingRecord = record;
    pendingSignature = key;
    computing = true;
    worker.postMessage({
      ids: next.nodes.map((n) => n.id),
      edges: next.edges.map(({ s, t }) => ({ s, t })),
      request: ++request,
    });
  }
  async function load() {
    loading = true;
    error = '';
    try {
      const record = await api<{ data: Chain; revision: number }>('/datasets/industry-chain');
      if (selected && !record.data.nodes.some((n) => n.id === selected)) selected = '';
      compute(record);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }
  function choose(id: string) {
    selected = id;
    query = '';
    page = 0;
    panel = true;
  }
  function saveView() {
    try {
      localStorage.setItem(
        'insightra-supply-map',
        JSON.stringify({ selected, metric, view, showInferred }),
      );
    } catch {}
  }
  function restore() {
    try {
      const old = JSON.parse(localStorage.getItem('insightra-supply-map') || '{}');
      selected = typeof old.selected === 'string' ? old.selected : '';
      if (old.metric === 'degree' || old.metric === 'bridge') metric = old.metric;
      if (old.view === 'atlas' || old.view === 'edges') view = old.view;
      if (typeof old.showInferred === 'boolean') showInferred = old.showInferred;
    } catch {}
  }
  onMount(() => {
    worker = new Worker(new URL('../lib/network/layout.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e) => {
      if (e.data.request !== request) return;
      computing = false;
      if (e.data.error) {
        error = e.data.error;
        signature = '';
      } else {
        data = pendingRecord!.data;
        revision = pendingRecord!.revision;
        topology = e.data.result;
        signature = pendingSignature;
        pendingRecord = null;
      }
    };
    worker.onerror = () => {
      computing = false;
      signature = '';
      error = '网络布局计算失败，请刷新重试。';
    };
    restore();
    void load();
    window.addEventListener('insightra:save-industry', saveView);
    window.addEventListener('insightra:restore-industry', restore);
    return () => {
      worker?.terminate();
      window.removeEventListener('insightra:save-industry', saveView);
      window.removeEventListener('insightra:restore-industry', restore);
    };
  });
</script>

<section class="supply-map">
  {#if error}<div class="message error" role="alert">
      {error}<button class="text-button" onclick={load}>重试</button>
    </div>{/if}
  <div class="supply-context">
    <div>
      <span class="eyebrow">SUPPLY SYSTEM / COMPANY ATLAS</span>
      <h2>全行业供应网络</h2>
      <p>每一个点都是公司。沿关系识别枢纽与桥接位置，选中时保留行业全貌。</p>
    </div>
    <div class="supply-totals">
      <span><b>{data?.nodes.length ?? '—'}</b>公司</span><span
        ><b>{data?.edges.length ?? '—'}</b>关系记录</span
      ><span><b>{topology?.communities.length ?? '—'}</b>关系社群</span>
    </div>
  </div>
  <div class="supply-toolbar">
    <div class="view-tabs">
      <button class:tab-active={view === 'atlas'} onclick={() => (view = 'atlas')}
        ><Network size={15} />全行业地图</button
      ><button
        class:tab-active={view === 'edges'}
        onclick={() => {
          view = 'edges';
          page = 0;
        }}><List size={15} />关系明细</button
      >
    </div>
    <label class="search-field"
      ><Search size={14} /><input
        aria-label="搜索产业公司"
        placeholder="定位公司、代码或标签"
        bind:value={query}
        oninput={() => (page = 0)}
      />{#if query}<button
          class="clear-search"
          aria-label="清空产业搜索"
          onclick={() => (query = '')}><X size={13} /></button
        >{/if}</label
    ><label class="metric-select"
      >节点大小<select aria-label="结构重要性指标" bind:value={metric}
        ><option value="degree">连接广度</option><option value="bridge">桥接中心性</option></select
      ></label
    ><button class="icon-button" aria-label="切换结构详情" onclick={() => (panel = !panel)}
      >{#if panel}<PanelRightClose size={17} />{:else}<PanelRightOpen size={17} />{/if}</button
    >
  </div>
  {#if query}<div class="supply-search-results">
      <span>{searchResults.length} 家匹配公司</span>{#each searchResults.slice(0, 12) as n}<button
          onclick={() => choose(n.id)}>{n.n}<small>{n.c}</small></button
        >{:else}<span>没有匹配的公司</span>{/each}
    </div>{/if}
  <div class="supply-workbench" class:inspector-hidden={!panel}>
    <div class="supply-main">
      {#if (loading || computing) && !topology}<LoadingSurface
          height={712}
          variant="map"
          label={loading ? '读取产业资料' : '正在组织全行业公司网络'}
        />{:else if data && topology}{#if view === 'atlas'}<NetworkAtlas
            {data}
            {topology}
            {selected}
            {query}
            {metric}
            {showInferred}
            onselect={choose}
          />
          {#if loading || computing}<div class="supply-refresh-overlay">
              正在更新，保留当前网络…
            </div>{/if}
          <div class="supply-map-legend">
            <div>
              <i class="legend-node"></i>公司 · 大小表示{metric === 'degree'
                ? '关联公司的数量'
                : '桥接中心性'}<i class="legend-region"></i>关系社群
            </div>
            <label><input type="checkbox" bind:checked={showInferred} />显示推断关系</label><span
              >实线：含公开披露　虚线：仅推断</span
            >
          </div>
        {:else}<div class="supply-edge-controls">
            <span>{relationships.length} 条记录</span><select
              aria-label="关系证据筛选"
              bind:value={relationFilter}
              onchange={() => (page = 0)}
              ><option value="all">全部证据</option><option value="d">公开披露</option><option
                value="i">产品匹配推断</option
              ></select
            >{#if selected}<label
                ><input
                  type="checkbox"
                  bind:checked={edgeFocus}
                  onchange={() => (page = 0)}
                />仅选中公司的关系</label
              >{/if}
          </div>
          <div class="supply-edge-table">
            <table class="data-table">
              <thead><tr><th>供应方</th><th>接收方</th><th>产品 / 服务</th><th>证据</th></tr></thead
              ><tbody
                >{#each relationships.slice(page * 40, page * 40 + 40) as edge}<tr
                    ><td
                      ><button class="text-button" onclick={() => choose(edge.s)}
                        >{nodeMap.get(edge.s)?.n}</button
                      ></td
                    ><td
                      ><button class="text-button" onclick={() => choose(edge.t)}
                        >{nodeMap.get(edge.t)?.n}</button
                      ></td
                    ><td class="wrap-cell">{edge.p}</td><td
                      >{edge.w === 'd' ? '公开披露' : '产品匹配推断'}</td
                    ></tr
                  >{:else}<tr><td colspan="4">没有符合条件的关系记录。</td></tr>{/each}</tbody
              >
            </table>
          </div>
          <div class="dataset-pagination">
            <span>第 {page + 1} 页</span><button
              class="button"
              disabled={page === 0}
              onclick={() => page--}>上一页</button
            ><button
              class="button"
              disabled={(page + 1) * 40 >= relationships.length}
              onclick={() => page++}>下一页</button
            >
          </div>{/if}{/if}
    </div>
    {#if panel}<aside class="supply-inspector">
        {#if company && selectedMetric}<div class="section-title">
            <span class="eyebrow">SELECTED COMPANY</span><button
              class="icon-button"
              aria-label="取消公司选择"
              onclick={() => choose('')}><X size={14} /></button
            >
          </div>
          <h2>{company.n}</h2>
          <div class="supply-company-code">
            {company.c} · {data?.segments.find((s) => s.id === company.s)?.short}
          </div>
          <div class="supply-metric-pair">
            <div><strong>{selectedMetric.degree}</strong><span>关联公司</span></div>
            <div>
              <strong>{(selectedMetric.bridge * 100).toFixed(1)}<small>%</small></strong><span
                >桥接中心性</span
              >
            </div>
          </div>
          <p>{company.note}</p>
          <div class="supply-direction-counts">
            <span
              >上游 <b>{new Set(links.filter((e) => e.t === selected).map((e) => e.s)).size}</b
              ></span
            ><span
              >下游 <b>{new Set(links.filter((e) => e.s === selected).map((e) => e.t)).size}</b
              ></span
            >
          </div>
          <h3>连接与产品</h3>
          <div class="supply-neighbors">
            {#each [...neighborIds]
              .sort((a, b) => (positionMap.get(b)?.degree ?? 0) - (positionMap.get(a)?.degree ?? 0))
              .slice(0, 10) as id}{@const relation = links.find(
                (e) => e.s === id || e.t === id,
              )!}<button onclick={() => choose(id)}
                ><span>{relation.s === selected ? '→' : '←'} {nodeMap.get(id)?.n}</span><small
                  >{relation.p}</small
                ></button
              >{/each}
          </div>
          <button
            class="text-button"
            onclick={() => {
              view = 'edges';
              page = 0;
              edgeFocus = true;
            }}>查看全部 {links.length} 条关系 <ArrowUpRight size={13} /></button
          >
        {:else}<span class="eyebrow">STRUCTURAL POSITIONS</span>
          <h2>{metric === 'degree' ? '谁连接得更多' : '谁处于桥接位置'}</h2>
          <p>
            {metric === 'degree'
              ? '按不重复的关联公司数量排序，发现连接广泛的节点。'
              : '按最短路径中介中心性排序，发现连接不同公司群体的位置。'}
          </p>
          <div class="supply-ranking">
            {#each ranking.slice(0, 10) as p, i}<button onclick={() => choose(p.id)}
                ><span class="rank-number">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{nodeMap.get(p.id)?.n}</strong><small
                    >{data?.segments.find((s) => s.id === nodeMap.get(p.id)?.s)?.short}</small
                  >
                </div>
                <b>{metric === 'degree' ? p.degree : (p.bridge * 100).toFixed(1) + '%'}</b></button
              >{/each}
          </div>{/if}
        <details class="supply-method">
          <summary>指标口径与局限</summary>
          <p>
            连接广度按不重复公司计数。桥接中心性按无向、无权简单图计算，在各连通网络内归一化；不同产品合并为同一公司连接。两项指标均使用全部资料，不随边的显示开关改变。
          </p>
          <p>这些是资料覆盖范围内的结构指标，不代表真实交易金额、产业控制力或投资价值。</p>
        </details>
      </aside>{/if}
  </div>
  <div class="supply-map-footer">
    <div><span class="layout-lock-dot"></span>布局固定 · 搜索、选择和指标切换不改变公司位置</div>
    <span>行情演化待接入 · 当前颜色表示社群</span><button class="button" onclick={onsave}
      >保存视图</button
    ><button class="text-button" onclick={() => navigate('数据管理')}
      ><Settings2 size={13} />编辑资料 v{revision}</button
    ><button class="icon-button" aria-label="刷新产业数据" onclick={load}
      ><RefreshCw size={14} /></button
    >
  </div>
  {#if data}<details class="industry-sources">
      <summary>资料来源 · {data.sources.length} 项</summary>
      <p>保留原资料的披露 / 推断标记，当前链接为资料集级来源，尚未逐条核验原文。</p>
      <div>
        {#each data.sources as [title, url]}<a href={url} target="_blank" rel="noreferrer"
            >{title}<ArrowUpRight size={12} /></a
          >{/each}
      </div>
    </details>{/if}
</section>
