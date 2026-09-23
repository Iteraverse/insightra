<script lang="ts">
  import JsonTree from './JsonTree.svelte';
  import { untrack } from 'svelte';
  import { Plus, ChevronDown, ChevronRight, X } from '@lucide/svelte';
  import type { Json } from './dataset';
  let {
    value,
    path = [],
    label = '根节点',
    onchange,
    onremove,
    readonly = false,
  } = $props<{
    value: Json;
    path?: (string | number)[];
    label?: string;
    onchange: (path: (string | number)[], v: Json) => void;
    onremove: (path: (string | number)[]) => void;
    readonly?: boolean;
  }>();
  let expanded = $state(untrack(() => path.length === 0)),
    newKey = $state(''),
    adding = $state(false),
    error = $state('');
  let visibleCount = $state(100);
  const container = $derived(value !== null && typeof value === 'object');
  const type = $derived(value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);
  function scalar(text: string) {
    error = '';
    if (type === 'number') {
      if (!text.trim() || !Number.isFinite(Number(text))) {
        error = '请输入有限数值';
        return;
      }
      onchange(path, Number(text));
    } else onchange(path, text);
  }
  function add() {
    error = '';
    if (Array.isArray(value)) {
      onchange(path, [...value, '']);
    } else if (value && typeof value === 'object') {
      if (
        !newKey.trim() ||
        newKey in value ||
        ['__proto__', 'constructor', 'prototype'].includes(newKey)
      ) {
        error = '字段名为空、重复或属于保留名称';
        return;
      }
      onchange(path, { ...value, [newKey]: '' });
      newKey = '';
      adding = false;
    }
    expanded = true;
  }
  function changeType(t: string) {
    onchange(
      path,
      t === 'object'
        ? {}
        : t === 'array'
          ? []
          : t === 'null'
            ? null
            : t === 'number'
              ? 0
              : t === 'boolean'
                ? false
                : '',
    );
    expanded = true;
  }
</script>

<div class="json-tree-node">
  <div class="json-tree-row">
    {#if container}<button
        class="icon-button"
        aria-label={`${expanded ? '折叠' : '展开'} ${label}`}
        onclick={() => (expanded = !expanded)}
        >{#if expanded}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}</button
      >{:else}<span class="tree-leaf-indent"></span>{/if}
    <span class="json-key">{label}</span><select
      aria-label={`${path.join('.') || '根节点'} 类型`}
      value={type}
      disabled={readonly}
      onchange={(e) => changeType(e.currentTarget.value)}
      ><option>string</option><option>number</option><option>boolean</option><option>null</option
      ><option>object</option><option>array</option></select
    >
    {#if container}<span class="tree-count">{Object.keys(value!).length} 项</span><button
        class="icon-button"
        aria-label={`添加到 ${label}`}
        disabled={readonly}
        onclick={() => {
          if (Array.isArray(value)) add();
          else {
            adding = !adding;
            expanded = true;
          }
        }}><Plus size={13} /></button
      >
    {:else if type === 'boolean'}<input
        type="checkbox"
        disabled={readonly}
        aria-label={`编辑 ${path.join('.')}`}
        checked={value === true}
        onchange={(e) => onchange(path, e.currentTarget.checked)}
      />
    {:else if type === 'null'}<span class="null-value">null</span>
    {:else}<input
        class="tree-value-input"
        {readonly}
        aria-label={`编辑 ${path.join('.') || '根节点'}`}
        value={String(value)}
        onchange={(e) => scalar(e.currentTarget.value)}
      />{/if}
    {#if path.length}<button
        class="icon-button"
        aria-label={`删除 ${path.join('.')}`}
        disabled={readonly}
        onclick={() => onremove(path)}><X size={12} /></button
      >{/if}
  </div>
  {#if error}<p class="cell-error" role="alert">{error}</p>{/if}
  {#if expanded && container}<div class="json-children">
      {#each Object.entries(value!).slice(0, visibleCount) as [key, child]}<JsonTree
          value={child as Json}
          path={[...path, Array.isArray(value) ? Number(key) : key]}
          label={key}
          {onchange}
          {onremove}
          {readonly}
        />{/each}
      {#if Object.keys(value!).length > visibleCount}<button
          class="text-button"
          onclick={() => (visibleCount += 100)}
          >再显示 100 项（已显示 {visibleCount} / {Object.keys(value!).length}）</button
        >{/if}
      {#if adding}<form
          class="tree-add"
          onsubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            aria-label={`新字段 ${path.join('.') || '根节点'}`}
            placeholder="字段名称"
            bind:value={newKey}
          /><button class="button">添加字段</button>
        </form>{/if}
    </div>{/if}
</div>
