// Vehicle illustrations for the customer's category list (owner 2026-11-04: "create these kind of icons for each vehicle category and also
// show these images once the customer clicks those categories", then "make it more mature and thick just like the reference").
// ONE parametric drawing, so all thirteen share one style: a heavy, realistic commercial-vehicle look seen from the front-left and slightly
// above (the near side, the front face and the roof / open bed are visible), soft gradients, a white cab with a tinted windscreen and side
// window, door seam and handle, mirror, grille, headlight and bumper, a deep-blue open bed or a white box / corrugated container, a dark
// chassis and chunky tyres with rims. Realism details: the far-side tyres peek out below the body (so a truck never reads as having two tyres), the
// rear axles of the bigger trucks carry twin tyres, tyres have tread / sidewall / lug nuts, arches have a mudguard lip, mud flaps, fuel tank, rear guard,
// reflective tape and marker lights. Bigger categories are longer with more axles (each drawing is cropped to its own bounds so every icon
// fills its box). Original artwork, language-free, crisp at any size, bundled with the app (no image files, works offline).
import React from "react";

// Index-aligned with CUSTOMER_LIST_CATEGORY_NAMES in App.jsx (12 weight limits + "above 32000 kg" = 13 drawings).
//   cw/ch = cab width/height, body = open | box | container, len = body length, bh = body height, gap = space between cab and body,
//   wheels = x of each wheel from the vehicle's left edge (more wheels = more axles).
export const VEHICLE_ART_SPECS = [
  { cw: 25, ch: 31, body: "open", len: 34, bh: 16, gap: 2, wheels: [8, 48, 48], special: "three-wheeler" }, // 3 wheeler (drawn by ThreeWheelerArt: ONE centre front wheel + two rear)
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

// THE 3 WHEELER (owner 2026-11-04: "use that realistic 3 wheelers in India"): a loading auto like an Ape / Alfa / Bajaj -- ONE wheel in the centre at the
// front under a scooter-style cowl with a raked windscreen and a round headlight, an open-sided cab (seat + handlebar visible, half door, canopy roof) and
// a short open cargo bed over two rear wheels (only the near one is fully visible; the far one peeks out under the bed, like on the other vehicles).
// Same palette, view, gradients and tyre detail as the rest of the set.
function ThreeWheelerArt({ className = "", title = "", bold = false }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const k = bold ? 1.7 : 1;
  const g = (name) => `url(#${name}${uid})`;
  const x0 = DEPTH + 6, dd = 9, rr = 4.5;            // the vehicle is narrower than a truck: shallower front face / roof
  const wr = 6.8;                                    // small wheels
  const CB = 47, TOP = 18, FL = 44;                  // cab bottom, roof line, bed floor
  const rearX = x0 + 49, rearY = GROUND - wr;
  const frontX = x0 + 8 - dd * 0.5, frontY = GROUND - wr - rr * 0.5;   // the front wheel sits on the centre line, i.e. half way back along the depth
  const bx = x0 + 27, len = 34, bh = 16, by = FL - bh;
  const p = (u, t) => `${(x0 - dd * u).toFixed(2)},${(TOP + t * (CB - TOP) - rr * u).toFixed(2)}`;   // a point on the nose: u 0 = near edge, 1 = far edge; t 0 = top .. 1 = bottom
  const wheel = (cx, cy, key, mudflap) => (
    <g key={key}>
      <circle cx={cx} cy={cy} r={wr + 2.4} fill={INK} />
      <circle cx={cx} cy={cy} r={wr} fill="#12171F" stroke="#2E3948" strokeWidth={1.1 * k} />
      <circle cx={cx} cy={cy} r={wr - 0.7} fill="none" stroke="#303C4E" strokeWidth={1.4 * k} strokeDasharray="1.3 1.5" />
      <circle cx={cx} cy={cy} r={wr - 2.2} fill="none" stroke="#222C3A" strokeWidth={1 * k} />
      <circle cx={cx} cy={cy} r={3.9} fill={g("rim")} stroke="#6F7C91" strokeWidth={0.8 * k} />
      <circle cx={cx} cy={cy} r={1.6} fill="#56627A" />
      {[0, 72, 144, 216, 288].map((a) => (<circle key={a} cx={cx + 2.5 * Math.cos((a * Math.PI) / 180)} cy={cy + 2.5 * Math.sin((a * Math.PI) / 180)} r={0.55} fill="#3C485C" />))}
      {mudflap && <rect x={cx + wr + 1} y={cy - 2.5} width={2.2} height={8.5} rx={0.8} fill="#0C1118" />}
    </g>
  );
  const marks = [];
  for (let x = bx + 8; x < bx + len - 4; x += 13) marks.push(<g key={x}><rect x={x - 1.4} y={by + 3} width={2.8} height={bh - 3} fill="#0E3282" opacity="0.8" /><line x1={x + 2.2} y1={by + 4} x2={x + 2.2} y2={FL - 1} stroke="rgba(255,255,255,0.18)" strokeWidth={0.9 * k} /></g>);
  const vbTop = TOP - rr - 4;
  const viewBox = `2 ${vbTop} ${x0 + 66 - 2} ${GROUND + 5 - vbTop}`;
  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : "true"} aria-label={title || undefined} focusable="false">
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`cab${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#DCE4EF" /></linearGradient>
        <linearGradient id={`front${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#C9D3E1" /><stop offset="1" stopColor="#F4F7FB" /></linearGradient>
        <linearGradient id={`roof${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#F8FAFD" /><stop offset="1" stopColor="#E4EAF3" /></linearGradient>
        <linearGradient id={`glass${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={GLASS_TOP} /><stop offset="1" stopColor={GLASS_BOT} /></linearGradient>
        <linearGradient id={`blue${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3470E6" /><stop offset="1" stopColor="#1647AB" /></linearGradient>
        <linearGradient id={`inside${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1A2332" /><stop offset="1" stopColor="#33425C" /></linearGradient>
        <radialGradient id={`rim${uid}`} cx="0.4" cy="0.35" r="0.8"><stop offset="0" stopColor="#E8EEF6" /><stop offset="1" stopColor="#8E9BB0" /></radialGradient>
      </defs>
      <ellipse cx={x0 + 30} cy={GROUND + 1.2} rx={42} ry={3} fill="rgba(15,27,45,0.20)" />

      {/* far rear wheel peeking out under the bed + the centre front wheel (drawn before the cowl so the cowl covers its top) */}
      <circle cx={rearX - dd * 0.8} cy={rearY - rr * 0.8} r={wr + 0.6} fill="#0C1118" />
      <circle cx={rearX - dd * 0.8} cy={rearY - rr * 0.8} r={wr - 2.2} fill="#1D2634" />
      <circle cx={rearX - dd * 0.8} cy={rearY - rr * 0.8} r={2} fill="#46536A" />
      {wheel(frontX, frontY, "front", false)}

      {/* chassis rail + rear axle */}
      <rect x={x0 + 6} y={FL} width={58} height={5} rx={1.5} fill={INK} />
      <rect x={x0 + 26} y={FL + 5} width={14} height={4} rx={1.5} fill="#2A3445" />

      {/* CARGO BED: far wall's inner face, near wall with ribs, tail light, marker */}
      <polygon points={`${bx},${by} ${bx + len},${by} ${bx + len - dd},${by - rr} ${bx - dd},${by - rr}`} fill="#0F2F7A" stroke={OUTLINE} strokeWidth={0.9 * k} strokeLinejoin="round" />
      <rect x={bx} y={by} width={len} height={bh} rx={1.8} fill={g("blue")} stroke={OUTLINE} strokeWidth={1.1 * k} />
      <rect x={bx} y={by} width={len} height={3.4} rx={1.6} fill="#5A92F2" />
      <rect x={bx} y={by + 3.4} width={len} height={1.2} fill="rgba(8,30,90,0.5)" />
      {marks}
      <rect x={bx} y={FL - 2.2} width={len} height={2.2} fill="#0E3282" />
      <rect x={bx + len - 3.4} y={FL - 7} width={2.4} height={4.4} rx={1} fill="#C62828" />
      <rect x={bx + len - 9} y={FL - 11} width={2.4} height={1.6} rx={0.5} fill="#F59E0B" />

      {/* CAB: canopy roof (receding), raked windscreen, nose with headlight, near side with open window + seat + handlebar, half door */}
      <polygon points={`${x0 + 5},${TOP} ${x0 + 25},${TOP} ${x0 + 25 - dd},${TOP - rr} ${x0 + 5 - dd},${TOP - rr}`} fill={g("roof")} stroke={OUTLINE} strokeWidth={1 * k} strokeLinejoin="round" />
      <polygon points={`${p(0, 0.52)} ${p(1, 0.52)} ${p(1, 1)} ${p(0, 1)}`} fill={g("front")} stroke={OUTLINE} strokeWidth={1.1 * k} strokeLinejoin="round" />
      <polygon points={`${x0},${TOP + 0.52 * (CB - TOP)} ${x0 - dd},${TOP + 0.52 * (CB - TOP) - rr} ${x0 - dd + 5},${TOP - rr} ${x0 + 5},${TOP}`} fill={g("glass")} stroke="rgba(10,20,40,0.6)" strokeWidth={0.8 * k} strokeLinejoin="round" />
      <polygon points={`${x0 + 1.5},${TOP + 0.5 * (CB - TOP)} ${x0 - dd * 0.4},${TOP + 0.5 * (CB - TOP) - rr * 0.4} ${x0 - dd * 0.4 + 4.6},${TOP + 2 - rr * 0.4} ${x0 + 5.6},${TOP + 2.4}`} fill="rgba(255,255,255,0.2)" />
      <ellipse cx={x0 - dd * 0.5} cy={TOP + 0.7 * (CB - TOP) - rr * 0.5} rx={2.7} ry={3.1} fill="#FFF3C9" stroke="rgba(0,0,0,0.5)" strokeWidth={0.7 * k} />
      <polygon points={`${p(0.04, 0.9)} ${p(0.96, 0.9)} ${p(0.96, 1.03)} ${p(0.04, 1.03)}`} fill="#222B39" stroke="rgba(0,0,0,0.5)" strokeWidth={0.6 * k} />
      <rect x={x0 - dd * 0.05 - 2.6} y={TOP + 0.66 * (CB - TOP) - 1} width={2.2} height={2} rx={0.6} fill="#F59E0B" />
      {/* near side of the cab */}
      <path d={`M ${x0} ${CB} L ${x0} ${TOP + 0.52 * (CB - TOP)} L ${x0 + 5} ${TOP} L ${x0 + 23} ${TOP} Q ${x0 + 25} ${TOP} ${x0 + 25} ${TOP + 3} L ${x0 + 25} ${CB} Z`} fill={g("cab")} stroke={OUTLINE} strokeWidth={1.1 * k} strokeLinejoin="round" />
      <path d={`M ${x0 + 7.5} 23 L ${x0 + 21.5} 23 L ${x0 + 21.5} 37 L ${x0 + 3.4} 37 Z`} fill={g("inside")} stroke="rgba(10,20,40,0.65)" strokeWidth={0.9 * k} strokeLinejoin="round" />
      <rect x={x0 + 12} y={29.5} width={9.5} height={7.5} rx={1.6} fill="#7C8AA0" />
      <rect x={x0 + 19.4} y={25.5} width={2.2} height={11.5} rx={1} fill="#66748C" />
      <line x1={x0 + 6.5} y1={29.5} x2={x0 + 11} y2={27} stroke="#0C1118" strokeWidth={1.6 * k} strokeLinecap="round" />
      <circle cx={x0 + 6.2} cy={29.8} r={1.5} fill="#0C1118" />
      <rect x={x0 + 0.6} y={37} width={24.4} height={CB - 37} fill="#C4CFDF" />
      <path d={`M ${x0 + 3} 40 L ${x0 + 22} 40`} stroke="rgba(15,27,45,0.4)" strokeWidth={0.9 * k} />
      <rect x={x0 + 14} y={41} width={5.4} height={1.8} rx={0.9} fill="#3A4659" />
      <rect x={x0 - 2.8} y={25} width={3.2} height={5.4} rx={1.2} fill={INK} />
      <rect x={x0 - 0.4} y={27} width={2.4} height={1.4} fill={INK} />

      {/* front mudguard over the centre wheel, rear arch + near rear wheel */}
      <path d={`M ${frontX - wr - 2.2} ${frontY - 2.2} A ${wr + 2.2} ${wr + 2.2} 0 0 1 ${frontX + wr + 2.2} ${frontY - 2.2} Z`} fill={g("cab")} stroke={OUTLINE} strokeWidth={1.1 * k} strokeLinejoin="round" />
      <path d={`M ${frontX - wr - 1} ${frontY - 2.2} A ${wr + 1} ${wr + 1} 0 0 1 ${frontX + wr + 1} ${frontY - 2.2}`} fill="none" stroke="rgba(15,27,45,0.45)" strokeWidth={1 * k} />
      <path d={`M ${rearX - wr - 3} ${rearY} A ${wr + 3} ${wr + 3} 0 0 1 ${rearX + wr + 3} ${rearY}`} fill="none" stroke="#5B6A82" strokeWidth={1.1 * k} />
      {wheel(rearX, rearY, "rear", true)}
    </svg>
  );
}

// bold = the small row icon (owner 2026-11-04: "match the thickness to the inside vehicle icon"): the big picture on the picked row is drawn about
// 1.7x larger than the row icon, so the row icon's strokes are drawn 1.7x thicker -- the SAME on-screen line thickness, same colours, same wheels and
// chassis (an earlier 2.4x version with chunkier tyres was too heavy).
export default function CategoryVehicleArt({ index = 0, className = "", title = "", bold = false }) {
  if (index === 0) return <ThreeWheelerArt className={className} title={title} bold={bold} />;
  const k = bold ? 1.7 : 1;                      // the big picture is drawn ~1.7x larger than the row icon, so 1.7x strokes = the SAME on-screen line thickness
  const wr = WHEEL_R;
  const outline = OUTLINE;
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
  if (sp.body === "container") for (let x = bx + 4; x < bx + sp.len - 2; x += 3.6) marks.push(<line key={x} x1={x} y1={by + 4} x2={x} y2={FLOOR - 4} stroke="rgba(30,45,70,0.16)" strokeWidth={1 * k} />);
  if (sp.body === "box") for (let x = bx + 15; x < bx + sp.len - 6; x += 17) marks.push(<line key={x} x1={x} y1={by + 3} x2={x} y2={by + sp.bh - 10} stroke="rgba(30,45,70,0.13)" strokeWidth={1 * k} />);
  if (sp.body === "open") for (let x = bx + 9; x < bx + sp.len - 4; x += 13) marks.push(<g key={x}><rect x={x - 1.4} y={by + 3} width={2.8} height={sp.bh - 3} fill="#0E3282" opacity="0.8" /><line x1={x + 2.2} y1={by + 4} x2={x + 2.2} y2={FLOOR - 1} stroke="rgba(255,255,255,0.18)" strokeWidth={0.9 * k} /></g>);

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

      {/* FAR-SIDE tyres (the other side of the vehicle, seen below the body to the up-left): without them a truck reads as having only two tyres */}
      {sp.wheels.map((wx) => (
        <g key={"far" + wx}>
          <circle cx={x0 + wx - d * 0.8} cy={WHEEL_Y - rise * 0.8} r={wr + 0.6} fill="#0C1118" />
          <circle cx={x0 + wx - d * 0.8} cy={WHEEL_Y - rise * 0.8} r={wr - 2.4} fill="#1D2634" />
          <circle cx={x0 + wx - d * 0.8} cy={WHEEL_Y - rise * 0.8} r={2.2} fill="#46536A" />
        </g>
      ))}

      {/* chassis + underbody */}
      <rect x={x0 + 2} y={FLOOR} width={width - 2} height={5.5} rx={1.5} fill={INK} />
      <rect x={x0 + sp.cw * 0.5} y={FLOOR + 5.5} width={Math.min(18, sp.len * 0.28)} height={4} rx={1.5} fill="#2A3445" />
      {/* fuel tank between the cab and the rear axle (from the Tata 407 up) + rear underride guard */}
      {sp.cw >= 32 && <rect x={x0 + sp.cw + 8} y={FLOOR + 5.2} width={15} height={7} rx={3.2} fill="#8896AB" stroke="rgba(15,27,45,0.5)" strokeWidth={0.9 * k} />}
      <rect x={x0 + width - 5} y={FLOOR + 4.5} width={3.4} height={5} rx={0.8} fill={INK} />

      {/* BODY ---------------------------------------------------------------- */}
      {sp.body === "open" && (
        <g>
          {/* far wall's inner face + bed (seen from above) */}
          <polygon points={`${bx},${by} ${bx + sp.len},${by} ${bx + sp.len - d},${by - rise} ${bx - d},${by - rise}`} fill="#0F2F7A" stroke={outline} strokeWidth={0.9 * k} strokeLinejoin="round" />
          <polygon points={`${bx},${by} ${bx - d},${by - rise} ${bx - d},${by - rise + 3} ${bx},${by + 3}`} fill="#0B2565" />
          <rect x={bx} y={by} width={sp.len} height={sp.bh} rx={1.8} fill={g("blue")} stroke={outline} strokeWidth={1.1 * k} />
          <rect x={bx} y={by} width={sp.len} height={3.4} rx={1.6} fill="#5A92F2" />
          <rect x={bx} y={by + 3.4} width={sp.len} height={1.2} fill="rgba(8,30,90,0.5)" />
          {marks}
          <rect x={bx} y={FLOOR - 2.2} width={sp.len} height={2.2} fill="#0E3282" />
        </g>
      )}
      {sp.body === "box" && (
        <g>
          <polygon points={`${bx},${by} ${bx + sp.len},${by} ${bx + sp.len - d},${by - rise} ${bx - d},${by - rise}`} fill={g("roof")} stroke={outline} strokeWidth={0.9 * k} strokeLinejoin="round" />
          <rect x={bx} y={by} width={sp.len} height={sp.bh} rx={2} fill={g("box")} stroke={outline} strokeWidth={1.1 * k} />
          {marks}
          <rect x={bx} y={by + sp.bh - 11} width={sp.len} height={4.2} fill="#143A82" />
          <rect x={bx} y={by + sp.bh - 6.4} width={sp.len} height={1.2} fill="rgba(255,255,255,0.35)" />
          <rect x={bx} y={by} width={sp.len} height={2.6} rx={1.3} fill="rgba(255,255,255,0.8)" />
        </g>
      )}
      {sp.body === "container" && (
        <g>
          <polygon points={`${bx},${by} ${bx + sp.len},${by} ${bx + sp.len - d},${by - rise} ${bx - d},${by - rise}`} fill={g("roof")} stroke={outline} strokeWidth={0.9 * k} strokeLinejoin="round" />
          <rect x={bx} y={by} width={sp.len} height={sp.bh} rx={1.6} fill={g("cont")} stroke={outline} strokeWidth={1.1 * k} />
          {marks}
          <rect x={bx} y={by} width={sp.len} height={3.6} fill="#8A99AE" />
          <rect x={bx} y={FLOOR - 4.4} width={sp.len} height={4.4} fill="#8A99AE" />
          <rect x={bx} y={by + sp.bh * 0.46} width={sp.len} height={4.4} fill="#143A82" opacity="0.92" />
          <rect x={bx} y={by + 3.6} width={3} height={sp.bh - 8} fill="#9DAABD" />
          <rect x={bx + sp.len - 3} y={by + 3.6} width={3} height={sp.bh - 8} fill="#9DAABD" />
        </g>
      )}
      {/* reflective tape along the bottom of the box / container + an amber side-marker light */}
      {sp.body !== "open" && (
        <g>
          <line x1={bx + 3} y1={FLOOR - 7.4} x2={bx + sp.len - 5} y2={FLOOR - 7.4} stroke="#C62828" strokeWidth={1.5 * k} />
          <line x1={bx + 3} y1={FLOOR - 7.4} x2={bx + sp.len - 5} y2={FLOOR - 7.4} stroke="#F4F6FA" strokeWidth={1.5 * k} strokeDasharray="4 3.5" />
        </g>
      )}
      <rect x={bx + sp.len - 9} y={FLOOR - 11} width={2.4} height={1.6} rx={0.5} fill="#F59E0B" />
      {/* tail light */}
      <rect x={bx + sp.len - 3.4} y={FLOOR - 7} width={2.4} height={4.4} rx={1} fill="#C62828" />

      {/* CAB ----------------------------------------------------------------- */}
      {/* roof (receding) */}
      <polygon points={`${x0},${cabTop} ${x0 + sp.cw - 2},${cabTop} ${x0 + sp.cw - 2 - d},${cabTop - rise} ${x0 - d},${cabTop - rise}`} fill={g("roof")} stroke={outline} strokeWidth={1 * k} strokeLinejoin="round" />
      {/* front face */}
      <polygon points={`${fp(0, 0)} ${fp(1, 0)} ${fp(1, 1)} ${fp(0, 1)}`} fill={g("front")} stroke={outline} strokeWidth={1.1 * k} strokeLinejoin="round" />
      <polygon points={`${fp(0.1, 0.1)} ${fp(0.92, 0.1)} ${fp(0.92, 0.5)} ${fp(0.1, 0.5)}`} fill={g("glass")} stroke="rgba(10,20,40,0.6)" strokeWidth={0.8 * k} strokeLinejoin="round" />
      <polygon points={`${fp(0.1, 0.1)} ${fp(0.42, 0.1)} ${fp(0.3, 0.5)} ${fp(0.1, 0.5)}`} fill="rgba(255,255,255,0.18)" />
      <polygon points={`${fp(0.1, 0.57)} ${fp(0.92, 0.57)} ${fp(0.92, 0.72)} ${fp(0.1, 0.72)}`} fill="#222B39" stroke="rgba(0,0,0,0.5)" strokeWidth={0.6 * k} />
      <polygon points={`${fp(0.2, 0.61)} ${fp(0.84, 0.61)} ${fp(0.84, 0.625)} ${fp(0.2, 0.625)}`} fill="rgba(255,255,255,0.35)" />
      <polygon points={`${fp(0.2, 0.665)} ${fp(0.84, 0.665)} ${fp(0.84, 0.68)} ${fp(0.2, 0.68)}`} fill="rgba(255,255,255,0.3)" />
      <polygon points={`${fp(0.04, 0.58)} ${fp(0.22, 0.58)} ${fp(0.22, 0.7)} ${fp(0.04, 0.7)}`} fill="#FFF3C9" stroke="rgba(0,0,0,0.45)" strokeWidth={0.6 * k} />
      <polygon points={`${fp(-0.02, 0.86)} ${fp(1, 0.86)} ${fp(1, 1.02)} ${fp(-0.02, 1.02)}`} fill="#222B39" stroke="rgba(0,0,0,0.5)" strokeWidth={0.6 * k} />
      {/* near side of the cab */}
      <path d={`M ${x0} ${CAB_BOTTOM} L ${x0} ${cabTop} L ${x0 + sp.cw - 3} ${cabTop} Q ${x0 + sp.cw} ${cabTop} ${x0 + sp.cw} ${cabTop + 5} L ${x0 + sp.cw} ${CAB_BOTTOM} Z`} fill={g("cab")} stroke={outline} strokeWidth={1.1 * k} strokeLinejoin="round" />
      <rect x={x0 + 0.6} y={CAB_BOTTOM - sp.ch * 0.22} width={sp.cw - 1.2} height={sp.ch * 0.22 - 0.6} fill="#C4CFDF" />
      <path d={`M ${x0 + 2.6} ${cabTop + sp.ch * 0.14} L ${x0 + sp.cw * 0.7} ${cabTop + sp.ch * 0.14} L ${x0 + sp.cw * 0.7} ${cabTop + sp.ch * 0.5} L ${x0 + 2.6} ${cabTop + sp.ch * 0.5} Z`} fill={g("glass")} stroke="rgba(10,20,40,0.6)" strokeWidth={0.8 * k} strokeLinejoin="round" />
      <path d={`M ${x0 + 2.6} ${cabTop + sp.ch * 0.14} L ${x0 + sp.cw * 0.34} ${cabTop + sp.ch * 0.14} L ${x0 + sp.cw * 0.14} ${cabTop + sp.ch * 0.5} L ${x0 + 2.6} ${cabTop + sp.ch * 0.5} Z`} fill="rgba(255,255,255,0.18)" />
      <line x1={x0 + sp.cw * 0.76} y1={cabTop + sp.ch * 0.1} x2={x0 + sp.cw * 0.76} y2={CAB_BOTTOM - 1} stroke="rgba(15,27,45,0.45)" strokeWidth={1 * k} />
      <rect x={x0 + sp.cw * 0.6} y={cabTop + sp.ch * 0.56} width={5} height={1.8} rx={0.9} fill="#3A4659" />
      <rect x={x0 - 3.2} y={cabTop + sp.ch * 0.3} width={3.4} height={6} rx={1.2} fill={INK} />
      <rect x={x0 - 0.6} y={cabTop + sp.ch * 0.33} width={2} height={1.4} fill={INK} />
      <rect x={x0 + 1} y={CAB_BOTTOM - 0.5} width={sp.cw * 0.5} height={2.4} rx={0.8} fill="#2A3445" />

      {/* WHEELS (near side): dark arch with a lighter mudguard lip, TWIN tyres on the rear axles of the bigger trucks (the inner twin shows behind the outer),
          a tread ring, a sidewall, a bright rim with lug nuts, and a mud flap behind the last wheel. */}
      {sp.wheels.map((wx) => {
        const cx = x0 + wx;
        const isFront = wx <= sp.cw + 4;
        const twin = !isFront && sp.cw >= 32;           // from the Tata 407 up, the rear axles carry twin tyres
        const lastAxle = wx === Math.max(...sp.wheels);
        return (
          <g key={wx}>
            <circle cx={cx} cy={WHEEL_Y} r={wr + 2.6} fill={INK} />
            <path d={`M ${cx - wr - 3.2} ${WHEEL_Y} A ${wr + 3.2} ${wr + 3.2} 0 0 1 ${cx + wr + 3.2} ${WHEEL_Y}`} fill="none" stroke="#5B6A82" strokeWidth={1.1 * k} />
            {twin && (
              <g>
                <circle cx={cx - 3.6} cy={WHEEL_Y - 1.4} r={wr} fill="#0C1118" stroke="#27313F" strokeWidth={1 * k} />
                <circle cx={cx - 3.6} cy={WHEEL_Y - 1.4} r={wr - 1.4} fill="none" stroke="#1C2533" strokeWidth={1 * k} strokeDasharray="1.3 1.5" />
              </g>
            )}
            <circle cx={cx} cy={WHEEL_Y} r={wr} fill="#12171F" stroke="#2E3948" strokeWidth={1.1 * k} />
            <circle cx={cx} cy={WHEEL_Y} r={wr - 0.8} fill="none" stroke="#303C4E" strokeWidth={1.5 * k} strokeDasharray="1.3 1.5" />
            <circle cx={cx} cy={WHEEL_Y} r={wr - 2.4} fill="none" stroke="#222C3A" strokeWidth={1 * k} />
            <circle cx={cx} cy={WHEEL_Y} r={4.6} fill={g("rim")} stroke="#6F7C91" strokeWidth={0.8 * k} />
            <circle cx={cx} cy={WHEEL_Y} r={1.9} fill="#56627A" />
            {[0, 72, 144, 216, 288].map((a) => (
              <circle key={a} cx={cx + 3 * Math.cos((a * Math.PI) / 180)} cy={WHEEL_Y + 3 * Math.sin((a * Math.PI) / 180)} r={0.65} fill="#3C485C" />
            ))}
            {lastAxle && <rect x={cx + wr + 1} y={WHEEL_Y - 3} width={2.4} height={10} rx={0.8} fill="#0C1118" />}
          </g>
        );
      })}
    </svg>
  );
}
