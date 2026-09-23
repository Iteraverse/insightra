<script lang="ts">
  import { onMount } from 'svelte';
  import { Upload, FileText, Search, Network, List, Layers, Trash2, X } from '@lucide/svelte';
  import { api, errorMessage, formatTime } from '../lib/api';
  type Doc = { id: string; name: string; characters: number; created_at: string; chunks: number };
  type Detail = {
    id: string;
    name: string;
    content: string;
    chunks: { ordinal: number; content: string }[];
  };
  let documents = $state<Doc[]>([]),
    detail = $state<Detail | null>(null),
    query = $state(''),
    error = $state(''),
    message = $state('');
  let loading = $state(false),
    importing = $state(false),
    deleting = $state(false),
    example = $state(true),
    mode = $state('map'),
    selectedTopic = $state(0),
    confirmDelete = $state(false);
  let fileInput: HTMLInputElement;
  let requestId = 0;
  const topics = [
    { name: '产业与供应链', color: 'var(--chart-blue)', x: 210, y: 135, count: 52 },
    { name: '量化与方法', color: 'var(--chart-purple)', x: 535, y: 130, count: 46 },
    { name: '生活与健康', color: 'var(--chart-green)', x: 255, y: 343, count: 37 },
    { name: '阅读与思考', color: 'var(--chart-warm)', x: 595, y: 340, count: 31 },
  ];
  const visible = $derived(
    documents.filter((d) => d.name.toLowerCase().includes(query.toLowerCase())),
  );
  const totalChunks = $derived(documents.reduce((n, d) => n + d.chunks, 0));
  async function load() {
    loading = true;
    try {
      documents = (await api<{ documents: Doc[] }>('/documents')).documents;
      if (documents.length) example = false;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }
  async function importFiles(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files || []);
    importing = true;
    error = '';
    message = '';
    let count = 0;
    let duplicates = 0;
    try {
      for (const file of files) {
        if (file.size > 1_500_000) throw new Error(`${file.name} 超过 1.5 MB，请拆分后导入。`);
        const content = await file.text();
        const result = await api<{ id: string; duplicate: boolean }>('/documents', {
          method: 'POST',
          body: JSON.stringify({ name: file.name, content }),
        });
        result.duplicate ? duplicates++ : count++;
      }
      message = `已导入 ${count} 份文档${duplicates ? `，跳过 ${duplicates} 份重复内容` : ''}。`;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      await load();
      importing = false;
      fileInput.value = '';
    }
  }
  async function selectDoc(id: string) {
    const request = ++requestId;
    error = '';
    detail = null;
    confirmDelete = false;
    try {
      const result = await api<Detail>(`/documents/${id}`);
      if (request === requestId) detail = result;
    } catch (e) {
      if (request === requestId) error = errorMessage(e);
    }
  }
  async function remove() {
    if (!detail) return;
    deleting = true;
    error = '';
    try {
      await api(`/documents/${detail.id}`, { method: 'DELETE' });
      detail = null;
      confirmDelete = false;
      await load();
      message = '文档及其本地分块已删除。';
    } catch (e) {
      error = errorMessage(e);
    } finally {
      deleting = false;
    }
  }
  onMount(() => {
    void load();
    return () => {
      requestId++;
    };
  });
</script>

