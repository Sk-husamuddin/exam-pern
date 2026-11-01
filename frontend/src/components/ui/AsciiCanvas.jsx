import React, { useEffect, useRef, useState } from 'react';

/**
 * AsciiCanvas — Recreates the "nnnnn" ASCII-art / dither effect from 21st.dev
 * (https://21st.dev/community/ascii) using high-performance Canvas2D.
 *
 * Parameters supported from 21st.dev recipe:
 * - renderMode: "dither" | "characters" | "dots" | "matrix"
 * - cellSize: 16
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

// ASCII glyph palette ordered by perceived luminance
const CHAR_SETS = {
  standard: [' ', '·', ':', '!', '+', 'x', '*', '#', '%', '@'],
  nnnnn: [' ', '.', ':', '-', '=', 'n', 'N', 'M', '█'],
  matrix: [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
};

export default function AsciiCanvas({
  initialMode = 'dots',
  cellSize = 16,
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

    // Offscreen buffer for rasterizing procedural 3D geometric subject
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

      // Match offscreen grid size
      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);
      offscreen.width = cols;
      offscreen.height = rows;
    }

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    handleResize();

    // Track mouse interaction
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

    // Animation variables
    let startTime = performance.now();

    function render(currentTime) {
      if (width === 0 || height === 0 || !ctx || !offCtx) {
        animFrameId = requestAnimationFrame(render);
        return;
      }

      const elapsed = (currentTime - startTime) * 0.001; // seconds
      const speed = 1.0; // animSpeed = 100
      const t = elapsed * speed;

      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);

      if (offscreen.width !== cols || offscreen.height !== rows) {
        offscreen.width = cols;
        offscreen.height = rows;
      }

      // -------------------------------------------------------------
      // 1. Draw dynamic 3D geometric subject on low-res offscreen buffer
      // -------------------------------------------------------------
      offCtx.fillStyle = '#050505';
      offCtx.fillRect(0, 0, cols, rows);

      const cx = cols / 2;
      const cy = rows / 2;
      const maxDim = Math.min(cols, rows);

      // Rotating torus-knot / multi-ring 3D shape
      const rotX = t * 0.65;
      const rotY = t * 0.95;
      const rotZ = t * 0.35;

      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

      const numPoints = 220;
      const pRadius = maxDim * 0.32;
      const tubeRadius = maxDim * 0.14;

      offCtx.lineWidth = 1.2;

      // Draw procedural illuminated wireframe / ribbons
      for (let i = 0; i < numPoints; i++) {
        const u = (i / numPoints) * Math.PI * 4;
        const v = (i / numPoints) * Math.PI * 8;

        // Torus knot formula p=2, q=3
        const r = pRadius * (0.8 + 0.3 * Math.sin(v + t));
        const px0 = r * Math.cos(u);
        const py0 = r * Math.sin(u);
        const pz0 = tubeRadius * Math.sin(3 * u);

        // Rotate 3D point
        const y1 = py0 * cosX - pz0 * sinX;
        const z1 = py0 * sinX + pz0 * cosX;

        const x2 = px0 * cosY + z1 * sinY;
        const z2 = -px0 * sinY + z1 * cosY;

        const x3 = x2 * cosZ - y1 * sinZ;
        const y3 = x2 * sinZ + y1 * cosZ;

        const persp = 300 / (300 + z2);
        const screenX = cx + x3 * persp;
        const screenY = cy + y3 * persp;

        // Depth-based brightness
        const normZ = (z2 + tubeRadius * 2) / (tubeRadius * 4);
        const b = Math.max(0.1, Math.min(1.0, normZ * 1.1));
        const val = Math.floor(b * 255);

        offCtx.fillStyle = `rgb(${val},${val},${val})`;
        offCtx.fillRect(Math.floor(screenX), Math.floor(screenY), 2, 2);
      }

      // Read back sampled luminance
      const imgData = offCtx.getImageData(0, 0, cols, rows);
      const pixels = imgData.data;

      // -------------------------------------------------------------
      // 2. Render to main canvas with devicePixelRatio scaling
      // -------------------------------------------------------------
      ctx.save();
      ctx.scale(dpr, dpr);

      // Background mode: "solid" white (#FFFFFF)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      const mouse = mouseRef.current;
      const charList = CHAR_SETS[renderMode === 'characters' ? 'nnnnn' : 'standard'];
      const charCount = charList.length;

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.floor(cellSize * 0.85)}px "Courier New", Courier, monospace`;

      // Loop through cells
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = (r * cols + c) * 4;
          let lum = (pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114) / 255;

          // Wave Animation: animStyle="wave", animSpeed=100, animIntensity=60
          const wave = Math.sin(c * 0.14 + r * 0.12 - t * 2.2) * 0.28 +
                       Math.cos(c * 0.08 - r * 0.16 + t * 1.5) * 0.18;
          lum += wave * 0.6; // 60% intensity

          // Interactive mouse wave ripple
          if (mouse.active) {
            const cellCenterX = c * cellSize + cellSize / 2;
            const cellCenterY = r * cellSize + cellSize / 2;
            const dx = cellCenterX - mouse.x;
            const dy = cellCenterY - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 260) {
              const mouseWave = Math.sin(dist * 0.06 - t * 5.0) * Math.exp(-dist / 140);
              lum += mouseWave * 0.45;
            }
          }

          // Parameter adjustments:
          // brightness: +12%
          lum += 0.12;
          // contrast: 115%
          lum = (lum - 0.5) * 1.15 + 0.5;
          // Clamp to [0, 1]
          lum = Math.max(0, Math.min(1, lum));

          const cellX = c * cellSize;
          const cellY = r * cellSize;

          // Determine color: Deep black (#09090b) or Swiss Red (#FF1818) on wave crests
          const isAccent = lum > 0.82 && ((c + r) % 5 === 0);
          const cellColor = isAccent ? '#FF1818' : '#09090B';

          if (renderMode === 'dither') {
            // Ordered Bayer Dithering 4x4
            // Subdivide 16px cell into 4x4 pixels (each 4px x 4px)
            const subSize = cellSize / 4;
            ctx.fillStyle = cellColor;

            for (let sy = 0; sy < 4; sy++) {
              for (let sx = 0; sx < 4; sx++) {
                const threshold = BAYER_4X4[sy][sx];
                // Inverted for light theme: higher lum = denser dither
                if (lum > threshold) {
                  // Draw dither dot/rect
                  const dotPad = 0.5;
                  ctx.fillRect(
                    cellX + sx * subSize + dotPad,
                    cellY + sy * subSize + dotPad,
                    subSize - dotPad * 2,
                    subSize - dotPad * 2
                  );
                }
              }
            }
          } else if (renderMode === 'characters') {
            // "nnnnn" Character mode: draw ASCII glyph based on luminance
            const charIdx = Math.floor(lum * (charCount - 1));
            const glyph = charList[charIdx];
            if (glyph && glyph !== ' ') {
              ctx.fillStyle = cellColor;
              ctx.fillText(glyph, cellX + cellSize / 2, cellY + cellSize / 2);
            }
          } else if (renderMode === 'dots') {
            // Halftone circular dots
            const radius = (cellSize / 2 - 1) * lum;
            if (radius > 0.5) {
              ctx.fillStyle = cellColor;
              ctx.beginPath();
              ctx.arc(cellX + cellSize / 2, cellY + cellSize / 2, radius, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (renderMode === 'matrix') {
            // Code rain ASCII glyphs
            const matrixChars = CHAR_SETS.matrix;
            const codeChar = matrixChars[Math.floor(Math.random() * matrixChars.length)];
            if (lum > 0.2) {
              ctx.fillStyle = isAccent ? '#FF1818' : lum > 0.6 ? '#000000' : '#71717A';
              ctx.fillText(codeChar, cellX + cellSize / 2, cellY + cellSize / 2);
            }
          }
        }
      }

      // -------------------------------------------------------------
      // 3. Post-FX: Vignette (intensity 38) & Bloom (intensity 25)
      // -------------------------------------------------------------
      // Vignette
      const diag = Math.sqrt(width * width + height * height);
      const vigGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        diag * 0.28,
        width / 2,
        height / 2,
        diag * 0.72
      );
      // Intensity 38%
      vigGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      vigGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.08)');
      vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, width, height);

      // Bloom: Subtle soft radial glow at center (intensity 25%)
      const bloomGrad = ctx.createRadialGradient(
        cx * cellSize,
        cy * cellSize,
        10,
        cx * cellSize,
        cy * cellSize,
        maxDim * cellSize * 0.45
      );
      bloomGrad.addColorStop(0, 'rgba(255, 24, 24, 0.12)'); // Swiss Red accent bloom
      bloomGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
      bloomGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = bloomGrad;
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

      {/* Subtle floating 21st.dev style controls badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 18,
          left: 18,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #E4E4E7',
          padding: '4px 8px',
          borderRadius: 0, // Swiss Red 0px radius
          fontSize: 11,
          fontFamily: 'monospace',
          color: '#000000',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'inline-block', width: 6, height: 6, background: '#FF1818', marginRight: 4 }} />
        <span>ASCII:</span>
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
