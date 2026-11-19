// Decorative circuit board under the frosted shell (Figma "Circuit board (image, drawn in code)").
// Drawn as SVG. Colours come from tokens through CSS classes (see device.css).

const W = 370;
const H = 1247;

/** Horizontal bus lines: [y, x1, x2]. Design parameters, a pleasant layout, not Figma measurements. */
const BUSES: ReadonlyArray<readonly [number, number, number]> = [
  [96, 24, 250],
  [190, 60, 330],
  [330, 24, 300],
  [470, 40, 340],
  [640, 24, 280],
  [820, 70, 346],
  [980, 24, 310],
  [1130, 50, 330],
];

/** Pads and vias: [x, y, radius]. */
const PADS: ReadonlyArray<readonly [number, number, number]> = [
  [24, 96, 4],
  [250, 96, 3],
  [60, 190, 3],
  [330, 190, 4],
  [24, 330, 4],
  [300, 330, 3],
  [40, 470, 3],
  [340, 470, 4],
  [24, 640, 4],
  [280, 640, 3],
  [70, 820, 3],
  [346, 820, 4],
  [24, 980, 4],
  [310, 980, 3],
  [50, 1130, 3],
  [330, 1130, 4],
];

/** Chips: [x, y, w, h]. */
const CHIPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [120, 130, 70, 40],
  [220, 380, 90, 50],
  [40, 700, 80, 44],
  [200, 880, 100, 56],
];

export function CircuitBoard() {
  return (
    <svg
      class="circuit-board"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect class="board-fill" width={W} height={H} />
      {BUSES.map(([y, x1, x2]) => (
        <g key={`${y}-${x1}`}>
          <path class="board-trace" d={`M${x1} ${y}H${x2}`} />
          <path class="board-trace" d={`M${x2} ${y}V${y + 24}H${x2 - 30}`} />
        </g>
      ))}
      {CHIPS.map(([x, y, w, h]) => (
        <g key={`${x}-${y}`}>
          <rect class="board-chip" x={x} y={y} width={w} height={h} rx="3" />
          {Array.from({ length: 6 }, (_, i) => (
            <path
              key={i}
              class="board-pin"
              d={`M${x + 8 + i * ((w - 16) / 5)} ${y - 5}V${y}M${x + 8 + i * ((w - 16) / 5)} ${y + h}V${y + h + 5}`}
            />
          ))}
        </g>
      ))}
      {PADS.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} class="board-pad" cx={x} cy={y} r={r} />
      ))}
    </svg>
  );
}
