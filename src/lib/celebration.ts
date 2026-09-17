/** Tiny "you did it" feedback for moments like finishing onboarding or acing a quiz. */

/** Plays a short, synthesized two-note chime. No audio asset needed. Silently no-ops if audio is unavailable/blocked. */
export function playSuccessChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes: [number, number][] = [[523.25, 0], [783.99, 0.09]]; // C5 then G5
    for (const [freq, delay] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.34);
    }
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* audio is a nice-to-have, never block on it */
  }
}

/** Short haptic pulse on devices that support it (most mobile browsers; no-op elsewhere). */
export function hapticPulse(pattern: number | number[] = [12, 40, 18]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration is a nice-to-have */
  }
}

/** Fires both together — the standard "you're done!" moment. */
export function celebrate() {
  playSuccessChime();
  hapticPulse();
}
