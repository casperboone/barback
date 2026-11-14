// The backdrop of the login page: a back bar at closing time, shelves of
// bottles under warm pendant lights, with stock tags hanging from the shelves.
// The strips under the shelves glow emerald, the app's colour.
// Drawn once on the server; a fixed seed keeps it the same on every visit.

const WIDTH = 1440;
const HEIGHT = 900;
const SHELVES = [300, 505, 710];
const COUNTER_TOP = 790;

type Shape = {
  w: number;
  h: number;
  neck: number;
  // Where the body ends and the neck begins, as fractions of the height.
  shoulder: number;
  neckStart: number;
};

const SHAPES: Shape[] = [
  { w: 34, h: 150, neck: 10, shoulder: 0.55, neckStart: 0.72 }, // wine
  { w: 44, h: 122, neck: 13, shoulder: 0.72, neckStart: 0.8 }, // whisky
  { w: 40, h: 132, neck: 14, shoulder: 0.78, neckStart: 0.84 }, // gin
  { w: 46, h: 108, neck: 12, shoulder: 0.42, neckStart: 0.7 }, // liqueur
  { w: 26, h: 96, neck: 9, shoulder: 0.45, neckStart: 0.68 }, // beer
  { w: 32, h: 160, neck: 11, shoulder: 0.7, neckStart: 0.8 }, // vodka
];

const GLASS = ["#c27a2c", "#2f5d3a", "#6b3414", "#9fb9c4", "#7a1f2b", "#d9cfb8", "#3d6f8c"];
const LABELS = ["#efe3c8", "#efe3c8", "#1c1410", "#e9d9a8", "#f4efe6"];

// Small deterministic PRNG, so the shelves don't reshuffle between renders.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bottlePath(x: number, base: number, s: Shape) {
  const half = s.w / 2;
  const neck = s.neck / 2;
  const sy = base - s.h * s.shoulder;
  const ny = base - s.h * s.neckStart;
  const top = base - s.h;
  const c1 = sy - (sy - ny) * 0.6;
  const c2 = ny + (sy - ny) * 0.4;
  return [
    `M ${x - half} ${base - 3}`,
    `Q ${x - half} ${base} ${x - half + 3} ${base}`,
    `L ${x + half - 3} ${base}`,
    `Q ${x + half} ${base} ${x + half} ${base - 3}`,
    `L ${x + half} ${sy}`,
    `C ${x + half} ${c1} ${x + neck} ${c2} ${x + neck} ${ny}`,
    `L ${x + neck} ${top}`,
    `L ${x - neck} ${top}`,
    `L ${x - neck} ${ny}`,
    `C ${x - neck} ${c2} ${x - half} ${c1} ${x - half} ${sy}`,
    "Z",
  ].join(" ");
}

type Bottle = {
  id: string;
  x: number;
  base: number;
  shape: Shape;
  glass: string;
  label: string;
  level: number;
  tag?: number;
};

function stockShelves(): Bottle[] {
  const next = random(1907);
  const bottles: Bottle[] = [];
  SHELVES.forEach((base, row) => {
    let x = 24 + next() * 20;
    let i = 0;
    while (x < WIDTH - 20) {
      // Bottles of a kind stand together, like on a real back bar.
      const shape = SHAPES[Math.floor(next() * SHAPES.length)];
      const run = 1 + Math.floor(next() * 3);
      const glass = GLASS[Math.floor(next() * GLASS.length)];
      const label = LABELS[Math.floor(next() * LABELS.length)];
      for (let r = 0; r < run && x < WIDTH - 20; r++) {
        x += shape.w / 2;
        bottles.push({
          id: `b${row}-${i}`,
          x,
          base,
          shape,
          glass,
          label,
          // The first of a run is the one being poured from.
          level: r === 0 ? 0.25 + next() * 0.6 : 0.9,
          tag: r === 0 && next() < 0.45 ? Math.floor(next() * 24) + 1 : undefined,
        });
        x += shape.w / 2 + 4 + next() * 5;
        i++;
      }
      x += 10 + next() * 26;
    }
  });
  return bottles;
}

const BOTTLES = stockShelves();
const LAMPS = [260, 720, 1180];

