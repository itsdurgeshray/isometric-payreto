"use client";

/**
 * IsometricTriad
 * Isometric triad (Paysourcing / Meta / Flex) built from solid shaded cubes.
 * Each block is a set of unit cubes that hop, one after another, into a new
 * arrangement only when the signal reaches it; it hovers over its stage with a slow breathing float,
 * and a blue signal travels along the triangle to hand activity from
 * one stage to the next. The active stage turns brand blue.
 *
 * Drop-in: requires `framer-motion` and Tailwind. No other dependencies.
 *   <IsometricTriad className="mx-auto w-full max-w-[760px]" />
 */

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

const BLUE = "#0230AE"; // Payreto brand blue
const BLUE_LINE = "#3B5EE6"; // signal / ring blue
const LABEL = "#6B6E75";
const HAIR = "#D9DDE6"; // hairline for stages and chips

// cube face colours: [light stop, dark stop]
const FACE = {
  active: {
    top: ["#3352D6", "#1A37B4"],
    right: ["#1B3BBA", "#071E85"],
    left: ["#FFFFFF", "#D3D8E5"],
    edgeLight: "#BCC3D3",
    edgeBlue: "rgba(255,255,255,0.32)",
  },
  idle: {
    top: ["#FFFFFF", "#EEF0F5"],
    right: ["#E7EAF1", "#CDD2DE"],
    left: ["#FFFFFF", "#E3E6EE"],
    edgeLight: "#C6CBD6",
    edgeBlue: "#C6CBD6",
  },
} as const;

const COLOR_EASE = "0.9s cubic-bezier(0.4, 0, 0.2, 1)";

/* ------------------------------------------------------------------ */
/* Isometric geometry                                                  */
/* ------------------------------------------------------------------ */

const U = 127; // one model unit in px (viewBox space)
const CX = U * Math.cos(Math.PI / 6);
const SY = U * 0.5;

const P = (ax: number, ay: number, x: number, y: number, z: number) =>
  `${(ax + (x - y) * CX).toFixed(1)} ${(ay + (x + y) * SY - z * U).toFixed(1)}`;

/** grid position of one cube, in cube units */
type Cell = [x: number, y: number, z: number];
type Arrangement = Cell[];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ------------------------------------------------------------------ */
/* Block arrangements (cube grid units)                                */
/* ------------------------------------------------------------------ */

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// Paysourcing: the 3-2-1 staircase, a two-wide tower, a stacked checker
const STAIR: Arrangement[] = [
  [[0, 0, 0], [0, 0, 1], [0, 0, 2], [1, 0, 0], [1, 0, 1], [2, 0, 0]],
  [[0.5, 0, 0], [0.5, 0, 1], [0.5, 0, 2], [1.5, 0, 0], [1.5, 0, 1], [1.5, 0, 2]],
  [[0.5, -0.5, 0], [0.5, -0.5, 1], [1.5, 0.5, 1], [1.5, -0.5, 0], [1.5, 0.5, 0], [0.5, 0.5, 0]],
];

// Meta: three 2x2 layers that stack apart, slide like a drawer, then fold into a block
const LAYERS: Arrangement[] = (() => {
  const cells = range(3).flatMap((L) => range(4).map((c) => ({ L, i: c % 2, j: Math.floor(c / 2) })));
  return [
    cells.map(({ L, i, j }) => [i, j, L * 1.3] as Cell),
    cells.map(({ L, i, j }) => [i + (L === 1 ? 0.8 : 0), j, L] as Cell),
    cells.map(({ L, i, j }) => (L < 2 ? [i - 0.5, j, L] : [1.5, j, i]) as Cell),
  ];
})();

// Flex: a 2x2x2 cube that steps into bars, then splits into four columns
const FLEXCUBE: Arrangement[] = (() => {
  const cells = range(8).map((c) => ({ i: c % 2, j: Math.floor(c / 2) % 2, k: Math.floor(c / 4) }));
  return [
    cells.map(({ i, j, k }) => [i, j, k] as Cell),
    cells.map(({ i, j, k }) => (i === 1 && j === 1 && k === 1 ? [0, 0, 2] : [i, j, k]) as Cell),
    cells.map(({ i, j, k }) => [i * 1.3 - 0.15, j * 1.3 - 0.15, k] as Cell),
  ];
})();

/* ------------------------------------------------------------------ */
/* Scene layout (viewBox space)                                        */
/* ------------------------------------------------------------------ */

type StageKey = "meta" | "paysourcing" | "flex";