<main class="module-page">
  <section class="page-heading">
    <div>
      <div class="eyebrow">PERSONAL KNOWLEDGE ATLAS</div>
      <h1>让知识，彼此连接<span class="heading-dot">。</span></h1>
      <p>从一份文档到一个想法，建立自己的知识坐标。</p>
    </div>
    <input
      class="visually-hidden"
      type="file"
      accept=".md,.txt"
      multiple
      bind:this={fileInput}
      onchange={importFiles}
      aria-label="选择文档"
    /><button
      class="button primary inline-primary"
      disabled={importing}
      onclick={() => fileInput.click()}
      ><Upload size={15} />{importing ? '正在导入…' : '导入文档'}</button
    >
  </section>
  {#if error}<div class="message error" role="alert">{error}</div>{/if}{#if message}<div
      class="message success"
      role="status"
    >
      {message}
    </div>{/if}
  <div class="knowledge-stats">
    <div>
      <FileText size={19} /><span>本地文档<strong>{documents.length}<small>份</small></strong></span
      >
    </div>
    <div>
      <Layers size={19} /><span>文本分块<strong>{totalChunks}<small>块</small></strong></span>
    </div>
    <div><Network size={19} /><span>向量索引<strong class="text-stat">未配置</strong></span></div>
    <div class="knowledge-stat-note">
      支持 UTF-8 Markdown / TXT<br />正文与分块保存在本机 SQLite
    </div>
  </div>
  <section class="surface-box knowledge-surface">
    <div class="knowledge-toolbar">
      <div class="view-tabs">
        <button class:tab-active={mode === 'map'} onclick={() => (mode = 'map')}
          ><Network size={15} />知识地图</button
        ><button class:tab-active={mode === 'list'} onclick={() => (mode = 'list')}
          ><List size={15} />文档列表</button
        >
      </div>
      <div class="toolbar-right">
        <label class="search-field"
          ><Search size={15} /><input
            aria-label="搜索文档"
            placeholder="搜索文件名"
            bind:value={query}
          /></label
        ><button
          class="button"
          aria-pressed={example}
          onclick={() => {
            example = !example;
            detail = null;
          }}>{example ? '查看本地文档' : '查看示例地图'}</button
        >
      </div>
    </div>
    <div class="knowledge-body">
      <div class="knowledge-main">
        {#if example && mode === 'map'}<div class="chart-caption">
            <span>示例语义地图</span><span class="demo-pill">合成坐标 · 非真实 embedding</span>
          </div>
          <div class="atlas-scroll">
            <svg
              viewBox="0 0 800 490"
              class="knowledge-atlas"
              role="img"
              aria-label="四个主题的示例知识地图，点击主题选择"
              ><defs
                ><pattern id="knowledge-dots" width="22" height="22" patternUnits="userSpaceOnUse"
                  ><circle cx="1" cy="1" r=".6" fill="var(--graph-dot)" /></pattern
                ></defs
              ><rect
                width="800"
                height="490"
                fill="url(#knowledge-dots)"
              />{#each topics as topic, gi}<g
                  style={`--topic-color:${topic.color}`}
                  class:selected-topic={selectedTopic === gi}
                  ><ellipse
                    cx={topic.x}
                    cy={topic.y}
                    rx="143"
                    ry="89"
                    class="atlas-halo"
                  />{#each Array.from({ length: topic.count }) as _, i}{@const angle =
                      i * 2.399}{@const radius = 13 + Math.sqrt(i / topic.count) * 95}<circle
                      cx={topic.x + Math.cos(angle) * radius * 1.3}
                      cy={topic.y + Math.sin(angle) * radius * 0.69}
                      r={i % 7 === 0 ? 4 : 2.5}
                      fill={topic.color}
                      opacity={0.35 + (i % 5) * 0.12}
                    />{/each}<g
                    role="button"
                    tabindex="0"
                    aria-label={`查看${topic.name}示例`}
                    onclick={() => (selectedTopic = gi)}
                    onkeydown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectedTopic = gi;
                      }
                    }}
                    ><rect
                      x={topic.x - 80}
                      y={topic.y + 93}
                      width="160"
                      height="35"
                      rx="5"
                      fill="var(--surface)"
                    /><text x={topic.x} y={topic.y + 116} text-anchor="middle" class="atlas-label"
                      >{topic.name} ↗</text
                    ></g
                  ></g
                >{/each}</svg
            >
          </div>
        {:else if loading}<div class="large-loading">读取本地文档…</div>
        {:else if !visible.length}<div class="honest-empty">
            <FileText size={32} />
            <h2>{query ? '没有匹配的文档' : '你的知识库，从第一份文档开始'}</h2>
            <p>导入 Markdown 或 TXT，自动生成可查看的文本分块。向量化稍后接入。</p>
            <button class="button" disabled={importing} onclick={() => fileInput.click()}
              >选择本地文档</button
            >
          </div>
        {:else if mode === 'map'}<div class="chart-caption">
            <span>文档分块分布</span><span class="fixture-label">按文档与块序排列 · 非语义投影</span
            >
          </div>
          <div class="chunk-map">
            {#each visible as doc, i}<button
                class:chunk-active={detail?.id === doc.id}
                onclick={() => selectDoc(doc.id)}
                ><span>{doc.name}</span>
                <div>
                  {#each Array.from({ length: Math.min(doc.chunks, 60) }) as _, j}<i
                      style={`--chunk-color:${topics[i % 4].color};opacity:${0.3 + (j % 5) * 0.12}`}
                    ></i>{/each}
                </div>
                <small>{doc.chunks} 块{doc.chunks > 60 ? ' · 预览前60块' : ''}</small></button
              >{/each}
          </div>
        {:else}<div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>文档</th><th>字符数</th><th>分块</th><th>导入时间</th></tr></thead
              ><tbody
                >{#each visible as doc}<tr
                    ><td
                      ><button
                        class="document-link"
                        onclick={() => {
                          example = false;
                          selectDoc(doc.id);
                        }}><FileText size={15} />{doc.name}</button
                      ></td
                    ><td>{doc.characters.toLocaleString()}</td><td>{doc.chunks}</td><td
                      >{formatTime(doc.created_at)}</td
                    ></tr
                  >{/each}</tbody
              >
            </table>
          </div>{/if}
      </div>
      <aside class="knowledge-details">
        {#if example && mode === 'map'}<span class="eyebrow">TOPIC PREVIEW</span><span
            class="topic-symbol"
            style={`color:${topics[selectedTopic].color}`}><Network size={30} /></span
          >
          <h2>{topics[selectedTopic].name}</h2>
          <p>一个主题可以跨越多份文档。未来在这里查看相似片段、原文出处与主题之间的联系。</p>
          <div class="detail-stat">
            <div><strong>{topics[selectedTopic].count}</strong><span>示例片段</span></div>
            <div><strong>—</strong><span>真实索引</span></div>
          </div>
          <div class="detail-note">
            <p>示例地图用于确认阅读方式。当前未运行 embedding 模型、降维或语义聚类。</p>
          </div>
        {:else if detail}<div class="section-title">
            <span class="eyebrow">DOCUMENT DETAILS</span><button
              class="icon-button"
              aria-label="关闭文档详情"
              onclick={() => (detail = null)}><X size={16} /></button
            >
          </div>
          <h2>{detail.name}</h2>
          <p>{detail.chunks.length} 个分块 · 每块最多 700 字符，相邻块重叠 100 字符</p>
          <div class="document-chunks">
            {#each detail.chunks as chunk}<details open={chunk.ordinal === 0}>
                <summary>片段 {String(chunk.ordinal + 1).padStart(2, '0')}</summary>
                <pre>{chunk.content}</pre>
              </details>{/each}
          </div>
          {#if confirmDelete}<div class="delete-confirm">
              <p>删除这份文档及全部本地分块？</p>
              <button class="button" disabled={deleting} onclick={remove}>确认删除</button><button
                class="text-button"
                onclick={() => (confirmDelete = false)}>取消</button
              >
            </div>{:else}<button
              class="text-button delete-button"
              onclick={() => (confirmDelete = true)}><Trash2 size={14} />删除文档</button
            >{/if}
        {:else}<span class="eyebrow">YOUR KNOWLEDGE</span>
          <h2>从原文出发</h2>
          <p>选择文档查看分块。每个片段都保留所属文档，便于回到上下文。</p>
          <div class="detail-note">
            <p>全文与文件名检索由本地接口提供；此处搜索框按文件名筛选。向量检索尚未配置。</p>
          </div>{/if}
      </aside>
    </div>
  </section>
</main>
