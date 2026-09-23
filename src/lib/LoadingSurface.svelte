<script lang="ts">
  let {
    height = 320,
    label = '正在加载数据',
    variant = 'chart',
  } = $props<{ height?: number; label?: string; variant?: 'chart' | 'table' | 'map' }>();
</script>

<div
  class={`loading-surface skeleton-${variant}`}
  style={`--skeleton-height:${height}px`}
  role="status"
  aria-label={label}
>
  <div class="skeleton-top"><span></span><i></i></div>
  {#if variant === 'map'}<div class="skeleton-map">
      {#each Array.from({ length: 12 }) as _, i}<i style={`--tile:${i}`}></i>{/each}
    </div>
  {:else if variant === 'table'}<div class="skeleton-rows">
      {#each Array.from({ length: 7 }) as _, i}<div>
          <i></i><span style={`width:${55 + (i % 3) * 14}%`}></span><b></b>
        </div>{/each}
    </div>
  {:else}<div class="skeleton-chart">
      <div></div>
      {#each [45, 62, 48, 78, 64, 88, 74, 95, 83, 104, 98, 118] as value}<i
          style={`height:${value}px`}
        ></i>{/each}
    </div>{/if}
  <span class="skeleton-caption">{label}</span>
</div>
