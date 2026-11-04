// Vehicle illustrations for the customer's category list (owner 2026-11-04: "create these kind of icons for each vehicle category and also
// show these images once the customer clicks those categories", then "make it more mature and thick just like the reference").
// ONE parametric drawing, so all thirteen share one style: a heavy, realistic commercial-vehicle look seen from the front-left and slightly
// above (the near side, the front face and the roof / open bed are visible), soft gradients, a white cab with a tinted windscreen and side
// window, door seam and handle, mirror, grille, headlight and bumper, a deep-blue open bed or a white box / corrugated container, a dark
// chassis and chunky tyres with rims. Bigger categories are longer with more axles (each drawing is cropped to its own bounds so every icon
// fills its box). Original artwork, language-free, crisp at any size, bundled with the app (no image files, works offline).
import React from "react";

// Index-aligned with CUSTOMER_LIST_CATEGORY_NAMES in App.jsx (12 weight limits + "above 32000 kg" = 13 drawings).
//   cw/ch = cab width/height, body = open | box | container, len = body length, bh = body height, gap = space between cab and body,
//   wheels = x of each wheel from the vehicle's left edge (more wheels = more axles).
export const VEHICLE_ART_SPECS = [
  { cw: 24, ch: 31, body: "open", len: 32, bh: 14, gap: 2, wheels: [10, 46] },                       // 3 wheeler
  { cw: 28, ch: 35, body: "open", len: 40, bh: 17, gap: 2, wheels: [11, 56] },                      // Tata Ace
  { cw: 30, ch: 37, body: "open", len: 50, bh: 19, gap: 2, wheels: [12, 68] },                      // Pickup
  { cw: 30, ch: 37, body: "open", len: 62, bh: 23, gap: 2, wheels: [12, 80] },                      // Pickup 8ft
  { cw: 32, ch: 41, body: "box", len: 70, bh: 35, gap: 2, wheels: [13, 88] },                       // Tata 407
  { cw: 34, ch: 43, body: "box", len: 82, bh: 38, gap: 2, wheels: [14, 102] },                      // 17ft Eicher
  { cw: 34, ch: 43, body: "container", len: 92, bh: 40, gap: 2, wheels: [14, 112] },                // 20ft container
  { cw: 34, ch: 43, body: "open", len: 100, bh: 30, gap: 2, wheels: [14, 102, 117] },               // 6 wheeler
  { cw: 36, ch: 45, body: "box", len: 108, bh: 42, gap: 2, wheels: [15, 114, 130] },                // 22ft/24ft truck
  { cw: 36, ch: 45, body: "open", len: 114, bh: 32, gap: 2, wheels: [13, 29, 122, 138] },           // 10 wheeler
  { cw: 36, ch: 46, body: "container", len: 116, bh: 44, gap: 2, wheels: [14, 30, 128, 144] },      // 32ft container
  { cw: 38, ch: 48, body: "box", len: 118, bh: 44, gap: 2, wheels: [15, 31, 124, 140, 156] },       // 12/14/16 wheeler
  { cw: 38, ch: 48, body: "container", len: 122, bh: 44, gap: 8, wheels: [15, 42, 130, 146, 162] }, // 32t+ truck (tractor + trailer)
];

const INK = "#1B2432";       // chassis / tyres
const GLASS_TOP = "#2B3F63";  // tinted glass
const GLASS_BOT = "#5E7699";
const OUTLINE = "rgba(15,27,45,0.55)";

const GROUND = 62;
const WHEEL_R = 8;
const WHEEL_Y = GROUND - WHEEL_R;   // 54
const FLOOR = 44;                   // top of the chassis = bottom of the body
const CAB_BOTTOM = 49.5;
const DEPTH = 12;                   // how far the front face / roof recede (to the up-left)
const RISE = 6;

