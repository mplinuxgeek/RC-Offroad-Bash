import { profile, tkey } from './trucks.js';
export { profile };
// Truck upgrade system: tech tree (nitro / brushless branch + shared chassis parts), credits, persistence and the mapping from owned parts to physics/handling parameters.
const KEY = tkey('mts_up'), WALLET = 'mts_wallet', BASE_COST = [1500, 3500, 7500], START_CREDITS = 7500, TEST_FLOOR = 0;

/** tiers[0] = what you start with (null = not available). max = highest tier. cost = price multiplier. */
const MOTOR_TIERS = [
    null, ['4074 brushless (2200kV)', 'Direct engine-replacement mount · installs the conversion kit'], ['4282 brushless (1900kV)', 'Long-can, high-torque rotor'], ['4985 brushless (1500kV)', 'Massive torque monster can']];
const BATTERY_TIERS = [
    ['Basic NiMH pack', 'Included with the conversion kit'], ['3S/4S LiPo · 120A ESC', '11.1-14.8V'], ['6S LiPo · 150A ESC', '22.2V high-discharge pack'], ['8S LiPo · 200A ESC', '29.6V dual battery trays']];
export const PARTS = [
  { id: 'engine', branch: 'nitro', name: 'Combustion engine', cost: 1.3, tiers: [
    ['.21 Small Block', 'Pull-start, standard rotary carb · ~1.5 HP'], ['.28 Mid Block', 'Roto-Start backplate, 3-needle slide carb · ~2.8 HP'],
    ['.32 Big Block', 'Billet high-compression cooling head · ~3.6 HP'], ['.36+ Racing Big Block', 'Turbo combustion chamber, high-flow porting & bump start · 4.5+ HP']],
    info: 'Higher tiers trade fuel efficiency and run temperature for top-end screaming power. Needs stronger shafts and diffs to survive.' },
  { id: 'trans', branch: 'nitro', name: 'Transmission', cost: 1.0, tiers: [
    ['Single-speed', 'Centrifugal clutch bell & spur gear, slipper clutch'], ['2-speed automatic', '2-shoe centrifugal shift hub, tunable shift point'], ['3-speed automatic', 'Dual-stage shifting cams, wide gear spread']],
    info: 'Nitro engines have a narrow powerband: 2nd and 3rd gear add launch punch without capping top speed.' },
  { id: 'brakes', branch: 'nitro', name: 'Mechanical brakes', cost: 0.7, tiers: [
    ['Single composite disc', 'Throttle servo linkage rod'], ['Dual vented steel discs', 'High-friction pads'], ['Triple carbon vented discs', 'Aluminium caliper mounts']],
    info: 'Dictates stopping distance. Electric builds use motor regen braking instead.' },
  { id: 'pipe', branch: 'nitro', name: 'Tuned pipe', cost: 0.8, tiers: [
    ['Molded composite pipe', ''], ['Cast aluminium pipe', 'Silicone coupler'], ['Polished dual-chamber pipe', 'Spring-mounted header'], ['Hard-anodized race pipe & manifold', 'Matched acoustic backpressure']],
    info: 'Shapes the 2-stroke power curve and changes the exhaust note.' },
  { id: 'motor', branch: 'electric', name: 'Brushless motor', cost: 1.5, get tiers() { return profile().partTiers?.motor || MOTOR_TIERS; },
    info: 'Conversion locks out nitro engine, tank, gearbox and mechanical brakes. Instant zero-RPM torque, battery weight.' },
  { id: 'battery', branch: 'electric', name: 'Battery / ESC', cost: 1.4, req: 'motor', get tiers() { return profile().partTiers?.battery || BATTERY_TIERS; },
    info: 'Voltage drives wheel speed and aerial pitch control but causes heavy drivetrain shock.' },
  { id: 'center', branch: 'electric', name: 'Centre drivetrain', cost: 1.0, req: 'motor', tiers: [
    ['Stock slipper', ''], ['Direct spur / lockout kit', 'Heavy-duty dual slipper pad'], ['Hardened centre diff (100k cSt)', '4-spider steel internals'], ['Cast solid spool (1M+ cSt)', 'Billet bulkhead housing']],
    info: 'Centre diff absorbs electric torque spikes to calm wheelies and axle snaps.' },
  { id: 'shocks', branch: 'all', name: 'Suspension', cost: 1.0, tiers: [
    ['4x basic single shocks', 'Full-length linear spring, molded composite bodies'],
    ['4x upgraded dual-rate shocks', 'Dual-rate tender + main springs with divider collar'],
    ['4x upgraded big-bore shocks', '40% larger bore alloy dampers, heavy-duty springs'],
    ['8x dual shocks (twin coil-overs)', 'Twin shock/spring assemblies per corner, reinforced dual mounts']],
    info: 'Controls chassis bounce and bottoming-out over jumps. Progresses from stock single springs to dual-rate, big-bore, and twin shocks per corner.' },
  { id: 'shafts', branch: 'all', name: 'Driveshafts & axles', cost: 0.8, tiers: [
    ['Steel dogbones & plastic sliders', ''], ['HD hardened universal shafts', ''], ['Hardened steel CVDs', 'Captured drive pins'], ['Chromoly splined extreme CVDs', 'Hardened centre driveshafts']],
    info: 'Prevents snapped shafts when launching big nitro motors or landing on 6S/8S power.' },
  { id: 'diffs', branch: 'all', name: 'Differentials', cost: 0.9, tiers: [
    ['2-spider open diffs', ''], ['4-spider sealed metal gear diffs', '10-30k cSt oil'], ['Spiral-cut hardened steel diffs', 'Machined alloy cups'], ['Locked spools / smart viscous diffs', 'Hardened ring and pinion']],
    info: 'Balances cornering rotation and straight-line pull. Upgraded diffs survive instant electric torque.' },
  { id: 'chassis', branch: 'all', name: 'Chassis & frame', cost: 1.2, tiers: [
    ['2.5mm flat aluminium plate', ''], ['Twin vertical plate (TVP) chassis', 'Anodized aircraft-grade alloy'], ['Long-wheelbase TVP frame', 'Cross-braces'], ['Carbon & titanium hybrid frame', 'Integrated roll cage & skid armour']],
    info: 'Rigidity preserves drivetrain alignment and toughens the truck; a longer wheelbase tames rear-bumper wheelies.' },
  { id: 'steering', branch: 'all', name: 'Steering servo', cost: 0.7, tiers: [
    ['Plastic-gear servo', '3-6 kg-cm'], ['Metal-gear servo', '15-20 kg-cm, servo saver'], ['Pro metal-gear high-speed servo', '30-35 kg-cm'], ['High-voltage titanium-gear servo', '50+ kg-cm, 0.08 s']],
    info: 'Sets steering speed and holding power under heavy throttle.' },
  { id: 'tires', branch: 'all', name: 'Wheels & tires', cost: 1.0, tiers: [
    ['Chevron tread tires', 'Open-cell foam, 14mm plastic hubs'], ['All-terrain multi-block bash tires', 'Dense foam, 17mm alloy hex'], ['Belted high-speed bash tires', 'Woven webbing, no ballooning'], ['Belted racing tires on beadlock wheels', 'Billet alloy ring locks']],
    info: 'Unbelted tires balloon into narrow discs at speed and lose grip. Belted tires keep their patch flat at 50+ mph.' },
];
export const part = (id) => PARTS.find((p) => p.id === id);
export const maxTier = (p) => p.tiers.length - 1;
export const tierCost = (p, t) => Math.round(BASE_COST[t - 1] * p.cost / 50) * 50;

