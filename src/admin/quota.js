export class QuotaTracker {
  constructor({ limit = 1000, warningThreshold = 800, criticalThreshold = 950 } = {}) {
    this.writesToday = 0;
    this.limit = limit;
    this.lastReset = '';
    this.warningThreshold = warningThreshold;
    this.criticalThreshold = criticalThreshold;
    this.supported = false;
    this.source = 'client-estimate';
    /* A2: lượt ĐỌC KV (trần free 100.000/ngày) — Worker đếm trong RAM nên đây là
       ước lượng; admin hiện cùng chỗ với phần ghi để thấy mức dùng thật. */
    this.readsToday = 0;
    this.readBudget = 100000;
    this.readWarn = false;
    this.readCritical = false;
    this.readSupported = false;
    this.listeners = new Set();
  }

  snapshot() {
    return {
      writesToday: this.writesToday,
      limit: this.limit,
      lastReset: this.lastReset,
      warningThreshold: this.warningThreshold,
      criticalThreshold: this.criticalThreshold,
      supported: this.supported,
      source: this.source,
      readsToday: this.readsToday,
      readBudget: this.readBudget,
      readWarn: this.readWarn,
      readCritical: this.readCritical,
      readSupported: this.readSupported,
    };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    const snap = this.snapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  async init(api) {
    if (!api || !api.kvStats) return this.snapshot();
    try {
      const stats = await api.kvStats();
      if (typeof stats.writesToday === 'number') {
        this.writesToday = Math.max(0, stats.writesToday);
        this.lastReset = stats.lastReset || '';
        this.supported = true;
        this.source = 'worker';
      } else {
        this.supported = false;
        this.source = 'worker-missing-counter';
      }
      /* Worker cũ chưa trả readsToday → để trống, KHÔNG hiện số 0 giả */
      if (typeof stats.readsToday === 'number') {
        this.readsToday = Math.max(0, stats.readsToday);
        this.readBudget = Math.max(1, Number(stats.readBudget) || 100000);
        this.readWarn = !!stats.readWarn || this.readsToday >= this.readBudget * 0.7;
        this.readCritical = !!stats.readCritical || this.readsToday >= this.readBudget * 0.9;
        this.readSupported = true;
      } else {
        this.readSupported = false;
      }
    } catch (e) {
      this.supported = false;
      this.source = 'unavailable';
    }
    this.notify();
    return this.snapshot();
  }

  trackWrite(cost = 1) {
    this.writesToday += Math.max(1, Number(cost) || 1);
    this.notify();
    return this.snapshot();
  }

  canProceed(operationCost = 1) {
    return this.writesToday + Math.max(1, Number(operationCost) || 1) <= this.limit;
  }

  level(operationCost = 0) {
    const value = this.writesToday + Math.max(0, Number(operationCost) || 0);
    if (value >= this.criticalThreshold) return 'critical';
    if (value >= this.warningThreshold) return 'warning';
    return 'ok';
  }

  /* Mức dùng lượt ĐỌC: 'ok' | 'warning' | 'critical' | 'unknown' */
  readLevel() {
    if (!this.readSupported) return 'unknown';
    if (this.readCritical) return 'critical';
    if (this.readWarn) return 'warning';
    return 'ok';
  }
}
