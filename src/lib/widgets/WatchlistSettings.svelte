<script lang="ts">
  import { Search, Plus, Check, X, ListPlus } from '@lucide/svelte';
  import { fuzzyMatch } from './cache';
  import type { BoundDataset, WidgetInstance, IndexRow } from './types';
  let { widget, dataset, onoptions } = $props<{
    widget: WidgetInstance;
    dataset?: BoundDataset;
    onoptions: (options: WidgetInstance['options']) => void;
  }>();
  let query = $state('');
  const symbols: string[] = $derived(widget.options.symbols ?? []);
  const rows: IndexRow[] = $derived(dataset?.data ?? []);
  const matches = $derived(
    query.trim()
      ? rows.filter((row) => fuzzyMatch(row.name + ' ' + row.ts_code, query)).slice(0, 12)
      : [],
  );
  function toggle(code: string) {
    onoptions({
      ...widget.options,
      symbols: symbols.includes(code)
        ? symbols.filter((s) => s !== code)
        : [...symbols, code].slice(0, 100),
    });
  }
</script>

<section class="watchlist-settings" aria-label="自选股管理">
  <div class="watch-search-box">
    <Search size={17} /><input
      aria-label="搜索股票"
      placeholder="搜索公司名称或证券代码…"
      bind:value={query}
      disabled={!dataset}
    />{#if query}<button class="icon-button" aria-label="清除股票搜索" onclick={() => (query = '')}
        ><X size={14} /></button
      >{/if}
  </div>
  {#if !dataset}<p class="widget-note">
      数据暂不可用，可先管理已有列表，加载成功后再搜索添加。
    </p>{/if}
  {#if query.trim()}<div class="watch-results-panel">
      <div class="watch-list-label"><span>搜索结果</span><small>最多显示 12 条</small></div>
      <div class="stock-results">
        {#each matches as row}<button
            class:already-added={symbols.includes(row.ts_code)}
            disabled={symbols.includes(row.ts_code) || symbols.length >= 100}
            onclick={() => toggle(row.ts_code)}
            ><span class="watch-identity"
              ><strong>{row.name}</strong><small>{row.ts_code}</small></span
            ><span class="watch-add"
              >{#if symbols.includes(row.ts_code)}<Check size={14} />已添加{:else}<Plus
                  size={14}
                />添加{/if}</span
            ></button
          >
        {:else}<p class="watch-no-results">没有找到匹配的股票，试试证券代码。</p>{/each}
      </div>
    </div>{/if}
  <div class="watch-list-label">
    <span>我的自选 <b>{symbols.length}</b></span><small>最多 100 只</small>
  </div>
  <div class="watchlist-members">
    {#each symbols as code, index}{@const row = rows.find((r) => r.ts_code === code)}
      <div>
        <span class="watch-number">{String(index + 1).padStart(2, '0')}</span><span
          class="watch-identity"
          ><strong>{row?.name ?? code}</strong><small>{row ? code : '当前数据源暂无行情'}</small
          ></span
        ><button
          class="icon-button watch-remove"
          aria-label={`移除自选 ${row?.name ?? code}`}
          title="从自选中移除"
          onclick={() => toggle(code)}><X size={14} /></button
        >
      </div>
    {:else}<div class="watch-empty">
        <ListPlus size={24} /><strong>建立你的观察列表</strong>
        <p>在上方搜索股票，点击添加。<br />行情会在看板中集中展示。</p>
      </div>{/each}
  </div>
</section>