export const TUNE_KEY = tkey('mts_tuning');
export const TUNING_DEFS = [
  { id: 'slipper', name: 'Slipper clutch', branch: 'all', min: 0, max: 4, def: 2,
    opts: ['Loose (high slip / no wheelies)', 'Medium-loose', 'Normal (balanced bash)', 'Medium-tight', 'Locked / tight (instant snap)'] },
  { id: 'shock_damp', name: 'Shock damping', branch: 'all', min: 0, max: 4, def: 2,
    opts: ['Soft (low cSt oil / bouncy)', 'Medium-soft', 'Normal (balanced)', 'Medium-stiff', 'Heavy (high cSt oil / packing)'] },
  { id: 'spring_preload', name: 'Spring preload', branch: 'all', min: 0, max: 4, def: 2,
    opts: ['Low (maximum sag / low CG)', 'Medium-low', 'Normal ride height', 'Medium-high', 'High (stiff / maximum clearance)'] },
  { id: 'engine_tune', name: 'Engine tune (Carb needle)', branch: 'nitro', min: 0, max: 4, def: 2,
    opts: ['Very Rich (runs cool, sluggish, 14 min run)', 'Slightly Rich (safe basher, 13 min)', 'Factory Optimum (peak balance, 12 min)', 'Slightly Lean (crisp throttle, 10 min)', 'Racer Lean (maximum top-end, runs hot, 9 min)'] },
  { id: 'motor_timing', name: 'ESC / Motor timing', branch: 'electric', min: 0, max: 4, def: 2,
    opts: ['0° Timing (maximum efficiency, cool)', '5° Timing', '10° Timing (standard bashing)', '15° Timing (high RPM / more heat)', '20° Aggressive (maximum RPM, high amp draw)'] },
  { id: 'clutch_engagement', name: 'Nitro clutch engagement', branch: 'nitro', min: 0, max: 4, def: 2,
    opts: ['Soft (engages at low RPM, smooth)', 'Medium-soft', 'Normal (standard springs)', 'Medium-hard (stall launch)', 'Hard (high stall snap / aggressive launch)'] },
  { id: 'brake_nitro', name: 'Nitro brake bias / linkage', branch: 'nitro', min: 0, max: 4, def: 2,
    opts: ['Light (gentle slowing / no nose dive)', 'Medium-light', 'Standard mechanical braking', 'Medium-firm', 'Extreme (immediate bite / wheelies on reverse)'] },
  { id: 'brake_electric', name: 'Brushless brake strength', branch: 'electric', min: 0, max: 4, def: 2,
    opts: ['30% Soft motor regen', '50% Medium-soft', '75% Standard motor brake', '90% Strong motor brake', '100% Full reverse regen (endo power)'] },
  { id: 'wheelie_bar', name: 'Wheelie bar', branch: 'all', min: 0, max: 3, def: 2,
    opts: ['Off', '15°', '30°', '45°'] }
];

