<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import MarketSources from './MarketSources.svelte';
  import LoadingSurface from '../lib/LoadingSurface.svelte';
  import {
    Upload,
    Database,
    FileJson,
    Table2,
    Braces,
    Download,
    Save,
    Plus,
    Trash2,
    RefreshCw,
    Check,
    Undo2,
  } from '@lucide/svelte';
  import { api, errorMessage, formatTime } from '../lib/api';
  import {
    type Json,
    type Dataset,
    type DatasetSummary,
    jsonCopy,
    displayCell,
    setJson,
    removeJson,
  } from '../lib/dataset';
  import JsonTree from '../lib/JsonTree.svelte';
  let { initialTab = 'datasets' } = $props<{ initialTab?: string }>();
  let activeTab = $state(untrack(() => initialTab));
  async function openSourceDataset(id: string) {
    activeTab = 'datasets';
    await list();
    await open(id);
  }
  async function copyDataset() {
    if (!current) return;
    busy = true;
    error = '';
    try {
      const result = await api<Dataset>('/datasets', {
        method: 'POST',
        body: JSON.stringify({
          name: current.name.replace(/\.[^.]+$/, '') + ' · 副本.json',
          format: 'json',
          text: JSON.stringify(current.data),
          schema: current.schema,
          as_of: current.as_of,
        }),
      });
      await list();
      await open(result.id, true);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
  let records = $state<DatasetSummary[]>([]),
    current = $state<Dataset | null>(null),
    draft = $state<Json>(null),
    mode = $state('table'),
    table = $state(''),
    page = $state(0),
    raw = $state(''),
    error = $state(''),
    message = $state(''),
    busy = $state(false),
    pending = $state(''),
    format = $state('json'),
    column = $state(''),
    confirmDelete = $state(false);
  let input: HTMLInputElement;
  let cellErrors = $state<Record<string, string>>({});
  let requestId = 0;
  const dirty = $derived(
    current !== null &&
      !current.read_only &&
      (JSON.stringify(draft) !== JSON.stringify(current.data) ||
        (mode === 'source' && raw !== JSON.stringify(draft, null, 2))),
  );
  const tables = $derived(
    draft !== null && !Array.isArray(draft) && typeof draft === 'object'
      ? Object.keys(draft).filter((k) => Array.isArray((draft as Record<string, Json>)[k]))
      : [],
  );
  const rows = $derived(
    table && draft !== null && typeof draft === 'object' && !Array.isArray(draft)
      ? draft[table]
      : draft,
  );
  const rowArray = $derived(Array.isArray(rows) ? rows : []);
  const isGrid = $derived(
    Array.isArray(rows) &&
      rows.every((r) => r !== null && !Array.isArray(r) && typeof r === 'object'),
  );
  const columns = $derived([
    ...new Set(
      rowArray.length
        ? rowArray.flatMap((r) =>
            r && typeof r === 'object' && !Array.isArray(r) ? Object.keys(r) : [],
          )
        : !table
          ? (current?.columns ?? [])
          : [],
    ),
  ]);
  const totalPages = $derived(Math.max(1, Math.ceil(rowArray.length / 40)));
  const pageRows = $derived(rowArray.slice(page * 40, page * 40 + 40));
  async function list() {
    records = (await api<{ datasets: DatasetSummary[] }>('/datasets')).datasets;
  }
  async function open(id: string, force = false) {
    if (dirty && !force) {
      pending = id;
      return;
    }
    const request = ++requestId;
    busy = true;
    error = '';
    message = '';
    try {
      const result = await api<Dataset>(`/datasets/${id}`);
      if (request !== requestId) return;
      current = result;
      draft = jsonCopy(result.data);
      table =
        result.kind === 'industry'
          ? 'nodes'
          : result.data && typeof result.data === 'object' && !Array.isArray(result.data)
            ? (Object.keys(result.data).find((k) =>
                Array.isArray((result.data as Record<string, Json>)[k]),
              ) ?? '')
            : '';
      mode = 'table';
      page = 0;
      raw = JSON.stringify(draft, null, 2);
      pending = '';
      confirmDelete = false;
      cellErrors = {};
      try {
        const cached = JSON.parse(localStorage.getItem(`insightra-data-draft:${id}`) || 'null');
        if (force) localStorage.removeItem(`insightra-data-draft:${id}`);
        if (!force && cached && typeof cached.raw === 'string') {
          draft = cached.data;
          raw = cached.raw;
          mode = 'source';
          current = { ...result, revision: cached.revision };
          message =
            cached.revision === result.revision
              ? '已恢复上次未保存的草稿。'
              : '草稿对应旧版本；请保留所需内容，再重新读取并合并。';
        }
      } catch {
        message = '未能恢复浏览器草稿，当前显示已保存数据。';
      }
    } catch (e) {
      error = errorMessage(e);
    } finally {
      if (request === requestId) busy = false;
    }
  }
  onMount(() => {
    void list()
      .then(() => {
        if (records.length)
          void open(records.find((r) => r.id === 'industry-chain')?.id ?? records[0].id);
      })
      .catch((e) => (error = errorMessage(e)));
    return () => {
      requestId++;
    };
  });
  onDestroy(() => {
    if (current && dirty) {
      try {
        localStorage.setItem(
          `insightra-data-draft:${current.id}`,
          JSON.stringify({ data: draft, raw, revision: current.revision }),
        );
      } catch {}
    }
  });
  function edit(path: (string | number)[], value: Json) {
    if (current?.read_only) return;
    draft = setJson(draft, path, value);
    raw = JSON.stringify(draft, null, 2);
    error = '';
  }
  function remove(path: (string | number)[]) {
    if (current?.read_only) return;
    draft = removeJson(draft, path);
    raw = JSON.stringify(draft, null, 2);
    page = Math.min(page, Math.max(0, Math.ceil(rowArray.length / 40) - 1));
    cellErrors = {};
  }
  function cell(index: number, key: string, text: string) {
    const row = rowArray[index] as Record<string, Json>;
    const old = row[key];
    let value: Json = text;
    try {
      if (typeof old === 'number') {
        if (!text.trim() || !Number.isFinite(Number(text))) throw new Error('数字格式无效');
        value = Number(text);
      } else if (
        typeof old === 'boolean' ||
        (old !== null && typeof old === 'object') ||
        old === null
      ) {
        value = JSON.parse(text);
        if (old !== null && typeof value !== typeof old)
          throw new Error('请保持原字段类型，或在 JSON 树中修改类型');
      }
      edit([...(table ? [table] : []), index, key], value);
      const next = { ...cellErrors };
      delete next[`${table}:${index}:${key}`];
      cellErrors = next;
    } catch (e) {
      error = `第 ${index + 1} 行 ${key}：${errorMessage(e)}`;
      cellErrors = { ...cellErrors, [`${table}:${index}:${key}`]: error };
    }
  }
  function applySource() {
    try {
      const next = JSON.parse(raw);
      draft = next;
      cellErrors = {};
      raw = JSON.stringify(next, null, 2);
      error = '';
      message = '源码已解析，可切换树或表格检查后保存。';
      return true;
    } catch (e) {
      error = `JSON 解析失败：${errorMessage(e)}`;
      return false;
    }
  }
  function switchMode(next: string) {
    if (mode === 'source' && raw !== JSON.stringify(draft, null, 2) && !applySource()) return;
    mode = next;
    raw = JSON.stringify(draft, null, 2);
  }
  function addRow() {
    if (!isGrid) return;
    const sample = rowArray[0] as Record<string, Json> | undefined;
    const value = Object.fromEntries(
      columns.map((c) => {
        const v = sample?.[c];
        return [
          c,
          Array.isArray(v)
            ? []
            : v !== null && typeof v === 'object'
              ? {}
              : typeof v === 'boolean'
                ? false
                : typeof v === 'number'
                  ? 0
                  : '',
        ];
      }),
    );
    edit(table ? [table] : [], [...rowArray, value]);
    page = Math.max(0, Math.floor((rowArray.length - 1) / 40));
  }
  function addColumn() {
    if (
      !column.trim() ||
      columns.includes(column) ||
      ['__proto__', 'constructor', 'prototype'].includes(column)
    ) {
      error = '列名为空、重复或属于保留名称。';
      return;
    }
    edit(
      table ? [table] : [],
      rowArray.length
        ? rowArray.map((r) => ({ ...(r as object), [column]: '' }))
        : [{ [column]: '' }],
    );
    column = '';
  }
  async function save() {
    if (current?.read_only) return;
    if (!current) return;
    if (mode === 'source' && !applySource()) return;
    busy = true;
    error = '';
    message = '';
    try {
      const result = await api<Dataset>(`/datasets/${current.id}`, {
        method: 'PUT',
        body: JSON.stringify({ revision: current.revision, data: draft }),
      });
      current = result;
      draft = jsonCopy(result.data);
      raw = JSON.stringify(draft, null, 2);
      await list();
      message = `已保存版本 v${result.revision}，产业视图会在重新打开或刷新时读取。`;
      try {
        localStorage.removeItem(`insightra-data-draft:${result.id}`);
      } catch {}
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
  async function importFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (dirty) {
      error = '请先保存或放弃当前修改，再导入文件。';
      input.value = '';
      return;
    }
    const ext = file.name.split('.').at(-1)?.toLowerCase();
    if (!['json', 'csv', 'tsv', 'jsonl'].includes(ext ?? '')) {
      error = '支持 JSON、CSV、TSV 和 JSONL。';
      return;
    }
    if (file.size > 3_000_000) {
      error = '文件超过 3 MB，请拆分后导入。';
      return;
    }
    busy = true;
    error = '';
    try {
      const result = await api<Dataset>('/datasets', {
        method: 'POST',
        body: JSON.stringify({ name: file.name, format: ext, text: await file.text() }),
      });
      await list();
      await open(result.id, true);
      message = '导入成功。CSV/TSV 单元格按文本保留，避免丢失前导零。';
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
      input.value = '';
    }
  }
  async function exportData() {
    if (!current) return;
    if (dirty) {
      error = '请先保存再导出，确保下载内容与当前编辑一致。';
      return;
    }
    try {
      const response = await fetch(
        `/api/datasets/${current.id}/export?format=${format}${format !== 'json' && table ? `&table=${encodeURIComponent(table)}` : ''}`,
      );
      if (!response.ok) {
        const detail = await response.json();
        throw new Error(detail.detail);
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download =
        current.name.replace(/\.[^.]+$/, '') +
        (table && format !== 'json' ? `-${table}` : '') +
        `.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      error = errorMessage(e);
    }
  }
  async function deleteData() {
    if (!current) return;
    busy = true;
    try {
      await api(`/datasets/${current.id}`, { method: 'DELETE' });
      current = null;
      draft = null;
      confirmDelete = false;
      await list();
      if (records.length) await open(records[0].id, true);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window
  onbeforeunload={(e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }}
/>
<main class="data-manager">
  <header class="desk-heading">
    <div>
      <span class="eyebrow">DATA / LIBRARY</span>
      <h1>数据管理</h1>
    </div>
    <span class="desk-description">导入 · 检查 · 编辑 · 发布版本</span><input
      class="visually-hidden"
      type="file"
      bind:this={input}
      accept=".json,.csv,.tsv,.jsonl"
      onchange={importFile}
      aria-label="导入结构化数据"
    /><button class="button primary inline-primary" disabled={busy} onclick={() => input.click()}
      ><Upload size={15} />导入数据</button
    >
  </header>
  <div class="data-layer-tabs">
    <button class:active={activeTab === 'datasets'} onclick={() => (activeTab = 'datasets')}
      >数据集</button
    ><button class:active={activeTab === 'sources'} onclick={() => (activeTab = 'sources')}
      >数据源</button
    >
  </div>
  {#if activeTab === 'sources'}<MarketSources onopen={openSourceDataset} />{:else}<div
      class="dataset-layout"
    >
      <aside class="dataset-sidebar">
        <span class="rail-label">本地数据集 · {records.length}</span
        >{#each records as record}<button
            class:dataset-active={current?.id === record.id}
            disabled={busy}
            onclick={() => open(record.id)}
            ><span class="dataset-file-icon"
              >{#if record.format === 'json'}<FileJson size={18} />{:else}<Table2
                  size={18}
                />{/if}</span
            ><span
              ><strong>{record.name}</strong><small
                >{record.format.toUpperCase()} · {record.records} 项 · v{record.revision}</small
              ></span
            ></button
          >{/each}
        <p class="rail-note">
          结构化数据独立于文档知识库。保存后的产业资料与研究视图共享同一版本。
        </p>
      </aside>
      <section class="dataset-editor">
        {#if error}<div class="message error" role="alert">{error}</div>{/if}{#if message}<div
            class="message success"
            role="status"
          >
            {message}
          </div>{/if}{#if pending}<div class="draft-banner">
            当前有未保存修改。<button class="text-button" onclick={() => open(pending, true)}
              >放弃修改并切换</button
            ><button class="text-button" onclick={() => (pending = '')}>继续编辑</button>
          </div>{/if}
        {#if current}<div class="dataset-title">
            <div>
              <h2>{current.name}</h2>
              <p>{current.source} · v{current.revision} · {formatTime(current.updated_at)}</p>
            </div>
            <span class="status-pill">{dirty ? '未保存修改' : '已保存'}</span>
          </div>
          <div class="dataset-toolbar">
            <div class="view-tabs">
              {#each [{ id: 'table', name: '表格', icon: Table2 }, { id: 'tree', name: 'JSON 树', icon: FileJson }, { id: 'source', name: '源码', icon: Braces }] as tab}<button
                  class:tab-active={mode === tab.id}
                  onclick={() => switchMode(tab.id)}><tab.icon size={14} />{tab.name}</button
                >{/each}
            </div>
            <div class="dataset-actions">
              <button
                class="button"
                disabled={busy}
                onclick={() => {
                  if (dirty) pending = current!.id;
                  else open(current!.id, true);
                }}><RefreshCw size={14} />重新读取</button
              ><button
                class="button primary inline-primary"
                disabled={busy || !dirty || Object.keys(cellErrors).length > 0 || current.read_only}
                onclick={save}><Save size={14} />{busy ? '处理中…' : '保存数据'}</button
              >
            </div>
          </div>
          <div class="data-editing-area" inert={busy}>
            {#if current.read_only}<div class="managed-dataset-note">
                同步快照 · {current.as_of} · 保留来源与口径，刷新请前往数据源。<button
                  class="text-button"
                  onclick={copyDataset}>复制为可编辑数据集</button
                >
              </div>{/if}
            {#if mode === 'table'}<div class="table-editor-controls">
                {#if tables.length}<label
                    >数据表<select
                      aria-label="选择数据表"
                      bind:value={table}
                      onchange={() => (page = 0)}
                      >{#each tables as key}<option value={key}>{key}</option>{/each}</select
                    ></label
                  >{/if}<span>{rowArray.length} 行 · {columns.length} 列</span>{#if isGrid}<button
                    class="text-button"
                    disabled={current.read_only}
                    onclick={addRow}><Plus size={13} />添加行</button
                  >
                  <form
                    onsubmit={(e) => {
                      e.preventDefault();
                      addColumn();
                    }}
                  >
                    <input
                      aria-label="新增列名"
                      disabled={current.read_only}
                      bind:value={column}
                      placeholder="新列名"
                    /><button class="icon-button" aria-label="添加列"><Plus size={14} /></button>
                  </form>{/if}
              </div>
              {#if isGrid}<div class="editable-table-scroll">
                  <table class="editable-data-table">
                    <thead
                      ><tr
                        ><th>#</th>{#each columns as key}<th>{key}</th>{/each}<th></th></tr
                      ></thead
                    ><tbody
                      >{#each pageRows as row, offset}{@const index = page * 40 + offset}<tr
                          ><td>{index + 1}</td>{#each columns as key}{@const value = (
                              row as Record<string, Json>
                            )[key]}<td
                              ><input
                                aria-label={`第${index + 1}行 ${key}`}
                                class:nested-cell={value !== null && typeof value === 'object'}
                                value={displayCell(value)}
                                readonly={current.read_only}
                                onchange={(e) => cell(index, key, e.currentTarget.value)}
                                title={displayCell(value)}
                              /></td
                            >{/each}<td
                            ><button
                              class="icon-button"
                              aria-label={`删除第${index + 1}行`}
                              disabled={current.read_only}
                              onclick={() => remove([...(table ? [table] : []), index])}
                              ><Trash2 size={13} /></button
                            ></td
                          ></tr
                        >{/each}</tbody
                    >
                  </table>
                </div>
                <div class="dataset-pagination">
                  <span>第 {page + 1} / {totalPages} 页 · 每页 40 行</span><button
                    class="button"
                    disabled={page === 0}
                    onclick={() => page--}>上一页</button
                  ><button class="button" disabled={page >= totalPages - 1} onclick={() => page++}
                    >下一页</button
                  >
                </div>{:else}<div class="honest-empty">
                  <FileJson size={30} />
                  <h2>这个结构更适合 JSON 树</h2>
                  <p>表格视图支持对象数组；任意嵌套结构可使用 JSON 树编辑。</p>
                  <button class="button" onclick={() => switchMode('tree')}>打开 JSON 树</button>
                </div>{/if}
            {:else if mode === 'tree'}<div class="json-tree-editor">
                <JsonTree
                  value={draft}
                  onchange={edit}
                  onremove={remove}
                  readonly={current.read_only}
                />
              </div>
            {:else}<textarea
                class="json-source-editor"
                aria-label="JSON 源码"
                readonly={current.read_only}
                bind:value={raw}
                oninput={() => (error = '')}
                spellcheck="false"></textarea><button
                class="button"
                disabled={current.read_only}
                onclick={applySource}>解析并检查 JSON</button
              >{/if}
          </div>
          <footer class="dataset-footer">
            <span
              >{current.kind === 'industry'
                ? '保存时校验公司 ID、关系引用、标签与链条方向。'
                : '本地保存 · 类型与嵌套结构保留'}{format === 'csv' || format === 'tsv'
                ? ' · 嵌套值导出为 JSON 文本'
                : ''}</span
            >
            <div>
              <select aria-label="导出格式" bind:value={format}
                ><option value="json">JSON</option><option value="csv">CSV</option><option
                  value="tsv">TSV</option
                ><option value="jsonl">JSONL</option></select
              ><button class="button" onclick={exportData}><Download size={14} />导出</button
              >{#if current.kind !== 'industry'}<button
                  class="icon-button"
                  aria-label="删除数据集"
                  onclick={() => (confirmDelete = !confirmDelete)}><Trash2 size={15} /></button
                >{/if}
            </div>
          </footer>
          {#if confirmDelete}<div class="draft-banner">
              删除这个本地数据集？<button class="text-button" onclick={deleteData}
                >确认删除数据集</button
              ><button class="text-button" onclick={() => (confirmDelete = false)}>取消</button>
            </div>{/if}
        {:else if busy}<LoadingSurface
            height={660}
            variant="table"
            label="读取数据集与字段"
          />{:else}<div class="honest-empty">
            <Database size={32} />
            <h2>{busy ? '正在加载…' : '选择或导入一个数据集'}</h2>
            <p>支持 JSON、CSV、TSV、JSONL。</p>
          </div>{/if}
      </section>
    </div>{/if}
</main>
