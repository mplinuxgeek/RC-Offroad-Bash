# RC Offroad Bash - Feature Enhancement Roadmap & Implementation Checklist

## Project Overview
- **Game Engine:** Three.js + Custom Physics Engine
- **Platform:** Browser-based (WebGL / WebGPU)
- **Scale:** 1:8 Offroad Monster Truck Simulation
- **Target Mechanics:** Authentic FreeCAD mechanical geometry, modular powertrain paths, realistic terrain dynamics, and stunt physics.

---

## 1. Physics, Mechanics & Drivetrain

### 1.1 Tire Dynamics & Deformation
- [ ] **Centrifugal Ballooning Model**
  - [ ] Implement rotational velocity-dependent mesh stretching on unbelted bash tires at high RPM.
  - [ ] Apply air-control gyroscopic torque scaling proportional to rotational expansion.
  - [ ] Maintain rigid dimensions for belted performance tire upgrades.
- [ ] **Sidewall Deflection & Contact Patch**
  - [ ] Implement lateral sidewall flex calculations based on cornering G-load.
  - [ ] Add bump-stop compression deformation on harsh vertical landings.

### 1.2 Thermal Dynamics & Powertrain Load
- [ ] **Brushless System Thermals**
  - [ ] Model motor stator and ESC heat saturation under sustained load.
  - [ ] Implement automatic thermal throttling step-down when temperatures exceed 85°C.
- [ ] **Nitro Engine Thermals & Vaporization**
  - [ ] Model cylinder head temperature curves governed by high/low-speed needle mixture.
  - [ ] Simulate engine stalls and vapor lock under prolonged high-temp idling.

### 1.3 Fluid Drivetrain Simulation
- [ ] **Per-Axle Viscous Differential Fluid Tuning**
  - [ ] Front Differential: 10,000 cSt to 100,000 cSt tuning range.
  - [ ] Center Differential: 100,000 cSt to 1,000,000 cSt / solid center spool lockout.
  - [ ] Rear Differential: 5,000 cSt to 50,000 cSt tuning range.
- [ ] **Diff Unload Modeling**
  - [ ] Calculate rotational power redistribution to unweighted wheels during cornering and jumps.

### 1.4 Surface Traction & Roost Particles
- [ ] Dynamic surface drag coefficients for clay, loose loam, gravel, and damp mud.
- [ ] Velocity-scaled directional dirt roost particle emitter linked to tire slip angle.

---

## 2. Vehicle Customization & CAD Integration

### 2.1 CAD Integration & 3D Printing Pipeline
- [ ] **Direct Mesh Exporter**
  - [ ] Export modified chassis structural elements to `.STL` format.
  - [ ] Export dimensional FreeCAD geometry assemblies to `.STEP` format.
- [ ] **Infill & Structural Material Properties**
  - [ ] Add selectable infill presets (e.g., PLA, PETG, TPU, Carbon Nylon) modifying weight, flex modulus, and impact failure limits.

### 2.2 Lexan Body Physics & Custom Liveries
- [ ] Shell vertex deformation shader for impact crumple zones.
- [ ] Tear/crack thresholds on repeated stress points (wheel arches, roof line).
- [ ] Custom decal and livery loader supporting user-imported PNG files and bump-map overlays.

### 2.3 Wheelie & Stability Electronics
- [ ] Adjustable single/dual roller wheelie bar with tunable spring rates.
- [ ] AVC / Steering Gyro stabilization algorithm with adjustable software gain slider (0–100%).

---

## 3. Track Builder & Environmental Mechanics

### 3.1 Dynamic Terrain Displacement
- [ ] Heightmap deformation buffer under high-load tire contact (rutting on berms, lip erosion on kickers).
- [ ] Track surface maintenance tool (rake/pack) in Map Editor.

### 3.2 Obstacles & Environmental Props
- [ ] Destructible bash props: construction cones, PVC pipes, wooden kickers, and concrete curbs.
- [ ] Standing water puddles with hydroplane physics and temporary electrical efficiency loss.

### 3.3 Map Serialization & Sharing
- [ ] Compact URL hash/base64 string compression for direct track sharing via link.
- [ ] Native JSON map schema validator with import/export clipboard integration.

---

## 4. Game Modes, Telemetry & Competition

### 4.1 Asynchronous Competition & Telemetry
- [ ] Delta-compressed ghost car recording system stored in IndexedDB.
- [ ] Trailing ghost visual with split-time delta markers and braking-point indicators.

### 4.2 Arena Bash Challenges
- [ ] Mega-ramp arena featuring high-jump crossbars and speed radar traps.
- [ ] Target staging platforms requiring precise mid-air pitch/yaw braking adjustment to stick the landing.

### 4.3 Engineering Telemetry HUD
- [ ] Live suspension stroke graph (real-time millimeter travel per damper).
- [ ] Chassis bottom-out contact warning indicators.
- [ ] Real-time G-force vector ball and motor current/RPM graphs.

---

## 5. Engine Architecture & Performance Optimization

### 5.1 Web Worker / WASM Offloading
- [ ] Migrate rigid-body calculations, spring-damper integration, and raycasting to a dedicated Web Worker.
- [ ] Lock physics tick rate to 120 Hz decoupled from the rendering loop.
- [ ] Implement `SharedArrayBuffer` for zero-copy state synchronization with Three.js.

### 5.2 WebGPU & Render Optimization
- [ ] Compute-shader particle engine for dust clouds, exhaust smoke, and debris.
- [ ] Distance-based Level of Detail (LOD) swapping for intricate CAD hardware assemblies (pins, hexes, linkage ends).

### 5.3 Controller & Haptic Integration
- [ ] Native Gamepad API haptic rumble profiles (engine idle, gear shifts, hard chassis bottom-out, tire slip).
