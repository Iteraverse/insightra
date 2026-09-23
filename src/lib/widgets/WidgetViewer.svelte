<script lang="ts">
  import { X } from '@lucide/svelte';
  import { focusTrap } from '../focusTrap';
  import WidgetContent from './WidgetContent.svelte';
  import type { WidgetInstance, BoundDataset } from './types';
  let { widget, dataset, title, trigger, onclose, onoptions } = $props<{
    widget: WidgetInstance;
    dataset: BoundDataset;
    title: string;
    trigger: HTMLElement | null;
    onclose: () => void;
    onoptions: (options: WidgetInstance['options']) => void;
  }>();
  let viewport = $state(800);
  function show(node: HTMLDialogElement) {
    node.showModal();
    return { destroy: () => node.close() };
  }
</script>

<svelte:window bind:innerHeight={viewport} />
<dialog
  class="widget-viewer"
  use:show
  use:focusTrap={trigger}
  tabindex="-1"
  aria-label={`${title}放大浏览`}
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
>
  <header>
    <div>
      <h2>{title}</h2>
      <small>{dataset.as_of ?? '本地数据'} · 收盘数据，非实时行情</small>
    </div>
    <button class="icon-button" aria-label="关闭放大浏览" onclick={onclose}><X size={20} /></button>
  </header>
  <div class="widget-viewer-content">
    <WidgetContent
      widget={{ ...widget, size: 'full' }}
      {dataset}
      {onoptions}
      height={Math.max(260, Math.min(720, viewport - 250))}
    />
  </div>
</dialog>
