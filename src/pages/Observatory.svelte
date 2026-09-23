<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowUpRight, ArrowRight, Network, FileText, Plus, Activity } from '@lucide/svelte';
  import { api, type MarketResult } from '../lib/api';
  import TimeSeries from '../lib/TimeSeries.svelte';
  import FloorPlan from '../lib/LiftedFloorPlan.svelte';
  import { initialLayout, type HomeLayout } from '../lib/home-layout';
  let { navigate } = $props<{ navigate: (page: string, target?: string) => void }>();
  let market = $state<MarketResult | null>(null),
    loading = $state(true),
    docs = $state<{ id: string; name: string }[] | null>(null),
    projects = $state<{ id: string; name: string }[] | null>(null),
    layout = $state<HomeLayout>(initialLayout),
    layoutSaved = $state(false),
    connected = $state(false);
  const last = $derived(market?.rows.at(-1));
  onMount(() => {
    void api<MarketResult>('/market/daily?ts_code=000001.SZ&days=90')
      .then((r) => (market = r))
      .catch(() => {})
      .finally(() => (loading = false));
    void api<{ documents: { id: string; name: string }[] }>('/documents')
      .then((r) => (docs = r.documents))
      .catch(() => {});
    void api<{ projects: { id: string; name: string }[] }>('/research/projects')
      .then((r) => (projects = r.projects))
      .catch(() => {});
    void api<{ layout: HomeLayout | null }>('/home/layout')
      .then((r) => {
        if (r.layout) {
          layout = r.layout;
          layoutSaved = true;
        }
      })
      .catch(() => {});
    void api<{ checks: { status: string }[] }>('/connections')
      .then((r) => (connected = r.checks[0]?.status === 'connected'))
      .catch(() => {});
  });
</script>

