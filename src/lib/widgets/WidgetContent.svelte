<script lang="ts">
  import MarketMap from './MarketMap.svelte';
  import MarketBreadth from './MarketBreadth.svelte';
  import IndustryBoard from './IndustryBoard.svelte';
  import IndexBoard from './IndexBoard.svelte';
  import StockBoard from './StockBoard.svelte';
  import type { WidgetInstance, BoundDataset, MarketRow, IndexRow } from './types';
  let { widget, dataset, height, onoptions } = $props<{
    widget: WidgetInstance;
    dataset: BoundDataset;
    height: number;
    onoptions: (options: WidgetInstance['options']) => void;
  }>();
</script>

{#if widget.kind === 'market-map'}<MarketMap
    rows={dataset.data as MarketRow[]}
    area={widget.options.area}
    {height}
  />
{:else if widget.kind === 'market-breadth'}<MarketBreadth rows={dataset.data as MarketRow[]} />
{:else if widget.kind === 'industry-board'}<IndustryBoard rows={dataset.data as MarketRow[]} />
{:else if widget.kind === 'index-board'}<IndexBoard
    rows={dataset.data as IndexRow[]}
    days={widget.options.trend_days ?? 20}
  />
{:else}<StockBoard rows={dataset.data as MarketRow[]} {widget} />{/if}
