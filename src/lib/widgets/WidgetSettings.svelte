<script lang="ts">
  import { X, ArrowUpRight } from '@lucide/svelte';
  import { focusTrap } from '../focusTrap';
  import { refreshChoices, type WidgetInstance, type WidgetGroup } from './types';
  let {
    widget,
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
  <label class="setting-field"
    >自动刷新<select
      aria-label={`${title}刷新周期`}
      value={widget.refresh_seconds ?? 300}
      onchange={(e) => oninterval(Number(e.currentTarget.value))}
      >{#each refreshChoices as choice}<option value={choice.value}>{choice.label}</option
        >{/each}</select
    ><small>按此周期检查已保存数据。上游采集频率在数据管理中设置；行情日期独立显示。</small></label
  >
  <label class="setting-field"
    >组件尺寸<select
      aria-label={`${title}尺寸`}
      value={widget.size}
      onchange={(e) => onresize(e.currentTarget.value as WidgetInstance['size'])}
      ><option value="small">小 · 1/3 行</option><option value="half">中 · 半行</option><option
        value="wide">大 · 2/3 行</option
      ><option value="full">超大 · 独占一行</option></select
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
  {#if widget.kind === 'market-map'}<label class="setting-field"
      >云图面积<select
        aria-label="云图面积指标"
        value={widget.options.area}
        onchange={(e) => onoptions({ area: e.currentTarget.value as 'amount' | 'total_mv' })}
        ><option value="total_mv">总市值</option><option value="amount">成交额</option></select
      ></label
    >{/if}
  <footer>
    <button
      class="text-button"
      onclick={() => {
        onclose();
        onbind();
      }}>更换绑定数据源 <ArrowUpRight size={13} /></button
    ><button class="button primary inline-primary" onclick={onclose}>完成</button>
  </footer>
  <p class="settings-save-hint">设置即时预览；点击看板工具栏“保存看板”以保留。</p>
</dialog>
