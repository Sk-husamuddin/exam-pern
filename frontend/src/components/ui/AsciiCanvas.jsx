import React, { useEffect, useRef, useState } from 'react';
import pikachuSrc from '../../assets/pikachu.png';

/**
 * Terminal Pikachu — Recreates the "Terminal Pikachu" ASCII-art / dither effect
 * from 21st.dev (https://21st.dev/community/ascii) using Canvas2D.
 *
 * Parameters from 21st.dev recipe:
 * - renderMode: "dither" | "characters" ("binary")
 * - cellSize: 10
 * - coverage: 36
 * - brightness: 0, contrast: 115, edgeEmphasis: 40
 * - tint: "#00ff66", tintOpacity: 45, overlayBlend: "overlay"
 * - pfx:
 *     vignette: 38%
 *     scanLines: 28%
 *     chromatic: 40%
 *     bloom: 60%
 *     filmGrain: 40%
 *     glitch: 20%
 * - animated: true, animStyle: "flicker", animSpeed: 100, animIntensity: 60
 */

// 3x3 Bayer Dither Matrix normalized [0, 1]
const BAYER_3X3 = [
  [0 / 9, 7 / 9, 3 / 9],
  [6 / 9, 5 / 9, 2 / 9],
  [4 / 9, 1 / 9, 8 / 9],
];