export const defaultTuning = () => Object.fromEntries(TUNING_DEFS.map((t) => [t.id, t.def]));
export function loadTuning() {
  const d = defaultTuning();
  try {
    const s = JSON.parse(localStorage.getItem(TUNE_KEY));
    if (s && typeof s === 'object') return { ...d, ...s };
  } catch (e) {}
  return d;
}
export function saveTuning(t) {
  try { localStorage.setItem(TUNE_KEY, JSON.stringify(t)); } catch (e) {}
}
export function resetTuning() {
  const d = defaultTuning();
  saveTuning(d);
  return d;
}

const fresh = () => ({ credits: START_CREDITS, own: Object.fromEntries(PARTS.map((p) => [p.id, p.id === 'motor' ? 0 : 0])), route: 'nitro', loan: 0 });
export function resetAll() { const f = fresh(); save(f); resetTuning(); return f; }
// Parts and route are per truck; credits and loan are one wallet shared by all trucks (seeded from the original eighthmt save on first run).
export function load() {
  const rd = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const w = rd(WALLET) || rd('mts_up') || {}, s = rd(KEY), f = fresh();
  const credits = w.credits === undefined ? START_CREDITS : Math.max(TEST_FLOOR, +w.credits || 0), loan = Math.max(0, Math.round(+w.loan || 0));
  if (s && s.own) return { credits, loan, route: s.route === 'electric' ? 'electric' : 'nitro', own: Object.fromEntries(PARTS.map((p) => [p.id, Math.max(0, Math.min(maxTier(p), +(s.own[p.id] ?? 0) || 0))])) }; // clamp: a truck's tier list can shrink between versions
  return { ...f, credits, loan };
}
export function save(s) { try { localStorage.setItem(KEY, JSON.stringify({ own: s.own, route: s.route })); localStorage.setItem(WALLET, JSON.stringify({ credits: s.credits, loan: s.loan })); } catch (e) {} }
/** earnings go to repaying any outstanding loan first; only the surplus becomes spendable credits */
export function addCredits(n) { const s = load(); n = Math.max(0, Math.round(n)); const pay = Math.min(s.loan || 0, n); s.loan = (s.loan || 0) - pay; s.credits += n - pay; save(s); return s.credits; }
export function takeLoan(n) { const s = load(); n = Math.max(0, Math.min(10000000, Math.round(n))); s.credits += n; s.loan = (s.loan || 0) + n; save(s); return n; }
export const loanOwed = () => load().loan || 0;
/** max every part of a branch plus all common parts (cheat) */
export function maxBuild(route) {
  const s = load(); s.route = route; for (const p of PARTS) { if (p.branch === 'all' || p.branch === route) s.own[p.id] = maxTier(p); else if (p.branch === 'electric' && route === 'nitro') s.own[p.id] = 0; } save(s); return s;
}
// cheat codes, typed anywhere in the menu / game: "loanme100k" (k = thousand, m = million, or plain digits then Enter), "iamthor" (all brushless + common upgrades), "iamloki" (all nitro + common upgrades)
let _cb = '';
const WORDS = ['loanme', 'iamthor', 'iamloki'], CODES = { iamthor: () => { maxBuild('electric'); return 'Thor mode: all brushless + common upgrades installed'; }, iamloki: () => { maxBuild('nitro'); return 'Loki mode: all nitro + common upgrades installed'; } };
const loanMsg = (n) => `Loan approved: +${n.toLocaleString('en-US')} credits (repay from earnings)`;
/** returns null (not a cheat key), or { consumed, msg } — consumed keys should not reach the normal hotkeys while a code is being typed */
export function cheatKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null; const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key === 'Enter' ? 'Enter' : null; if (!k) return null;
  if (k === 'Enter') { const m = /^loanme(\d+(?:\.\d+)?)$/.exec(_cb); _cb = ''; return m ? { consumed: true, msg: loanMsg(takeLoan(+m[1])) } : null; }
  const cand = _cb + k;
  if (CODES[cand]) { _cb = ''; return { consumed: true, msg: CODES[cand](), reload: true }; }
  const m = /^loanme(\d+(?:\.\d+)?)([km])$/.exec(cand); if (m) { _cb = ''; return { consumed: true, msg: loanMsg(takeLoan(+m[1] * (m[2] === 'k' ? 1e3 : 1e6))) }; }
  if (WORDS.some((w) => w.startsWith(cand)) || /^loanme\d*(?:\.\d*)?$/.test(cand)) { _cb = cand; return { consumed: cand.length > 1, msg: '' }; }
  _cb = WORDS.some((w) => w.startsWith(k)) ? k : ''; return null;
}

