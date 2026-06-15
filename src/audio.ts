/* -------------------------------------------------------------
   Web Audio API Procedural Synthesizer for 3D Dice PWA
   ------------------------------------------------------------- */

class AudioEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  public effectsEnabled: boolean = true;
  private stretchOsc: OscillatorNode | null = null;
  private stretchGain: GainNode | null = null;
  public currentSurface: string = 'classic';

  constructor() {
    // AudioContext is initialized on first user interaction
  }

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Plays a procedural plastic thud/cink for dice collisions
  public playThud(intensity: number) {
    if (!this.enabled || intensity < 0.1) return;
    this.init();
    if (!this.ctx) return;

    let startFreq = 180, endFreq = 50;
    let clickStart = 800, clickEnd = 400;
    let volMod = 1.0;
    let durationMod = 1.0;

    switch (this.currentSurface) {
      case 'wood':
      case 'mahogany':
        startFreq = 350; endFreq = 120;
        clickStart = 1500; clickEnd = 600;
        volMod = 1.2; durationMod = 0.8;
        break;
      case 'concrete':
        startFreq = 600; endFreq = 200;
        clickStart = 2500; clickEnd = 1000;
        volMod = 1.4; durationMod = 0.5; // Ostrý, krátky a hlasnejší náraz
        break;
      case 'fleece':
        startFreq = 120; endFreq = 40;
        clickStart = 300; clickEnd = 100;
        volMod = 0.6; durationMod = 1.2; // Mäkký, tichší a dlhší tlmený dopad
        break;
    }

    const volume = Math.min(intensity * 0.15 * volMod, 0.8);
    const duration = (0.15 + Math.min(intensity * 0.05, 0.25)) * durationMod;
    const now = this.ctx.currentTime;

    // Bass Thud (Sine sweep)
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'sine';
    // Dynamický sweep frekvencie podľa povrchu
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + duration);

    // High frequency "click" (highpass noise or sharp envelope)
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();

    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(clickStart, now);
    clickOsc.frequency.linearRampToValueAtTime(clickEnd, now + 0.02);

    clickGain.gain.setValueAtTime(volume * 0.6, now);
    clickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.02);

    clickOsc.connect(clickGain);
    clickGain.connect(this.ctx.destination);

    clickOsc.start(now);
    clickOsc.stop(now + 0.03);
  }

  // Plays a rising pitch for rubber band stretch
  public playSlingshotStretch(dragDistance: number, maxDistance: number) {
    if (!this.enabled || !this.effectsEnabled) return;
    this.init();
    if (!this.ctx) return;

    const percent = Math.min(dragDistance / maxDistance, 1.0);
    const targetFreq = 120 + percent * 280; // 120Hz to 400Hz
    const now = this.ctx.currentTime;

    if (!this.stretchOsc) {
      this.stretchOsc = this.ctx.createOscillator();
      this.stretchGain = this.ctx.createGain();

      this.stretchOsc.type = 'triangle';
      this.stretchOsc.frequency.setValueAtTime(120, now);
      
      this.stretchGain.gain.setValueAtTime(0.01, now);
      this.stretchGain.gain.linearRampToValueAtTime(0.12, now + 0.1);

      this.stretchOsc.connect(this.stretchGain);
      this.stretchGain.connect(this.ctx.destination);
      this.stretchOsc.start(now);
    } else {
      // Smoothly slide the pitch up
      this.stretchOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);
      this.stretchGain!.gain.setTargetAtTime(0.02 + percent * 0.1, now, 0.05);
    }
  }

  public stopSlingshotStretch() {
    if (this.stretchOsc) {
      try {
        this.stretchOsc.stop();
      } catch (e) {}
      this.stretchOsc = null;
      this.stretchGain = null;
    }
  }

  // Slingshot snap/release sound
  public playSlingshotRelease() {
    this.stopSlingshotStretch();
    if (!this.enabled || !this.effectsEnabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    gainNode.gain.setValueAtTime(0.25, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Exploding dynamite sound (White noise + Low-pass sweep + Sub-bass boom)
  public playExplosion(intensity = 1.0) {
    if (!this.enabled || !this.effectsEnabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 0.5 + intensity * 0.7; // scaled duration

    // 1. Procedural White Noise Buffer
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(800 * intensity + 200, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(40 + 20 * (1 - intensity), now + 0.8 * duration);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5 * intensity, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noiseNode.start(now);
    noiseNode.stop(now + duration);

    // 2. Sub-bass boom
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(80 + 20 * intensity, now);
    subOsc.frequency.linearRampToValueAtTime(20, now + 0.3 * duration);

    subGain.gain.setValueAtTime(0.8 * intensity, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5 * duration);

    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);

    subOsc.start(now);
    subOsc.stop(now + 0.5 * duration);
  }

  // Gentle UI Click Sound
  public playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(300, now + 0.05);

    gainNode.gain.setValueAtTime(0.08, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Premium purchased retro fanfare (C4 -> E4 -> G4 -> C5 arpeggio)
  public playSuccess() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5

    notes.forEach((freq, idx) => {
      const time = now + idx * 0.12;
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      
      gainNode.gain.setValueAtTime(0.12, time);
      gainNode.gain.exponentialRampToValueAtTime(0.005, time + 0.3);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(time);
      osc.stop(time + 0.35);
    });
  }

  // Warning sound when attempting to roll a locked die
  public playLockedBuzzer() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 0.15;
    
    // Synthesize dry synthetic bzz (two low detuned sawtooth oscillators)
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(110, now); // A2 note

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(113, now); // slightly detuned for chorus fatness

    gainNode.gain.setValueAtTime(0.18, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  }
}

export const audio = new AudioEngine();
