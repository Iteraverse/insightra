<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    Activity,
    ArrowRight,
    ArrowUpRight,
    BookOpen,
    Check,
    ChevronRight,
    CircleHelp,
    Database,
    Grid2X2,
    House,
    Layers,
    LayoutDashboard,
    List,
    Menu,
    Network,
    PanelRightClose,
    PanelRightOpen,
    Search,
    Settings2,
    SlidersHorizontal,
    Sparkles,
    Waypoints,
    X,
  } from '@lucide/svelte';
  import Settings from './pages/Settings.svelte';
  import Finance from './pages/MarketDashboard.svelte';
  import Knowledge from './pages/Knowledge.svelte';
  import ResearchDesk from './pages/ResearchDesk.svelte';
  import Home from './pages/Home.svelte';
  import Health from './pages/Health.svelte';
  import DataManager from './pages/DataManager.svelte';
  import IndustryNetwork from './pages/SupplyMap.svelte';
  import Overview from './pages/Observatory.svelte';
  type Appearance = 'neutral' | 'paper' | 'night';

  let appearance = $state<Appearance>('neutral');
  let density = $state('comfortable');
  let designOpen = $state(false);
  let navOpen = $state(false);
  let saved = $state(false);
  let notice = $state('');
  let activeNav = $state('数据研究');
  let researchView = $state('projects');
  let dataSection = $state('datasets');
  function navigate(page: string, target?: string) {
    activeNav = page;
    if (page === '数据研究') researchView = target === 'industry' ? 'industry' : 'projects';
    if (page === '数据管理') dataSection = target === 'sources' ? 'sources' : 'datasets';
    navOpen = false;
  }
  let service = $state('检测中');
  let noticeTimer: ReturnType<typeof setTimeout>;
  const navItems = [
    { label: '概览', icon: LayoutDashboard },
    { label: '金融资产', icon: Layers },
    { label: '数据研究', icon: Network },
    { label: '知识空间', icon: BookOpen },
    { label: '健康记录', icon: Activity },
    { label: '家庭环境', icon: House },
  ];
  function notify(message: string) {
    notice = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = ''), 3800);
  }
  function saveView() {
    window.dispatchEvent(new Event('insightra:save-industry'));
    try {
      localStorage.setItem('insightra-view', JSON.stringify({ appearance, density }));
      saved = true;
      notify('当前视图与外观偏好已保存到此浏览器');
    } catch {
      notify('浏览器存储不可用，当前视图未保存');
    }
  }
  function restoreView() {
    try {
      const value = localStorage.getItem('insightra-view');
      if (!value) {
        notify('还没有保存的视图');
        return;
      }
      const data = JSON.parse(value);
      if (['neutral', 'paper', 'night'].includes(data.appearance)) appearance = data.appearance;
      if (['comfortable', 'compact'].includes(data.density)) density = data.density;
      activeNav = '数据研究';
      researchView = 'industry';
      void tick().then(() => window.dispatchEvent(new Event('insightra:restore-industry')));
      notify('已恢复保存的视图');
    } catch {
      notify('无法读取保存的视图');
    }
  }
  onMount(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('insightra-view') || '{}');
      if (['neutral', 'paper', 'night'].includes(stored.appearance)) appearance = stored.appearance;
      if (['comfortable', 'compact'].includes(stored.density)) density = stored.density;
    } catch {
      /* A malformed preference must not prevent the app from loading. */
    }
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => (service = data.status === 'ok' ? '本地服务已连接' : '仅界面预览'))
      .catch(() => (service = '仅界面预览'));
    return () => {
      controller.abort();
      clearTimeout(noticeTimer);
    };
  });
</script>

<svelte:head><title>Insightra · {activeNav}</title></svelte:head>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      designOpen = false;
      navOpen = false;
    }
  }}
/>