/** is this part usable on the current branch? */
export function active(s, p) { return p.branch === 'all' || p.branch === s.route; }
/** why can't tier t of p be bought now? returns '' when OK */
export function blocked(s, p, t) {
  if (t > maxTier(p)) return 'Maxed';
  if (t !== s.own[p.id] + 1) return t <= s.own[p.id] ? 'Owned' : 'Needs previous tier';
  if (p.branch === 'nitro' && s.route === 'electric') return 'Locked: brushless conversion fitted';
  if (p.branch === 'electric' && s.route === 'nitro' && p.id !== 'motor') return 'Locked: needs brushless conversion';
  if (p.req && s.own[p.req] < 1) return 'Needs brushless motor';
  if (tierCost(p, t) > s.credits) return 'Not enough credits';
  return '';
}
export function buy(s, id) {
  const p = part(id), t = s.own[id] + 1, why = blocked(s, p, t); if (why) return why;
  s.credits -= tierCost(p, t); s.own[id] = t; if (id === 'motor') s.route = 'electric'; save(s); return '';
}
export const SELL = 0.8;
export const sellValue = (p, t) => Math.round(tierCost(p, t) * SELL);
/** uninstall the top installed tier of a part for 80% of its price; returns '' on success or the reason it can't be removed */
export function sell(s, id) {
  const p = part(id), t = s.own[id]; if (t < 1) return 'Nothing installed';
  if (id === 'motor' && t === 1 && (s.own.battery > 0 || s.own.center > 0)) return 'Remove the battery / centre drivetrain first';
  s.credits += sellValue(p, t); s.own[id] = t - 1; if (id === 'motor' && t === 1) s.route = 'nitro'; save(s); return '';
}
export function setRoute(s, r) { if (r === 'electric' && s.own.motor < 1) return 'Buy the brushless motor (conversion kit) first'; s.route = r; save(s); return ''; }
export function refundAll(s) { let c = 0; for (const p of PARTS) for (let t = 1; t <= s.own[p.id]; t++) c += tierCost(p, t); s.credits += Math.round(c * 0.8); for (const p of PARTS) s.own[p.id] = 0; s.route = 'nitro'; save(s); }

