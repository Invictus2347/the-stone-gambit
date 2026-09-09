export class StoneAudio {
  constructor() {
    this.enabled = false;
    this.ctx = null;
  }
  async init(context) {
    if (!this.ctx) {
      this.ctx = context ?? new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -8;
      this.limiter.knee.value = 5;
      this.limiter.ratio.value = 10;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.22;
      this.master.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
      if (this.ctx.createMediaStreamDestination) {
        this.destination = this.ctx.createMediaStreamDestination();
        this.limiter.connect(this.destination);
      }
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      let seed = 53;
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        data[i] = (seed / 2147483647) * 2 - 1;
      }
    }
    if (!context) await this.ctx.resume();
    this.enabled = true;
    this.master.gain.value = 0.6;
  }
  mute() {
    this.enabled = false;
    if (this.master) this.master.gain.value = 0;
  }
  tone(freq, time, length, volume = 0.12) {
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, time);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, time + length);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(volume, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, time + length);
    o.connect(g);
    g.connect(this.master);
    o.start(time);
    o.stop(time + length);
    return o;
  }
  hit(time) {
    if (!this.enabled) return;
    const t = time ?? this.ctx.currentTime;
    this.tone(64, t, 0.7, 0.62);
    this.tone(128, t, 0.16, 0.1);
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2800, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 1.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.52, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    n.connect(f);
    f.connect(g);
    g.connect(this.master);
    n.start(t);
    n.stop(t + 1.8);
    // Dry initial crack, then irregular lower thuds and granular chips landing.
    for (let i = 0; i < 23; i++) {
      const delay = 0.06 + Math.pow(i / 22, 1.3) * 2.3,
        time = t + delay,
        source = this.ctx.createBufferSource(),
        filter = this.ctx.createBiquadFilter(),
        gain = this.ctx.createGain();
      source.buffer = this.noise;
      filter.type = 'bandpass';
      filter.frequency.value = 280 + (i % 7) * 340;
      filter.Q.value = 0.65;
      const amp = 0.16 * (1 - i / 27),
        length = 0.05 + (i % 4) * 0.031;
      gain.gain.setValueAtTime(amp, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + length);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(time, (i * 0.073) % 1);
      source.stop(time + length);
      if (i % 4 === 0) this.tone(75 + (i % 3) * 26, time, 0.18, amp * 0.7);
    }
    // Convolution tail gives the large stone chamber a broad, natural decay.
    if (!this.reverb) {
      this.reverb = this.ctx.createConvolver();
      const ir = this.ctx.createBuffer(2, this.ctx.sampleRate * 2.4, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < data.length; i++)
          data[i] =
            this.noise.getChannelData(0)[i % this.noise.length] *
            Math.pow(1 - i / data.length, 3) *
            0.13;
      }
      this.reverb.buffer = ir;
      this.reverb.connect(this.master);
    }
    g.connect(this.reverb);
  }
  slide(time) {
    if (!this.enabled) return;
    const t = time ?? this.ctx.currentTime,
      n = this.ctx.createBufferSource(),
      f = this.ctx.createBiquadFilter(),
      g = this.ctx.createGain();
    n.buffer = this.noise;
    n.loop = true;
    f.type = 'bandpass';
    f.frequency.value = 210;
    f.Q.value = 0.9;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2);
    n.connect(f);
    f.connect(g);
    g.connect(this.master);
    n.start(t);
    n.stop(t + 2);
  }
  swing(time) {
    if (!this.enabled) return;
    const t = time ?? this.ctx.currentTime,
      n = this.ctx.createBufferSource(),
      f = this.ctx.createBiquadFilter(),
      g = this.ctx.createGain();
    n.buffer = this.noise;
    f.type = 'bandpass';
    f.frequency.setValueAtTime(420, t);
    f.frequency.exponentialRampToValueAtTime(1900, t + 0.2);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    n.connect(f);
    f.connect(g);
    g.connect(this.master);
    n.start(t);
    n.stop(t + 0.35);
  }
  atmosphere(duration = 40, cues = [3.4, 8.7, 14, 19.3, 24.6, 29.9]) {
    this.stopAtmosphere();
    this.scoreNodes = [];
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    // Original sparse low-register score: tension and negative space, not constant beats.
    for (const hz of [41.2, 61.74, 82.4]) this.scoreNodes.push(this.tone(hz, t, duration, 0.018));
    for (const offset of cues) {
      this.scoreNodes.push(this.tone(48, t + offset, 0.65, 0.1));
      const n = this.ctx.createBufferSource(),
        f = this.ctx.createBiquadFilter(),
        g = this.ctx.createGain();
      n.buffer = this.noise;
      f.type = 'bandpass';
      f.frequency.value = 640;
      f.Q.value = 0.4;
      g.gain.setValueAtTime(0.001, t + offset);
      g.gain.exponentialRampToValueAtTime(0.065, t + offset + 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.65);
      n.connect(f);
      f.connect(g);
      g.connect(this.master);
      n.start(t + offset);
      n.stop(t + offset + 0.7);
      this.scoreNodes.push(n);
    }
  }
  stopAtmosphere() {
    for (const n of this.scoreNodes ?? []) {
      try {
        n.stop();
        n.disconnect();
      } catch {}
    }
    this.scoreNodes = [];
  }
}