<main class="observatory">
  <header class="observatory-heading">
    <div>
      <span class="eyebrow">THE PERSONAL OBSERVATORY</span>
      <h1>向外观察世界，<br /><span>向内理解自己。</span></h1>
    </div>
    <div class="observatory-intro">
      <span class="observatory-date"
        >{new Intl.DateTimeFormat('zh-CN', {
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        }).format(new Date())}</span
      >
      <p>市场的起伏，知识的连接，<br />还有日常生活里的细微变化。</p>
      <button class="text-button" onclick={() => navigate('数据连接')}
        ><i class="connection-indicator" class:connected></i>{connected
          ? '最近接口检验通过'
          : '查看数据连接'}<ArrowUpRight size={13} /></button
      >
    </div>
  </header>
  <div class="observatory-composition">
    <section class="market-feature">
      <div class="editorial-section-head">
        <span><i>01</i> 市场观察</span><button
          class="icon-button"
          aria-label="打开金融资产"
          onclick={() => navigate('金融资产')}><ArrowUpRight size={19} /></button
        >
      </div>
      <div class="market-feature-title">
        <div>
          <h2>平安银行 <span>000001.SZ</span></h2>
          <p>Tushare · 未复权日线</p>
        </div>
        {#if last}<div class="editorial-quote">
            <strong>{last.close.toFixed(2)}</strong><span
              class:positive={last.pct_chg >= 0}
              class:negative={last.pct_chg < 0}
              >{last.pct_chg > 0 ? '+' : ''}{last.pct_chg.toFixed(2)}%</span
            >
          </div>{/if}
      </div>
      {#if loading}<div class="editorial-market-empty">
          正在读取市场记录…
        </div>{:else if market?.ok && market.rows.length}<TimeSeries
          values={market.rows.map((r) => r.close)}
          labels={market.rows.map((r) => `${r.trade_date.slice(4, 6)}/${r.trade_date.slice(6)}`)}
          title="收盘价"
          unit="CNY"
        />{:else}<div class="editorial-market-empty">
          <p>{market?.message || '行情暂不可用'}</p>
          <button class="text-button" onclick={() => navigate('金融资产')}>打开行情页查看 →</button>
        </div>{/if}
      <div class="market-feature-foot">
        <span
          >{market?.ok
            ? `${market.rows.length} 个交易日 · ${last?.trade_date} 收盘`
            : '等待可用行情'}</span
        ><button class="text-button" onclick={() => navigate('金融资产')}
          >进入市场 <ArrowRight size={14} /></button
        >
      </div>
    </section>
    <aside class="research-feature">
      <div class="editorial-section-head"><span><i>02</i> 继续研究</span><Network size={18} /></div>
      <div class="research-feature-main">
        <span class="feature-kicker">FOLLOW THE QUESTION</span>
        <h2>让线索成为<br />可以验证的问题。</h2>
        <p>围绕一个研究问题，积累数据、笔记和实验记录。</p>
      </div>
      {#if projects?.length}{#each projects.slice(0, 2) as p}<button
            class="editorial-project"
            onclick={() => navigate('数据研究')}
            ><span>{p.name}</span><ArrowUpRight size={15} /></button
          >{/each}{:else}<button class="editorial-project" onclick={() => navigate('数据研究')}
          ><span>开始第一项研究</span><Plus size={17} /></button
        >{/if}<button
        class="feature-secondary-link"
        onclick={() => navigate('数据研究', 'industry')}
        >浏览产业关系视图 <ArrowUpRight size={14} /></button
      >
    </aside>
    <section class="knowledge-feature">
      <div class="editorial-section-head">
        <span><i>03</i> 知识的积累</span><button
          class="icon-button"
          aria-label="打开知识空间"
          onclick={() => navigate('知识空间')}><ArrowUpRight size={18} /></button
        >
      </div>
      <div class="knowledge-editorial-body">
        <div class="paper-stack" aria-hidden="true">
          <div class="paper-sheet sheet-back"></div>
          <div class="paper-sheet sheet-mid"></div>
          <div class="paper-sheet sheet-front">
            <FileText size={23} /><span>FIELD NOTES</span><i></i><i></i><i></i><small
              >想法，从这里生长。</small
            >
          </div>
        </div>
        <div class="knowledge-editorial-copy">
          <strong>{docs?.length ?? '—'}<span>份本地文档</span></strong>
          <h2>碎片之间，<br />总有新的连接。</h2>
          {#if docs?.length}<p class="recent-document">最近：{docs[0].name}</p>{:else}<p>
              把阅读、笔记和资料留在身边。<br />从原文出发，建立自己的知识地图。
            </p>{/if}<button class="text-button" onclick={() => navigate('知识空间')}
            >整理知识 <ArrowRight size={14} /></button
          >
        </div>
      </div>
    </section>
    <section class="living-feature">
      <div class="editorial-section-head">
        <span><i>04</i> 生活的空间</span><button
          class="icon-button"
          aria-label="打开家庭环境"
          onclick={() => navigate('家庭环境')}><ArrowUpRight size={18} /></button
        >
      </div>
      <div class="living-editorial-body">
        <div class="mini-home-link"><FloorPlan {layout} /></div>
        <div class="living-editorial-copy">
          <span class="feature-kicker">A PLACE TO RETURN TO</span>
          <h2>把家，放进你的数据空间。</h2>
          <p>{layout.rooms.length} 个房间 · {layoutSaved ? '已保存布局' : '示例布局'}</p>
          <button class="text-button" onclick={() => navigate('家庭环境')}
            >布置空间 <ArrowRight size={14} /></button
          >
        </div>
      </div>
      <button class="health-ribbon" onclick={() => navigate('健康记录')}
        ><Activity size={18} /><span>也别忘了，关心自己的变化。</span><small
          >健康记录 · 待接入</small
        ><ArrowUpRight size={16} /></button
      >
    </section>
  </div>
  <footer class="observatory-footer">
    <span>INSIGHTRA / A VIEW OF YOUR WORLD</span><span>行情来自真实接口 · 生活读数尚未接入</span>
  </footer>
</main>
