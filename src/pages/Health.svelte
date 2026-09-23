<script lang="ts">
  import {
    Activity,
    Moon,
    Footprints,
    ArrowUpRight,
    ArrowLeft,
    ArrowRight,
    Scale,
  } from '@lucide/svelte';
  import TimeSeries from '../lib/TimeSeries.svelte';
  let demo = $state(true),
    metric = $state('weight'),
    days = $state(30),
    day = $state(29);
  const records = Array.from({ length: 90 }, (_, i) => ({
    weight: 69.8 - i * 0.018 + Math.sin(i * 0.8) * 0.16,
    sleep: 7.2 + Math.sin(i * 0.72) * 0.7,
    steps: Math.round(7300 + Math.sin(i * 0.4) * 1900),
  }));
  const range = $derived(records.slice(-days));
  const index = $derived(Math.min(day, range.length - 1));
  const info = $derived(
    metric === 'weight'
      ? { name: '体重', unit: 'kg', color: 'var(--chart-green)' }
      : metric === 'sleep'
        ? { name: '睡眠', unit: '小时', color: 'var(--chart-purple)' }
        : { name: '活动步数', unit: '步', color: 'var(--chart-warm)' },
  );
  const values = $derived(range.map((r) => r[metric as keyof typeof r]));
  const latest = $derived(range.at(-1)!);
  const change = $derived(values.at(-1)! - values[0]);
  function selectMetric(value: string) {
    metric = value;
  }
</script>

<main class="health-journal">
  <header class="health-heading">
    <div>
      <span class="eyebrow">THE EVERYDAY / A PERSONAL JOURNAL</span>
      <h1>身体有自己的节奏。<br /><span>慢一点，看清它。</span></h1>
    </div>
    <div class="health-heading-aside">
      <span class="demo-pill">{demo ? '合成记录 · 设计示例' : '尚未接入'}</span>
      <p>不急着给每一天打分，<br />先看见时间留下的变化。</p>
      <button class="text-button" onclick={() => (demo = !demo)}
        >{demo ? '切换到我的数据' : '查看示例界面'}<ArrowUpRight size={14} /></button
      >
    </div>
  </header>
  {#if !demo}<section class="health-real-empty">
      <Activity size={36} />
      <h2>等待你的第一条健康记录</h2>
      <p>体重、睡眠和活动记录接入后，会在这里形成自己的时间轴。</p>
      <button class="button" onclick={() => (demo = true)}>查看示例界面</button>
    </section>
  {:else}<div class="health-main-layout">
      <section class="health-long-view">
        <div class="health-section-label">
          <span>01 / 长期观察</span>
          <div class="segment-control">
            {#each [7, 30, 90] as n}<button
                class:active={days === n}
                onclick={() => {
                  days = n;
                  day = n - 1;
                }}>{n} 天</button
              >{/each}
          </div>
        </div>
        <div class="health-metric-tabs">
          {#each [{ id: 'weight', name: '体重', icon: Scale }, { id: 'sleep', name: '睡眠', icon: Moon }, { id: 'steps', name: '活动', icon: Footprints }] as item}<button
              class:health-metric-selected={metric === item.id}
              onclick={() => selectMetric(item.id)}><item.icon size={16} />{item.name}</button
            >{/each}
        </div>
        <div class="health-value-story">
          <div>
            <strong
              >{values.at(-1)?.toLocaleString('zh-CN', {
                maximumFractionDigits: metric === 'steps' ? 0 : 1,
              })}</strong
            ><span>{info.unit}<small>最近一条示例记录</small></span>
          </div>
          <p>
            <b>{change > 0 ? '+' : ''}{change.toFixed(metric === 'steps' ? 0 : 1)} {info.unit}</b
            ><span>区间变化，仅描述趋势</span>
          </p>
        </div>
        <TimeSeries
          {values}
          labels={range.map((_, i) => `D${i + 1}`)}
          title={info.name}
          unit={info.unit}
          color={info.color}
        />
        <div class="health-chart-note">
          <span>每一个点，都是一次记录。</span><span>示例序列，不作健康评分</span>
        </div>
      </section>
      <aside class="health-rhythm">
        <div class="health-section-label"><span>02 / 生活节律</span><Moon size={16} /></div>
        <h2>好好休息，<br />也是日常的一部分。</h2>
        <div class="sleep-clock" aria-label="示例睡眠时长">
          <svg
            viewBox="0 0 220 220"
            role="img"
            aria-label={`最近示例睡眠 ${latest.sleep.toFixed(1)} 小时`}
            ><circle
              cx="110"
              cy="110"
              r="83"
              fill="none"
              stroke="var(--border)"
              stroke-width="11"
            />{#each Array.from({ length: 24 }) as _, i}<line
                x1={110 + Math.cos((i * Math.PI) / 12) * 99}
                y1={110 + Math.sin((i * Math.PI) / 12) * 99}
                x2={110 + Math.cos((i * Math.PI) / 12) * (i % 6 === 0 ? 106 : 103)}
                y2={110 + Math.sin((i * Math.PI) / 12) * (i % 6 === 0 ? 106 : 103)}
                stroke="var(--line)"
              />{/each}<circle
              cx="110"
              cy="110"
              r="83"
              fill="none"
              stroke="var(--chart-purple)"
              stroke-width="11"
              stroke-dasharray={`${(latest.sleep / 24) * 521.5} 521.5`}
              transform="rotate(-135 110 110)"
              stroke-linecap="round"
            /><text x="110" y="113" text-anchor="middle" class="sleep-value"
              >{latest.sleep.toFixed(1)}<tspan class="sleep-unit"> h</tspan></text
            ><text x="110" y="139" text-anchor="middle" class="sleep-caption">24 小时中的睡眠</text
            ></svg
          >
        </div>
        <div class="rhythm-reading">
          <span>最近活动</span><strong>{latest.steps.toLocaleString()}<small>步</small></strong>
        </div>
        <p class="rhythm-note">
          等待真实数据后，逐步建立属于你的基线。示例不代表个人目标或医学建议。
        </p>
      </aside>
    </div>
    <section class="health-observation-strip">
      <div class="health-strip-intro">
        <span class="eyebrow">03 / DAILY NOTES</span>
        <h2>把日子展开来看。</h2>
        <p>选择一天，在右侧查看当天记录。</p>
      </div>
      <div class="health-day-grid">
        {#each range as record, i}<button
            aria-label={`查看第${i + 1}天记录`}
            aria-pressed={index === i}
            class:day-selected={index === i}
            onclick={() => (day = i)}
            ><i style={`height:${18 + ((record.steps - 5000) / 4500) * 26}px`}></i><span
              >{i + 1}</span
            ></button
          >{/each}
      </div>
      <aside class="health-day-detail">
        <span>DAY {String(index + 1).padStart(2, '0')}</span>
        <div><span>体重</span><b>{range[index].weight.toFixed(1)} kg</b></div>
        <div><span>睡眠</span><b>{range[index].sleep.toFixed(1)} h</b></div>
        <div><span>活动</span><b>{range[index].steps.toLocaleString()} 步</b></div>
      </aside>
    </section>
    <footer class="health-source-footer">
      <span>等待接入：体重秤 / 健康数据导出 / 手动记录</span><span
        >当前全部为合成示例，不保存为个人记录</span
      >
    </footer>{/if}
</main>