type StageDef = {
  key: StageKey;
  label: string;
  frames: Arrangement[];
  cube: number; // cube edge in model units
  centre: [number, number]; // grid point that sits on the stage axis
  anchor: [number, number]; // stage axis in viewBox px
  stage: { cx: number; cy: number; rx: number; lip: number; inner: number; innerCy: number; ring: number };
  chip: [number, number];
  labelAt: [number, number];
  icon: "shield" | "layers" | "zap";
  delay: number;
};

const STAGES: Record<StageKey, StageDef> = {
  paysourcing: {
    key: "paysourcing",
    label: "PAYSOURCING",
    frames: STAIR,
    cube: 0.5,
    centre: [1.5, 0.5],
    anchor: [810, 501],
    stage: { cx: 810, cy: 613, rx: 187, lip: 146, inner: 94, innerCy: 643, ring: 26 },
    chip: [810, 176],
    labelAt: [810, 112],
    icon: "shield",
    delay: 0,
  },
  meta: {
    key: "meta",
    label: "META",
    frames: LAYERS,
    cube: 0.45,
    centre: [1, 1],
    anchor: [315, 790],
    stage: { cx: 315, cy: 900, rx: 156, lip: 122, inner: 79, innerCy: 927, ring: 22 },
    chip: [315, 462],
    labelAt: [315, 1108],
    icon: "layers",
    delay: 1.4,
  },
  flex: {
    key: "flex",
    label: "FLEX",
    frames: FLEXCUBE,
    cube: 0.5,
    centre: [1, 1],
    anchor: [1305, 790],
    stage: { cx: 1305, cy: 900, rx: 157, lip: 122, inner: 79, innerCy: 927, ring: 22 },
    chip: [1305, 462],
    labelAt: [1305, 1108],
    icon: "zap",
    delay: 2.6,
  },
};

const ORDER: StageKey[] = ["meta", "paysourcing", "flex"];

const APEX: [number, number] = [810, 748];
const BASE_L: [number, number] = [472, 922];
const BASE_R: [number, number] = [1148, 922];

// signal tracks run parallel to each edge, just outside the slopes and just
// inside the base, like the reference
const up = (p: [number, number], dy: number): [number, number] => [p[0], p[1] - dy];
const TRACK = {
  left: { from: up(BASE_L, 24), to: up(APEX, 24) },
  right: { from: up(APEX, 24), to: up(BASE_R, 24) },
  base: { from: up(BASE_R, 12), to: up(BASE_L, 12) },
};

const EDGES: Record<string, { from: [number, number]; to: [number, number] }> = {
  "meta>paysourcing": TRACK.left,
  "paysourcing>flex": TRACK.right,
  "flex>meta": TRACK.base,
};

const REST_DASHES: Array<{ from: [number, number]; to: [number, number]; t: [number, number] }> = [
  { ...TRACK.left, t: [0.22, 0.66] },
  { ...TRACK.right, t: [0.34, 0.78] },
  { ...TRACK.base, t: [0.24, 0.76] },
];

const along = (a: [number, number], b: [number, number], t: number) =>
  [lerp(a[0], b[0], t), lerp(a[1], b[1], t)] as const;

/* ------------------------------------------------------------------ */
/* Timing                                                              */
/* ------------------------------------------------------------------ */

const MORPH = 1.7; // seconds a morph takes (cubes cascade inside it)
const FLOAT = 4.4; // breathing period
const STEP = 3.4; // seconds per stage hand-off
const TRAVEL = 1.25; // signal travel time
const HOP = 0.45; // how high a moving cube lifts, in cube units

/* ------------------------------------------------------------------ */
/* Cubes                                                               */
/* ------------------------------------------------------------------ */

type Placed = { id: number; depth: number; top: string; right: string; left: string };

