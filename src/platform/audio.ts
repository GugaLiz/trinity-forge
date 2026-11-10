let context: AudioContext | undefined;
export function chime(
  kind: 'select' | 'forge' | 'catalyst' | 'rare' | 'rest' | 'working' | 'failure',
) {
  if (document.hidden) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    const notes =
      kind === 'working'
        ? [110, 146.83, 110]
        : kind === 'failure'
          ? [196, 164.81, 130.81]
          : kind === 'catalyst'
            ? [261.63, 392, 523.25, 659.25]
            : kind === 'rare'
              ? [392, 493.88, 587.33, 783.99]
              : kind === 'forge'
                ? [293.66, 440, 587.33]
                : [kind === 'rest' ? 220 : 440];
    notes.forEach((frequency, i) => {
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      const t = context!.currentTime + i * (kind === 'catalyst' ? 0.14 : 0.09);
      const sustain = kind === 'rare' ? 1.1 : kind === 'catalyst' ? 0.85 : 0.55;
      oscillator.type = kind === 'working' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(kind === 'working' ? 0.025 : 0.045, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + sustain);
      oscillator.connect(gain);
      gain.connect(context!.destination);
      oscillator.start(t);
      oscillator.stop(t + sustain + 0.05);
    });
  } catch {
    /* Sound is optional; gameplay remains available. */
  }
}
export function suspendAudio() {
  if (context?.state === 'running') void context.suspend();
}
