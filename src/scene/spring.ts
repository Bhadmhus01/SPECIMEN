/** A damped spring for juicy, physical-feeling wobbles (shell rocking, pot squash). */
export class Spring {
  x = 0;
  v = 0;
  private readonly k: number;
  private readonly c: number;

  /** Defaults give a ~2.5 Hz wobble that settles in well under a second. */
  constructor(stiffness = 260, damping = 14) {
    this.k = stiffness;
    this.c = damping;
  }

  /** Kick the spring with a velocity impulse. */
  poke(v: number): void {
    this.v += v;
  }

  reset(): void {
    this.x = 0;
    this.v = 0;
  }

  step(dt: number): void {
    // sub-step so a long frame cannot make the integration blow up
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * this.x - this.c * this.v) * h;
      this.x += this.v * h;
    }
  }
}
