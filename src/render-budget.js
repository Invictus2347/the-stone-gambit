// Bound render-target area on high-DPI/4K displays. CSS layout stays full size.
export function renderPixelRatio(width, height, deviceRatio = 1, scale = 1) {
  return Math.max(
    0.5,
    Math.min(deviceRatio, 1.25, Math.sqrt(1440000 / Math.max(1, width * height))) * scale,
  );
}

export class FrameBudget {
  constructor() {
    this.reset();
  }
  reset() {
    this.samples = 0;
    this.total = 0;
  }
  sample(ms) {
    if (!Number.isFinite(ms) || ms < 1 || ms > 250) return false;
    this.total += ms;
    this.samples++;
    if (this.samples < 90) return false;
    const slow = this.total / this.samples > 28;
    this.reset();
    return slow;
  }
}
