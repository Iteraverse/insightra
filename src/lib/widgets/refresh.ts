import type { BoundDataset, RefreshState } from './types';
export type RefreshConfig = { id: string; sourceId: string; interval: number; kind: string };

/** Independent widget clocks; concurrent requests share a dataset read. */
export class WidgetRefreshCoordinator {
  private configs = new Map<string, RefreshConfig>();
  private states = new Map<string, RefreshState>();
  private tickets = new Map<string, number>();
  private flights = new Map<
    string,
    { promise: Promise<{ data: BoundDataset; at: number }>; controller: AbortController }
  >();
  private cache = new Map<string, { data: BoundDataset; at: number }>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private alive = true;
  constructor(
    private read: (id: string, signal: AbortSignal) => Promise<BoundDataset>,
    private emit: (states: Record<string, RefreshState>) => void,
    private validate: (data: BoundDataset, config: RefreshConfig) => string,
    private visible = () => !document.hidden,
  ) {}
  start() {
    this.timer = setInterval(() => this.tick(), 1000);
  }
  configure(configs: RefreshConfig[]) {
    const wanted = new Set(configs.map((c) => c.id));
    for (const id of this.configs.keys())
      if (!wanted.has(id)) {
        this.configs.delete(id);
        this.states.delete(id);
        this.tickets.set(id, (this.tickets.get(id) ?? 0) + 1);
      }
    for (const config of configs) {
      const old = this.configs.get(config.id);
      this.configs.set(config.id, { ...config });
      if (!old || old.sourceId !== config.sourceId || old.kind !== config.kind) {
        this.tickets.set(config.id, (this.tickets.get(config.id) ?? 0) + 1);
        this.states.delete(config.id);
        void this.refresh(config.id, false);
      }
    }
    this.publish();
  }
  private publish() {
    if (this.alive) this.emit(Object.fromEntries(this.states));
  }
  private fetch(sourceId: string) {
    const running = this.flights.get(sourceId);
    if (running) return running.promise;
    const controller = new AbortController();
    const promise = this.read(sourceId, controller.signal)
      .then((data) => {
        const result = { data, at: Date.now() };
        this.cache.set(sourceId, result);
        return result;
      })
      .finally(() => this.flights.delete(sourceId));
    this.flights.set(sourceId, { promise, controller });
    return promise;
  }
  async refresh(id: string, force = true) {
    const config = this.configs.get(id);
    if (!config || !this.alive || this.states.get(id)?.loading) return;
    const ticket = (this.tickets.get(id) ?? 0) + 1;
    this.tickets.set(id, ticket);
    const previous = this.states.get(id);
    this.states.set(id, {
      ...previous,
      sourceId: config.sourceId,
      loading: true,
      error: undefined,
    });
    this.publish();
    try {
      const cached = this.cache.get(config.sourceId);
      const result =
        !force && cached && Date.now() - cached.at < Math.min(config.interval || 300, 300) * 1000
          ? cached
          : await this.fetch(config.sourceId);
      if (!this.alive || this.tickets.get(id) !== ticket) return;
      const problem = this.validate(result.data, config);
      if (problem) throw new Error(problem);
      this.states.set(id, {
        sourceId: config.sourceId,
        data: result.data,
        loading: false,
        completedAt: result.at,
        successAt: result.at,
      });
    } catch (error) {
      if (!this.alive || this.tickets.get(id) !== ticket) return;
      this.states.set(id, {
        ...previous,
        sourceId: config.sourceId,
        loading: false,
        error: error instanceof Error ? error.message : '刷新失败',
        completedAt: Date.now(),
      });
    }
    this.publish();
  }
  refreshAll() {
    return Promise.all([...this.configs.keys()].map((id) => this.refresh(id)));
  }
  tick() {
    if (!this.alive || !this.visible()) return;
    const now = Date.now();
    for (const config of this.configs.values()) {
      const state = this.states.get(config.id);
      if (
        config.interval > 0 &&
        state &&
        !state.loading &&
        now - (state.completedAt ?? 0) >= config.interval * 1000
      )
        void this.refresh(config.id);
    }
  }
  destroy() {
    this.alive = false;
    clearInterval(this.timer);
    for (const f of this.flights.values()) f.controller.abort();
    this.flights.clear();
    this.configs.clear();
    this.states.clear();
    this.cache.clear();
  }
}
