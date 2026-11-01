import React, { useEffect, useRef, useState } from 'react';
import hourglassSrc from '../../assets/hourglass.png';

/**
 * AsciiCanvas — Recreates the "nnnnn" ASCII-art / dither hourglass effect from 21st.dev
 * (https://21st.dev/community/ascii?preview=%2Fcommunity%2Fascii%2Fnnnnn-6c21b46c-9b8f-4f27-ad7c-6492021cc00f)
 * using Canvas2D.
 *
 * Parameters from 21st.dev recipe:
 * - renderMode: "dither" | "characters"
 * - cellSize: 16 (or 12 for crispness)
 * - brightness: 12, contrast: 115
 * - animStyle: "wave", animSpeed: 100, animIntensity: 60
 * - pfx: vignette (intensity 38), bloom (intensity 25)
 */

// 4x4 Bayer Ordered Dither Matrix normalized [0, 1]
const BAYER_4X4 = [
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

const NNNNN_CHARS = [' ', '·', ':', 'n', 'N', 'M', '█'];

export default function AsciiCanvas({
  cellSize = 14,
  className = '',
  style = {},
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [renderMode, setRenderMode] = useState('dither'); // 'dither' | 'characters'
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animFrameId = null;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Load Hourglass source artwork
    const img = new Image();
    let imgLoaded = false;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgLoaded = true;
    };
    img.src = hourglassSrc;

    // Offscreen buffer for sampling the source artwork
    const offscreen = document.createElement('canvas');
    const offCtx = offscreen.getContext ? offscreen.getContext('2d', { willReadFrequently: true }) : null;

    function handleResize() {
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    handleResize();

    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    };

    const onMouseLeave = () => {
      mouseRef.current.active = false;
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);

    const startTime = performance.now();

    function render(currentTime) {
      if (width === 0 || height === 0 || !ctx || !offCtx) {
        animFrameId = requestAnimationFrame(render);
        return;
      }

      const elapsed = (currentTime - startTime) * 0.001; // seconds
      const t = elapsed;

      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);

      if (offscreen.width !== cols || offscreen.height !== rows) {
        offscreen.width = cols;
        offscreen.height = rows;
      }

      // -------------------------------------------------------------
      // 1. Render Hourglass into low-res sampling buffer
      // -------------------------------------------------------------
      offCtx.fillStyle = '#FFFFFF';
      offCtx.fillRect(0, 0, cols, rows);

      if (imgLoaded && img.naturalWidth > 0) {
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const gridAspect = cols / rows;

        let drawW, drawH, drawX, drawY;
        // Keep hourglass nicely framed in center
        if (gridAspect > imgAspect) {
          drawH = rows * 0.86;
          drawW = drawH * imgAspect;
          drawX = (cols - drawW) / 2;
          drawY = (rows - drawH) / 2;
        } else {
          drawW = cols * 0.86;
          drawH = drawW / imgAspect;
          drawX = (cols - drawW) / 2;
          drawY = (rows - drawH) / 2;
        }

        offCtx.drawImage(img, drawX, drawY, drawW, drawH);
      }

      const imgData = offCtx.getImageData(0, 0, cols, rows);
      const pixels = imgData.data;

      // -------------------------------------------------------------
      // 2. Draw to main canvas with devicePixelRatio scaling
      // -------------------------------------------------------------
      ctx.save();
      ctx.scale(dpr, dpr);

      // Background mode: solid white (#FFFFFF)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      const mouse = mouseRef.current;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.floor(cellSize * 0.85)}px "Courier New", Courier, monospace`;

      // Loop through grid cells
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = (r * cols + c) * 4;
          const pr = pixels[idx];
          const pg = pixels[idx + 1];
          const pb = pixels[idx + 2];

          // Normalized color
          const isSand = pr > 150 && pg < 135 && pb < 90; // Orange/amber sand
          const isBrightSand = pr > 210 && pg > 100 && pb < 80;

          // Perceived inverted luminance (0 = white/light, 1 = dark black)
          let darkness = 1.0 - (pr * 0.299 + pg * 0.587 + pb * 0.114) / 255;

          // Wave Animation: animStyle="wave", animSpeed=100, animIntensity=60
          // Creates the concentric & diagonal wave dither ripples as in 21st.dev preview
          const cellX = c * cellSize;
          const cellY = r * cellSize;
          const distToCenter = Math.sqrt((cellX - centerX) ** 2 + (cellY - centerY) ** 2);

          const diagWave = Math.sin((c * 0.18 + r * 0.18) - t * 2.2) * 0.16;
          const rippleWave = Math.sin(distToCenter * 0.04 - t * 2.6) * 0.14;
          const wave = (diagWave + rippleWave) * 0.6; // 60% animIntensity

          // Modulate background darkness with wave
          if (darkness < 0.45) {
            darkness = Math.max(0, darkness + wave);
          } else {
            darkness = Math.min(1.0, darkness + wave * 0.3);
          }

          // Interactive mouse wave
          if (mouse.active) {
            const dx = cellX + cellSize / 2 - mouse.x;
            const dy = cellY + cellSize / 2 - mouse.y;
            const mouseDist = Math.sqrt(dx * dx + dy * dy);
            if (mouseDist < 220) {
              const mouseWave = Math.sin(mouseDist * 0.08 - t * 6.0) * Math.exp(-mouseDist / 110);
              darkness = Math.max(0, Math.min(1.0, darkness + mouseWave * 0.35));
            }
          }

          // Parameter adjustments:
          // brightness: +12%
          darkness = Math.max(0, darkness - 0.12 * (1.0 - darkness));
          // contrast: 115%
          darkness = (darkness - 0.5) * 1.15 + 0.5;
          darkness = Math.max(0, Math.min(1.0, darkness));

          if (darkness < 0.04) continue; // Skip near-white cells

          // Color selection
          let cellColor;
          if (isBrightSand) {
            cellColor = '#FF5722'; // Bright amber-orange sand
          } else if (isSand) {
            cellColor = '#E65100'; // Deep rich amber sand
          } else {
            cellColor = '#09090B'; // Crisp black dither frame
          }

          if (renderMode === 'dither') {
            // Ordered Bayer Dithering 4x4
            const subSize = cellSize / 4;
            ctx.fillStyle = cellColor;

            for (let sy = 0; sy < 4; sy++) {
              for (let sx = 0; sx < 4; sx++) {
                const threshold = BAYER_4X4[sy][sx];
                if (darkness > threshold) {
                  const pad = 0.4;
                  ctx.fillRect(
                    cellX + sx * subSize + pad,
                    cellY + sy * subSize + pad,
                    subSize - pad * 2,
                    subSize - pad * 2
                  );
                }
              }
            }
          } else {
            // "nnnnn" Character mode
            const charIdx = Math.floor(darkness * (NNNNN_CHARS.length - 1));
            const glyph = NNNNN_CHARS[charIdx];
            if (glyph && glyph !== ' ') {
              ctx.fillStyle = cellColor;
              ctx.fillText(glyph, cellX + cellSize / 2, cellY + cellSize / 2);
            }
          }
        }
      }

      // -------------------------------------------------------------
      // 3. Post-Effects (pfx)
      // -------------------------------------------------------------
      // 3a. Bloom: 25% intensity (Warm amber glow around sand)
      const bloomGrad = ctx.createRadialGradient(
        centerX,
        centerY + 10,
        15,
        centerX,
        centerY + 10,
        Math.min(width, height) * 0.4
      );
      bloomGrad.addColorStop(0, 'rgba(230, 81, 0, 0.16)');
      bloomGrad.addColorStop(0.5, 'rgba(255, 152, 0, 0.05)');
      bloomGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = bloomGrad;
      ctx.fillRect(0, 0, width, height);

      // 3b. Vignette: 38% intensity
      const diag = Math.sqrt(width * width + height * height);
      const vigGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        diag * 0.28,
        centerX,
        centerY,
        diag * 0.72
      );
      vigGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      vigGrad.addColorStop(0.68, 'rgba(0, 0, 0, 0.08)');
      vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, width, height);

      ctx.restore();
      animFrameId = requestAnimationFrame(render);
    }

    animFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameId);
      ro.disconnect();
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [renderMode, cellSize]);

  return (
    <div
      ref={containerRef}
      className={`ascii-canvas-container ${className}`}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      />

      {/* Floating 21st.dev style controls badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 18,
          left: 18,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #E4E4E7',
          padding: '4px 8px',
          borderRadius: 0,
          fontSize: 11,
          fontFamily: 'monospace',
          color: '#000000',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'inline-block', width: 6, height: 6, background: '#FF1818', marginRight: 4 }} />
        <span>nnnnn:</span>
        <button
          type="button"
          onClick={() => setRenderMode('dither')}
          style={{
            background: renderMode === 'dither' ? '#000000' : 'transparent',
            color: renderMode === 'dither' ? '#FFFFFF' : '#71717A',
            border: 'none',
            padding: '2px 6px',
            fontSize: 10,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          dither
        </button>
        <button
          type="button"
          onClick={() => setRenderMode('characters')}
          style={{
            background: renderMode === 'characters' ? '#000000' : 'transparent',
            color: renderMode === 'characters' ? '#FFFFFF' : '#71717A',
            border: 'none',
            padding: '2px 6px',
            fontSize: 10,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          characters
        </button>
      </div>
    </div>
  );
}
