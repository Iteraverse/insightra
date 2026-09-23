<script lang="ts">
  import { X, ArrowUpRight } from '@lucide/svelte';
  import { focusTrap } from '../focusTrap';
  import WatchlistSettings from './WatchlistSettings.svelte';
  import type { BoundDataset } from './types';
  import { refreshChoices, type WidgetInstance, type WidgetGroup } from './types';
  let {
    widget,
    dataset,
    title,
    groups,
    groupId,
    trigger,
    onclose,
    oninterval,
    onresize,
    onrelocate,
    onoptions,
    onbind,
  } = $props<{
    widget: WidgetInstance;
    dataset?: BoundDataset;
    title: string;
    groups: WidgetGroup[];
    groupId: string;
    trigger: HTMLElement | null;
    onclose: () => void;
    oninterval: (seconds: number) => void;
    onresize: (size: WidgetInstance['size']) => void;
    onrelocate: (id: string) => void;
    onoptions: (options: WidgetInstance['options']) => void;
    onbind: () => void;
  }>();
  let section = $state<'content' | 'general'>('content');
  const sizes: { value: WidgetInstance['size']; label: string; span: number; hint: string }[] = [
    { value: 'small', label: '小', span: 4, hint: '1/3 行' },
    { value: 'half', label: '中', span: 6, hint: '半行' },
    { value: 'wide', label: '大', span: 8, hint: '2/3 行' },
    { value: 'full', label: '特大', span: 12, hint: '独占一行' },
  ];
  function showModal(node: HTMLDialogElement) {
    node.showModal();
    return {
      destroy() {
        node.close();
      },
    };
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') onclose();
  }}
/>
<dialog
  class="widget-settings-dialog"
  use:showModal
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
  aria-label={`${title}设置`}
  tabindex="-1"
  use:focusTrap={trigger}
>
  <header>
    <div>
      <span class="eyebrow">组件设置</span>
      <h2>{title}</h2>
    </div>
    <button class="icon-button" aria-label="关闭组件设置" onclick={onclose}><X size={18} /></button>
  </header>

  <div class="settings-navigation" aria-label="设置分类">
    <button
      class:active={section === 'content'}
      aria-pressed={section === 'content'}
      onclick={() => (section = 'content')}>组件内容</button
    ><button
      class:active={section === 'general'}
      aria-pressed={section === 'general'}
      onclick={() => (section = 'general')}>通用设置</button
    >
  </div>
  <section
    hidden={section !== 'content'}
    class="settings-section content-settings"
    aria-label="组件内容"
  >
    <div class="settings-section-heading">
      <h3>组件内容</h3>
      <span>选择你想观察的数据</span>
    </div>
    {#if widget.kind === 'watchlist'}<WatchlistSettings {widget} {dataset} {onoptions} />
    {:else if widget.kind === 'market-map'}<label class="setting-field"
        >云图面积<select
          aria-label="云图面积指标"
          value={widget.options.area}
          onchange={(e) =>
            onoptions({ ...widget.options, area: e.currentTarget.value as 'amount' | 'total_mv' })}
          ><option value="total_mv">总市值</option><option value="amount">成交额</option></select
        ><small>方块面积按所选指标分配，颜色表示涨跌幅。</small></label
      >
    {:else}<p class="settings-content-note">
        {widget.kind === 'index-board'
          ? '展示绑定数据中的指数及历史走势。'
          : widget.kind === 'market-breadth'
            ? '展示市场涨跌分布与上涨家数。'
            : widget.kind === 'industry-board'
              ? '展示细分行业表现，可在组件中筛选查看。'
              : '展示涨跌与成交排行，可在组件中切换排序。'}
      </p>{/if}
    {#if widget.kind === 'watchlist' || widget.kind === 'index-board'}<label class="setting-field"
        >走势区间<select
          aria-label="走势交易日数"
          value={widget.options.trend_days ?? 20}
          onchange={(e) =>
            onoptions({
              ...widget.options,
              trend_days: Number(e.currentTarget.value) as 5 | 10 | 20 | 60,
            })}
          >{#each [5, 10, 20, 60] as days}<option value={days}>{days} 个交易日</option
            >{/each}</select
        ><small
          >{widget.kind === 'watchlist'
            ? '中尺寸显示走势，大及特大显示开高低与成交量。保存自选列表后，在数据管理同步 A 股数据补充历史。'
            : '曲线按所选区间绘制，量能对比上一条日线。'}</small
        ></label
      >{/if}
    <div class="settings-source">
      <div><span>数据来源</span><strong>{dataset?.name ?? '等待数据集'}</strong></div>
      <button
        class="text-button"
        onclick={() => {
          onclose();
          onbind();
        }}>更换绑定数据源 <ArrowUpRight size={13} /></button
      >
    </div>
  </section>
  <section
    hidden={section !== 'general'}
    class="settings-section base-settings"
    aria-label="通用设置"
  >
    <div class="settings-section-heading">
      <h3>通用设置</h3>
      <span>尺寸、刷新与位置</span>
    </div>
    <fieldset class="widget-size-picker">
      <legend>组件尺寸</legend>
      <div class="size-choice-grid">
        {#each sizes as size}<label class="size-choice" class:selected={widget.size === size.value}>
            <input
              type="radio"
              name={`size-${widget.id}`}
              aria-label={`${size.label} · ${size.hint}`}
              value={size.value}
              checked={widget.size === size.value}
              onchange={() => onresize(size.value)}
            />
            <span class="size-diagram" aria-hidden="true"
              ><i style={`grid-column:span ${size.span}`}></i>{#if size.span < 12}<b
                  style={`grid-column:span ${12 - size.span}`}
                ></b>{/if}</span
            >
            <strong>{size.label}</strong><small>{size.hint}</small>
          </label>{/each}
      </div>
    </fieldset>
    <fieldset class="height-picker">
      <legend>组件高度 <small>180 px 为一个单位</small></legend>
      <div>
        {#each [2, 3, 4] as units}<button
            class:active={(widget.options.height_units ??
              (widget.kind === 'market-map' ? 3 : 2)) === units}
            aria-pressed={(widget.options.height_units ??
              (widget.kind === 'market-map' ? 3 : 2)) === units}
            onclick={() => onoptions({ ...widget.options, height_units: units as 2 | 3 | 4 })}
            >{units} 格 · {units * 180}px</button
          >{/each}
      </div>
    </fieldset>
    <div class="settings-field-pair">
      <label class="setting-field"
        >自动刷新<select
          aria-label={`${title}刷新周期`}
          value={widget.refresh_seconds ?? 300}
          onchange={(e) => oninterval(Number(e.currentTarget.value))}
          >{#each refreshChoices as choice}<option value={choice.value}>{choice.label}</option
            >{/each}</select
        ></label
      >
      <label class="setting-field"
        >所属编组<select
          aria-label={`${title}移动到编组`}
          value={groupId}
          onchange={(e) => onrelocate(e.currentTarget.value)}
          >{#each groups as group}<option value={group.id}>{group.title}</option>{/each}</select
        ></label
      >
    </div>
    <p class="settings-content-note">刷新检查已保存的数据；获取新行情请前往数据管理同步。</p>
  </section>
  <footer>
    <p class="settings-save-hint">即时预览 · 保存看板后保留设置</p>
    <button class="button primary inline-primary" onclick={onclose}>完成</button>
  </footer>
</dialog>
