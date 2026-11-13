import type { Rarity } from '../types';

// Procedural Web Audio API sound engine + normalized duration-aware Legendary voice lines

const LEGENDARY_VOICE_CLIPS = [
  '/assets/aistudio/audio_2026-11-13_01-13-58__mp3cut.net__61a9b56d.mp3',
  '/assets/aistudio/video__online-audio-converter__mp3cut.net__843c5eac.mp3',
];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private shortClickNoise: AudioBuffer | null = null;
  private whooshNoise: AudioBuffer | null = null;
  private legendaryBuffers: (AudioBuffer | null)[] = [null, null];
  private preloadStarted = false;
  public muted = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.preloadStarted) {
      this.preloadStarted = true;
      this.preloadLegendaryVoices(this.ctx).catch(() => {});
    }
    return this.ctx;
  }

  private async preloadLegendaryVoices(ctx: AudioContext): Promise<void> {
    await Promise.all(
      LEGENDARY_VOICE_CLIPS.map(async (url, idx) => {
        if (this.legendaryBuffers[idx]) return;
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arr);
          this.legendaryBuffers[idx] = decoded;
        } catch {
          // Ignore network/decode errors in headless environments
        }
      })
    );
  }

  private getShortClickNoise(ctx: AudioContext): AudioBuffer {
    if (this.shortClickNoise && this.shortClickNoise.sampleRate === ctx.sampleRate) {
      return this.shortClickNoise;
    }
    const length = Math.floor(ctx.sampleRate * 0.032);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.22));
    }
    this.shortClickNoise = buffer;
    return buffer;
  }

  private getWhooshNoise(ctx: AudioContext): AudioBuffer {
    if (this.whooshNoise && this.whooshNoise.sampleRate === ctx.sampleRate) {
      return this.whooshNoise;
    }
    const length = Math.floor(ctx.sampleRate * 0.45);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const env = Math.sin((i / length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    this.whooshNoise = buffer;
    return buffer;
  }

  /**
   * Unified tactile mechanical tick used identically for BOTH Case Tape & Upgrader Wheel
   * (165Hz warm mechanical body thump + 2.5kHz crisp latch click)
   */
  public playCaseTick(progress = 0) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Crisp mechanical latch transient (2200-2600 Hz)
    const noise = ctx.createBufferSource();
    noise.buffer = this.getShortClickNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2600 - progress * 650, now);
    bp.Q.setValueAtTime(2.6, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.11, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);

    // 2. Warm mechanical body thump (175 Hz -> 88 Hz)
    const body = ctx.createOscillator();
    const bGain = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(175 - progress * 30, now);
    body.frequency.exponentialRampToValueAtTime(88, now + 0.028);

    bGain.gain.setValueAtTime(0.11, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    body.connect(bGain);
    bGain.connect(ctx.destination);
    body.start(now);
    body.stop(now + 0.034);
  }

  /**
   * Upgrader wheel uses the EXACT same mechanical tick sound as the case roulette
   */
  public playRouletteTick(progress = 0) {
    this.playCaseTick(progress);
  }

  /**
   * Heavy physical crate drop-slam impact sound synced to the 3D case landing on the floor
   */
  public playCaseDropThud() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Sub-bass concrete floor thud (92 Hz -> 34 Hz)
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(92, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.22);
    subGain.gain.setValueAtTime(0.28, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    sub.connect(subGain).connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.36);

    // 2. Hollow polymer shell resonance (155 Hz -> 72 Hz)
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(155, now);
    body.frequency.exponentialRampToValueAtTime(72, now + 0.14);
    bodyGain.gain.setValueAtTime(0.14, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    body.connect(bodyGain).connect(ctx.destination);
    body.start(now);
    body.stop(now + 0.2);

    // 3. Secondary bounce micro-thud (~145ms later) & latch clack
    const bounceAt = now + 0.145;
    const bOsc = ctx.createOscillator();
    const bGain = ctx.createGain();
    bOsc.type = 'sine';
    bOsc.frequency.setValueAtTime(78, bounceAt);
    bOsc.frequency.exponentialRampToValueAtTime(38, bounceAt + 0.12);
    bGain.gain.setValueAtTime(0.09, bounceAt);
    bGain.gain.exponentialRampToValueAtTime(0.001, bounceAt + 0.15);
    bOsc.connect(bGain).connect(ctx.destination);
    bOsc.start(bounceAt);
    bOsc.stop(bounceAt + 0.17);

    const rattle = ctx.createBufferSource();
    rattle.buffer = this.getShortClickNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1450, now);
    bp.Q.setValueAtTime(2.0, now);
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(0.08, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    rattle.connect(bp).connect(rGain).connect(ctx.destination);
    rattle.start(now);
  }

  /**
   * Metallic clasp snaps + heavy hinge motion + golden radiance swell synced to CS2 90° opening
   */
  public playCaseLidOpen() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Dual heavy steel cam latches snapping open sequentially
    [0, 0.085].forEach((offset, i) => {
      const t = now + offset;
      const noise = ctx.createBufferSource();
      noise.buffer = this.getShortClickNoise(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2450 + i * 320, t);
      bp.Q.setValueAtTime(3.0, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.13, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.032);
      noise.connect(bp).connect(g).connect(ctx.destination);
      noise.start(t);

      const clank = ctx.createOscillator();
      const cg = ctx.createGain();
      clank.type = 'triangle';
      clank.frequency.setValueAtTime(420 + i * 70, t);
      clank.frequency.exponentialRampToValueAtTime(160, t + 0.045);
      cg.gain.setValueAtTime(0.08, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      clank.connect(cg).connect(ctx.destination);
      clank.start(t);
      clank.stop(t + 0.055);
    });

    // 2. Heavy lid pneumatic hinge & air movement (0.18s -> 0.85s)
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.getWhooshNoise(ctx);
    const bpHiss = ctx.createBiquadFilter();
    bpHiss.type = 'bandpass';
    bpHiss.frequency.setValueAtTime(620, now + 0.16);
    bpHiss.frequency.exponentialRampToValueAtTime(1950, now + 0.65);
    bpHiss.Q.setValueAtTime(1.1, now + 0.16);
    const hGain = ctx.createGain();
    hGain.gain.setValueAtTime(0.001, now + 0.16);
    hGain.gain.linearRampToValueAtTime(0.065, now + 0.34);
    hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    hiss.connect(bpHiss).connect(hGain).connect(ctx.destination);
    hiss.start(now + 0.16);

    // 3. Golden-orange glow harmonic swell as case reaches 90 degrees
    [220, 329.63].forEach((freq) => {
      const glowOsc = ctx.createOscillator();
      const glowGain = ctx.createGain();
      glowOsc.type = 'sine';
      glowOsc.frequency.setValueAtTime(freq, now + 0.28);
      glowGain.gain.setValueAtTime(0.001, now + 0.28);
      glowGain.gain.linearRampToValueAtTime(0.032, now + 0.65);
      glowGain.gain.exponentialRampToValueAtTime(0.001, now + 1.18);
      glowOsc.connect(glowGain).connect(ctx.destination);
      glowOsc.start(now + 0.28);
      glowOsc.stop(now + 1.22);
    });
  }

  /**
   * Custom synthesized item drop sound synced to the exact stop frame
   */
  public playItemDropSound(rarity: Rarity = 'rare') {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Airy shimmer whoosh + latch attack
    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhooshNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, now);
    bp.frequency.exponentialRampToValueAtTime(3600, now + 0.14);
    bp.Q.setValueAtTime(1.6, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.09, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);

    // 2. Deep warm sub-bass impact tail (112Hz -> 48Hz)
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(112, now);
    sub.frequency.exponentialRampToValueAtTime(48, now + 0.55);
    subGain.gain.setValueAtTime(0.22, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.88);

    // 3. Rarity-tuned chime
    const notesByRarity: Record<Rarity, number[]> = {
      common: [587.33, 880],
      rare: [523.25, 659.25, 1046.5],
      epic: [440, 659.25, 880, 1318.5],
      legendary: [587.33, 880, 1174.66, 1479.98],
    };

    const notes = notesByRarity[rarity] ?? notesByRarity.rare;
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.065, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.58);
    });
  }

  /**
   * Computes RMS of a decoded AudioBuffer so quiet & loud clips play cleanly at balanced loudness
   */
  private computeBufferRms(buffer: AudioBuffer): number {
    const ch = buffer.getChannelData(0);
    let sumSq = 0;
    const step = Math.max(1, Math.floor(ch.length / 4000));
    let count = 0;
    for (let i = 0; i < ch.length; i += step) {
      sumSq += ch[i] * ch[i];
      count++;
    }
    return Math.sqrt(sumSq / Math.max(1, count));
  }

  /**
   * Plays one of the 2 user-supplied Legendary voice clips at random with duration-calculated
   * smooth fade-in and fade-out envelopes so every syllable is heard completely and cleanly,
   * paired with the 3D spin shimmer & golden landing chord.
   */
  public async playLegendaryRevealSound(): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;

    const chosenIdx = Math.random() < 0.5 ? 0 : 1;
    let buffer = this.legendaryBuffers[chosenIdx];

    if (!buffer) {
      try {
        const res = await fetch(LEGENDARY_VOICE_CLIPS[chosenIdx]);
        if (res.ok) {
          buffer = await ctx.decodeAudioData(await res.arrayBuffer());
          this.legendaryBuffers[chosenIdx] = buffer;
        }
      } catch {
        buffer = null;
      }
    }

    const now = ctx.currentTime;
    // Small lead-in delay prevents audio-context wake-up from clipping the opening consonant
    const startOffset = 0.035;
    let voiceDuration = 1.0;

    if (buffer && buffer.duration > 0.1) {
      voiceDuration = buffer.duration;
      const rms = this.computeBufferRms(buffer);
      // Normalize clip loudness to ~0.18 target RMS safely through a limiter/compressor
      const targetGain = Math.min(2.3, Math.max(0.85, 0.18 / Math.max(0.03, rms)));

      // Smooth proportional fade-in and fade-out calculated directly from clip duration
      // Fade-in: 5% of duration (clamped 30ms..55ms) so attack is click-free yet 100% intelligible
      // Fade-out: 14% of duration (clamped 95ms..160ms) finishing right at end of buffer so no words are cut off
      const fadeIn = Math.min(0.055, Math.max(0.03, voiceDuration * 0.05));
      const fadeOut = Math.min(0.16, Math.max(0.095, voiceDuration * 0.14));

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-10, now);
      compressor.knee.setValueAtTime(12, now);
      compressor.ratio.setValueAtTime(4, now);

      const playStart = now + startOffset;
      const playEnd = playStart + voiceDuration;
      const fadeOutStart = Math.max(playStart + fadeIn + 0.05, playEnd - fadeOut);

      // Build smooth S-curve cosine fade-in and cosine fade-out envelopes
      const steps = 16;
      const fadeInCurve = new Float32Array(steps);
      const fadeOutCurve = new Float32Array(steps);
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        // Smooth cosine half-bell (0 -> 1 and 1 -> 0)
        fadeInCurve[i] = targetGain * (0.5 - 0.5 * Math.cos(Math.PI * t));
        fadeOutCurve[i] = targetGain * (0.5 + 0.5 * Math.cos(Math.PI * t));
      }

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.setValueCurveAtTime(fadeInCurve, playStart, fadeIn);
      gainNode.gain.setValueAtTime(targetGain, playStart + fadeIn);
      gainNode.gain.setValueCurveAtTime(fadeOutCurve, fadeOutStart, fadeOut);
      gainNode.gain.setValueAtTime(0, playEnd + 0.01);

      source.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(ctx.destination);

      source.start(playStart);
      source.stop(playEnd + 0.02);
    }

    // Subtle soft spin shimmer during rotation that ducks under the voice and swells to a golden chord right after
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(105, now);
    sub.frequency.exponentialRampToValueAtTime(44, now + 0.9);
    subGain.gain.setValueAtTime(0.08, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 1.0);

    // Majestic golden settle chord blooming cleanly right as the voice phrase finishes and the card locks front-facing
    const chordStart = startOffset + voiceDuration + 0.05;
    const voices = [
      { freq: 293.66, delay: 0.0, peak: 0.04, dur: 1.8 },  // D4
      { freq: 440.0, delay: 0.08, peak: 0.04, dur: 1.7 },  // A4
      { freq: 587.33, delay: 0.16, peak: 0.045, dur: 1.6 }, // D5
      { freq: 739.99, delay: 0.26, peak: 0.045, dur: 1.5 }, // F#5
      { freq: 880.0, delay: 0.36, peak: 0.05, dur: 1.45 },  // A5
    ];

    voices.forEach(({ freq, delay, peak, dur }) => {
      const s = now + chordStart + delay;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, s);
      osc2.frequency.setValueAtTime(freq * 1.003, s);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, s);
      filter.frequency.exponentialRampToValueAtTime(3000, s + 0.4);
      filter.frequency.exponentialRampToValueAtTime(950, s + dur);

      gain.gain.setValueAtTime(0.001, s);
      gain.gain.linearRampToValueAtTime(peak, s + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, s + dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(s);
      osc2.start(s);
      osc1.stop(s + dur + 0.05);
      osc2.stop(s + dur + 0.05);
    });
  }

  public playWin(rarity: Rarity = 'rare') {
    this.playItemDropSound(rarity);
  }

  public playLoss() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.26);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playCoin() {
    const ctx = this.getContext();
    if (!ctx) return;
    [880, 1174.66].forEach((freq, i) => {
      const now = ctx.currentTime + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    });
  }

  public playWheelStart() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.14);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playWheelPinTick(velocityNorm: number) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const v = Math.max(0.05, Math.min(1, velocityNorm));

    const noise = ctx.createBufferSource();
    noise.buffer = this.getShortClickNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1750 + v * 1200, now);
    bp.Q.setValueAtTime(2.4, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.07 + v * 0.065, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

    noise.connect(bp).connect(nGain).connect(ctx.destination);
    noise.start(now);

    const body = ctx.createOscillator();
    const bGain = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(280 + v * 140, now);
    body.frequency.exponentialRampToValueAtTime(95, now + 0.028);
    bGain.gain.setValueAtTime(0.085 + v * 0.05, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    body.connect(bGain).connect(ctx.destination);
    body.start(now);
    body.stop(now + 0.035);
  }

  public playWheelWinFanfare(isJackpot: boolean) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = isJackpot
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, i) => {
      const start = now + i * 0.075;
      const osc = ctx.createOscillator();
      const shimmer = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      shimmer.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      shimmer.frequency.setValueAtTime(freq * 2, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.08, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.85);

      osc.connect(gain);
      shimmer.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      shimmer.start(start);
      osc.stop(start + 0.88);
      shimmer.stop(start + 0.88);
    });
  }
}

export const soundFX = new SoundEngine();
