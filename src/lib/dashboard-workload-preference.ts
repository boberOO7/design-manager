export const WORKLOAD_CAPACITY_KEY = "dashboard-workload-visible-rows";
export const WORKLOAD_CAPACITY_PROPERTY = "--dashboard-workload-visible-rows";
export const DEFAULT_WORKLOAD_ROWS = 10;
export const MIN_WORKLOAD_ROWS = 4;
export const MAX_WORKLOAD_ROWS = 15;

export function readWorkloadCapacity() {
  try {
    const value = localStorage.getItem(WORKLOAD_CAPACITY_KEY);
    const rows = value === null ? NaN : Number(value);
    return Number.isInteger(rows) ? Math.max(MIN_WORKLOAD_ROWS, Math.min(MAX_WORKLOAD_ROWS, rows)) : DEFAULT_WORKLOAD_ROWS;
  } catch {
    return DEFAULT_WORKLOAD_ROWS;
  }
}

export function applyWorkloadCapacity(rows: number) {
  document.documentElement.style.setProperty(WORKLOAD_CAPACITY_PROPERTY, String(rows));
}

export function saveWorkloadCapacity(rows: number) {
  applyWorkloadCapacity(rows);
  try { localStorage.setItem(WORKLOAD_CAPACITY_KEY, String(rows)); } catch { /* Resizing still works when storage is unavailable. */ }
}

// Parser-executed for document loads; client navigation uses the same preference.
export const workloadCapacityBootstrapScript = `(() => {
  try {
    const value = localStorage.getItem("${WORKLOAD_CAPACITY_KEY}");
    const rows = value === null ? NaN : Number(value);
    document.documentElement.style.setProperty("${WORKLOAD_CAPACITY_PROPERTY}", String(Number.isInteger(rows) ? Math.max(${MIN_WORKLOAD_ROWS}, Math.min(${MAX_WORKLOAD_ROWS}, rows)) : ${DEFAULT_WORKLOAD_ROWS}));
  } catch {}
})();`;
