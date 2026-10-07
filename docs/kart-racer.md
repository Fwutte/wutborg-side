# Wutborg Kart, version 5

The game at kart-racer.html uses local Three.js and procedural scenery. No new packages or remote assets are required.

## Play

- Six courses: Kløversløjfen, Solskinsbugten, Midnatskronen, Vulkanpasset, Frosttinderne and Junglestien.
- Eight drivers, three difficulties, single race, six-race Grand Prix and time trial. Cup ties use the latest finishing order.
- The new courses add launch ramps, moving obstacles and narrow turbo side routes. Holding drift when landing gives a boost. Airborne karts can clear obstacles.
- Frosttinderne has reduced grip between 16% and 72% of the lap. Steer early; drifting also has less grip here.
- Volcano craters, snowy crystals, jungle temples and weather distinguish the landscapes. The Canvas fallback also draws ramps, obstacles and side routes.
- Keyboard: arrows/WASD to drive, Shift/X to drift, Space/Z for items, R to recover and Escape to pause. Touch buttons provide the same actions.
- Gamepad mappings remain available, but this update was not tested with a physical controller.

## Handling update

Version 5 replaces direct heading changes with a bicycle steering model and a separate momentum vector. Steering becomes less sensitive at speed, recenters quickly and responds faster to countersteering. Stationary karts cannot turn on the spot; steering reverses naturally when backing up. Acceleration tapers toward top speed, hills affect engine load and boost expiration sheds excess speed gradually.

Tyres have a limited lateral grip budget shared with acceleration and braking. Ice and grass reduce grip. Drifting lowers rear grip, allows countersteering and charges turbo only during a slide. Releasing drift restores grip progressively. Steering in the air changes the body orientation slightly while retaining the launch trajectory; landing boosts remain available.

Braking stops the kart before reverse engages after a 0.25-second hold. Gas brakes reverse motion before accelerating forwards. Gamepad sticks have a rescaled deadzone, triggers provide proportional throttle/brake and the D-pad can steer. Keyboard and touch retain the existing controls. Road-edge assistance acts only when the player is not actively steering or drifting.

Kart collisions apply mass-weighted impulses; barrier contacts remove outward velocity while preserving motion along the road. Wrong-way detection now includes backing up against the race direction. Recovery clears steering, yaw and slip state.

The 3D renderer interpolates physics poses between the fixed simulation steps. Body pitch and roll follow measured acceleration; wheels turn according to steering angle and accumulated travel. The chase camera blends heading with slide direction, looks into turns and resets after recovery.

## Implementation

js/kart-racer-data.js owns spline geometry, surface regions, ramps and obstacles. Physics, AI, rendering and the minimap share the same 1,024 samples. Side routes follow the road projection and do not bypass the twelve lap checkpoints. Their narrow safe area rewards accurate steering; leaving it incurs the normal off-road penalty.

js/kart-racer.js runs fixed 60 Hz physics and separately simulates jump height. js/kart-racer-3d.js renders course mechanics and particles; js/kart-racer-world.js batches landscape geometry. Weather and particle counts are capped. Mobile retains its reduced pixel ratio and shadow settings.

Settings stay under wutborg.kart.v2. Personal records now use track-id:v5:difficulty (or time), since the handling model changes race times. Earlier records remain in storage. Highscore submissions identify version 5.

## Validation

npm run test:kart covers 45 checks, including eighteen complete races with all eight drivers (six courses × three difficulties). In addition to lap integrity, items, storage and geometry, it checks steering at rest and in reverse, high-speed steering, proportional inputs, the reverse delay, smooth boost expiration, countersteering, ice traction, airborne momentum, glancing barriers, collision momentum/energy, controller reconnects and equivalent physics under 30/60/144 Hz render schedules. Controller behavior is simulated; a physical controller and physical phones still require hands-on testing.

npm run test:expansions tests launching, landing boosts, obstacle clearance, side routes and ice alongside Mario and Borgstorm extensions.

Serve the repository and open scripts/game-expansion.browser-test.html for isolated visual scenes without saved results. The existing scripts/kart-racer.browser-test.html covers the full six-race cup; ?scenario=preview&track=0&stop=10 supports course indices 0–5 and an optional &at=0.46 starting fraction. Browser screenshots verify local rendering; they do not establish performance on physical phones.

The six-race browser integration test exercises race completion, totals, final standings, restart, rendering budget and GPU resource cleanup.

The October 7 handling check (`scripts/kart-racer.browser-test.html?scenario=handling`) passed all 17 browser checks, including keyboard/touch input, restoring focus after item use, pose interpolation, body movement, steering wheels, paused wheel animation, camera recovery and GPU cleanup. The full integration run completed all six Grand Prix races. Its existing menu budget of fewer than 300 draw calls failed: isolated measurements gave 322 calls for both the original renderer and version 5 at the same viewport. That scenery budget remains an outstanding issue independent of handling.