export default function CategoryVehicleArt({ index = 0, className = "", title = "" }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const sp = VEHICLE_ART_SPECS[Math.min(Math.max(index, 0), VEHICLE_ART_SPECS.length - 1)];
  // The width must also cover the last wheel's dark arch, or a many-axle truck loses its rear wheel at the edge.
  const width = Math.max(sp.cw + sp.gap + sp.len, Math.max(...sp.wheels) + WHEEL_R + 4);
  const x0 = DEPTH + 6;                               // near-side left edge of the cab (the front face recedes to the left of it)
  const cabTop = CAB_BOTTOM - sp.ch;
  const bx = x0 + sp.cw + sp.gap;
  const by = FLOOR - sp.bh;
  const d = DEPTH, rise = RISE;
  // point on the cab's FRONT face: u 0 = the near edge, 1 = the far edge; t 0 = roof line, 1 = bottom
  const fp = (u, t) => `${(x0 - d * u).toFixed(2)},${(cabTop + t * sp.ch - rise * u).toFixed(2)}`;
  const g = (name) => `url(#${name}${uid})`;

  const vbLeft = 2;
  const vbRight = x0 + width + 5;
  const vbTop = Math.min(cabTop, by) - rise - 4;
  const viewBox = `${vbLeft} ${vbTop.toFixed(1)} ${(vbRight - vbLeft).toFixed(1)} ${(GROUND + 5 - vbTop).toFixed(1)}`;

  // vertical ribs / corrugation / stakes on the near side of the body
  const marks = [];
  if (sp.body === "container") for (let x = bx + 4; x < bx + sp.len - 2; x += 3.6) marks.push(<line key={x} x1={x} y1={by + 4} x2={x} y2={FLOOR - 4} stroke="rgba(30,45,70,0.16)" strokeWidth="1" />);
  if (sp.body === "box") for (let x = bx + 15; x < bx + sp.len - 6; x += 17) marks.push(<line key={x} x1={x} y1={by + 3} x2={x} y2={by + sp.bh - 10} stroke="rgba(30,45,70,0.13)" strokeWidth="1" />);
  if (sp.body === "open") for (let x = bx + 9; x < bx + sp.len - 4; x += 13) marks.push(<g key={x}><rect x={x - 1.4} y={by + 3} width={2.8} height={sp.bh - 3} fill="#0E3282" opacity="0.8" /><line x1={x + 2.2} y1={by + 4} x2={x + 2.2} y2={FLOOR - 1} stroke="rgba(255,255,255,0.18)" strokeWidth="0.9" /></g>);

  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : "true"} aria-label={title || undefined} focusable="false">
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`cab${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#DCE4EF" /></linearGradient>
        <linearGradient id={`front${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#C9D3E1" /><stop offset="1" stopColor="#F4F7FB" /></linearGradient>
        <linearGradient id={`roof${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#F8FAFD" /><stop offset="1" stopColor="#E4EAF3" /></linearGradient>
        <linearGradient id={`glass${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={GLASS_TOP} /><stop offset="1" stopColor={GLASS_BOT} /></linearGradient>
        <linearGradient id={`blue${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3470E6" /><stop offset="1" stopColor="#1647AB" /></linearGradient>
        <linearGradient id={`box${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E3EAF3" /></linearGradient>
        <linearGradient id={`cont${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E9EEF6" /><stop offset="1" stopColor="#C6D1E1" /></linearGradient>
        <radialGradient id={`rim${uid}`} cx="0.4" cy="0.35" r="0.8"><stop offset="0" stopColor="#E8EEF6" /><stop offset="1" stopColor="#8E9BB0" /></radialGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx={x0 + width / 2 - 2} cy={GROUND + 1.2} rx={width / 2 + 8} ry={3} fill="rgba(15,27,45,0.20)" />

      {/* chassis + underbody */}
      <rect x={x0 + 2} y={FLOOR} width={width - 2} height={5.5} rx={1.5} fill={INK} />
      <rect x={x0 + sp.cw * 0.5} y={FLOOR + 5.5} width={Math.min(18, sp.len * 0.28)} height={4} rx={1.5} fill="#2A3445" />

      {/* BODY ---------------------------------------------------------------- */}
      {sp.body === "open" && (
        <g>
          {/* far wall's inner face + bed (seen from above) */}
          <polygon points={`${bx},${by} ${bx + sp.len},${by} ${bx + sp.len - d},${by - rise} ${bx - d},${by - rise}`} fill="#0F2F7A" stroke={OUTLINE} strokeWidth="0.9" strokeLinejoin="round" />
          <polygon points={`${bx},${by} ${bx - d},${by - rise} ${bx - d},${by - rise + 3} ${bx},${by + 3}`} fill="#0B2565" />
          <rect x={bx} y={by} width={sp.len} height={sp.bh} rx={1.8} fill={g("blue")} stroke={OUTLINE} strokeWidth="1.1" />
          <rect x={bx} y={by} width={sp.len} height={3.4} rx={1.6} fill="#5A92F2" />
          <rect x={bx} y={by + 3.4} width={sp.len} height={1.2} fill="rgba(8,30,90,0.5)" />
          {marks}
          <rect x={bx} y={FLOOR - 2.2} width={sp.len} height={2.2} fill="#0E3282" />
        </g>
      )}
      {sp.body === "box" && (
        <g>
          <polygon points={`${bx},${by} ${bx + sp.len},${by} ${bx + sp.len - d},${by - rise} ${bx - d},${by - rise}`} fill={g("roof")} stroke={OUTLINE} strokeWidth="0.9" strokeLinejoin="round" />
          <rect x={bx} y={by} width={sp.len} height={sp.bh} rx={2} fill={g("box")} stroke={OUTLINE} strokeWidth="1.1" />
          {marks}
          <rect x={bx} y={by + sp.bh - 11} width={sp.len} height={4.2} fill="#143A82" />
          <rect x={bx} y={by + sp.bh - 6.4} width={sp.len} height={1.2} fill="rgba(255,255,255,0.35)" />
          <rect x={bx} y={by} width={sp.len} height={2.6} rx={1.3} fill="rgba(255,255,255,0.8)" />
        </g>
      )}
      {sp.body === "container" && (
        <g>
          <polygon points={`${bx},${by} ${bx + sp.len},${by} ${bx + sp.len - d},${by - rise} ${bx - d},${by - rise}`} fill={g("roof")} stroke={OUTLINE} strokeWidth="0.9" strokeLinejoin="round" />
          <rect x={bx} y={by} width={sp.len} height={sp.bh} rx={1.6} fill={g("cont")} stroke={OUTLINE} strokeWidth="1.1" />
          {marks}
          <rect x={bx} y={by} width={sp.len} height={3.6} fill="#8A99AE" />
          <rect x={bx} y={FLOOR - 4.4} width={sp.len} height={4.4} fill="#8A99AE" />
          <rect x={bx} y={by + sp.bh * 0.46} width={sp.len} height={4.4} fill="#143A82" opacity="0.92" />
          <rect x={bx} y={by + 3.6} width={3} height={sp.bh - 8} fill="#9DAABD" />
          <rect x={bx + sp.len - 3} y={by + 3.6} width={3} height={sp.bh - 8} fill="#9DAABD" />
        </g>
      )}
      {/* tail light */}
      <rect x={bx + sp.len - 3.4} y={FLOOR - 7} width={2.4} height={4.4} rx={1} fill="#C62828" />

      {/* CAB ----------------------------------------------------------------- */}
      {/* roof (receding) */}
      <polygon points={`${x0},${cabTop} ${x0 + sp.cw - 2},${cabTop} ${x0 + sp.cw - 2 - d},${cabTop - rise} ${x0 - d},${cabTop - rise}`} fill={g("roof")} stroke={OUTLINE} strokeWidth="1" strokeLinejoin="round" />
      {/* front face */}
      <polygon points={`${fp(0, 0)} ${fp(1, 0)} ${fp(1, 1)} ${fp(0, 1)}`} fill={g("front")} stroke={OUTLINE} strokeWidth="1.1" strokeLinejoin="round" />
      <polygon points={`${fp(0.1, 0.1)} ${fp(0.92, 0.1)} ${fp(0.92, 0.5)} ${fp(0.1, 0.5)}`} fill={g("glass")} stroke="rgba(10,20,40,0.6)" strokeWidth="0.8" strokeLinejoin="round" />
      <polygon points={`${fp(0.1, 0.1)} ${fp(0.42, 0.1)} ${fp(0.3, 0.5)} ${fp(0.1, 0.5)}`} fill="rgba(255,255,255,0.18)" />
      <polygon points={`${fp(0.1, 0.57)} ${fp(0.92, 0.57)} ${fp(0.92, 0.72)} ${fp(0.1, 0.72)}`} fill="#222B39" stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      <polygon points={`${fp(0.2, 0.61)} ${fp(0.84, 0.61)} ${fp(0.84, 0.625)} ${fp(0.2, 0.625)}`} fill="rgba(255,255,255,0.35)" />
      <polygon points={`${fp(0.2, 0.665)} ${fp(0.84, 0.665)} ${fp(0.84, 0.68)} ${fp(0.2, 0.68)}`} fill="rgba(255,255,255,0.3)" />
      <polygon points={`${fp(0.04, 0.58)} ${fp(0.22, 0.58)} ${fp(0.22, 0.7)} ${fp(0.04, 0.7)}`} fill="#FFF3C9" stroke="rgba(0,0,0,0.45)" strokeWidth="0.6" />
      <polygon points={`${fp(-0.02, 0.86)} ${fp(1, 0.86)} ${fp(1, 1.02)} ${fp(-0.02, 1.02)}`} fill="#222B39" stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      {/* near side of the cab */}
      <path d={`M ${x0} ${CAB_BOTTOM} L ${x0} ${cabTop} L ${x0 + sp.cw - 3} ${cabTop} Q ${x0 + sp.cw} ${cabTop} ${x0 + sp.cw} ${cabTop + 5} L ${x0 + sp.cw} ${CAB_BOTTOM} Z`} fill={g("cab")} stroke={OUTLINE} strokeWidth="1.1" strokeLinejoin="round" />
      <rect x={x0 + 0.6} y={CAB_BOTTOM - sp.ch * 0.22} width={sp.cw - 1.2} height={sp.ch * 0.22 - 0.6} fill="#C4CFDF" />
      <path d={`M ${x0 + 2.6} ${cabTop + sp.ch * 0.14} L ${x0 + sp.cw * 0.7} ${cabTop + sp.ch * 0.14} L ${x0 + sp.cw * 0.7} ${cabTop + sp.ch * 0.5} L ${x0 + 2.6} ${cabTop + sp.ch * 0.5} Z`} fill={g("glass")} stroke="rgba(10,20,40,0.6)" strokeWidth="0.8" strokeLinejoin="round" />
      <path d={`M ${x0 + 2.6} ${cabTop + sp.ch * 0.14} L ${x0 + sp.cw * 0.34} ${cabTop + sp.ch * 0.14} L ${x0 + sp.cw * 0.14} ${cabTop + sp.ch * 0.5} L ${x0 + 2.6} ${cabTop + sp.ch * 0.5} Z`} fill="rgba(255,255,255,0.18)" />
      <line x1={x0 + sp.cw * 0.76} y1={cabTop + sp.ch * 0.1} x2={x0 + sp.cw * 0.76} y2={CAB_BOTTOM - 1} stroke="rgba(15,27,45,0.45)" strokeWidth="1" />
      <rect x={x0 + sp.cw * 0.6} y={cabTop + sp.ch * 0.56} width={5} height={1.8} rx={0.9} fill="#3A4659" />
      <rect x={x0 - 3.2} y={cabTop + sp.ch * 0.3} width={3.4} height={6} rx={1.2} fill={INK} />
      <rect x={x0 - 0.6} y={cabTop + sp.ch * 0.33} width={2} height={1.4} fill={INK} />
      <rect x={x0 + 1} y={CAB_BOTTOM - 0.5} width={sp.cw * 0.5} height={2.4} rx={0.8} fill="#2A3445" />

      {/* WHEELS (near side) --------------------------------------------------- */}
      {sp.wheels.map((wx) => {
        const cx = x0 + wx;
        return (
          <g key={wx}>
            <circle cx={cx} cy={WHEEL_Y} r={WHEEL_R + 2.6} fill={INK} />
            <circle cx={cx} cy={WHEEL_Y} r={WHEEL_R} fill="#12171F" stroke="#2E3948" strokeWidth="1" />
            <circle cx={cx} cy={WHEEL_Y} r={WHEEL_R - 1.8} fill="none" stroke="#2A3544" strokeWidth="1" />
            <circle cx={cx} cy={WHEEL_Y} r={4.7} fill={g("rim")} stroke="#6F7C91" strokeWidth="0.8" />
            <circle cx={cx} cy={WHEEL_Y} r={1.9} fill="#56627A" />
            {[0, 72, 144, 216, 288].map((a) => (
              <circle key={a} cx={cx + 3.1 * Math.cos((a * Math.PI) / 180)} cy={WHEEL_Y + 3.1 * Math.sin((a * Math.PI) / 180)} r={0.65} fill="#3C485C" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
