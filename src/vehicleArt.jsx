// Vehicle illustrations for the customer's category list (owner 2026-11-04: "create these kind of icons for each vehicle category and also
// show these images once the customer clicks those categories"). ONE parametric drawing, so all thirteen share one style: a flat side view
// facing left (cab on the left), white cab with a blue glass window, a marigold headlight, dark chassis and wheels, and a body that is an
// open blue bed, a white box or a ribbed container. Bigger categories are visibly longer and get more axles (each drawing is cropped to
// its own bounds so every icon fills its box). Original artwork, language-free,
// crisp at any size, and bundled with the app (no image files, works offline).
import React from "react";

// Index-aligned with CUSTOMER_LIST_CATEGORY_NAMES in App.jsx (12 weight limits + "above 32000 kg" = 13 drawings).
//   cw/ch = cab width/height, body = open | box | container, len = body length, bh = body height, gap = space between cab and body,
//   wheels = x of each wheel from the vehicle's left edge (more wheels = more axles).
export const VEHICLE_ART_SPECS = [
  { cw: 22, ch: 28, body: "open", len: 30, bh: 12, gap: 2, wheels: [9, 44] },                       // 3 wheeler
  { cw: 26, ch: 32, body: "open", len: 38, bh: 15, gap: 2, wheels: [10, 54] },                      // Tata Ace
  { cw: 28, ch: 34, body: "open", len: 48, bh: 17, gap: 2, wheels: [11, 66] },                      // Pickup
  { cw: 28, ch: 34, body: "open", len: 60, bh: 21, gap: 2, wheels: [11, 78] },                      // Pickup 8ft
  { cw: 30, ch: 38, body: "box", len: 68, bh: 33, gap: 2, wheels: [12, 86] },                       // Tata 407
  { cw: 32, ch: 40, body: "box", len: 80, bh: 36, gap: 2, wheels: [13, 100] },                      // 17ft Eicher
  { cw: 32, ch: 40, body: "container", len: 90, bh: 38, gap: 2, wheels: [13, 110] },                // 20ft container
  { cw: 32, ch: 40, body: "open", len: 98, bh: 28, gap: 2, wheels: [13, 100, 114] },                // 6 wheeler
  { cw: 34, ch: 42, body: "box", len: 106, bh: 40, gap: 2, wheels: [14, 112, 127] },                // 22ft/24ft truck
  { cw: 34, ch: 42, body: "open", len: 112, bh: 30, gap: 2, wheels: [12, 27, 120, 135] },           // 10 wheeler
  { cw: 34, ch: 44, body: "container", len: 114, bh: 42, gap: 2, wheels: [13, 28, 126, 141] },      // 32ft container
  { cw: 36, ch: 46, body: "box", len: 116, bh: 42, gap: 2, wheels: [14, 29, 122, 137, 152] },       // 12/14/16 wheeler
  { cw: 36, ch: 46, body: "container", len: 120, bh: 42, gap: 8, wheels: [14, 40, 128, 143, 158] }, // 32t+ truck (tractor + trailer)
];

const INK = "#1E2A3B";     // chassis / outlines
const TYRE = "#2B3544";
const HUB = "#CBD5E1";
const GLASS = "#9CC9F5";
const BLUE = "#1D5FD1";     // open bed (brand blue family)
const BLUE_DARK = "#0F3E96";
const MARIGOLD = "#FFCC00";

const GROUND = 62;          // ground line
const WHEEL_Y = 55;         // wheel centre
const WHEEL_R = 7;
const FLOOR = 47;           // top of the chassis = bottom of the body
const CAB_BOTTOM = 51;
const VIEW_W = 170;
const VIEW_H = 72;