export function BackBar({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d120c" />
          <stop offset="1" stopColor="#0c0705" />
        </linearGradient>
        <radialGradient id="lamp-glow">
          <stop offset="0" stopColor="#ffb85c" stopOpacity="0.42" />
          <stop offset="0.45" stopColor="#f29a3a" stopOpacity="0.14" />
          <stop offset="1" stopColor="#f29a3a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="shelf-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34d399" stopOpacity="0.3" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="shelf-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b4326" />
          <stop offset="1" stopColor="#3a2213" />
        </linearGradient>
        <linearGradient id="counter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2213" />
          <stop offset="0.08" stopColor="#24140b" />
          <stop offset="1" stopColor="#0a0604" />
        </linearGradient>
        <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1d27a" />
          <stop offset="0.5" stopColor="#b8892f" />
          <stop offset="1" stopColor="#6e4f17" />
        </linearGradient>
        <linearGradient id="liquid-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.35" />
          <stop offset="0.35" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
        <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.7" />
        </radialGradient>
        {BOTTLES.map((b) => (
          <clipPath key={b.id} id={`fill-${b.id}`}>
            <rect
              x={b.x - b.shape.w}
              y={b.base - b.shape.h * b.level}
              width={b.shape.w * 2}
              height={b.shape.h * b.level}
            />
          </clipPath>
        ))}
      </defs>

      <rect width={WIDTH} height={HEIGHT} fill="url(#wall)" />
      {/* Wall panelling. */}
      {Array.from({ length: 24 }, (_, i) => (
        <line
          key={i}
          x1={i * 62 + 20}
          x2={i * 62 + 20}
          y1={0}
          y2={COUNTER_TOP}
          stroke="#000"
          strokeOpacity="0.25"
          strokeWidth="2"
        />
      ))}

      {LAMPS.map((x) => (
        <ellipse
          key={`glow-${x}`}
          className="login-lamp-glow"
          cx={x}
          cy={190}
          rx={420}
          ry={330}
          fill="url(#lamp-glow)"
        />
      ))}

      {SHELVES.map((y, i) => (
        <g key={`shelf-${y}`}>
          {/* A light strip under each shelf washes the wall below it. */}
          {i < SHELVES.length - 1 && (
            <rect x={0} y={y + 29} width={WIDTH} height={120} fill="url(#shelf-light)" opacity="0.7" />
          )}
          <rect x={0} y={y} width={WIDTH} height={5} fill="#8a5a33" />
          <rect x={0} y={y + 5} width={WIDTH} height={16} fill="url(#shelf-front)" />
          <rect x={0} y={y + 21} width={WIDTH} height={8} fill="#000" opacity="0.35" />
        </g>
      ))}

      {BOTTLES.map((b) => {
        const d = bottlePath(b.x, b.base, b.shape);
        const { w, h, shoulder } = b.shape;
        return (
          <g key={b.id}>
            {/* Empty glass, then what's left in it. */}
            <path d={d} fill={b.glass} opacity="0.32" />
            <path d={d} fill={b.glass} clipPath={`url(#fill-${b.id})`} />
            <path d={d} fill="url(#liquid-shade)" />
            <rect
              x={b.x - w * 0.4}
              y={b.base - h * shoulder * 0.78}
              width={w * 0.8}
              height={h * shoulder * 0.42}
              rx={1.5}
              fill={b.label}
              opacity="0.88"
            />
            <line
              x1={b.x - w * 0.28}
              x2={b.x + w * 0.28}
              y1={b.base - h * shoulder * 0.62}
              y2={b.base - h * shoulder * 0.62}
              stroke={b.label === "#1c1410" ? "#c9a24a" : "#6b4326"}
              strokeWidth="1.5"
              opacity="0.7"
            />
            {/* Highlight along the glass. */}
            <rect
              x={b.x - w / 2 + 4}
              y={b.base - h * shoulder * 0.98}
              width={2.5}
              height={h * shoulder * 0.85}
              rx={1.25}
              fill="#fff"
              opacity="0.22"
            />
            <rect
              x={b.x - b.shape.neck / 2 - 1}
              y={b.base - h - 7}
              width={b.shape.neck + 2}
              height={9}
              rx={1.5}
              fill="#1a110b"
            />
          </g>
        );
      })}

      {/* Stock tags hanging from the shelf edge; red when it's time to order. */}
      {BOTTLES.filter((b) => b.tag).map((b, i) => {
        const tilt = ((i * 37) % 11) - 5;
        const low = b.tag! <= 3;
        return (
          <g
            key={`tag-${b.id}`}
            transform={`rotate(${tilt} ${b.x} ${b.base + 14})`}
          >
            <line
              x1={b.x}
              x2={b.x}
              y1={b.base + 14}
              y2={b.base + 34}
              stroke="#d9c7a3"
              strokeOpacity="0.6"
            />
            <rect
              x={b.x - 16}
              y={b.base + 34}
              width={32}
              height={20}
              rx={3}
              fill={low ? "#c8473a" : "#efe3c8"}
            />
            <circle cx={b.x} cy={b.base + 38} r={1.6} fill="#3a2213" />
            <text
              x={b.x}
              y={b.base + 50}
              textAnchor="middle"
              fontSize="10"
              fontFamily="ui-monospace, monospace"
              fontWeight="600"
              fill={low ? "#fff4ec" : "#3a2213"}
            >
              ×{b.tag}
            </text>
          </g>
        );
      })}

      {LAMPS.map((x) => (
        <g key={`lamp-${x}`}>
          <line x1={x} x2={x} y1={0} y2={70} stroke="#0a0604" strokeWidth="2" />
          <path
            d={`M ${x - 34} 108 L ${x - 12} 70 L ${x + 12} 70 L ${x + 34} 108 Z`}
            fill="#1a110b"
          />
          <path
            d={`M ${x - 34} 108 L ${x + 34} 108`}
            stroke="url(#brass)"
            strokeWidth="3"
          />
          <ellipse cx={x} cy={110} rx={22} ry={5} fill="#ffd28a" opacity="0.9" />
        </g>
      ))}

      {/* The bar itself, with its brass foot rail. */}
      <rect x={0} y={COUNTER_TOP} width={WIDTH} height={HEIGHT - COUNTER_TOP} fill="url(#counter)" />
      <rect x={0} y={COUNTER_TOP} width={WIDTH} height={2} fill="#a3714a" opacity="0.6" />
      <rect x={0} y={COUNTER_TOP + 62} width={WIDTH} height={7} rx={3.5} fill="url(#brass)" opacity="0.85" />

      <rect width={WIDTH} height={HEIGHT} fill="url(#vignette)" />
    </svg>
  );
}
