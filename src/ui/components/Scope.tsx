import { useEffect, useRef } from "preact/hooks";
import type { SpectrumSource } from "../../audio/index";
import { copy } from "../copy";
import {
  binRange,
  canvasBuffer,
  formatKHz,
  type ScopeWindow,
  warmUpFrame,
} from "../model/scope-map";
import {
  axisTicks,
  binForRow,
  buildPalette,
  freqFraction,
  parseHex,
  type Rgb,
  SCOPE_HEIGHT,
  SCOPE_WIDTH,
  STATIC_MAX_INDEX,
  scopeMode,
  warmUpProgress,
  warmUpRowIndex,
} from "./scope-draw";
import "../styles/scope.css";

export interface ScopeProps {
  /** `UiTransport.analyser`. Null before start and after stop: the Scope then shows static. */
  source: SpectrumSource | null;
  window: ScopeWindow;
  power: "off" | "selftest" | "on";
  reducedMotion: boolean;
  /** Caption for the marked band, for example "Call band". Optional. */
  bandLabel?: string;
}

/** Fallbacks used only when a Token cannot be parsed as a hex value. */
const FALLBACK_DARK: Rgb = [0, 0, 0];
const FALLBACK_BRIGHT: Rgb = [255, 255, 255];

function readRgb(el: Element, name: string, fallback: Rgb): Rgb {
  return parseHex(getComputedStyle(el).getPropertyValue(name)) ?? fallback;
}

/** CRT spectrogram. Time runs left to right, frequency bottom to top. */
export function Scope(props: ScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The drawing loop reads the latest props from here, so it starts once at mount.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const palette = buildPalette(
      readRgb(canvas, "--screen", FALLBACK_DARK),
      readRgb(canvas, "--phosphor", FALLBACK_BRIGHT),
    );
    // Drawing-buffer size in device pixels. Starts at the Figma size and follows the rendered size
    // (requirement 22.8). All drawing is ImageData in buffer pixels, so the context keeps the
    // identity transform; the devicePixelRatio is applied through the buffer size instead.
    let w = canvas.width;
    let h = canvas.height;
    // One spectrogram step is one CSS pixel wide, so history scrolls at the same speed at any ratio.
    let step = 1;
    let column = ctx.createImageData(step, h);
    let frame = ctx.createImageData(w, h);
    let buf = new Uint8Array(0);
    let raf = 0;
    let warmStart: number | null = null;
    let lastMode: string | null = null;

    const putIndex = (data: Uint8ClampedArray, pixel: number, idx: number) => {
      data.set(palette.subarray(idx * 4, idx * 4 + 4), pixel * 4);
    };

    const drawStatic = () => {
      for (let p = 0; p < w * h; p++) {
        putIndex(frame.data, p, Math.floor(Math.random() * STATIC_MAX_INDEX));
      }
      ctx.putImageData(frame, 0, 0);
    };

    const drawWarmUp = (now: number) => {
      warmStart ??= now;
      const region = warmUpFrame(warmUpProgress(now - warmStart), h);
      for (let y = 0; y < h; y++) {
        const idx = warmUpRowIndex(y, region);
        for (let x = 0; x < w; x++) putIndex(frame.data, y * w + x, idx);
      }
      ctx.putImageData(frame, 0, 0);
    };

    const drawLive = (source: SpectrumSource, win: ScopeWindow) => {
      if (lastMode !== "live") {
        for (let p = 0; p < w * h; p++) putIndex(frame.data, p, 0);
        ctx.putImageData(frame, 0, 0);
      }
      if (buf.length !== source.frequencyBinCount)
        buf = new Uint8Array(source.frequencyBinCount);
      source.getByteFrequencyData(buf);
      const range = binRange(
        source.sampleRate,
        source.fftSize,
        win.loHz,
        win.hiHz,
      );
      ctx.drawImage(canvas, -step, 0);
      for (let row = 0; row < h; row++) {
        const idx = buf[binForRow(row, h, range)] ?? 0;
        for (let x = 0; x < step; x++)
          putIndex(column.data, row * step + x, idx);
      }
      ctx.putImageData(column, w - step, 0);
    };

    // Resizing clears the canvas (and the spectrogram history); drawing continues from the next frame.
    const resize = (cssWidth: number, cssHeight: number) => {
      const dpr = window.devicePixelRatio || 1;
      const size = canvasBuffer(cssWidth, cssHeight, dpr);
      if (size.width === w && size.height === h) return;
      canvas.width = size.width;
      canvas.height = size.height;
      w = size.width;
      h = size.height;
      step = Math.max(1, Math.min(w, Math.round(dpr)));
      column = ctx.createImageData(step, h);
      frame = ctx.createImageData(w, h);
      lastMode = null;
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            const box = entries[entries.length - 1]?.contentRect;
            if (box) resize(box.width, box.height);
          });
    observer?.observe(canvas);

    const tick = (now: number) => {
      raf = 0;
      if (document.hidden) return; // resumed by visibilitychange
      const p = latest.current;
      const mode = scopeMode({
        power: p.power,
        hasSource: p.source !== null,
        reducedMotion: p.reducedMotion,
      });
      if (mode !== "warmup") warmStart = null;
      if (mode === "live" && p.source) drawLive(p.source, p.window);
      else if (mode === "warmup") drawWarmUp(now);
      else if (lastMode !== "static" || !p.reducedMotion) drawStatic();
      lastMode = mode;
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (!document.hidden && raf === 0) raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const { loHz, hiHz, bandHz } = props.window;
  const mode = scopeMode({
    power: props.power,
    hasSource: props.source !== null,
    reducedMotion: props.reducedMotion,
  });
  const pct = (hz: number) =>
    `${(freqFraction(hz, loHz, hiHz) * 100).toFixed(2)}%`;

  return (
    <div class="scope" data-mode={mode} role="img" aria-label="Spectrum scope">
      <div class="scope-screen">
        <canvas
          ref={canvasRef}
          class="scope-canvas"
          width={SCOPE_WIDTH}
          height={SCOPE_HEIGHT}
        />
        <div class="scope-axis" aria-hidden="true">
          {/* Figma axis: top and middle in kHz, "Hz" at the bottom. */}
          {axisTicks(loHz, hiHz)
            .filter((_, i) => i % 2 === 0)
            .map((hz) => (
              <span key={hz} class="scope-tick" style={{ bottom: pct(hz) }}>
                {hz === loHz ? "Hz" : `${formatKHz(hz)}k`}
              </span>
            ))}
        </div>
        {props.power === "off" ? (
          <span class="scope-standby">{copy.scope.standby}</span>
        ) : null}
        {bandHz && mode !== "warmup" ? (
          <div class="scope-band" aria-hidden="true">
            <i
              class="scope-band-line"
              data-edge="hi"
              style={{ bottom: pct(bandHz[1]) }}
            />
            <i
              class="scope-band-line"
              data-edge="lo"
              style={{ bottom: pct(bandHz[0]) }}
            />
            {props.bandLabel ? (
              <span
                class="scope-band-caption"
                style={{ bottom: pct(bandHz[1]) }}
              >
                {props.bandLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
