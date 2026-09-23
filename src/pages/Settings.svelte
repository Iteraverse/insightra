<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Check,
    KeyRound,
    RefreshCw,
    ShieldCheck,
    PlugZap,
    Clock3,
    AlertCircle,
  } from '@lucide/svelte';
  import { api, errorMessage, formatTime, type CheckResult } from '../lib/api';
  type Variable = { key: string; configured: boolean; masked: string; source: string };
  let variables = $state<Variable[]>([]),
    checks = $state<CheckResult[]>([]);
  let values = $state<Record<string, string>>({});
  let loading = $state(true),
    saving = $state(false),
    testing = $state(''),
    error = $state(''),
    message = $state('');
  let selectedApi = $state('trade_cal');
  const configured = $derived(variables.find((v) => v.key === 'TUSHARE_TOKEN')?.configured);
  const latest = $derived(checks[0]);
  async function load() {
    loading = true;
    error = '';
    try {
      const [config, history] = await Promise.all([
        api<{ variables: Variable[] }>('/settings'),
        api<{ checks: CheckResult[] }>('/connections'),
      ]);
      variables = config.variables;
      checks = history.checks;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }
  async function save() {
    saving = true;
    error = '';
    message = '';
    try {
      const updates = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value.trim()),
      );
      if (!Object.keys(updates).length) {
        message = '填写新值后再保存；留空会保留已有配置。';
        return;
      }
      const data = await api<{ variables: Variable[] }>('/settings', {
        method: 'PUT',
        body: JSON.stringify({ values: updates }),
      });
      variables = data.variables;
      values = {};
      checks = (await api<{ checks: CheckResult[] }>('/connections')).checks;
      message = '配置已保存；新请求立即生效。';
    } catch (e) {
      error = errorMessage(e);
    } finally {
      saving = false;
    }
  }
  async function test() {
    testing = selectedApi;
    error = '';
    message = '';
    try {
      const result = await api<CheckResult>(`/connections/tushare/test?api_name=${selectedApi}`, {
        method: 'POST',
      });
      checks = [result, ...checks].slice(0, 20);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      testing = '';
    }
  }
  onMount(load);
</script>

<main class="module-page">
  <section class="page-heading">
    <div>
      <div class="eyebrow">CONNECTIONS & ENVIRONMENT</div>
      <h1>连接你的数据世界<span class="heading-dot">。</span></h1>
      <p>集中管理凭证，让每一次连接都有可检查的结果。</p>
    </div>
    <span class="status-pill"><ShieldCheck size={14} />本机配置</span>
  </section>
  {#if error}<div class="message error" role="alert">
      <AlertCircle size={16} />{error}<button class="text-button" onclick={load}>重新加载</button>
    </div>{/if}
  {#if message}<div class="message success" role="status"><Check size={16} />{message}</div>{/if}
  <div class="settings-layout">
    <section class="surface-box">
      <div class="box-heading">
        <div>
          <h2>环境变量</h2>
          <p>密钥仅保存在后端，本页面不会回显原值。</p>
        </div>
        <KeyRound size={19} />
      </div>
      {#if loading}<div class="loading-state">读取本地配置…</div>{:else}
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {#each variables as variable}<div class="credential-field">
              <label for={variable.key}
                >{variable.key}<span class:connected={variable.configured} class="field-status"
                  >{variable.source === 'process'
                    ? '进程环境提供'
                    : variable.configured
                      ? '已配置'
                      : '未配置'}</span
                ></label
              ><input
                id={variable.key}
                type="password"
                autocomplete="new-password"
                spellcheck="false"
                disabled={variable.source === 'process' || saving || !!testing}
                bind:value={values[variable.key]}
                placeholder={variable.configured ? '•••••••• · 输入新值以替换' : '输入凭证'}
                maxlength="512"
              /><small
                >{variable.key.startsWith('BINANCE')
                  ? '预留配置 · 币安连接器尚未启用'
                  : '用于 Tushare Pro 的只读数据查询'}</small
              >
            </div>{/each}
          <div class="form-footer">
            <span>留空保留原值 · 不写入浏览器存储</span><button
              type="submit"
              class="button primary inline-primary"
              disabled={saving || !!testing}
              >{saving ? '保存中…' : '保存配置'}<Check size={14} /></button
            >
          </div>
        </form>{/if}
    </section>
    <section class="surface-box connection-box">
      <div class="box-heading">
        <div>
          <h2>接口可用性检验</h2>
          <p>按接口检验，不将单次成功视为所有权限可用。</p>
        </div>
        <PlugZap size={19} />
      </div>
      <div class="provider-heading">
        <span class="provider-logo">Tu</span>
        <div>
          <h3>Tushare Pro</h3>
          <span>A 股 · 交易日历 · 历史行情</span>
        </div>
        <span class="status-pill" class:status-good={configured}
          >{configured ? '凭证已配置' : '待配置'}</span
        >
      </div>
      <label class="field-label" for="test-api">检验接口</label><select
        id="test-api"
        bind:value={selectedApi}
        disabled={!!testing}
        ><option value="trade_cal">trade_cal · 最近 7 天交易日历</option><option value="daily"
          >daily · 平安银行最近 14 天日线</option
        ></select
      ><button
        class="button primary test-connection"
        disabled={!configured || !!testing || saving}
        onclick={test}
        ><RefreshCw size={15} class={testing ? 'spinning' : ''} />{testing
          ? '正在请求数据源…'
          : '检验接口'}</button
      >
      <div class="connection-path">
        <span class:step-done={configured}>本地配置</span><i></i><span class:step-done={!!latest}
          >接口请求</span
        ><i></i><span class:step-done={latest?.status === 'connected'}>数据返回</span>
      </div>
      {#if latest}<div
          class="check-result"
          class:result-ok={latest.status === 'connected'}
          role="status"
        >
          <strong
            >{latest.status === 'connected'
              ? '请求成功'
              : latest.status === 'permission_denied'
                ? '接口权限不足'
                : '请求未成功'}</strong
          >
          <p>{latest.message}</p>
          <div>
            <span>{latest.api_name}</span><span>{latest.latency_ms} ms</span><span
              >{formatTime(latest.checked_at)}</span
            >
          </div>
        </div>{:else}<div class="check-result">
          <strong>尚未检验</strong>
          <p>保存凭证后发起一次真实请求，查看权限与返回结果。</p>
        </div>{/if}
      <div class="provider-next">
        <span class="provider-logo binance-logo">B</span>
        <div>
          <h3>Binance</h3>
          <p>连接器待接入 · 当前不会发送请求或下单</p>
        </div>
      </div>
    </section>
  </div>
  <section class="surface-box history-box">
    <div class="box-heading">
      <div>
        <h2>连接记录</h2>
        <p>保留最近 20 次检验结果，失败原因同样可见。</p>
      </div>
      <Clock3 size={18} />
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>时间</th><th>接口</th><th>结果</th><th>耗时</th><th>说明</th></tr></thead
        ><tbody
          >{#each checks as check}<tr
              ><td>{formatTime(check.checked_at)}</td><td class="mono-text">{check.api_name}</td><td
                ><span class="status-pill" class:status-good={check.status === 'connected'}
                  >{check.status === 'connected' ? '可用' : '失败'}</span
                ></td
              ><td>{check.latency_ms} ms</td><td class="wrap-cell">{check.message}</td></tr
            >{:else}<tr><td colspan="5" class="table-empty">还没有连接记录</td></tr>{/each}</tbody
        >
      </table>
    </div>
  </section>
  <p class="page-note">配置保存于本机 .env 文件，未加密；已排除版本控制。当前服务仅供本机使用。</p>
</main>
