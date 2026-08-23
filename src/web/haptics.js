/**
 * Vibration wrapper, settings-gated. iOS Safari ignores navigator.vibrate;
 * Android gets the patterns.
 */

export function createHaptics(hapticsEnabled) {
  const patterns = {
    pop: 10,
    special: 22,
    blast: [12, 30, 24],
    reject: 8,
    shuffle: [15, 30, 15],
    win: [30, 60, 30, 60, 90],
    lose: [60, 40, 60],
  };

  return {
    buzz(name) {
      if (!hapticsEnabled()) return;
      const pattern = patterns[name];
      if (pattern && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    },
  };
}
