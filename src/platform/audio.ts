let context: AudioContext | undefined;
export function chime(kind: 'select' | 'forge' | 'rare' | 'rest' | 'working' | 'failure') {
  if (document.hidden) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    const notes =
      kind === 'working'
        ? [110, 146.83, 110]
        : kind === 'failure'
          ? [196, 164.81, 130.81]
          : kind === 'rare'
            ? [392, 493.88, 587.33, 783.99]
            : kind === 'forge'
              ? [293.66, 440, 587.33]
              : [kind === 'rest' ? 220 : 440];
    notes.forEach((frequency, i) => {
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      const t = context!.currentTime + i * 0.09;
      oscillator.type = kind === 'working' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(kind === 'working' ? 0.025 : 0.045, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      oscillator.connect(gain);
      gain.connect(context!.destination);
      oscillator.start(t);
      oscillator.stop(t + 0.6);
    });
  } catch {
    /* Sound is optional; gameplay remains available. */
  }
}
export function suspendAudio() {
  if (context?.state === 'running') void context.suspend();
}
