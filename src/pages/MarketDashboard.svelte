<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { cached, remember, fuzzyMatch } from '../lib/widgets/cache';
  import { WidgetRefreshCoordinator } from '../lib/widgets/refresh';
  import { widgetHeight, datasetProblem, type RefreshState } from '../lib/widgets/types';
  import {
    Plus,
    Settings2,
    Save,
    RefreshCw,
    GripVertical,
    ArrowUp,
    ArrowDown,
    Trash2,
    Copy,
    X,
    Check,
    Undo2,
    LayoutGrid,
    Database,
  } from '@lucide/svelte';
  import { api, errorMessage } from '../lib/api';
  import { focusTrap } from '../lib/focusTrap';
  import LoadingSurface from '../lib/LoadingSurface.svelte';
  import WidgetFrame from '../lib/widgets/WidgetFrame.svelte';
  import {
    cloneGroup,
    type Board,
    type WidgetGroup,
    type WidgetInstance,
    type WidgetDefinition,
    type BoundDataset,
    type GroupTemplate,
  } from '../lib/widgets/types';
  let { navigate } = $props<{ navigate: (page: string, target?: string) => void }>();
  let board = $state<Board>({ revision: 0, groups: [] }),
    baseline = $state(''),
    definitions = $state<WidgetDefinition[]>([]),
    templates = $state<GroupTemplate[]>([]),
    states = $state<Record<string, RefreshState>>({});
  let coordinator = $state.raw<WidgetRefreshCoordinator | null>(null);
  let confirmDiscard = $state(false);
  let search = $state('');
  type Preview = { board: Board; definitions: WidgetDefinition[]; templates: GroupTemplate[] };
  const matchingDefinitions = $derived(
    definitions.filter(
      (d) =>
        (!rebinding || d.kind === chosen) &&
        fuzzyMatch(d.name + ' ' + d.description + ' ' + d.kind, search),
    ),
  );
  function rememberBoard() {
    remember('finance', {
      board: $state.snapshot(board),
      definitions: $state.snapshot(definitions),
      templates: $state.snapshot(templates),
    });
  }
  let loading = $state(true),
    saving = $state(false),
    editing = $state(false),
    error = $state(''),
    message = $state(''),
    library = $state(false),
    libraryTab = $state('widgets'),
    chosen = $state('market-map'),
    binding = $state(''),
    targetGroup = $state(''),
    rebinding = $state(''),
    pendingDelete = $state(''),
    history = $state<WidgetGroup[][]>([]),
    dropTarget = $state(''),
    dropWidget = $state('');
  let trigger = $state<HTMLElement | null>(null);
  let drag: { type: 'group' | 'widget'; group: string; widget?: string } | null = null,
    alive = true;
  const dirty = $derived(!!baseline && JSON.stringify(board.groups) !== baseline);
  const selectedDefinition = $derived(definitions.find((d) => d.kind === chosen));
  const compatible = $derived(selectedDefinition?.datasets.filter((d) => d.compatible) ?? []);
  const widgetCount = $derived(board.groups.reduce((n, g) => n + g.widgets.length, 0));
  async function catalog() {
    const [c, t] = await Promise.all([
      api<{ widgets: WidgetDefinition[] }>('/widgets/catalog'),
      api<{ templates: GroupTemplate[] }>('/widget-groups'),
    ]);
    definitions = c.widgets;
    templates = t.templates;
  }
  const refreshConfigs = $derived(
    board.groups.flatMap((g) =>
      g.widgets.map((w) => ({
        id: w.id,
        sourceId: Object.values(w.sources)[0],
        kind: w.kind,
        interval: w.refresh_seconds ?? 300,
      })),
    ),
  );
  $effect(() => {
    const configs = refreshConfigs;
    untrack(() => coordinator?.configure(configs));
  });
  async function loadBindings(force = false) {
    coordinator?.configure(refreshConfigs);
    if (force) await coordinator?.refreshAll();
  }
  function exitEditing() {
    if (dirty) confirmDiscard = true;
    else editing = false;
  }
  function discard() {
    board = { ...board, groups: JSON.parse(baseline) };
    history = [];
    editing = false;
    confirmDiscard = false;
    try {
      localStorage.removeItem('insightra-market-board-draft');
    } catch {}
  }
  async function load() {
    loading = !baseline;
    error = '';
    try {
      const [saved] = await Promise.all([api<Board>('/boards/finance'), catalog()]);
      if (!alive) return;
      if (dirty) {
        message = '已显示本地草稿，请保存或放弃修改后重新读取。';
        return;
      }
      board = saved;
      baseline = JSON.stringify(saved.groups);
      rememberBoard();
      try {
        const draft = JSON.parse(localStorage.getItem('insightra-market-board-draft') || 'null');
        if (draft?.revision === saved.revision && Array.isArray(draft.groups)) {
          board = draft;
          editing = true;
          message = '已恢复未保存的看板草稿。';
        }
      } catch {}
      targetGroup = board.groups[0]?.id ?? '';
      void loadBindings();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    alive = true;
    const preview = cached<Preview>('finance');
    if (preview?.board && Array.isArray(preview.definitions)) {
      board = preview.board;
      definitions = preview.definitions;
      templates = preview.templates;
      baseline = JSON.stringify(board.groups);
      loading = false;
    }
    coordinator = new WidgetRefreshCoordinator(
      (id, signal) => api<BoundDataset>(`/datasets/${id}`, { signal }),
      (next) => (states = next),
      (data, config) => {
        const definition = definitions.find((d) => d.kind === config.kind);
        return definition ? datasetProblem(data, definition) : '组件声明未加载。';
      },
    );
    coordinator.configure(refreshConfigs);
    coordinator.start();
    const resume = () => coordinator?.tick();
    document.addEventListener('visibilitychange', resume);
    void load();
    return () => {
      alive = false;
      coordinator?.destroy();
      document.removeEventListener('visibilitychange', resume);
    };
  });
  onDestroy(() => {
    if (dirty) {
      try {
        localStorage.setItem('insightra-market-board-draft', JSON.stringify(board));
      } catch {}
    }
  });
  function apply(groups: WidgetGroup[]) {
    history = [...history.slice(-19), structuredClone($state.snapshot(board.groups))];
    board = { ...board, groups };
    message = '';
    void loadBindings();
  }
  function undo() {
    const last = history.at(-1);
    if (!last) return;
    history = history.slice(0, -1);
    board = { ...board, groups: last };
  }
  async function save() {
    saving = true;
    error = '';
    try {
      board = await api<Board>('/boards/finance', {
        method: 'PUT',
        body: JSON.stringify({ revision: board.revision, groups: board.groups }),
      });
      baseline = JSON.stringify(board.groups);
      rememberBoard();
      history = [];
      editing = false;
      message = '看板编组、位置和数据绑定已保存。';
      try {
        localStorage.removeItem('insightra-market-board-draft');
      } catch {}
    } catch (e) {
      error = errorMessage(e);
    } finally {
      saving = false;
    }
  }
  function addGroup() {
    const group: WidgetGroup = {
      id: crypto.randomUUID(),
      title: `观察编组 ${board.groups.length + 1}`,
      widgets: [],
    };
    apply([...board.groups, group]);
    targetGroup = group.id;
    editing = true;
  }
  function rename(id: string, title: string) {
    if (!title.trim()) return;
    apply(board.groups.map((g) => (g.id === id ? { ...g, title: title.trim() } : g)));
  }
  function removeGroup(id: string) {
    apply(board.groups.filter((g) => g.id !== id));
    pendingDelete = '';
  }
  function moveGroup(id: string, to: number) {
    const groups = [...board.groups];
    const from = groups.findIndex((g) => g.id === id);
    if (from < 0 || to < 0 || to >= groups.length || from === to) return;
    const [group] = groups.splice(from, 1);
    groups.splice(to, 0, group);
    apply(groups);
  }
  function changeWidget(id: string, change: Partial<WidgetInstance>) {
    apply(
      board.groups.map((g) => ({
        ...g,
        widgets: g.widgets.map((w) => (w.id === id ? { ...w, ...change } : w)),
      })),
    );
  }
  function removeWidget(id: string) {
    apply(board.groups.map((g) => ({ ...g, widgets: g.widgets.filter((w) => w.id !== id) })));
  }
  function moveWidget(id: string, groupId: string, to: number) {
    const source = board.groups.find((g) => g.widgets.some((w) => w.id === id));
    const widget = source?.widgets.find((w) => w.id === id);
    if (!widget) return;
    const groups = board.groups.map((g) => ({
      ...g,
      widgets: g.widgets.filter((w) => w.id !== id),
    }));
    const destination = groups.find((g) => g.id === groupId);
    if (!destination) return;
    destination.widgets.splice(Math.max(0, Math.min(to, destination.widgets.length)), 0, widget);
    apply(groups);
  }
  function startDrag(e: DragEvent, value: NonNullable<typeof drag>) {
    e.stopPropagation();
    drag = value;
    e.dataTransfer?.setData('text/plain', value.widget ?? value.group);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function drop(e: DragEvent, groupId: string, index?: number) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag) return;
    if (drag.type === 'group')
      moveGroup(
        drag.group,
        board.groups.findIndex((g) => g.id === groupId),
      );
    else moveWidget(drag.widget!, groupId, index ?? Infinity);
    drag = null;
    dropTarget = '';
    dropWidget = '';
  }
  async function openLibrary(e?: MouseEvent, widget?: WidgetInstance, groupId?: string) {
    trigger = (e?.currentTarget as HTMLElement) ?? (document.activeElement as HTMLElement);
    library = true;
    search = '';
    libraryTab = 'widgets';
    rebinding = widget?.id ?? '';
    chosen = widget?.kind ?? 'market-map';
    targetGroup = groupId ?? board.groups[0]?.id ?? '';
    binding = widget ? Object.values(widget.sources)[0] : '';
    try {
      await catalog();
      if (!binding)
        binding =
          definitions.find((d) => d.kind === chosen)?.datasets.find((d) => d.compatible)?.id ?? '';
    } catch (e) {
      error = errorMessage(e);
    }
  }
  function chooseKind(kind: string) {
    chosen = kind;
    binding =
      definitions.find((d) => d.kind === kind)?.datasets.find((d) => d.compatible)?.id ?? '';
  }
  function addWidget() {
    if (!selectedDefinition || !binding || !compatible.some((d) => d.id === binding)) return;
    const sources = { [selectedDefinition.slot]: binding };
    if (rebinding) {
      changeWidget(rebinding, { sources });
      library = false;
      return;
    }
    let groups = structuredClone($state.snapshot(board.groups));
    let destination = groups.find((g) => g.id === targetGroup);
    if (!destination) {
      destination = { id: crypto.randomUUID(), title: '市场观察', widgets: [] };
      groups.push(destination);
    }
    destination.widgets.push({
      id: crypto.randomUUID(),
      kind: selectedDefinition.kind,
      sources,
      size: selectedDefinition.default_size,
      options: { area: 'total_mv' },
    });
    apply(groups);
    editing = true;
    library = false;
  }
  async function saveGroup(group: WidgetGroup) {
    error = '';
    try {
      const result = await api<GroupTemplate>('/widget-groups', {
        method: 'POST',
        body: JSON.stringify(group),
      });
      templates = [...templates, result];
      message = `「${group.title}」已保存到编组库，可整体添加。`;
    } catch (e) {
      error = errorMessage(e);
    }
  }
  function addTemplate(template: GroupTemplate) {
    apply([...board.groups, cloneGroup($state.snapshot(template.group))]);
    editing = true;
    library = false;
  }
  function templateReady(template: GroupTemplate) {
    return template.group.widgets.every((widget) => {
      const definition = definitions.find((d) => d.kind === widget.kind);
      return definition?.datasets.some(
        (d) => d.id === widget.sources[definition.slot] && d.compatible,
      );
    });
  }
  async function deleteTemplate(id: string) {
    try {
      await api(`/widget-groups/${id}`, { method: 'DELETE' });
      templates = templates.filter((t) => t.id !== id);
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      library = false;
      drag = null;
      dropTarget = '';
    }
  }}
  onbeforeunload={(e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }}