<div class="app-shell" data-theme={appearance} data-density={density}>
  <aside class="sidebar" class:nav-open={navOpen} aria-label="主导航">
    <a
      class="brand"
      href="/"
      onclick={(event) => {
        event.preventDefault();
        activeNav = '数据研究';
        navOpen = false;
      }}
      ><span class="brand-mark"><Network size={20} /></span><span
        >insightra<span class="brand-period">.</span></span
      ></a
    >
    <div class="workspace-label">
      <span class="workspace-avatar">J</span>
      <div>个人工作空间<small>Personal workspace</small></div>
      <span class="local-dot" title="本地工作空间"></span>
    </div>
    <p class="nav-section-label">工作空间</p>
    <nav>
      {#each navItems as item}<button
          class:nav-active={activeNav === item.label}
          aria-label={item.label}
          onclick={() => {
            activeNav = item.label;
            navOpen = false;
          }}><item.icon size={17} /><span>{item.label}</span></button
        >{/each}
    </nav>
    <div class="nav-divider"></div>
    <p class="nav-section-label">资料与视图</p>
    <nav>
      <button class:nav-active={activeNav === '数据管理'} onclick={() => navigate('数据管理')}
        ><Database size={17} /><span>数据管理</span></button
      >
      <button class:nav-active={activeNav === '数据连接'} onclick={() => navigate('数据连接')}
        ><Database size={17} /><span>数据连接</span></button
      ><button onclick={restoreView}><BookOpen size={17} /><span>保存的视图</span></button>
    </nav>
    <div class="sidebar-bottom">
      <div class="local-status">
        <span class:online={service === '本地服务已连接'}></span>{service}
      </div>
      <button class="sidebar-setting" onclick={() => (designOpen = !designOpen)}
        ><Settings2 size={16} />外观与布局<span>↗</span></button
      >
      <div class="profile">
        <span class="profile-avatar">JY</span>
        <div>我的数据空间<small>仅自己可见 · 本地预览</small></div>
      </div>
    </div>
  </aside>

  <div class="workspace">
    <header class="topbar">
      <div class="breadcrumb">
        <button
          class="icon-button mobile-menu"
          aria-label="打开导航"
          onclick={() => (navOpen = !navOpen)}><Menu size={18} /></button
        ><span>工作空间</span><ChevronRight size={13} /><strong>{activeNav}</strong>
      </div>
      <div class="topbar-actions">
        <span class="prototype-badge"><span></span>本地工作台</span><button
          class="icon-button"
          aria-label="打开外观设置"
          onclick={() => (designOpen = !designOpen)}><SlidersHorizontal size={17} /></button
        ><button
          class="icon-button"
          aria-label="关于此原型"
          onclick={() => notify('Tushare、本地文档与产业资料已接入；健康和家庭读数仍为示例。')}
          ><CircleHelp size={17} /></button
        ><span class="avatar-small">J</span>
      </div>
    </header>

    {#if activeNav === '数据研究'}
      <ResearchDesk bind:section={researchView} onsave={saveView} {saved}>
        <IndustryNetwork {navigate} onsave={saveView} />
      </ResearchDesk>
    {:else if activeNav === '概览'}<Overview {navigate} />
    {:else if activeNav === '金融资产'}<Finance {navigate} />
    {:else if activeNav === '知识空间'}<Knowledge />
    {:else if activeNav === '健康记录'}<Health />
    {:else if activeNav === '家庭环境'}<Home />
    {:else if activeNav === '数据管理'}<DataManager initialTab={dataSection} />
    {:else if activeNav === '数据连接'}<Settings />
    {/if}
  </div>

  {#if designOpen}<aside class="appearance-panel" aria-label="外观与布局">
      <div class="appearance-heading">
        <div>
          <span class="eyebrow">MAKE IT YOURS</span>
          <h2>外观与布局</h2>
        </div>
        <button class="icon-button" aria-label="关闭外观设置" onclick={() => (designOpen = false)}
          ><X size={19} /></button
        >
      </div>
      <p>同一套工作台，三种阅读氛围。</p>
      <div class="theme-options">
        {#each [{ id: 'neutral', name: '中性浅色', note: '清晰、克制，适合日常研究' }, { id: 'paper', name: '纸感暖白', note: '柔和、舒展，适合阅读与整理' }, { id: 'night', name: '石墨深色', note: '降低背景亮度，适合夜间观察' }] as theme}<button
            aria-pressed={appearance === theme.id}
            class:theme-selected={appearance === theme.id}
            onclick={() => (appearance = theme.id as Appearance)}
            ><span class="theme-swatch" data-swatch={theme.id}><i></i><i></i><i></i></span><span
              ><strong>{theme.name}</strong><small>{theme.note}</small></span
            >{#if appearance === theme.id}<Check size={17} />{/if}</button
          >{/each}
      </div>
      <h3>信息密度</h3>
      <div class="density-options">
        <button class:chosen={density === 'comfortable'} onclick={() => (density = 'comfortable')}
          >舒适</button
        ><button class:chosen={density === 'compact'} onclick={() => (density = 'compact')}
          >紧凑</button
        >
      </div>
      <div class="design-principles">
        <h3>这套界面的约定</h3>
        <p>01 <span>结构优先，颜色服务于信息。</span></p>
        <p>02 <span>主画布稳定，详情按需展开。</span></p>
        <p>03 <span>选择始终可见，操作能够返回。</span></p>
        <p>04 <span>事实、推断与缺失明确区分。</span></p>
      </div>
      <button class="button primary" onclick={saveView}>保存当前偏好<Check size={16} /></button>
    </aside>{/if}
  <div class="toast" class:toast-visible={!!notice} role="status">
    {#if notice}<Check size={16} />{notice}{/if}
  </div>
</div>
