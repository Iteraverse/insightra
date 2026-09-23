<script lang="ts">
  import {
    Maximize2,
    GripVertical,
    Trash2,
    ArrowLeft,
    ArrowRight,
    RefreshCw,
    Settings2,
  } from '@lucide/svelte';
  import WidgetContent from './WidgetContent.svelte';
  import WidgetViewer from './WidgetViewer.svelte';
  import WidgetSettings from './WidgetSettings.svelte';
  import { widgetHeight, refreshChoices, type RefreshState } from './types';
  import LoadingSurface from '../LoadingSurface.svelte';
  import type { WidgetInstance, WidgetDefinition, BoundDataset, WidgetGroup } from './types';
  let {
    widget,
    definition,
    state: refreshState,
    editing,
    groups,
    groupId,
    onremove,
    onmove,
    onresize,
    onrelocate,
    onbind,
    ondrag,
    ondragend,
    onoptions,
    onretry,
    oninterval,
  } = $props<{
    widget: WidgetInstance;
    definition: WidgetDefinition;
    state: RefreshState | undefined;
    editing: boolean;
    groups: WidgetGroup[];
    groupId: string;
    onremove: () => void;
    onmove: (direction: number) => void;
    onresize: (size: WidgetInstance['size']) => void;
    onrelocate: (groupId: string) => void;
    onbind: () => void;
    ondrag: (e: DragEvent) => void;
    ondragend: () => void;
    onoptions: (options: WidgetInstance['options']) => void;
    onretry: () => void;
    oninterval: (seconds: number) => void;
  }>();
  let viewerOpen = $state(false);
  let settingsOpen = $state(false),
    settingsTrigger = $state<HTMLElement | null>(null);
  const refreshStatus = $derived(
    refreshState?.loading
      ? 'loading'
      : refreshState?.error
        ? 'failure'
        : refreshState?.completedAt !== undefined
          ? 'success'
          : 'pending',
  );
  const refreshTime = $derived(
    refreshState?.completedAt !== undefined
      ? new Intl.DateTimeFormat('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        }).format(refreshState.completedAt)
      : '—',
  );
  const cadence = $derived(
    refreshChoices.find((c) => c.value === (widget.refresh_seconds ?? 300))?.label ?? '每 5 分钟',
  );
  const cardHeight = $derived(widgetHeight(widget));
  const bodyHeight = $derived(cardHeight - 92);
  const chartHeight = $derived(Math.max(160, bodyHeight - 130));
  const dataset: BoundDataset | undefined = $derived(refreshState?.data);
  const invalid = $derived(
    dataset && dataset.schema !== definition.schema
      ? '数据口径与组件不匹配，请重新绑定数据源。'
      : dataset &&
          !dataset.data.every((row) =>
            Object.entries(definition.required_fields).every(([key, type]) => {
              const value = (row as unknown as Record<string, unknown>)[key];
              return (key === 'amount' && value === null) || typeof value === type;
            }),
          )
        ? '数据字段或类型不兼容，请重新绑定数据源。'
        : '',
  );
</script>

<article
  class={`market-widget widget-${widget.kind}`}
  aria-label={definition.name}
  aria-busy={refreshState?.loading ?? true}
>
  <header class="market-widget-header">
    <div class="widget-heading-main">
      <h2>{definition.name}</h2>
      <span
        class="widget-refresh-state"
        data-refresh-status={refreshStatus}
        title={`${refreshState?.loading ? '正在刷新' : refreshState?.error ? '上次刷新失败：' + refreshState.error : '上次刷新成功'} · ${cadence} · 此时间为快照检查时间`}
        aria-label={`${definition.name}：${refreshState?.loading ? '刷新中' : refreshState?.error ? '刷新失败' : '刷新成功'} ${refreshTime}`}
      >
        {#if refreshState?.loading}<RefreshCw size={11} class="spinning" />{:else}<i
            class="refresh-light"
          ></i>{/if}<time
          datetime={refreshState?.completedAt !== undefined
            ? new Date(refreshState.completedAt).toISOString()
            : undefined}>{refreshTime}</time
        >{#if refreshState?.loading}<small>刷新中</small>{/if}
      </span>
    </div>
    <div class="widget-header-actions">
      <button
        class="icon-button"
        aria-label={`放大${definition.name}`}
        disabled={!dataset}
        onclick={(e) => {
          settingsTrigger = e.currentTarget;
          viewerOpen = true;
        }}><Maximize2 size={13} /></button
      >
      {#if editing}<button
          class="icon-button"
          draggable="true"
          aria-label={`拖动${definition.name}`}
          ondragstart={ondrag}
          {ondragend}><GripVertical size={14} /></button
        ><button
          class="icon-button"
          aria-label={`前移${definition.name}`}
          onclick={() => onmove(-1)}><ArrowLeft size={13} /></button
        ><button class="icon-button" aria-label={`后移${definition.name}`} onclick={() => onmove(1)}
          ><ArrowRight size={13} /></button
        >{/if}
      <button
        class="icon-button"
        aria-label={`刷新${definition.name}`}
        disabled={refreshState?.loading}
        onclick={onretry}><RefreshCw size={13} /></button
      >
      <button
        class="icon-button"
        aria-label={`${definition.name}设置`}
        onclick={(e) => {
          settingsTrigger = e.currentTarget;
          settingsOpen = true;
        }}><Settings2 size={14} /></button
      >
      {#if editing}<button
          class="icon-button"
          aria-label={`删除${definition.name}`}
          onclick={onremove}><Trash2 size={13} /></button
        >{/if}
    </div>
  </header>
  <div
    style={`--widget-body-height:${bodyHeight}px`}
    class="widget-body"
    class:widget-refreshing={refreshState?.loading && !!dataset}
  >
    {#if !dataset && !refreshState?.error}<LoadingSurface
        height={bodyHeight}
        variant={widget.kind === 'market-map'
          ? 'map'
          : widget.kind === 'industry-board'
            ? 'table'
            : 'chart'}
        label={`正在读取${definition.name}的数据源`}
      />
    {:else if invalid || (!dataset && refreshState?.error)}<div class="widget-empty">
        <h3>数据源暂不可用</h3>
        <p>{invalid || refreshState?.error}</p>
        <button class="button" onclick={onretry}>重试读取</button><button
          class="text-button"
          onclick={onbind}>重新绑定数据源</button
        >
      </div>
    {:else if dataset}<div class="widget-reveal">
        <WidgetContent {widget} {dataset} {onoptions} height={chartHeight} />
      </div>{/if}
    {#if refreshState?.loading && dataset}<div class="widget-refresh-indicator">
        <RefreshCw size={12} class="spinning" />更新中，保留当前视图
      </div>{/if}
  </div>
  <footer class="widget-provenance">
    {#if dataset}<span
        >{dataset.as_of ?? '本地数据'} · v{dataset.revision} · {dataset.data.length.toLocaleString()}
        条</span
      ><span>{dataset.as_of ? '收盘数据，非实时行情' : '日期以数据字段为准'}</span>{:else}<span
        >等待兼容的数据集</span
      >{/if}{#if refreshState?.error && dataset}<p class="widget-error-note">
        刷新失败：{refreshState.error}（仍显示上次成功数据）
      </p>{/if}
  </footer>
  {#if dataset?.warnings?.length}<details class="widget-quality">
      <summary>数据覆盖与口径</summary>{#each dataset.warnings as warning}<p>{warning}</p>{/each}
    </details>{/if}
</article>

{#if settingsOpen}<WidgetSettings
    {widget}
    {dataset}
    title={definition.name}
    {groups}
    {groupId}
    trigger={settingsTrigger}
    onclose={() => (settingsOpen = false)}
    {oninterval}
    {onresize}
    {onrelocate}
    {onoptions}
    {onbind}
  />{/if}

{#if viewerOpen && dataset}<WidgetViewer
    {widget}
    {dataset}
    title={definition.name}
    trigger={settingsTrigger}
    {onoptions}
    onclose={() => (viewerOpen = false)}
  />{/if}