/** owned parts -> handling parameters (1.0 = the previous fixed tuning) */
export function stats(s, P = profile(), tune = loadTuning()) {
  const o = s.own, el = s.route === 'electric', T = (i, arr) => arr[Math.min(i, arr.length - 1)];
  const t = { ...defaultTuning(), ...tune };
  let pwr, spd, pt, pitch = 1, brake, gears, whine = false, flipK = 0, wheelieCut = 0;
  let fuelRate = 1.0;
  if (!el) {
    // Engine tune: 0=Very rich (0.88 pwr, 0.92 spd, 0.85 fuelRate), 2=Optimum (1.0, 1.0, 1.0), 4=Lean (1.14 pwr, 1.08 spd, 1.33 fuelRate)
    const engTunePwr = [0.88, 0.94, 1.0, 1.07, 1.14][t.engine_tune];
    const engTuneSpd = [0.92, 0.96, 1.0, 1.04, 1.08][t.engine_tune];
    fuelRate = [0.85, 0.92, 1.0, 1.15, 1.33][t.engine_tune];

    pwr = T(o.engine, [0.8, 1.0, 1.2, 1.4]) * (1 + 0.04 * o.pipe) * (1 + 0.02 * o.shafts) * (1 + 0.015 * o.chassis) * engTunePwr;
    spd = T(o.engine, [0.85, 0.95, 1.08, 1.2]) * (1 + 0.02 * o.pipe) * engTuneSpd;
    pt = o.engine; pitch = 1 + 0.05 * o.pipe + 0.03 * o.engine;
    
    // Nitro brake tuning bias (0=light to 4=extreme bite)
    const nitroBrakeMul = [0.65, 0.82, 1.0, 1.2, 1.45][t.brake_nitro];
    brake = T(o.brakes, P.drive.brakeNitro) * nitroBrakeMul;

    // Nitro clutch engagement: soft (0.85x launch boost) to hard (1.25x high-stall punch)
    const clutchMul = [0.85, 0.92, 1.0, 1.12, 1.25][t.clutch_engagement];
    const baseGears = P.gearing.nitro[o.trans];
    gears = { ...baseGears, g1Boost: (baseGears.g1Boost || 1) * clutchMul };
  } else {
    const m = o.motor, b = o.battery, nb = P.partTiers?.battery?.length || 4; // battery tier count (8S is the last tier)
    // Motor timing: 0 (0 deg, 0.92 pwr, 0.95 spd, cool) to 4 (20 deg aggressive, 1.15 pwr, 1.10 spd, high draw)
    const timingPwr = [0.92, 0.96, 1.0, 1.07, 1.15][t.motor_timing];
    const timingSpd = [0.95, 0.97, 1.0, 1.05, 1.10][t.motor_timing];
    fuelRate = [0.85, 0.92, 1.0, 1.15, 1.35][t.motor_timing];

    pwr = T(m, [0, 1.0, 1.35, 1.75]) * T(b, P.drive.batteryPower || [0.8, 1.0, 1.4, 1.9]) * (1 + 0.02 * o.shafts) * (1 + 0.015 * o.chassis) * timingPwr;
    const tbl = P.drive.speedTable; // optional per-truck top speed in mph, rows = brushless motor tier 1..3, columns = battery tier (set from the real Kv / cell-count figures); otherwise motor and battery factors multiply
    if (tbl) { const mph = T(m - 1, tbl)[Math.min(b, tbl[0].length - 1)], v = mph * 0.44704; spd = v / (1 - 6e-5 * v * v) / P.drive.topSpeed * timingSpd; } // second term pre-compensates air drag so the truck actually reaches the figure
    else spd = T(m, P.drive.motorSpeed || [0.95, 0.95, 1.15, 1.38]) * T(b, P.drive.batterySpeed || [1, 1.05, 1.17, 1.32]) * timingSpd;
    pt = (m - 1) + b; whine = true;
    
    // Brushless brake strength (0=30% soft regen to 4=100% full regen/endo power)
    const elecBrakeMul = [0.45, 0.70, 1.0, 1.25, 1.5][t.brake_electric];
    brake = P.drive.brakeElectric * elecBrakeMul;

    // centre drivetrain tames the launch (traction-control style)
    gears = { n: 0, up: [999, 999], down: [999, 999], launchMu: P.gearing.electric.launchMu, g1Boost: T(o.center, [1.0, 0.93, 0.87, 0.8]) * (b >= nb - 1 ? 1.25 : 1), fade: P.gearing.electric.fade, dip: P.gearing.electric.dip };
    wheelieCut = T(o.center, [0, 0.15, 0.3, 0.45]); flipK = b >= nb - 1 ? Math.max(10, Math.min(16, (pwr * gears.g1Boost - 1.8) * 9)) * (1 - 0.08 * o.center) : Math.max(0, Math.min(14, (pwr * gears.g1Boost - 2.6) * 10));
  }

  // Slipper clutch adjustment: 0=Loose (limits launch punch & tames wheelies), 4=Locked (raw snap)
  const slipLaunchMul = [0.75, 0.88, 1.0, 1.12, 1.22][t.slipper];
  const slipWheelieCutAdd = [0.25, 0.12, 0, -0.08, -0.15][t.slipper];
  gears.g1Boost = (gears.g1Boost || 1) * slipLaunchMul;
  wheelieCut = Math.max(0, wheelieCut + slipWheelieCutAdd);

  const strength = o.shafts + (o.diffs >= 2 ? 1 : 0) + (el ? Math.max(0, o.center - 1) : 0), deficit = Math.max(0, pt - 1 - strength);
  
  // Shock tuning and preload:
  const baseSh = P.cabSpring[o.shocks];
  // Shock damping (0=Soft bouncy, 4=Heavy pack)
  const dampMul = [0.65, 0.82, 1.0, 1.25, 1.55][t.shock_damp];
  // Spring preload (0=Low/soft sag, 4=High clearance/stiff)
  const preloadMul = [0.78, 0.89, 1.0, 1.15, 1.3][t.spring_preload];
  const sh = { ...baseSh, ze: baseSh.ze * dampMul, wt: baseSh.wt * preloadMul };

  // Tier-based suspension characteristics:
  // Tier 0: Soft single spring, lowest stroke before bottoming, light damping -> bottoms out on big jumps & bounces.
  // Tier 1: Dual-rate spring setup, slightly firmer progressive stroke, better damping.
  // Tier 2: Big bore shocks (40% larger bore), high pack, much firmer bottom-out resistance.
  // Tier 3: Twin coil-overs per corner (8 shocks), maximum stroke support, plush control, lands flat with zero bounce.
  // tierMode 'relative' (trophy truck): the tier numbers below are the 1:8 monster truck's absolute values, so scale them against tier 0 and keep the profile's own spring, damping, travel and bounce.
  const rel = P.suspension.tierMode === 'relative', sc = (a, base) => rel ? a[o.shocks] / a[0] * base : a[o.shocks];
  const tierSpringK = sc([1.20, 1.28, 1.38, 1.52], 1);
  const tierTravel = rel ? P.suspension.travel * (1 + 0.05 * o.shocks) : [0.22, 0.28, 0.33, 0.38][o.shocks];
  const tierBound = sc([0.65, 0.95, 1.30, 1.70], 1);
  const tierRebound = sc([0.95, 1.15, 1.35, 1.75], 1);
  const tierRestitution = rel ? P.suspension.restitution : [0.42, 0.38, 0.34, 0.30][o.shocks];
  const tierRestitutionBody = rel ? P.suspension.restitutionBody : [0.28, 0.22, 0.16, 0.10][o.shocks];

  if (!(flipK > 0)) wheelieCut = Math.max(wheelieCut, 0.55 + 0.05 * o.chassis);
  const capDeg = flipK > 0 || pwr >= 3.0 ? null : 22 + 28 * Math.max(0, pwr - 0.8) - (el ? 14 * o.center : 0);
  const liftK = Math.max(0, Math.min(12, (pwr * (gears.g1Boost || 1) - 0.9) * 7)) * (el ? 1 - 0.15 * o.center : 1);
  return { route: s.route, shocks: o.shocks, flipK, liftK, wheelieCut, capGain: 30 * Math.pow(pwr * (gears.g1Boost || 1), 2), wheelieCap: capDeg == null ? null : Math.sin(Math.max(12, capDeg) * Math.PI / 180), pwr, spd, pt, brake, gears, whine, pitch, deficit, strength, shock: sh,
    fuelRate, dampMul, preloadMul, tuning: t, barDeg: [0, 15, 30, 45][t.wheelie_bar],
    tierSpringK, tierTravel, tierBound, tierRebound, tierRestitution, tierRestitutionBody,
    steerRate: [0.24, 0.31, 0.40, 0.55][o.steering], steerMax: P.steering.max + [-1, 0, 1, 2][o.steering],
    wheelieDamp: [0.988, 0.985, 0.978, 0.97][o.chassis], dmg: [1, 1.1, 1.25, 1.5][o.chassis],
    grip: P.tyres.baseGrip * [0.99, 1.0, 1.03, 1.06][o.tires] * [0.93, 1.0, 1.06, 1.12][o.diffs], balloon: [1.0, 0.6, 0, 0][o.tires] };
}

