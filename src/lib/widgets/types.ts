export type PricePoint = { trade_date: string; close: number; vol?: number | null };
export type MarketRow = {
  open?: number | null;
  high?: number | null;
  low?: number | null;
  pre_close?: number | null;
  vol?: number | null;
  history?: PricePoint[];
  ts_code: string;
  name: string;
  industry: string;
  trade_date: string;
  close: number;
  pct_chg: number;
  amount: number | null;
  total_mv?: number | null;
};
export type IndexRow = {
  open?: number | null;
  high?: number | null;
  low?: number | null;
  pre_close?: number | null;
  vol?: number | null;
  ts_code: string;
  name: string;
  trade_date: string;
  close: number;
  pct_chg: number;
  amount?: number | null;
};
export type BoundDataset = {
  id: string;
  name: string;
  revision: number;
  data: MarketRow[] | IndexRow[];
  as_of?: string;
  source: string;
  schema?: string;
  updated_at: string;
  coverage?: Record<string, number>;
  warnings?: string[];
  read_only?: boolean;
};
export type WidgetKind =
  | 'market-map'
  | 'market-breadth'
  | 'industry-board'
  | 'index-board'
  | 'watchlist'
  | 'market-movers';
export type WidgetInstance = {
  id: string;
  kind: WidgetKind;
  sources: Record<string, string>;
  size: 'full' | 'wide' | 'half' | 'small';
  refresh_seconds?: number;
  options: {
    area: 'total_mv' | 'amount';
    symbols?: string[];
    height_units?: 2 | 3 | 4;
    trend_days?: 5 | 10 | 20 | 60;
  };
};
export type WidgetGroup = { id: string; title: string; widgets: WidgetInstance[] };
export type Board = { revision: number; groups: WidgetGroup[]; updated_at?: string };
export type WidgetDefinition = {
  schema: string;
  kind: WidgetKind;
  name: string;
  description: string;
  slot: string;
  required_fields: Record<string, string>;
  optional_fields: Record<string, string>;
  default_size: WidgetInstance['size'];
  datasets: {
    id: string;
    name: string;
    records: number;
    revision: number;
    compatible: boolean;
    reason: string;
    as_of?: string;
    read_only?: boolean;
  }[];
};
export type GroupTemplate = { id: string; group: WidgetGroup; created_at: string };
export type RefreshState = {
  data?: BoundDataset;
  loading: boolean;
  error?: string;
  completedAt?: number;
  successAt?: number;
  sourceId: string;
};
export const refreshChoices = [
  { value: 0, label: '手动刷新' },
  { value: 15, label: '每 15 秒' },
  { value: 30, label: '每 30 秒' },
  { value: 60, label: '每 1 分钟' },
  { value: 300, label: '每 5 分钟' },
  { value: 900, label: '每 15 分钟' },
  { value: 3600, label: '每 1 小时' },
];
export function datasetProblem(data: BoundDataset, definition: WidgetDefinition): string {
  if (data.schema !== definition.schema) return '数据口径不兼容，请重新绑定数据源。';
  if (!Array.isArray(data.data) || !data.data.length) return '数据集没有可用记录。';
  for (const row of data.data)
    for (const [key, type] of Object.entries(definition.required_fields)) {
      const value = (row as unknown as Record<string, unknown>)[key];
      if (key === 'amount' && value === null) continue;
      if (typeof value !== type || (type === 'number' && !Number.isFinite(value)))
        return `字段 ${key} 不符合组件要求。`;
    }
  if (
    data.schema === 'ashare.snapshot.v1' &&
    new Set(data.data.map((r) => r.trade_date)).size !== 1
  )
    return '股票快照必须来自同一交易日。';
  return '';
}
export const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
export const money = (value: number) =>
  value >= 1e12
    ? `${(value / 1e12).toFixed(2)} 万亿`
    : value >= 1e8
      ? `${(value / 1e8).toFixed(2)} 亿`
      : `${(value / 1e4).toFixed(0)} 万`;
export const cloneGroup = (group: WidgetGroup): WidgetGroup => ({
  ...structuredClone(group),
  id: crypto.randomUUID(),
  widgets: group.widgets.map((w) => ({ ...structuredClone(w), id: crypto.randomUUID() })),
});

export const widgetHeight = (widget: WidgetInstance) =>
  180 * (widget.options.height_units ?? (widget.kind === 'market-map' ? 3 : 2));
