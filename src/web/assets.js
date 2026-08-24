/**
 * Raster asset registry. assets/manifest.json maps asset keys
 * ('candy/red', 'bg/meadow', 'mascot/frost/cheer', 'logo') to image files;
 * loadAssets() fetches the manifest and preloads every image it names.
 *
 * The registry is deliberately source-agnostic and partial-tolerant: any
 * key that is missing, fails to fetch, or fails to decode simply stays
 * absent, and every consumer falls back to its programmatic drawing. The
 * game boots and plays identically with no manifest at all — swap in
 * higher-quality renders (hand-drawn, AI-generated, …) by replacing files
 * and keys, never by touching code.
 */

/** @type {Map<string, HTMLImageElement>} */
const images = new Map();

/** Fetch the manifest and preload all images. Never rejects. */
export async function loadAssets(base = 'assets/') {
  let manifest;
  try {
    const res = await fetch(`${base}manifest.json`);
    if (!res.ok) return;
    manifest = await res.json();
  } catch {
    return; // no manifest — fully programmatic mode
  }
  await Promise.all(
    Object.entries(manifest).map(
      ([key, rel]) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            images.set(key, img);
            resolve();
          };
          img.onerror = () => resolve(); // missing file → programmatic fallback
          img.src = base + rel;
        }),
    ),
  );
}

/** @returns {HTMLImageElement | null} */
export function getImage(key) {
  return images.get(key) ?? null;
}