function placeCubes(def: StageDef, phase: number): Placed[] {
  const { frames, cube: c, centre, anchor } = def;
  const n = frames.length;
  const i = Math.min(Math.floor(phase), n - 1);
  const t = phase - i;
  const A = frames[i % n];
  const B = frames[(i + 1) % n];
  const count = A.length;
  const spread = 0.45; // share of the morph used to cascade the start times
  const [ax, ay] = anchor;

  return A.map((a, k) => {
    const b = B[k];
    const start = count > 1 ? (k / (count - 1)) * spread : 0;
    const e = easeInOut(clamp01((t - start) / (1 - spread)));
    const moves = Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.05;
    const gx = lerp(a[0], b[0], e);
    const gy = lerp(a[1], b[1], e);
    const gz = lerp(a[2], b[2], e) + (moves ? Math.sin(Math.PI * e) * HOP : 0);

    const x0 = (gx - centre[0]) * c;
    const y0 = (gy - centre[1]) * c;
    const z0 = gz * c;
    const x1 = x0 + c;
    const y1 = y0 + c;
    const z1 = z0 + c;
    const p = (x: number, y: number, z: number) => P(ax, ay, x, y, z);

    return {
      id: k,
      depth: gx + gy + gz + gz * 0.001,
      top: `M${p(x0, y0, z1)}L${p(x1, y0, z1)}L${p(x1, y1, z1)}L${p(x0, y1, z1)}Z`,
      right: `M${p(x1, y0, z1)}L${p(x1, y1, z1)}L${p(x1, y1, z0)}L${p(x1, y0, z0)}Z`,
      left: `M${p(x0, y1, z1)}L${p(x1, y1, z1)}L${p(x1, y1, z0)}L${p(x0, y1, z0)}Z`,
    };
  }).sort((m, n2) => m.depth - n2.depth);
}

function FaceGradients({ uid, active }: { uid: string; active: boolean }) {
  const tone = active ? FACE.active : FACE.idle;
  const stop = (color: string) => ({ stopColor: color, transition: `stop-color ${COLOR_EASE}` });
  return (
    <defs>
      <linearGradient id={`${uid}-top`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" style={stop(tone.top[0])} />
        <stop offset="1" style={stop(tone.top[1])} />
      </linearGradient>
      <linearGradient id={`${uid}-right`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style={stop(tone.right[0])} />
        <stop offset="1" style={stop(tone.right[1])} />
      </linearGradient>
      <linearGradient id={`${uid}-left`} x1="0" y1="0" x2="0.15" y2="1">
        <stop offset="0" style={stop(tone.left[0])} />
        <stop offset="1" style={stop(tone.left[1])} />
      </linearGradient>
    </defs>
  );
}

function Block({ def, active, play, reduce }: { def: StageDef; active: boolean; play: boolean; reduce: boolean }) {
  const uid = `cube${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const phase = useMotionValue(0);
  const [p, setP] = useState(0);
  useMotionValueEvent(phase, "change", setP);
  const n = def.frames.length;

  // Idle blocks hold their shape. Each time the signal arrives and the block
  // becomes active, it transforms once into its next arrangement and rests.
  const index = useRef(0);
  const morphed = useRef(false);
  useEffect(() => {
    if (!active) {
      morphed.current = false;
      return;
    }
    if (!play || reduce || morphed.current) return;
    morphed.current = true;
    const from = index.current;
    const to = from + 1;
    phase.set(from);
    const controls = animate(phase, to, {
      duration: MORPH,
      ease: "linear", // easing is applied per cube so they cascade
      onComplete: () => {
        index.current = to % n;
        phase.set(index.current);
      },
    });
    return () => {
      // interrupted mid-morph (e.g. scrolled away): settle on the target shape
      if (phase.get() !== index.current) {
        controls.stop();
        index.current = to % n;
        phase.set(index.current);
      }
    };
  }, [active, play, reduce, n, phase]);

  const cubes = useMemo(() => placeCubes(def, p), [def, p]);
  const tone = active ? FACE.active : FACE.idle;
  const edge = (c: string) => ({ stroke: c, transition: `stroke ${COLOR_EASE}` });

  return (
    <g strokeWidth={1} strokeLinejoin="round">
      <FaceGradients uid={uid} active={active} />
      {cubes.map((cube) => (
        <g key={cube.id}>
          <path d={cube.left} fill={`url(#${uid}-left)`} style={edge(tone.edgeLight)} />
          <path d={cube.right} fill={`url(#${uid}-right)`} style={edge(tone.edgeBlue)} />
          <path d={cube.top} fill={`url(#${uid}-top)`} style={edge(tone.edgeBlue)} />
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Stage, chip, signal                                                 */
/* ------------------------------------------------------------------ */

const ISO = 0.577; // ellipse ratio of a circle seen isometrically

function Stage({ def, active, breathe }: { def: StageDef; active: boolean; breathe: boolean }) {
  const { cx, cy, rx, lip, inner, innerCy, ring } = def.stage;
  const ry = rx * ISO;
  const band = `M${cx - rx} ${cy}L${cx - rx} ${cy + ring}A${rx} ${ry} 0 0 0 ${cx + rx} ${cy + ring}L${cx + rx} ${cy}A${rx} ${ry} 0 0 0 ${cx - rx} ${cy}Z`;
  const pulse = breathe
    ? { duration: FLOAT, repeat: Infinity, ease: "easeInOut" as const, delay: def.delay * 0.5 }
    : { duration: 0.6 };

  return (
    <g>
      {/* disc: rim band, surface, recessed lip */}
      <path d={band} fill="url(#triad-rim)" stroke={HAIR} strokeWidth={1} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#triad-surface)" stroke={HAIR} strokeWidth={1} />
      <ellipse cx={cx} cy={cy + ring * 0.25} rx={lip} ry={lip * ISO} fill="url(#triad-lip)" stroke="#E3E6EE" strokeWidth={1} />

      {/* soft blue pool when active */}
      <motion.ellipse
        cx={cx}
        cy={innerCy}
        rx={inner * 1.35}
        ry={inner * 1.35 * ISO}
        fill="url(#triad-pool)"
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.9 }}
      />

      {/* contact shadow: tightens and darkens as the block sinks */}
      <motion.ellipse
        cx={cx}
        cy={innerCy}
        rx={inner * 0.95}
        ry={inner * 0.95 * ISO}
        fill="url(#triad-shadow)"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={breathe ? { scale: [1, 0.86, 1], opacity: [0.95, 0.6, 0.95] } : { scale: 1, opacity: 0.95 }}
        transition={pulse}
      />

      {/* blue landing ring, breathing with the block */}
      <motion.ellipse
        cx={cx}
        cy={innerCy}
        rx={inner}
        ry={inner * ISO}
        fill="none"
        stroke={BLUE_LINE}
        strokeWidth={1.6}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={
          breathe
            ? { scale: [1, 0.92, 1], opacity: active ? [0.95, 0.7, 0.95] : [0.45, 0.28, 0.45] }
            : { scale: 1, opacity: active ? 0.95 : 0.45 }
        }
        transition={pulse}
      />
    </g>
  );
}

const ICONS: Record<StageDef["icon"], string[]> = {
  shield: [
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    "m9 12 2 2 4-4",
  ],
  layers: [
    "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
    "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",
    "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
  ],
  zap: [
    "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
  ],
};

function Chip({ def, active }: { def: StageDef; active: boolean }) {
  const [x, y] = def.chip;
  const s = 58;
  return (
    <g transform={`translate(${x - s / 2} ${y - s / 2})`}>
      <motion.rect
        width={s}
        height={s}
        rx={16}
        fill="#fff"
        strokeWidth={1.2}
        filter="url(#triad-chip-shadow)"
        initial={false}
        animate={{ stroke: active ? BLUE_LINE : HAIR }}
        transition={{ duration: 0.8 }}
      />
      <motion.g
        transform={`translate(${(s - 26) / 2} ${(s - 26) / 2}) scale(${26 / 24})`}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ stroke: active ? BLUE : "#7B7F87" }}
        transition={{ duration: 0.8 }}
      >
        {ICONS[def.icon].map((d) => (
          <path key={d} d={d} />
        ))}
      </motion.g>
    </g>
  );
}

