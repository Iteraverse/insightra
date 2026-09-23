<script lang="ts">
  import { onMount } from 'svelte';
  import { Database, RefreshCw, ArrowRight, Check, PlugZap } from '@lucide/svelte';
  import { api, errorMessage, formatTime } from '../lib/api';
  import LoadingSurface from '../lib/LoadingSurface.svelte';
  let { onopen } = $props<{ onopen: (id: string) => void }>();
  type Source = {
    id: string;
    name: string;
    description: string;
    dataset_id: string;
    schema: string;
    apis: string[];
    fields: string[];
    frequency: string;
    has_dataset: boolean;
    dataset_revision: number | null;
    state: {
      status: string;
      message: string;
      progress?: number;
      updated_at?: string;
      as_of?: string;
      records?: number;
      warnings?: string[];
    };
  };
  let sources = $state<Source[]>([]),
    error = $state(''),
    loading = $state(true);
  let alive = true,
    timer: ReturnType<typeof setTimeout>;
  async function load() {
    try {
      const result = await api<{ sources: Source[] }>('/market-sources');
      if (!alive) return;
      sources = result.sources;
      error = '';
      if (sources.some((s) => s.state.status === 'running')) timer = setTimeout(load, 1400);
    } catch (e) {
      if (alive) error = errorMessage(e);
    } finally {
      if (alive) loading = false;
    }
  }
  async function sync(id: string) {
    error = '';
    try {
      await api(`/market-sources/${id}/sync`, { method: 'POST' });
      clearTimeout(timer);
      await load();
    } catch (e) {
      error = errorMessage(e);
    }
  }
  onMount(() => {
    alive = true;
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  });
</script>

<section class="market-sources">
  <div class="source-layer-intro">
    <span class="eyebrow">LAYER 01 / DATA SOURCES</span>
    <h2>先连接数据，再构建视图。</h2>
    <p>同步结果进入数据集。组件只读取已保存的数据，不各自请求外部接口。</p>
  </div>
  {#if error}<div class="message error" role="alert">
      {error}<button class="text-button" onclick={load}>重试</button>
    </div>{/if}{#if loading}<LoadingSurface
      height={320}
      variant="table"
      label="读取可用数据源"
    />{:else}<div class="source-adapters">
      {#each sources as source}<article>
          <header>
            <span class="source-provider-mark">Tu</span>
            <div>
              <h3>{source.name}</h3>
              <p>{source.description}</p>
            </div>
            <span class="status-pill" class:status-good={source.has_dataset}
              >{source.has_dataset
                ? '已接入'
                : source.state.status === 'running'
                  ? '同步中'
                  : '待接入'}</span
            >
          </header>
          <div class="source-contract">
            <div>
              <span>提供的数据</span>
              <div class="source-field-tags">
                {#each source.fields as field}<code>{field}</code>{/each}
              </div>
            </div>
            <div><span>更新口径</span><strong>{source.frequency} · 最近完整交易日</strong></div>
            <div><span>上游接口</span><strong>{source.apis.join(' · ')}</strong></div>
          </div>
          {#if source.state.status === 'running'}<div class="sync-progress" role="status">
              <div><i style={`width:${source.state.progress ?? 1}%`}></i></div>
              <span>{source.state.message}</span>
            </div>{:else}<div
              class="source-sync-summary"
              class:source-sync-error={source.state.status === 'error'}
            >
              <span>{source.state.message}</span>{#if source.state.as_of}<b
                  >{source.state.as_of} · {source.state.records?.toLocaleString()} 条 · v{source.dataset_revision}</b
                >{/if}
            </div>{/if}
          <footer>
            <button
              class="button primary inline-primary"
              disabled={source.state.status === 'running'}
              onclick={() => sync(source.id)}
              ><RefreshCw
                size={14}
                class={source.state.status === 'running' ? 'spinning' : ''}
              />{source.state.status === 'running'
                ? '同步中…'
                : source.has_dataset
                  ? '同步最新数据'
                  : '接入并同步'}</button
            ><button
              class="button"
              disabled={!source.has_dataset}
              onclick={() => onopen(source.dataset_id)}>查看数据集<ArrowRight size={14} /></button
            >{#if source.state.updated_at}<small>{formatTime(source.state.updated_at)}</small>{/if}
          </footer>
        </article>{/each}
    </div>{/if}
  <p class="page-note">
    同步在后端执行，离开页面也会继续。失败时保留上次成功快照；同步数据只读，可复制为可编辑数据集。
  </p>
</section>
