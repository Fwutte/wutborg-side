export class Audio {
  constructor(enabled = true) { this.enabled = enabled; this.context = null; }
  unlock() {
    if (!this.enabled) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context ||= new Context();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { /* Audio must never block the game. */ }
  }
  tone(hz, duration, delay = 0, type = 'triangle', volume = .05) {
    const c = this.context;
    if (!this.enabled || !c || c.state !== 'running') return;
    const o = c.createOscillator(), g = c.createGain(), time = c.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(hz, time);
    g.gain.setValueAtTime(.001, time); g.gain.linearRampToValueAtTime(volume, time + .012);
    g.gain.exponentialRampToValueAtTime(.001, time + duration);
    o.connect(g); g.connect(c.destination); o.start(time); o.stop(time + duration);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  play(kind) {
    if (kind === 'gain') [392, 494, 587].forEach((f, i) => this.tone(f, .2, i * .06));
    if (kind === 'start' || kind === 'siege') [196, 294, 392].forEach((f, i) => this.tone(f, .35, i * .11, 'triangle', .045));
    if (kind === 'won') [262, 330, 392, 523, 659].forEach((f, i) => this.tone(f, .5, i * .12));
    if (kind === 'lost') [196, 165, 131].forEach((f, i) => this.tone(f, .4, i * .17));
    if (kind === 'hit') { this.tone(80, .19, 0, 'sawtooth', .025); this.tone(55, .22, .015, 'sine', .08); }
    if (kind === 'shield') { this.tone(330, .3); this.tone(660, .35, .04, 'sine'); }
    if (kind === 'volley') [700, 900, 1100].forEach((f, i) => this.tone(f, .09, i * .035, 'sine', .025));
    if (kind === 'dodge') this.tone(780, .12, 0, 'sine', .025);
    if (kind === 'warning') this.tone(147, .12, 0, 'triangle', .035);
  }
  setEnabled(value) { this.enabled = value; if (value) this.unlock(); else this.context?.suspend().catch(() => {}); }
}
