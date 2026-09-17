// Lift shadow detail on small/touch displays without extra lights or render passes.
// Use the short edge for touch devices so rotating a phone retains the same look.
export function lightingProfile(width, height, coarsePointer = false) {
  const mobile = width < 650 || (coarsePointer && Math.min(width, height) < 900);
  return mobile
    ? { exposure: 1.65, environment: 0.8, hemisphere: 1.5, key: 3.4, fill: 2, fog: 0.01 }
    : { exposure: 1.02, environment: 0.3, hemisphere: 0.45, key: 2.8, fill: 0.75, fog: 0.021 };
}
