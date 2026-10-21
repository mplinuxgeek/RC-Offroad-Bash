import { buildRcTruck, updateStruts } from './rctruck.js';

/** Visual truck: the user's own RC monster truck model (see rctruck.js). */
export const buildTruckVisual = buildRcTruck;
export function syncTruck(vis, truck, dt = 0) {
  // suspension droop (visual): with the wheels off the ground each axle hangs `droop` metres lower, easing out slowly and back in quickly on touchdown
  const dr = truck.P.suspension.droop, drA = [truck.P.suspension.droopFront ?? dr, truck.P.suspension.droopRear ?? dr]; vis.droop = vis.droop || [0, 0]; vis.airDrop = vis.airDrop || [0, 0]; vis.gndDrop = vis.gndDrop || [0, 0];
  for (let a = 0; a < 2; a++) { const air = (truck.wheels[a * 2].contact ? 0 : 0.5) + (truck.wheels[a * 2 + 1].contact ? 0 : 0.5) , tg = drA[a] * air * (truck.touch ? 1 : 1), cur = vis.airDrop[a]; vis.airDrop[a] = cur + (tg - cur) * Math.min(1, dt * (tg > cur ? 4 : 22));
    // the contact sphere is inflated by `sag`, so a tyre that is not compressed by that much would hover: lower the axle by the unused stroke (raise it when over-compressed) so the tyre rubber meets the ground
    let e = 0, n = 0; for (let k = 0; k < 2; k++) { const w = truck.wheels[a * 2 + k]; if (w.contact && truck.susp) { e += truck.sag0 - w.comp; n++; } }
    const gt = n ? Math.max(-0.2, Math.min(0.3, e / n)) * (1 - air) : 0; vis.gndDrop[a] += (gt - vis.gndDrop[a]) * Math.min(1, dt * 30); vis.droop[a] = vis.airDrop[a] + vis.gndDrop[a]; }
  vis.root.position.copy(truck.p); vis.root.quaternion.copy(truck.q);
  vis.cab.update(truck, dt); vis.cab.matrix(vis.body.matrix); vis.body.matrixWorldNeedsUpdate = true;
  truck.wheels.forEach((wh, i) => { const l = truck.wheelLocal(i), v = vis.wheels[i]; v.pivot.position.copy(l); v.pivot.position.y -= vis.droop[i >> 1]; v.pivot.rotation.order = 'ZYX'; v.pivot.rotation.y = i < 2 ? truck.steer * Math.PI / 180 : 0; v.pivot.rotation.z = truck.phi ? truck.phi[i >> 1] : 0; v.spin.rotation.x = wh.spin; });
  for (let a = 0; a < 2; a++) { const ph = truck.phi ? truck.phi[a] : 0, y0 = truck.sp[a * 2].p0.y, g = vis.axles[a]; g.rotation.z = ph; g.position.set(y0 * Math.sin(ph), y0 * (1 - Math.cos(ph)) - vis.droop[a], 0); }
  updateStruts(vis, truck);
}