export default function AsciiCanvas({
  cellSize = 10,
  className = '',
  style = {},
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [renderMode, setRenderMode] = useState('dither'); // 'dither' | 'binary'
  const [scanLinesEnabled, setScanLinesEnabled] = useState(true);
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

    // Load Pikachu source photo
    const img = new Image();
    let imgLoaded = false;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgLoaded = true;
    };
    img.src = pikachuSrc;

    // Offscreen sampling canvas
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

    // Mouse listener for interactive CRT interference
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

      // -------------------------------------------------------------
      // 1. Grid setup & Sampling Pikachu onto low-res grid
      // -------------------------------------------------------------
      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);

      if (offscreen.width !== cols || offscreen.height !== rows) {
        offscreen.width = cols;
        offscreen.height = rows;
      }

      // Clear offscreen
      offCtx.fillStyle = '#000000';
      offCtx.fillRect(0, 0, cols, rows);

      if (imgLoaded && img.naturalWidth > 0) {
        // Draw Pikachu centered with contain aspect ratio
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const gridAspect = cols / rows;

        let drawW, drawH, drawX, drawY;
        if (gridAspect > imgAspect) {
          // Canvas is wider than image: match height
          drawH = rows * 0.88;
          drawW = drawH * imgAspect;
          drawX = (cols - drawW) / 2;
          drawY = (rows - drawH) / 2;
        } else {
          // Canvas is taller: match width
          drawW = cols * 0.84;
          drawH = drawW / imgAspect;
          drawX = (cols - drawW) / 2;
          drawY = (rows - drawH) / 2;
        }

        offCtx.drawImage(img, drawX, drawY, drawW, drawH);
      }

      const imgData = offCtx.getImageData(0, 0, cols, rows);
      const pixels = imgData.data;

      // -------------------------------------------------------------
      // 2. Flicker & CRT Glitch Calculations
      // -------------------------------------------------------------
      // animStyle: "flicker", animSpeed: 100, animIntensity: 60
      const flickerNoise =
        Math.sin(t * 37) * 0.03 +
        Math.cos(t * 59) * 0.02 +
        (Math.random() - 0.5) * 0.04;
      const flickerFactor = 1.0 + flickerNoise * 0.6; // 60% animIntensity

      // Glitch slice: random line jitter at 20% intensity
      const glitchActive = Math.sin(t * 12) > 0.85;
      const glitchRow = glitchActive ? Math.floor(Math.sin(t * 43) * 0.5 + 0.5 * rows) : -10;
      const glitchOffset = glitchActive ? Math.floor((Math.random() - 0.5) * 6) : 0;

      // -------------------------------------------------------------
      // 3. Render Pass to Main Canvas
      // -------------------------------------------------------------
      ctx.save();
      ctx.scale(dpr, dpr);

      // Terminal CRT dark green/black solid background (#030804)
      ctx.fillStyle = '#040905';
      ctx.fillRect(0, 0, width, height);

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.floor(cellSize * 0.88)}px "Courier New", Courier, monospace`;

      const mouse = mouseRef.current;

      // Pre-compute luminance array for edgeEmphasis
      const lumMap = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = (r * cols + c) * 4;
          const pr = pixels[idx];
          const pg = pixels[idx + 1];
          const pb = pixels[idx + 2];
          // Standard luminance
          lumMap[r * cols + c] = (pr * 0.299 + pg * 0.587 + pb * 0.114) / 255;
        }
      }

      // Loop through cells and draw Pikachu ASCII / Dither
      for (let r = 0; r < rows; r++) {
        const isGlitchLine = Math.abs(r - glitchRow) < 2;
        const colShift = isGlitchLine ? glitchOffset : 0;

        for (let c = 0; c < cols; c++) {
          const sampleC = Math.max(0, Math.min(cols - 1, c + colShift));
          const idx = r * cols + sampleC;
          let lum = lumMap[idx];

          // Edge emphasis: 40%
          const left = lumMap[r * cols + Math.max(0, sampleC - 1)];
          const right = lumMap[r * cols + Math.min(cols - 1, sampleC + 1)];
          const top = lumMap[Math.max(0, r - 1) * cols + sampleC];
          const bot = lumMap[Math.min(rows - 1, r + 1) * cols + sampleC];
          const edge = Math.abs(right - left) + Math.abs(bot - top);
          lum += edge * 0.4;

          // Apply contrast: 115% (factor 1.15) & brightness: 0
          lum = (lum - 0.5) * 1.15 + 0.5;

          // Apply CRT flicker modulation
          lum *= flickerFactor;

          // Interactive mouse lightning / phosphor charge
          if (mouse.active) {
            const cellX = c * cellSize + cellSize / 2;
            const cellY = r * cellSize + cellSize / 2;
            const dx = cellX - mouse.x;
            const dy = cellY - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 180) {
              const mouseSpark = Math.sin(dist * 0.1 - t * 8.0) * Math.exp(-dist / 90);
              lum += mouseSpark * 0.35;
            }
          }

          lum = Math.max(0, Math.min(1.0, lum));

          // Coverage: 36%
          // Only cells above coverage threshold get drawn (keeps dark background crisp)
          const coverageThreshold = 0.36 * (1.0 - lum * 0.5);
          if (lum < 0.12 && lum < coverageThreshold) continue;

          const cellX = c * cellSize;
          const cellY = r * cellSize;

          // Color pipeline: Terminal phosphor green #00ff66 with 45% tint overlay
          // Highlight shades transition from rich terminal green to electric mint white
          let fillStyle;
          if (lum > 0.85) {
            fillStyle = '#D4FFAA'; // Electric bright phosphor highlight
          } else if (lum > 0.6) {
            fillStyle = '#55FF99'; // Vibrant mint green
          } else if (lum > 0.35) {
            fillStyle = '#00FF66'; // Pure Terminal green (#00ff66)
          } else {
            fillStyle = '#008833'; // Deep shadow phosphor
          }

          if (renderMode === 'dither') {
            // Ordered Bayer Dither 3x3
            const subSize = cellSize / 3;
            ctx.fillStyle = fillStyle;

            for (let sy = 0; sy < 3; sy++) {
              for (let sx = 0; sx < 3; sx++) {
                const threshold = BAYER_3X3[sy][sx];
                if (lum > threshold * 0.9) {
                  ctx.fillRect(
                    cellX + sx * subSize + 0.5,
                    cellY + sy * subSize + 0.5,
                    subSize - 0.8,
                    subSize - 0.8
                  );
                }
              }
            }
          } else {
            // Binary mode: '0' and '1' ASCII code
            const binaryChar = (c + r + Math.floor(t * 3)) % 2 === 0 ? '1' : '0';
            ctx.fillStyle = fillStyle;
            ctx.fillText(binaryChar, cellX + cellSize / 2, cellY + cellSize / 2);
          }
        }
      }

      // -------------------------------------------------------------
      // 4. Post-Effects (pfx)
      // -------------------------------------------------------------

      // 4a. Bloom: 60% intensity (Phosphor glow from Pikachu's center)
      const bloomGrad = ctx.createRadialGradient(
        width / 2,
        height * 0.48,
        20,
        width / 2,
        height * 0.48,
        Math.min(width, height) * 0.55
      );
      bloomGrad.addColorStop(0, 'rgba(0, 255, 102, 0.24)');
      bloomGrad.addColorStop(0.5, 'rgba(0, 255, 102, 0.08)');
      bloomGrad.addColorStop(1, 'rgba(0, 255, 102, 0)');
      ctx.fillStyle = bloomGrad;
      ctx.fillRect(0, 0, width, height);

      // 4b. ScanLines: 28% intensity
      if (scanLinesEnabled) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        for (let y = 0; y < height; y += 3) {
          ctx.fillRect(0, y, width, 1.2);
        }
        // Subtle moving CRT beam line
        const beamY = ((t * 80) % height);
        ctx.fillStyle = 'rgba(0, 255, 102, 0.06)';
        ctx.fillRect(0, beamY - 4, width, 8);
      }

      // 4c. Chromatic Aberration: 40% intensity (RGB phosphor fringing)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(0, 255, 102, 0.05)';
      ctx.fillRect(1.5, 0, width, height);
      ctx.fillStyle = 'rgba(0, 100, 255, 0.03)';
      ctx.fillRect(-1.5, 0, width, height);
      ctx.restore();

      // 4d. Film Grain: 40% intensity
      // Sample 300 random terminal noise specs
      ctx.fillStyle = 'rgba(0, 255, 102, 0.12)';
      for (let i = 0; i < 280; i++) {
        const nx = Math.random() * width;
        const ny = Math.random() * height;
        ctx.fillRect(nx, ny, 1, 1);
      }

      // 4e. Vignette: 38% intensity (Curved CRT tube dark edges)
      const diag = Math.sqrt(width * width + height * height);
      const vigGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        diag * 0.26,
        width / 2,
        height / 2,
        diag * 0.68
      );
      vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vigGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.15)');
      vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
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
  }, [renderMode, scanLinesEnabled, cellSize]);

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
        backgroundColor: '#040905',
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

      {/* Cyberpunk Terminal HUD Overlay Header */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: 11,
          color: '#00FF66',
          textShadow: '0 0 8px rgba(0,255,102,0.6)',
          letterSpacing: '0.08em',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              background: '#00FF66',
              boxShadow: '0 0 8px #00FF66',
              borderRadius: '50%',
            }}
          />
          <strong>TERMINAL PIKACHU // 21ST.DEV</strong>
        </div>
        <div style={{ fontSize: 10, color: '#39A96B', opacity: 0.9 }}>
          CRT 60Hz • DITHER PFX • PHOSPHOR GREEN
        </div>
      </div>

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
          background: 'rgba(4, 15, 7, 0.92)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #00FF66',
          boxShadow: '0 0 12px rgba(0, 255, 102, 0.25)',
          padding: '4px 8px',
          borderRadius: 0,
          fontSize: 11,
          fontFamily: 'monospace',
          color: '#00FF66',
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'inline-block', width: 6, height: 6, background: '#00FF66', marginRight: 4 }} />
        <span>MODE:</span>
        <button
          type="button"
          onClick={() => setRenderMode('dither')}
          style={{
            background: renderMode === 'dither' ? '#00FF66' : 'transparent',
            color: renderMode === 'dither' ? '#000000' : '#39A96B',
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
          onClick={() => setRenderMode('binary')}
          style={{
            background: renderMode === 'binary' ? '#00FF66' : 'transparent',
            color: renderMode === 'binary' ? '#000000' : '#39A96B',
            border: 'none',
            padding: '2px 6px',
            fontSize: 10,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          binary
        </button>
        <span style={{ color: '#00FF66', opacity: 0.4 }}>|</span>
        <button
          type="button"
          onClick={() => setScanLinesEnabled((prev) => !prev)}
          style={{
            background: scanLinesEnabled ? '#003311' : 'transparent',
            color: '#00FF66',
            border: '1px solid #00FF66',
            padding: '2px 6px',
            fontSize: 10,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          {scanLinesEnabled ? 'scanlines: on' : 'scanlines: off'}
        </button>
      </div>
    </div>
  );
}
