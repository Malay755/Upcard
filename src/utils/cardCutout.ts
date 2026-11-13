import { useEffect, useState } from 'react';

const cutoutCache = new Map<string, string>();
const inFlightCache = new Map<string, Promise<string>>();

/**
 * Checks whether a pixel is part of the baked neutral dark charcoal/gray checkerboard
 * background common in pre-rendered card exports.
 */
function isNeutralCheckerboardPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 25) return true;
  const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
  const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
  return maxC <= 135 && maxC - minC <= 20;
}

function processCardCutout(src: string): Promise<string> {
  const cached = cutoutCache.get(src);
  if (cached) return Promise.resolve(cached);

  const existing = inFlightCache.get(src);
  if (existing) return existing;

  const promise = new Promise<string>((resolve) => {
    if (typeof window === 'undefined' || !src || src.startsWith('data:image/svg')) {
      resolve(src);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';

    img.onload = () => {
      try {
        const natW = img.naturalWidth;
        const natH = img.naturalHeight;
        if (!natW || !natH) {
          resolve(src);
          return;
        }

        // Work at up to 768px max side for snappy first-paint & crisp UI rendering
        const maxSide = 768;
        const scale = Math.min(1, maxSide / Math.max(natW, natH));
        const w = Math.max(1, Math.round(natW * scale));
        const h = Math.max(1, Math.round(natH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(src);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Inspect corners: if already transparent, skip flood fill and just trim bounds
        const cornerIndices = [
          0,
          (w - 1) * 4,
          ((h - 1) * w) * 4,
          ((h - 1) * w + (w - 1)) * 4,
        ];
        const hasTransparentCorners = cornerIndices.every((idx) => data[idx + 3] < 245);
        const hasCheckerboardCorners = cornerIndices.some((idx) =>
          isNeutralCheckerboardPixel(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])
        );

        if (!hasTransparentCorners && hasCheckerboardCorners) {
          const total = w * h;
          const visited = new Uint8Array(total);
          const queue = new Int32Array(total);
          let head = 0;
          let tail = 0;

          const enqueue = (idx: number) => {
            if (visited[idx]) return;
            const p = idx * 4;
            if (isNeutralCheckerboardPixel(data[p], data[p + 1], data[p + 2], data[p + 3])) {
              visited[idx] = 1;
              queue[tail++] = idx;
            }
          };

          for (let x = 0; x < w; x++) {
            enqueue(x);
            enqueue((h - 1) * w + x);
          }
          for (let y = 1; y < h - 1; y++) {
            enqueue(y * w);
            enqueue(y * w + w - 1);
          }

          while (head < tail) {
            const idx = queue[head++];
            const x = idx % w;
            const y = (idx / w) | 0;
            if (x > 0) enqueue(idx - 1);
            if (x < w - 1) enqueue(idx + 1);
            if (y > 0) enqueue(idx - w);
            if (y < h - 1) enqueue(idx + w);
            // 8-connectivity clears tight 1px gaps between corner glints & frame border
            if (x > 0 && y > 0) enqueue(idx - w - 1);
            if (x < w - 1 && y > 0) enqueue(idx - w + 1);
            if (x > 0 && y < h - 1) enqueue(idx + w - 1);
            if (x < w - 1 && y < h - 1) enqueue(idx + w + 1);
          }

          // Clear isolated small neutral checkerboard triangles trapped behind upper/lower corner flares
          const cornerCompVisited = new Uint8Array(total);
          const compQueue = new Int32Array(total);
          const maxPocketSize = Math.floor(total * 0.012);
          for (let y = 0; y < h; y++) {
            const inCornerY = y < h * 0.28 || y > h * 0.72;
            if (!inCornerY) continue;
            for (let x = 0; x < w; x++) {
              const inCornerX = x < w * 0.28 || x > w * 0.72;
              if (!inCornerX) continue;
              const startIdx = y * w + x;
              if (visited[startIdx] || cornerCompVisited[startIdx]) continue;
              const p0 = startIdx * 4;
              if (!isNeutralCheckerboardPixel(data[p0], data[p0 + 1], data[p0 + 2], data[p0 + 3])) {
                continue;
              }
              let cHead = 0;
              let cTail = 0;
              cornerCompVisited[startIdx] = 1;
              compQueue[cTail++] = startIdx;
              let staysInCornerMargin = true;
              while (cHead < cTail) {
                const cIdx = compQueue[cHead++];
                const cx = cIdx % w;
                const cy = (cIdx / w) | 0;
                if (cx >= w * 0.3 && cx <= w * 0.7 && cy >= h * 0.3 && cy <= h * 0.7) {
                  staysInCornerMargin = false;
                }
                const neighbors = [
                  cx > 0 ? cIdx - 1 : -1,
                  cx < w - 1 ? cIdx + 1 : -1,
                  cy > 0 ? cIdx - w : -1,
                  cy < h - 1 ? cIdx + w : -1,
                ];
                for (const nIdx of neighbors) {
                  if (nIdx < 0 || visited[nIdx] || cornerCompVisited[nIdx]) continue;
                  const np = nIdx * 4;
                  if (isNeutralCheckerboardPixel(data[np], data[np + 1], data[np + 2], data[np + 3])) {
                    cornerCompVisited[nIdx] = 1;
                    compQueue[cTail++] = nIdx;
                  }
                }
              }
              if (staysInCornerMargin && cTail <= maxPocketSize) {
                for (let k = 0; k < cTail; k++) {
                  visited[compQueue[k]] = 1;
                  queue[tail++] = compQueue[k];
                }
              }
            }
          }

          // Clear visited checkerboard pixels
          for (let i = 0; i < tail; i++) {
            data[queue[i] * 4 + 3] = 0;
          }

          // 1px soft anti-alias feather on dark neutral boundary pixels touching erased bg
          for (let y = 1; y < h - 1; y++) {
            const row = y * w;
            for (let x = 1; x < w - 1; x++) {
              const idx = row + x;
              if (visited[idx]) continue;
              const touchesBg =
                visited[idx - 1] || visited[idx + 1] || visited[idx - w] || visited[idx + w];
              if (!touchesBg) continue;
              const p = idx * 4;
              const r = data[p];
              const g = data[p + 1];
              const b = data[p + 2];
              const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
              const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
              if (maxC <= 155 && maxC - minC <= 28) {
                data[p + 3] = Math.round(data[p + 3] * 0.42);
              }
            }
          }

          ctx.putImageData(imgData, 0, 0);
        }

        // Compute tight bounding box of visible artwork so differently padded exports scale uniformly
        let minX = w;
        let minY = h;
        let maxX = 0;
        let maxY = 0;
        for (let y = 0; y < h; y++) {
          const row = y * w;
          for (let x = 0; x < w; x++) {
            if (data[(row + x) * 4 + 3] > 16) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (maxX <= minX || maxY <= minY) {
          resolve(src);
          return;
        }

        const pad = 4;
        const sx = Math.max(0, minX - pad);
        const sy = Math.max(0, minY - pad);
        const sw = Math.min(w - sx, maxX - minX + 1 + pad * 2);
        const sh = Math.min(h - sy, maxY - minY + 1 + pad * 2);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = sw;
        outCanvas.height = sh;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) {
          resolve(src);
          return;
        }
        outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        outCanvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            cutoutCache.set(src, url);
            resolve(url);
          } else {
            const dataUrl = outCanvas.toDataURL('image/png');
            cutoutCache.set(src, dataUrl);
            resolve(dataUrl);
          }
        }, 'image/png');
      } catch {
        resolve(src);
      }
    };

    img.onerror = () => resolve(src);
    img.src = src;
  }).finally(() => {
    inFlightCache.delete(src);
  });

  inFlightCache.set(src, promise);
  return promise;
}

/**
 * Strips baked dark checkerboard borders and crops tight around finished card PNGs.
 * Results are cached globally so repeated renders (grids, roulettes, modals) are instant.
 */
export function useCleanCardImage(src: string): { displayUrl: string; ready: boolean } {
  const [cutUrl, setCutUrl] = useState<string>(() => cutoutCache.get(src) ?? src);
  const [ready, setReady] = useState<boolean>(() => !src || cutoutCache.has(src));

  useEffect(() => {
    if (!src) {
      setCutUrl('');
      setReady(true);
      return;
    }

    const cached = cutoutCache.get(src);
    if (cached) {
      setCutUrl(cached);
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);
    processCardCutout(src).then((result) => {
      if (!cancelled) {
        setCutUrl(result);
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return { displayUrl: cutUrl, ready };
}