/>
<main class="market-dashboard" inert={library}>
  <header class="dashboard-commandbar">
    <div class="dashboard-identity">
      <h1>行情看板</h1>
      <span>{board.groups.length} 组 · {widgetCount} 组件</span>{#if dirty}<span class="unsaved-dot"
          >未保存</span
        >{/if}
    </div>
    <div class="dashboard-commands">
      {#if editing}<button class="button" onclick={addGroup}><Plus size={14} />新建编组</button
        ><button
          class="icon-button"
          aria-label="撤销看板修改"
          disabled={!history.length}
          onclick={undo}><Undo2 size={15} /></button
        >{:else}<button class="button" onclick={() => loadBindings(true)}
          ><RefreshCw size={14} />刷新全部</button
        >{/if}
      <button class="button" disabled={loading} onclick={(e) => openLibrary(e)}
        ><Plus size={14} />添加小组件</button
      >
      {#if dirty || editing}<button
          class="button primary inline-primary"
          disabled={!dirty || saving}
          onclick={save}><Check size={14} />{saving ? '保存中…' : '保存看板'}</button
        >{/if}
      <button
        class="button"
        disabled={loading}
        onclick={() => (editing ? exitEditing() : (editing = true))}
        >{#if editing}退出编辑{:else}<Settings2 size={14} />编辑布局{/if}</button
      >
      <button
        class="icon-button"
        aria-label="管理数据源"
        title="管理数据源"
        onclick={() => navigate('数据管理', 'sources')}><Database size={16} /></button
      >
    </div>
  </header>
  {#if error}<div class="message error" role="alert">
      {error}<button class="text-button" onclick={load}>重新读取看板</button>
    </div>{/if}
  {#if message}<div class="board-inline-message" role="status">{message}</div>{/if}
  {#if confirmDiscard}<div class="draft-banner">
      有未保存的布局或设置。<button class="text-button" onclick={discard}>放弃本次修改</button
      ><button class="text-button" onclick={() => (confirmDiscard = false)}>继续编辑</button>
    </div>{/if}
  {#if loading}<div class="dashboard-skeleton">
      <LoadingSurface variant="map" height={520} label="读取看板与数据绑定" /><LoadingSurface
        height={520}
        label="准备市场组件"
      />
    </div>
  {:else if !board.groups.length}<section class="board-empty">
      <LayoutGrid size={35} />
      <h2>从数据源开始，搭建你的市场看板。</h2>
      <p>在数据管理接入数据，选择声明了对应数据依赖的小组件，再添加到看板。</p>
      <div>
        <button class="button" onclick={() => navigate('数据管理', 'sources')}>管理数据源</button
        ><button class="button primary inline-primary" onclick={(e) => openLibrary(e)}
          >添加第一个组件</button
        >
      </div>
    </section>
  {:else}<div class="board-groups">
      {#each board.groups as group, gi (group.id)}<section
          class="market-widget-group"
          class:group-drop-target={dropTarget === group.id}
          data-group={group.id}
          role="group"
          aria-label={group.title}
          ondragover={(e) => {
            if (drag) {
              e.preventDefault();
              dropTarget = group.id;
            }
          }}
          ondrop={(e) => drop(e, group.id)}
        >
          <header class="widget-group-heading">
            <div>
              {#if editing}<button
                  class="icon-button"
                  draggable="true"
                  aria-label={`拖动编组 ${group.title}`}
                  ondragstart={(e) => startDrag(e, { type: 'group', group: group.id })}
                  ondragend={() => {
                    drag = null;
                    dropTarget = '';
                  }}><GripVertical size={16} /></button
                ><input
                  aria-label={`编组名称 ${gi + 1}`}
                  value={group.title}
                  maxlength="80"
                  onchange={(e) => rename(group.id, e.currentTarget.value)}
                />{:else}<h2>{group.title}</h2>{/if}<span>{group.widgets.length} 个组件</span>
            </div>
            <div>
              <button class="text-button" onclick={() => saveGroup(group)}
                ><Copy size={13} />保存编组</button
              >{#if editing}<button
                  class="icon-button"
                  aria-label={`上移编组 ${group.title}`}
                  disabled={gi === 0}
                  onclick={() => moveGroup(group.id, gi - 1)}><ArrowUp size={14} /></button
                ><button
                  class="icon-button"
                  aria-label={`下移编组 ${group.title}`}
                  disabled={gi === board.groups.length - 1}
                  onclick={() => moveGroup(group.id, gi + 1)}><ArrowDown size={14} /></button
                ><button
                  class="icon-button"
                  aria-label={`删除编组 ${group.title}`}
                  onclick={() => (pendingDelete = group.id)}><Trash2 size={14} /></button
                ><button class="button" onclick={(e) => openLibrary(e, undefined, group.id)}
                  ><Plus size={13} />添加</button
                >{/if}
            </div>
          </header>
          {#if pendingDelete === group.id}<div class="draft-banner">
              删除这个编组及其看板组件？数据集不会被删除。<button
                class="text-button"
                onclick={() => removeGroup(group.id)}>确认删除编组</button
              ><button class="text-button" onclick={() => (pendingDelete = '')}>取消</button>
            </div>{/if}
          <div class="widget-grid">
            {#each group.widgets as widget, wi (widget.id)}{@const definition = definitions.find(
                (d) => d.kind === widget.kind,
              )}{#if definition}<div
                  class={`widget-placement size-${widget.size}`}
                  style={`grid-row:span ${widgetHeight(widget) / 12 + 1};--card-height:${widgetHeight(widget)}px`}
                  data-widget={widget.id}
                  class:widget-drop-target={dropWidget === widget.id}
                  role="group"
                  aria-label={`${definition.name}位置`}
                  ondragover={(e) => {
                    if (drag?.type === 'widget') {
                      e.preventDefault();
                      e.stopPropagation();
                      dropWidget = widget.id;
                    }
                  }}
                  ondrop={(e) => drop(e, group.id, wi)}
                >
                  <WidgetFrame
                    {widget}
                    {definition}
                    state={states[widget.id]}
                    {editing}
                    groups={board.groups}
                    groupId={group.id}
                    onremove={() => removeWidget(widget.id)}
                    onmove={(direction) => moveWidget(widget.id, group.id, wi + direction)}
                    onresize={(size) => changeWidget(widget.id, { size })}
                    onoptions={(options) => changeWidget(widget.id, { options })}
                    onrelocate={(id) => moveWidget(widget.id, id, Infinity)}
                    onbind={() => openLibrary(undefined, widget, group.id)}
                    ondrag={(e) =>
                      startDrag(e, { type: 'widget', group: group.id, widget: widget.id })}
                    ondragend={() => {
                      drag = null;
                      dropTarget = '';
                      dropWidget = '';
                    }}
                    onretry={() => coordinator?.refresh(widget.id)}
                    oninterval={(refresh_seconds) => changeWidget(widget.id, { refresh_seconds })}
                  />
                </div>{/if}{:else}<button
                class="empty-group-add"
                onclick={(e) => openLibrary(e, undefined, group.id)}
                ><Plus size={22} /><span>向这个编组添加小组件</span></button
              >{/each}
          </div>
        </section>{/each}
    </div>{/if}
</main>
{#if library}<div class="widget-library-backdrop">
    <div
      class="widget-library"
      role="dialog"
      aria-modal="true"
      aria-label="小组件库"
      tabindex="-1"
      use:focusTrap={trigger}
    >
      <header>
        <div>
          <span class="eyebrow">LAYER 02 / WIDGET CONTRACTS</span>
          <h2>{rebinding ? '重新绑定数据源' : '添加到你的看板'}</h2>
        </div>
        <button class="icon-button" aria-label="关闭小组件库" onclick={() => (library = false)}
          ><X size={20} /></button
        >
      </header>
      <div class="library-tabs">
        <button class:active={libraryTab === 'widgets'} onclick={() => (libraryTab = 'widgets')}
          >小组件</button
        >{#if !rebinding}<button
            class:active={libraryTab === 'groups'}
            onclick={() => (libraryTab = 'groups')}
            >已保存编组 <span>{templates.length}</span></button
          >{/if}
      </div>
      {#if libraryTab === 'widgets'}<input
          class="widget-search"
          aria-label="搜索小组件"
          placeholder="搜索组件名称或用途，如：自选、涨跌、指数"
          bind:value={search}
        />
        {#if !matchingDefinitions.length}<p class="widget-search-empty">
            没有匹配的小组件，试试其他关键词。
          </p>{/if}
        <div class="widget-library-body">
          <nav class="widget-kind-list">
            {#each matchingDefinitions as d}<button
                class:active={chosen === d.kind}
                onclick={() => chooseKind(d.kind)}
                ><span class={`widget-preview preview-${d.kind}`} aria-hidden="true"
                  >{#each Array.from({ length: 6 }) as _, i}<i style={`--i:${i}`}></i>{/each}</span
                ><strong>{d.name}</strong><small
                  >{d.datasets.filter((r) => r.compatible).length} 个兼容数据集</small
                ></button
              >{/each}
          </nav>
          <section class="widget-binding-form">
            {#if selectedDefinition}<span class="eyebrow">DATA DEPENDENCIES</span>
              <h3>{selectedDefinition.name}</h3>
              <p>{selectedDefinition.description}</p>
              <div class="widget-required-fields">
                <span>必需字段</span>
                <div>
                  {#each Object.keys(selectedDefinition.required_fields) as field}<code
                      >{field}</code
                    >{/each}
                </div>
              </div>
              <label
                >绑定数据集<select aria-label="组件数据源" bind:value={binding}
                  ><option value="">选择兼容的数据集</option>{#each compatible as dataset}<option
                      value={dataset.id}>{dataset.name} · v{dataset.revision}</option
                    >{/each}</select
                ></label
              >{#if !compatible.length}<div class="dependency-missing">
                  还没有满足字段要求的数据集。<button
                    class="text-button"
                    onclick={() => {
                      library = false;
                      navigate('数据管理', 'sources');
                    }}>前往数据管理接入</button
                  >
                </div>{/if}{#if !rebinding}<label
                  >添加到编组<select aria-label="组件目标编组" bind:value={targetGroup}
                    ><option value="">新建“市场观察”编组</option
                    >{#each board.groups as group}<option value={group.id}>{group.title}</option
                      >{/each}</select
                  ></label
                >{/if}
              <p class="widget-binding-note">
                组件只读取绑定的数据集。同步和数据修订在数据管理中完成。
              </p>
              <button
                class="button primary inline-primary"
                disabled={!binding || !compatible.some((d) => d.id === binding)}
                onclick={addWidget}><Plus size={15} />{rebinding ? '应用绑定' : '添加组件'}</button
              >{/if}
          </section>
        </div>
      {:else}<div class="saved-group-library">
          {#each templates as template}<article>
              <div>
                <h3>{template.group.title}</h3>
                <p>
                  {template.group.widgets
                    .map((w) => definitions.find((d) => d.kind === w.kind)?.name ?? w.kind)
                    .join(' · ')}
                </p>
                <small>{template.group.widgets.length} 个组件 · 保留数据源绑定</small>
              </div>
              <button
                class="button"
                disabled={!templateReady(template)}
                title={templateReady(template)
                  ? '保留来源绑定并添加整个编组'
                  : '先接入编组需要的数据源'}
                onclick={() => addTemplate(template)}
                >{templateReady(template) ? '整体添加' : '数据源待准备'}</button
              ><button
                class="icon-button"
                aria-label={`删除模板 ${template.group.title}`}
                onclick={() => deleteTemplate(template.id)}><Trash2 size={15} /></button
              >
            </article>{:else}<div class="board-empty">
              <Copy size={30} />
              <h3>还没有保存的编组</h3>
              <p>在看板编组标题旁点击“保存编组”，以后便可整体添加。</p>
            </div>{/each}
        </div>{/if}
    </div>
  </div>{/if}
