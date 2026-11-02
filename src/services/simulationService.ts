/**
 * Simulation Service
 * 
 * Manages vehicle movement simulation along high-resolution route geometry
 * using requestAnimationFrame, supporting Start, Pause, Resume, Reset controls,
 * and reporting real-time progress and destination arrival.
 */

export type SimulationStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface SimulationState {
  status: SimulationStatus;
  progressPercent: number; // 0 to 100
  currentPosition: { lat: number; lng: number } | null;
  currentIndex: number;
  totalPoints: number;
  deliveryReached: boolean;
  routeGeometry: { lat: number; lng: number }[];
}

export type SimulationListener = (state: SimulationState) => void;

const safeRequestAnimationFrame = (callback: (timestamp: number) => void): number => {
  if (typeof requestAnimationFrame !== 'undefined') {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(Date.now()), 16) as unknown as number;
};

const safeCancelAnimationFrame = (id: number): void => {
  if (typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
};

export class SimulationService {
  private status: SimulationStatus = 'idle';
  private routeGeometry: { lat: number; lng: number }[] = [];
  private currentIndex: number = 0;
  private currentPosition: { lat: number; lng: number } | null = null;
  private deliveryReached: boolean = false;
  private listeners: Set<SimulationListener> = new Set();
  private rafId: number | null = null;
  private lastTimestamp: number = 0;
  // Step interval in ms between coordinate increments
  private stepIntervalMs: number = 100;
  private accumulatedTimeMs: number = 0;

  constructor(routeGeometry?: { lat: number; lng: number }[]) {
    if (routeGeometry && routeGeometry.length > 0) {
      this.setGeometry(routeGeometry);
    }
  }

  /**
   * Sets new route geometry and resets progress to start point.
   */
  setGeometry(geometry: { lat: number; lng: number }[]): void {
    this.stopAnimationLoop();
    this.routeGeometry = Array.isArray(geometry) ? [...geometry] : [];
    this.currentIndex = 0;
    this.currentPosition = this.routeGeometry[0] ? { ...this.routeGeometry[0] } : null;
    this.deliveryReached = false;
    this.status = 'idle';
    this.notify();
  }

  /**
   * Returns current snapshot of simulation state.
   */
  getState(): SimulationState {
    const total = this.routeGeometry.length;
    const percent = total > 1 ? Math.min(100, Math.round((this.currentIndex / (total - 1)) * 100)) : (this.deliveryReached ? 100 : 0);

    return {
      status: this.status,
      progressPercent: percent,
      currentPosition: this.currentPosition,
      currentIndex: this.currentIndex,
      totalPoints: total,
      deliveryReached: this.deliveryReached,
      routeGeometry: this.routeGeometry,
    };
  }

  /**
   * Subscribes a listener to simulation state changes.
   * Returns an unsubscribe callback.
   */
  subscribe(listener: SimulationListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }

  /**
   * Starts simulation from the beginning or current position.
   */
  start(): void {
    if (this.routeGeometry.length === 0) return;

    if (this.status === 'completed') {
      this.currentIndex = 0;
      this.deliveryReached = false;
    }

    this.status = 'running';
    this.accumulatedTimeMs = 0;
    this.lastTimestamp = 0;
    this.startAnimationLoop();
    this.notify();
  }

  /**
   * Pauses the simulation.
   */
  pause(): void {
    if (this.status !== 'running') return;
    this.stopAnimationLoop();
    this.status = 'paused';
    this.notify();
  }

  /**
   * Resumes a paused simulation.
   */
  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.accumulatedTimeMs = 0;
    this.lastTimestamp = 0;
    this.startAnimationLoop();
    this.notify();
  }

  /**
   * Resets simulation to initial state at origin of current route.
   */
  reset(): void {
    this.stopAnimationLoop();
    this.currentIndex = 0;
    this.currentPosition = this.routeGeometry[0] ? { ...this.routeGeometry[0] } : null;
    this.deliveryReached = false;
    this.status = 'idle';
    this.notify();
  }

  /**
   * Animation frame loop driving vehicle progression.
   */
  private startAnimationLoop(): void {
    this.stopAnimationLoop();

    const step = (timestamp: number) => {
      if (this.status !== 'running') return;

      if (!this.lastTimestamp) {
        this.lastTimestamp = timestamp;
      }

      const delta = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;
      this.accumulatedTimeMs += delta;

      // Advance one or more steps based on accumulated delta time
      while (this.accumulatedTimeMs >= this.stepIntervalMs) {
        this.accumulatedTimeMs -= this.stepIntervalMs;

        if (this.currentIndex < this.routeGeometry.length - 1) {
          this.currentIndex++;
          this.currentPosition = { ...this.routeGeometry[this.currentIndex] };
        } else {
          // Reached destination
          this.currentIndex = this.routeGeometry.length - 1;
          this.currentPosition = { ...this.routeGeometry[this.currentIndex] };
          this.deliveryReached = true;
          this.status = 'completed';
          this.stopAnimationLoop();
          this.notify();
          return;
        }
      }

      this.notify();

      if (this.status === 'running') {
        this.rafId = safeRequestAnimationFrame(step);
      }
    };

    this.rafId = safeRequestAnimationFrame(step);
  }

  private stopAnimationLoop(): void {
    if (this.rafId !== null) {
      safeCancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTimestamp = 0;
    this.accumulatedTimeMs = 0;
  }

  /**
   * Clean up all timers and listeners when unmounting.
   */
  destroy(): void {
    this.stopAnimationLoop();
    this.listeners.clear();
  }
}

export const simulationService = new SimulationService();
