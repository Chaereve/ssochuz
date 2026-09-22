export class QuotaTracker {
  constructor({ limit = 1000, warningThreshold = 800, criticalThreshold = 950 } = {}) {
    this.writesToday = 0;
    this.limit = limit;
    this.lastReset = '';
    this.warningThreshold = warningThreshold;
    this.criticalThreshold = criticalThreshold;
    this.supported = false;
    this.source = 'client-estimate';
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
}
