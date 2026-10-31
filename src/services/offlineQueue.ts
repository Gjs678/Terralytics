// Lightweight offline-first helper for the driver app.
// Deliberately simple per the project brief: detect navigator.onLine,
// keep the last route cached, and queue blockage reports made while
// offline so they can sync automatically once connectivity returns.
import { mossamApi, type BlockageReportInput } from './api';

const QUEUE_KEY = 'mossam_offline_report_queue';
const ROUTE_CACHE_KEY = 'mossam_cached_route';

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function cacheActiveRoute(route: unknown) {
  try {
    localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(route));
  } catch (e) {
    // storage unavailable - non-fatal for a demo
  }
}

export function getCachedRoute<T>(): T | null {
  try {
    const raw = localStorage.getItem(ROUTE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    return null;
  }
}

function readQueue(): BlockageReportInput[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function writeQueue(queue: BlockageReportInput[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    // ignore
  }
}

export function queueReport(report: BlockageReportInput) {
  const queue = readQueue();
  queue.push(report);
  writeQueue(queue);
}

export function pendingReportCount(): number {
  return readQueue().length;
}

/** Try to submit a report immediately; if offline or the request fails,
 * queue it locally instead. Returns whether it was sent immediately. */
export async function submitOrQueueReport(report: BlockageReportInput): Promise<{ sent: boolean }> {
  if (!isOnline()) {
    queueReport(report);
    return { sent: false };
  }
  try {
    await mossamApi.submitBlockageReport(report);
    return { sent: true };
  } catch (e) {
    queueReport(report);
    return { sent: false };
  }
}

/** Call this on reconnect (or periodically) to flush queued reports. */
export async function syncQueuedReports(): Promise<number> {
  if (!isOnline()) return 0;
  const queue = readQueue();
  if (queue.length === 0) return 0;

  const remaining: BlockageReportInput[] = [];
  let syncedCount = 0;
  for (const report of queue) {
    try {
      await mossamApi.submitBlockageReport(report);
      syncedCount += 1;
    } catch (e) {
      remaining.push(report);
    }
  }
  writeQueue(remaining);
  return syncedCount;
}
