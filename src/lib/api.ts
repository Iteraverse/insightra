export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: options.signal ?? AbortSignal.timeout(30000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('服务返回了无效响应，请确认后端已启动。');
  }
  if (!response.ok)
    throw new Error(typeof data.detail === 'string' ? data.detail : '请求失败，请稍后重试。');
  return data as T;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '请求失败，请重试。';
export type CheckResult = {
  ok: boolean;
  status: string;
  message: string;
  api_name: string;
  latency_ms: number;
  checked_at: string;
  row_count?: number;
  rows?: Record<string, unknown>[];
};
export type DailyRow = {
  trade_date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  pct_chg: number;
  vol: number;
};
export type MarketResult = {
  ok: boolean;
  status: string;
  message: string;
  rows: DailyRow[];
  source: string;
  adjustment: string;
  fetched_at: string;
  cached: boolean;
  stale: boolean;
  symbol: string;
};
export const formatTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', { hour12: false });
