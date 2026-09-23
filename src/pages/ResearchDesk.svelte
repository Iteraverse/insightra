<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import {
    Folder,
    Database,
    FlaskConical,
    Network,
    Plus,
    Search,
    ArrowUpRight,
    X,
    Check,
    FileText,
  } from '@lucide/svelte';
  import { api, errorMessage, formatTime } from '../lib/api';
  let {
    children,
    section = $bindable('projects'),
    onsave,
    saved = false,
  } = $props<{
    children: Snippet;
    section?: string;
    onsave: () => void;
    saved?: boolean;
  }>();
  type Project = {
    id: string;
    name: string;
    hypothesis: string;
    status: string;
    updated_at: string;
  };
  type Dataset = {
    key: string;
    symbol: string;
    rows: number;
    source: string;
    adjustment: string;
    fetched_at: string;
  };
  let projects = $state<Project[]>([]),
    datasets = $state<Dataset[]>([]),
    query = $state(''),
    selected = $state<Project | null>(null),
    name = $state(''),
    hypothesis = $state(''),
    creating = $state(false),
    busy = $state(false),
    error = $state(''),
    message = $state('');
  const filtered = $derived(projects.filter((p) => p.name.includes(query)));
  async function load() {
    try {
      const [p, d] = await Promise.all([
        api<{ projects: Project[] }>('/research/projects'),
        api<{ datasets: Dataset[] }>('/research/catalog'),
      ]);
      projects = p.projects;
      datasets = d.datasets;
    } catch (e) {
      error = errorMessage(e);
    }
  }
  onMount(() => {
    void load();
  });
  function choose(p: Project) {
    selected = p;
    name = p.name;
    hypothesis = p.hypothesis;
    creating = false;
    message = '';
  }
  function create() {
    section = 'projects';
    creating = true;
    selected = null;
    name = '';
    hypothesis = '';
    error = '';
  }
  async function save() {
    if (!name.trim()) return;
    busy = true;
    error = '';
    try {
      const project = await api<Project>(
        selected ? `/research/projects/${selected.id}` : '/research/projects',
        { method: selected ? 'PUT' : 'POST', body: JSON.stringify({ name, hypothesis }) },
      );
      await load();
      choose(project);
      message = '研究草稿已保存。';
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<main class="research-desk">
  <header class="desk-heading">
    <div>
      <span class="eyebrow">RESEARCH / WORKSPACE</span>
      <h1>研究工作台</h1>
    </div>
    <span class="desk-description">问题 · 数据 · 实验 · 证据</span><button
      class="button primary inline-primary"
      onclick={create}><Plus size={15} />新建研究</button
    >
  </header>
  <div class="desk-layout" class:desk-canvas-mode={section === 'industry'}>
    <aside class="research-rail">
      <span class="rail-label">研究资源</span
      >{#each [{ id: 'projects', name: '研究项目', icon: Folder, count: projects.length }, { id: 'datasets', name: '数据集', icon: Database, count: datasets.length }, { id: 'experiments', name: '实验记录', icon: FlaskConical, count: 0 }] as tab}<button
          class:rail-active={section === tab.id}
          aria-label={tab.name}
          title={tab.name}
          onclick={() => {
            section = tab.id;
            creating = false;
            selected = null;
          }}><tab.icon size={15} /><span>{tab.name}</span><small>{tab.count}</small></button
        >{/each}<span class="rail-label rail-spaced">工作视图</span><button
        class:rail-active={section === 'industry'}
        aria-label="产业网络"
        title="产业网络"
        onclick={() => (section = 'industry')}
        ><Network size={15} /><span>产业网络</span><ArrowUpRight size={13} /></button
      >
      <div class="rail-note">
        <span>研究从一个问题开始</span>
        <p>数据、假设与运行结果，围绕项目归档。</p>
      </div>
    </aside>
    <div class="desk-content">
      {#if error}<div class="message error" role="alert">
          {error}<button class="text-button" onclick={load}>重试</button>
        </div>{/if}{#if message}<div class="message success" role="status">{message}</div>{/if}
      {#if section === 'industry'}<div class="desk-view-heading">
          <h2>产业网络</h2>
          <span class="fixture-label">本地资料</span>
          <button class="button desk-save-view" onclick={onsave}
            ><Check size={14} />{saved ? '已保存视图' : '保存视图'}</button
          >
        </div>
        {@render children()}
      {:else if section === 'projects'}<div class="desk-section-heading">
          <div>
            <h2>研究项目 <span>{projects.length}</span></h2>
            <p>保存研究目标，明确数据边界，再进入分析。</p>
          </div>
          <label class="search-field"
            ><Search size={14} /><input
              aria-label="搜索研究项目"
              placeholder="搜索项目"
              bind:value={query}
            /></label
          >
        </div>
        <div class="project-workspace" class:project-open={creating || selected !== null}>
          <section class="project-list">
            <div class="project-table-head">
              <span>项目名称</span><span>状态</span><span>最近更新</span>
            </div>
            {#each filtered as p}<button
                class="project-row"
                class:project-selected={selected?.id === p.id}
                onclick={() => choose(p)}
                ><span><Folder size={16} /><strong>{p.name}</strong></span><span
                  class="project-state">草稿</span
                ><time>{formatTime(p.updated_at)}</time></button
              >{:else}<div class="research-empty">
                <span class="empty-index">01 / RESEARCH QUESTION</span>
                <h3>{query ? '没有匹配的项目' : '把一个值得研究的问题，留下来。'}</h3>
                <p>先记录假设与验证范围。创建后，可以持续补充研究笔记。</p>
                {#if !query}<button class="text-button" onclick={create}
                    >创建第一项研究 <Plus size={14} /></button
                  >{/if}
              </div>{/each}
            <div class="research-reference">
              <span class="rail-label">已有观察视图</span><button
                onclick={() => (section = 'industry')}
                ><span class="reference-icon"><Network size={22} /></span>
                <div>
                  <strong>产业关系观察</strong>
                  <p>群组、流向、矩阵与公司明细</p>
                </div>
                <span class="fixture-label">资料集</span><ArrowUpRight size={16} /></button
              >
            </div>
          </section>
          {#if creating || selected}<aside class="project-inspector">
              <div class="section-title">
                <h3>{creating ? '新建研究' : '项目说明'}</h3>
                <button
                  class="icon-button"
                  aria-label="关闭项目说明"
                  onclick={() => {
                    selected = null;
                    creating = false;
                  }}><X size={16} /></button
                >
              </div>
              <form
                onsubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <label class="editor-field"
                  >研究名称<input
                    aria-label="研究名称"
                    bind:value={name}
                    maxlength="100"
                    required
                    placeholder="例如：行业动量在不同市场状态下是否稳定？"
                  /></label
                ><label class="editor-field"
                  >假设与验证范围<textarea
                    aria-label="假设与验证范围"
                    bind:value={hypothesis}
                    maxlength="10000"
                    rows="9"
                    placeholder="研究假设、样本区间、变量口径，以及什么结果会推翻假设…"
                  ></textarea></label
                ><button class="button primary inline-primary" disabled={busy || !name.trim()}
                  ><Check size={14} />{busy ? '保存中…' : '保存研究'}</button
                >
              </form>
              <div class="project-attributes">
                <div><span>数据快照</span><b>尚未绑定</b></div>
                <div><span>实验运行</span><b>0 次</b></div>
                <div><span>结果产物</span><b>暂无</b></div>
              </div>
              <p class="page-note">
                当前支持项目草稿与笔记；计算执行器尚未接入，不会产生虚构绩效。
              </p>
            </aside>{/if}
        </div>
      {:else if section === 'datasets'}<div class="desk-section-heading">
          <div>
            <h2>数据集 <span>{datasets.length}</span></h2>
            <p>当前已获取的行情缓存，可在金融资产页面刷新。</p>
          </div>
          <span class="status-pill">本地缓存目录</span>
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead
              ><tr
                ><th>标的 / 区间</th><th>来源</th><th>记录数</th><th>口径</th><th>获取时间</th></tr
              ></thead
            ><tbody
              >{#each datasets as d}<tr
                  ><td class="mono-text">{d.key}</td><td>{d.source}</td><td>{d.rows}</td><td
                    >{d.adjustment}</td
                  ><td>{formatTime(d.fetched_at)}</td></tr
                >{:else}<tr
                  ><td colspan="5" class="table-empty">尚无数据集，请先在金融资产页面获取行情。</td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </div>
        <p class="desk-footnote">
          行情缓存尚不是不可变研究快照；正式实验应固定数据版本与可用时间。
        </p>
      {:else}<div class="desk-section-heading">
          <div>
            <h2>实验记录</h2>
            <p>因子检验、策略回测和样本外验证的运行记录。</p>
          </div>
          <span class="status-pill">执行器未连接</span>
        </div>
        <div class="experiment-schema">
          <span>运行 ID</span><span>关联研究</span><span>数据版本</span><span>参数 / 代码版本</span
          ><span>结果</span>
        </div>
        <div class="research-empty">
          <FlaskConical size={29} />
          <h3>还没有实验运行</h3>
          <p>执行能力接入后，每次分析将记录输入、参数、日志和结果，方便比较与复现。</p>
        </div>
        <div class="experiment-contract">
          <section>
            <h3>明确输入</h3>
            <p>数据快照、样本区间、复权和可用时点。</p>
          </section>
          <section>
            <h3>保留过程</h3>
            <p>代码版本、参数、成本假设和运行日志。</p>
          </section>
          <section>
            <h3>核验输出</h3>
            <p>样本外表现、回撤、暴露与归因。</p>
          </section>
        </div>{/if}
    </div>
  </div>
</main>
