import React, { useEffect, useRef, useState } from 'react';
import lbrceSrc from '../../assets/lbrce.jpg';

/**
 * AsciiCanvas — Renders the LBRCE college dome & architecture as high-performance
 * Canvas2D ASCII / Halftone Dots art, covering 100% height and width of the left screen.
 *
 * Supported modes:
 * - "dots": Halftone circular dots (Default)
 * - "dither": 4x4 Ordered Bayer dithering
 * - "characters": Classical ASCII density glyphs
 * - "matrix": Digital code stream glyphs
 */

const BAYER_4X4 = [
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

const CHAR_SETS = {
  standard: [' ', '·', ':', '!', '+', 'x', '*', '#', '%', '@'],
  characters: [' ', '.', ':', '-', '=', 'n', 'N', 'M', '█'],
  matrix: [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
};

export default function AsciiCanvas({
  initialMode = 'dots',
  cellSize = 12,
  className = '',
  style = {},
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [renderMode, setRenderMode] = useState(initialMode);
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

    // Load LBRCE source image
    const img = new Image();
    let imgLoaded = false;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgLoaded = true;
    };
    img.src = lbrceSrc;

    // Offscreen buffer for sampling
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

      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);
      offscreen.width = cols;
      offscreen.height = rows;
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
      // 1. Draw LBRCE image into offscreen buffer with COVER (100% height & width)
      // -------------------------------------------------------------
      offCtx.fillStyle = '#FFFFFF';
      offCtx.fillRect(0, 0, cols, rows);

      if (imgLoaded && img.naturalWidth > 0) {
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const gridAspect = cols / rows;

        let drawW, drawH, drawX, drawY;
        if (gridAspect > imgAspect) {
          // Container is wider than image: match width, crop top/bottom
          drawW = cols;
          drawH = cols / imgAspect;
          drawX = 0;
          drawY = (rows - drawH) / 2;
        } else {
          // Container is taller than image: match 100% height, crop sides
          drawH = rows;
          drawW = rows * imgAspect;
          drawX = (cols - drawW) / 2;
          drawY = 0;
        }

        offCtx.drawImage(img, drawX, drawY, drawW, drawH);
      }

      const imgData = offCtx.getImageData(0, 0, cols, rows);
      const pixels = imgData.data;

      // -------------------------------------------------------------
      // 2. Render to main canvas
      // -------------------------------------------------------------
      ctx.save();
      ctx.scale(dpr, dpr);

      // Clean white background (#FFFFFF)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      const mouse = mouseRef.current;
      const charList = CHAR_SETS[renderMode] || CHAR_SETS.characters;
      const charCount = charList.length;

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.floor(cellSize * 0.85)}px "Courier New", Courier, monospace`;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = (r * cols + c) * 4;
          const pr = pixels[idx];
          const pg = pixels[idx + 1];
          const pb = pixels[idx + 2];

          // Darkness: 0 = light/white sky, 1 = dark architectural features & dome
          let darkness = 1.0 - (pr * 0.299 + pg * 0.587 + pb * 0.114) / 255;

          // Subtle animated wave ripple across architecture
          const wave = Math.sin(c * 0.12 + r * 0.12 - t * 1.8) * 0.08 +
                       Math.cos(c * 0.08 - r * 0.14 + t * 1.4) * 0.06;
          darkness += wave * 0.4;

          // Interactive mouse wave
          if (mouse.active) {
            const cellCenterX = c * cellSize + cellSize / 2;
            const cellCenterY = r * cellSize + cellSize / 2;
            const dx = cellCenterX - mouse.x;
            const dy = cellCenterY - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 220) {
              const mouseWave = Math.sin(dist * 0.08 - t * 5.0) * Math.exp(-dist / 110);
              darkness += mouseWave * 0.3;
            }
          }

          // Contrast curve & brightness adjustment
          darkness = (darkness - 0.45) * 1.25 + 0.45;
          darkness = Math.max(0, Math.min(1.0, darkness));

          if (darkness < 0.05) continue; // Skip pure white areas

          const cellX = c * cellSize;
          const cellY = r * cellSize;

          // Swiss Red highlight accent on prominent architectural lines & edges
          const isAccent = darkness > 0.65 && ((c + r) % 6 === 0);
          const cellColor = isAccent ? '#FF1818' : '#09090B';

          if (renderMode === 'dots') {
            // Halftone circular dots (Default)
            const radius = (cellSize / 2 - 0.6) * darkness;
            if (radius > 0.4) {
              ctx.fillStyle = cellColor;
              ctx.beginPath();
              ctx.arc(cellX + cellSize / 2, cellY + cellSize / 2, radius, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (renderMode === 'dither') {
            // 4x4 Ordered Bayer Dithering
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
          } else if (renderMode === 'characters') {
            // "nnnnn" Character mode
            const charIdx = Math.floor(darkness * (charCount - 1));
            const glyph = charList[charIdx];
            if (glyph && glyph !== ' ') {
              ctx.fillStyle = cellColor;
              ctx.fillText(glyph, cellX + cellSize / 2, cellY + cellSize / 2);
            }
          } else if (renderMode === 'matrix') {
            // Code rain ASCII glyphs
            const matrixChars = CHAR_SETS.matrix;
            const codeChar = matrixChars[Math.floor(Math.random() * matrixChars.length)];
            if (darkness > 0.15) {
              ctx.fillStyle = isAccent ? '#FF1818' : darkness > 0.5 ? '#000000' : '#71717A';
              ctx.fillText(codeChar, cellX + cellSize / 2, cellY + cellSize / 2);
            }
          }
        }
      }

      // -------------------------------------------------------------
      // 3. Post-Effects: Soft Vignette (intensity 28)
      // -------------------------------------------------------------
      const diag = Math.sqrt(width * width + height * height);
      const vigGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        diag * 0.32,
        width / 2,
        height / 2,
        diag * 0.72
      );
      vigGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      vigGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.04)');
      vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
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

      {/* Floating controls badge */}
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
        <span>LBRCE:</span>
        <button
          type="button"
          onClick={() => setRenderMode('dots')}
          style={{
            background: renderMode === 'dots' ? '#000000' : 'transparent',
            color: renderMode === 'dots' ? '#FFFFFF' : '#71717A',
            border: 'none',
            padding: '2px 6px',
            fontSize: 10,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          dots
        </button>
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
          nnnnn
        </button>
        <button
          type="button"
          onClick={() => setRenderMode('matrix')}
          style={{
            background: renderMode === 'matrix' ? '#000000' : 'transparent',
            color: renderMode === 'matrix' ? '#FFFFFF' : '#71717A',
            border: 'none',
            padding: '2px 6px',
            fontSize: 10,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          matrix
        </button>
      </div>
    </div>
  );
}
