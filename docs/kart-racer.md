# Wutborg Kart, version 4

The game at kart-racer.html uses local Three.js and procedural scenery. No new packages or remote assets are required.

## Play

- Six courses: Kløversløjfen, Solskinsbugten, Midnatskronen, Vulkanpasset, Frosttinderne and Junglestien.
- Eight drivers, three difficulties, single race, six-race Grand Prix and time trial. Cup ties use the latest finishing order.
- The new courses add launch ramps, moving obstacles and narrow turbo side routes. Holding drift when landing gives a boost. Airborne karts can clear obstacles.
- Frosttinderne has reduced grip between 16% and 72% of the lap. Steer early; drifting also has less grip here.
- Volcano craters, snowy crystals, jungle temples and weather distinguish the landscapes. The Canvas fallback also draws ramps, obstacles and side routes.
- Keyboard: arrows/WASD to drive, Shift/X to drift, Space/Z for items, R to recover and Escape to pause. Touch buttons provide the same actions.
- Gamepad mappings remain available, but this update was not tested with a physical controller.

## Implementation

js/kart-racer-data.js owns spline geometry, surface regions, ramps and obstacles. Physics, AI, rendering and the minimap share the same 1,024 samples. Side routes follow the road projection and do not bypass the twelve lap checkpoints. Their narrow safe area rewards accurate steering; leaving it incurs the normal off-road penalty.

js/kart-racer.js runs fixed 60 Hz physics and separately simulates jump height. js/kart-racer-3d.js renders course mechanics and particles; js/kart-racer-world.js batches landscape geometry. Weather and particle counts are capped. Mobile retains its reduced pixel ratio and shadow settings.

Settings stay under wutborg.kart.v2. Personal records now use track-id:v4:difficulty (or time) because jumping and the routes change race times. Earlier records remain in storage. Highscore submissions identify version 4.

## Validation

npm run test:kart covers 34 checks, including eighteen complete races with all eight drivers (six courses × three difficulties). It verifies lap integrity, reverse travel, recovery, items, collisions, storage, height continuity, curvature and map bounds.

npm run test:expansions tests launching, landing boosts, obstacle clearance, side routes and ice alongside Mario and Borgstorm extensions.

Serve the repository and open scripts/game-expansion.browser-test.html for isolated visual scenes without saved results. The existing scripts/kart-racer.browser-test.html covers the full six-race cup; ?scenario=preview&track=0&stop=10 supports course indices 0–5 and an optional &at=0.46 starting fraction. Browser screenshots verify local rendering; they do not establish performance on physical phones.

The six-race browser integration test passed all 40 checks, including totals, final standings, restart, rendering budget and GPU resource cleanup.
