export const initialState = {
  mode: '',              // key | login | local
  role: '',
  permissions: [],
  online: false,
  apiBase: '',
  worker: null,
  registry: null,
  loading: false,
  error: '',
  stats: { items: {}, days: [], updatedAt: '', loaded: false },
  reports: { count: 0, items: [], loaded: false },
  comments: { count: 0, items: [], loaded: false },
  quota: { writesToday: 0, limit: 1000, warningThreshold: 800, criticalThreshold: 950, lastReset: '', source: 'client-estimate', supported: false },
};

export class AdminStore {
  constructor(seed = {}) {
    this.state = Object.assign({}, initialState, seed);
    this.listeners = new Set();
  }

  getState() { return this.state; }

  setState(patch) {
    this.state = Object.assign({}, this.state, patch || {});
    this.listeners.forEach((fn) => fn(this.state));
  }

  update(fn) {
    this.setState(fn(this.state));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export function createAdminStore(seed) {
  return new AdminStore(seed);
}