export default function CategoryVehicleArt({ index = 0, className = "", title = "" }) {
  const sp = VEHICLE_ART_SPECS[Math.min(Math.max(index, 0), VEHICLE_ART_SPECS.length - 1)];
  // The drawing's width must also cover the last wheel's dark arch, or a many-axle truck loses its rear wheel at the edge.
  const width = Math.max(sp.cw + sp.gap + sp.len, Math.max(...sp.wheels) + WHEEL_R + 3);
  const x0 = Math.round((VIEW_W - width) / 2);
  const cabTop = CAB_BOTTOM - sp.ch;
  const bx = x0 + sp.cw + sp.gap;
  const by = FLOOR - sp.bh;
  const slats = [];
  if (sp.body === "open") for (let x = bx + 7; x < bx + sp.len - 3; x += 8) slats.push(<line key={x} x1={x} y1={by + 4} x2={x} y2={FLOOR - 1} stroke="rgba(255,255,255,0.28)" strokeWidth="1" />);
  const ribs = [];
  if (sp.body === "container") for (let x = bx + 5; x < bx + sp.len - 3; x += 5) ribs.push(<line key={x} x1={x} y1={by + 3} x2={x} y2={FLOOR - 3} stroke="#C5D0DF" strokeWidth="1" />);
  // Each drawing is cropped to its own bounds, so a small vehicle (3 wheeler) fills its icon box as well as a big one (32t+ truck) does.
  const vbTop = Math.min(cabTop, by) - 3;
  const viewBox = `${x0 - 4} ${vbTop} ${width + 8} ${GROUND + 5 - vbTop}`;
  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : "true"} aria-label={title || undefined} focusable="false">
      {title ? <title>{title}</title> : null}
      {/* ground shadow */}
      <ellipse cx={VIEW_W / 2} cy={GROUND + 1} rx={width / 2 + 5} ry={2.4} fill="rgba(15,27,45,0.16)" />
      {/* chassis */}
      <rect x={x0 + 2} y={FLOOR} width={width - 2} height={4.5} rx={1.5} fill={INK} />
      {/* body */}
      {sp.body === "open" && (
        <g>
          <rect x={bx} y={by} width={sp.len} height={sp.bh} rx={2} fill={BLUE} />
          <rect x={bx} y={by} width={sp.len} height={3.2} rx={1.6} fill={BLUE_DARK} />
          {slats}
        </g>
      )}
      {sp.body === "box" && (
        <g>
          <rect x={bx} y={by} width={sp.len} height={sp.bh} rx={2.5} fill="#F8FAFC" stroke="#C7D2E0" strokeWidth="1" />
          <rect x={bx + 1} y={by + 1} width={sp.len - 2} height={3} rx={1.5} fill="#E2E8F0" />
          <rect x={bx} y={by + sp.bh * 0.58} width={sp.len} height={3.4} fill={BLUE} />
          <rect x={bx} y={by + sp.bh * 0.58 + 4.4} width={sp.len} height={1.6} fill={MARIGOLD} />
        </g>
      )}
      {sp.body === "container" && (
        <g>
          <rect x={bx} y={by} width={sp.len} height={sp.bh} rx={2} fill="#E8EEF7" stroke="#94A3B8" strokeWidth="1" />
          {ribs}
          <rect x={bx} y={by} width={sp.len} height={3} rx={1.5} fill="#CBD5E1" />
          <rect x={bx} y={FLOOR - 4} width={sp.len} height={4} fill="#CBD5E1" />
          <rect x={bx} y={by + sp.bh * 0.5 - 2} width={sp.len} height={4} fill={BLUE} opacity="0.9" />
        </g>
      )}
      {/* cab */}
      <path d={`M ${x0} ${CAB_BOTTOM} L ${x0} ${cabTop + 11} Q ${x0} ${cabTop} ${x0 + 8} ${cabTop} L ${x0 + sp.cw - 3} ${cabTop} Q ${x0 + sp.cw} ${cabTop} ${x0 + sp.cw} ${cabTop + 4} L ${x0 + sp.cw} ${CAB_BOTTOM} Z`} fill="#FFFFFF" stroke="#C7D2E0" strokeWidth="1" />
      <rect x={x0 + 0.5} y={CAB_BOTTOM - sp.ch * 0.26} width={sp.cw - 1} height={sp.ch * 0.26} fill="#DCE5F2" />
      <path d={`M ${x0 + 3.5} ${cabTop + sp.ch * 0.2} L ${x0 + sp.cw * 0.66} ${cabTop + sp.ch * 0.2} L ${x0 + sp.cw * 0.66} ${cabTop + sp.ch * 0.52} L ${x0 + 3.5} ${cabTop + sp.ch * 0.52} Z`} fill={GLASS} />
      <line x1={x0 + sp.cw * 0.74} y1={cabTop + sp.ch * 0.18} x2={x0 + sp.cw * 0.74} y2={CAB_BOTTOM - 1} stroke="#B6C2D4" strokeWidth="1" />
      <rect x={x0 - 0.5} y={CAB_BOTTOM - sp.ch * 0.22} width={3.4} height={2.6} rx={1} fill={MARIGOLD} />
      <rect x={x0 - 1.5} y={CAB_BOTTOM - 2.5} width={5} height={3.2} rx={1} fill={INK} />
      {/* wheels: dark arch, tyre, light hub */}
      {sp.wheels.map((wx) => (
        <g key={wx}>
          <circle cx={x0 + wx} cy={WHEEL_Y} r={WHEEL_R + 2.2} fill={INK} />
          <circle cx={x0 + wx} cy={WHEEL_Y} r={WHEEL_R} fill={TYRE} />
          <circle cx={x0 + wx} cy={WHEEL_Y} r={3.2} fill={HUB} />
          <circle cx={x0 + wx} cy={WHEEL_Y} r={1.1} fill="#64748B" />
        </g>
      ))}
    </svg>
  );
}