function Signal({ from, to }: { from: [number, number]; to: [number, number] }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const d = `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`;
  const run = { duration: TRAVEL, ease: [0.55, 0, 0.35, 1] as const };
  return (
    <g>
      <defs>
        <mask id={`sig-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1200">
          <motion.path
            d={d}
            stroke="#fff"
            strokeWidth={10}
            fill="none"
            initial={{ pathLength: 0.28, pathOffset: -0.28 }}
            animate={{ pathOffset: 1 }}
            transition={run}
          />
        </mask>
      </defs>
      <path d={d} stroke={BLUE_LINE} strokeWidth={2.4} strokeLinecap="round" fill="none" mask={`url(#sig-${id})`} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export type IsometricTriadProps = {
  className?: string;
  /** Override the three labels, e.g. for localisation. */
  labels?: Partial<Record<StageKey, string>>;
  /** Accessible description of the illustration. */
  title?: string;
};

export default function IsometricTriad({
  className,
  labels,
  title = "Paysourcing, Meta and Flex: three connected stages of the Payreto model",
}: IsometricTriadProps) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reduce = useReducedMotion() ?? false;

  const [step, setStep] = useState(0);
  const [active, setActive] = useState<StageKey>(ORDER[0]);
  const [hovered, setHovered] = useState<StageKey | null>(null);
  const [edge, setEdge] = useState<string | null>(null);

  // hand activity around the triangle: meta > paysourcing > flex > meta
  useEffect(() => {
    if (!inView || reduce || hovered) return;
    const tick = setInterval(() => setStep((s) => s + 1), STEP * 1000);
    return () => clearInterval(tick);
  }, [inView, reduce, hovered]);

  useEffect(() => {
    if (step === 0) return;
    const from = ORDER[(step - 1) % 3];
    const to = ORDER[step % 3];
    setEdge(`${from}>${to}`);
    const arrive = setTimeout(() => setActive(to), TRAVEL * 820);
    const clear = setTimeout(() => setEdge(null), TRAVEL * 1000 + 50);
    return () => {
      clearTimeout(arrive);
      clearTimeout(clear);
    };
  }, [step]);

  const current = hovered ?? active;
  const breathe = inView && !reduce;

  return (
    <svg
      ref={ref}
      viewBox="120 40 1380 1110"
      role="img"
      aria-label={title}
      className={className}
      style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="triad-tri" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E7ECFD" stopOpacity={0.95} />
          <stop offset="100%" stopColor="#F1F4FE" stopOpacity={0.6} />
        </linearGradient>
        <linearGradient id="triad-rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E9ECF3" />
          <stop offset="0.5" stopColor="#F4F6FA" />
          <stop offset="1" stopColor="#DCE0E9" />
        </linearGradient>
        <linearGradient id="triad-surface" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#F3F5F9" />
        </linearGradient>
        <linearGradient id="triad-lip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EEF1F6" />
          <stop offset="1" stopColor="#FFFFFF" />
        </linearGradient>
        <radialGradient id="triad-pool">
          <stop offset="0%" stopColor={BLUE_LINE} stopOpacity={0.2} />
          <stop offset="100%" stopColor={BLUE_LINE} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="triad-shadow">
          <stop offset="0%" stopColor="#1B2A5E" stopOpacity={0.16} />
          <stop offset="100%" stopColor="#1B2A5E" stopOpacity={0} />
        </radialGradient>
        <filter id="triad-chip-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#1B2A5E" floodOpacity="0.08" />
        </filter>
      </defs>

      {/* connecting triangle */}
      <path
        d={`M${APEX[0]} ${APEX[1]}L${BASE_R[0]} ${BASE_R[1]}L${BASE_L[0]} ${BASE_L[1]}Z`}
        fill="url(#triad-tri)"
      />

      {/* resting dashes */}
      <g stroke={BLUE_LINE} strokeWidth={2.2} strokeLinecap="round" opacity={0.85}>
        {REST_DASHES.map(({ from, to, t }, i) => {
          const a = along(from, to, t[0]);
          const b = along(from, to, t[1]);
          return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
        })}
      </g>

      {/* travelling hand-off signal */}
      {edge && EDGES[edge] && <Signal key={`${edge}-${step}`} from={EDGES[edge].from} to={EDGES[edge].to} />}

      {/* stages, floating blocks and chips (back to front) */}
      {(["paysourcing", "meta", "flex"] as StageKey[]).map((key) => {
        const def = STAGES[key];
        const isActive = current === key;
        const float = breathe
          ? { duration: FLOAT, repeat: Infinity, ease: "easeInOut" as const, delay: def.delay * 0.5 }
          : undefined;
        return (
          <g key={key} onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)}>
            <Stage def={def} active={isActive} breathe={breathe} />
            <motion.g animate={breathe ? { y: [0, -12, 0] } : { y: 0 }} transition={float}>
              <Block def={def} active={isActive} play={inView} reduce={reduce} />
            </motion.g>
            <motion.g
              animate={breathe ? { y: [0, -7, 0] } : { y: 0 }}
              transition={float && { ...float, delay: def.delay * 0.5 + 0.25 }}
            >
              <Chip def={def} active={isActive} />
            </motion.g>
            <motion.text
              x={def.labelAt[0]}
              y={def.labelAt[1]}
              textAnchor="middle"
              dx={4.4 /* offsets the trailing letter-space so labels sit centred */}
              fontSize={44}
              fontWeight={600}
              letterSpacing="0.2em"
              initial={false}
              animate={{ fill: isActive ? BLUE : LABEL }}
              transition={{ duration: 0.8 }}
              style={{ fontFamily: "inherit" }}
            >
              {labels?.[key] ?? def.label}
            </motion.text>
          </g>
        );
      })}
    </svg>
  );
}