/** push the stats into a rigid-body truck + cab spring + visuals + damage thresholds */
export function apply(c, { truck, cab, vis, linkage, setShocks }) {
  // pwr = launch acceleration (x the old 7 m/s^2), spd = top speed (x 28 m/s)
  truck.drive.k = truck.P.drive.accel * c.pwr / c.spd; truck.drive.vmax = truck.P.drive.topSpeed * c.spd; truck.brakeAccel = c.brake; truck.gears = { ...truck.gears, ...c.gears };
  truck.wheelieDamp = c.wheelieDamp; truck.flipK = c.flipK; truck.liftK = c.liftK; truck.wheelieCut = c.wheelieCut; truck.wheelieCap = c.wheelieCap; truck.capGain = c.capGain;
  { const pc = truck.P.launch.pitchCapDeg; if (pc != null) { truck.flipK = 0; truck.liftK = 0; truck.wheelieCut = 0.8; truck.wheelieCap = Math.sin(pc * Math.PI / 180); truck.capGain = 80; } } // long, heavy trophy truck: only a brief small nose lift on launch, never a wheelie truck.steerRate = c.steerRate; truck.steerMax = c.steerMax; truck.gripMul = c.grip; truck.balloon = c.balloon; truck.deficit = c.deficit; truck.snapT = 0;
  truck.fuelRate = c.fuelRate || 1.0;
  truck.barDeg0 = c.barDeg; truck.barDeg = truck.barBroken ? 0 : c.barDeg;
  if (truck.P && truck.P.suspension) {
    const kMul = (c.tierSpringK || 1.0) * (c.preloadMul != null ? c.preloadMul : 1.0);
    truck.suspK = truck.P.suspension.springRate * kMul;
    truck.sag0 = truck.P.suspension.sag / Math.sqrt(c.preloadMul != null ? c.preloadMul : 1.0);
    if (c.tierTravel != null) truck.travel = c.tierTravel;
    const bMul = (c.tierBound || 1.0) * (c.dampMul != null ? c.dampMul : 1.0);
    const rMul = (c.tierRebound || 1.0) * (c.dampMul != null ? c.dampMul : 1.0);
    truck.suspZB = truck.P.suspension.bound * bMul;
    truck.suspZR = truck.P.suspension.rebound * rMul;
    if (c.tierRestitution != null) truck.restitution = c.tierRestitution;
    if (c.tierRestitutionBody != null) truck.restitutionBody = c.tierRestitutionBody;
  }
  if (cab) cab.tune = c.shock;
  if (setShocks) setShocks(c.shock);
  if (vis) {
    vis.hideParts = c.route === 'electric' ? ['pipe', 'tank'] : [];
    for (const k of ['pipe', 'tank']) if (vis.parts[k]) vis.parts[k].visible = !vis.hideParts.includes(k);
    if (vis.setNitro) vis.setNitro(c.route !== 'electric');
    if (vis.setWheelieBar) vis.setWheelieBar(c.barDeg, !!truck.barBroken);
    if (vis.setShockTier) vis.setShockTier(c.shocks || 0);
    else if (vis.setDualSprings) vis.setDualSprings(c.shocks >= 1);
  }
}
