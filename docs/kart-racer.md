# Wutborg Kart, version 6

The game at kart-racer.html uses local Three.js and procedural scenery. No new packages or remote assets are required.

## Play

- Six courses: Kløversløjfen, Solskinsbugten, Midnatskronen, Vulkanpasset, Frosttinderne and Junglestien.
- Eight drivers, three difficulties, single race, six-race Grand Prix and time trial. Cup ties use the latest finishing order.
- The new courses add launch ramps, moving obstacles and narrow turbo side routes. Holding drift when landing gives a boost. Airborne karts can clear obstacles.
- Frosttinderne has reduced grip between 16% and 72% of the lap. Steer early; drifting also has less grip here.
- Volcano craters, snowy crystals, jungle temples and weather distinguish the landscapes. The Canvas fallback also draws ramps, obstacles and side routes.
- Keyboard: arrows/WASD to drive, Shift/X to drift, Space/Z for items, C to hold rear view, R to recover and Escape to pause. Touch buttons provide the same actions; gamepad Y holds rear view.
- Gamepad mappings remain available, but this update was not tested with a physical controller.

## Follow-up review: time trial and control fixes

Time trial now records the best completed run without recovery as a personal ghost for the same course revision and driver. It samples position, heading, road/jump height and furthest progress at 10 Hz, interpolates playback between samples and renders one translucent kart without shadows. The ghost never joins the physical field or takes pickups. The HUD compares elapsed time at the same progress on the recorded run; the reference uses first crossings so reversing does not corrupt the comparison. Pause freezes both playback and the clock. Item controls are hidden in time trial.

The four most recently updated driver/course ghosts are cached locally under `ghosts` in the existing save. Recordings are limited to ten minutes and 6,002 frames; malformed replays are rejected while records and preferences remain available. Faster clean runs replace their own ghost. Recovery runs still show normal results, but do not overwrite a clean ghost. On a storage quota error the oldest cached replays are removed until records/preferences can be saved. Existing record keys remain version 6.

Gamepad Start launches the selected race, pauses/resumes and continues/retries from results. B recovers during racing. Held Start cannot repeatedly toggle after reset, and held buttons do not activate when a controller connects. Mobile now has a separate recovery button. Pause/menu/restart clear pressed touch highlights and pending actions. Keyboard focus returns to driving after sound/fullscreen actions, repeated Escape keydowns are ignored, and recovery cannot move the kart during countdown. Kart collisions also compare total elevation plus jump height to prevent contact between separate heights.

## Racing update

Version 6 adds slipstream for both human and AI drivers. Follow an aligned, moving kart 60–300 simulation units ahead; after 1.3 seconds its wake provides up to 22 units of extra top speed and 30 units of acceleration. It fades over 0.5 seconds when the wake is lost. Opposite travel, off-road driving, spins, jumps and separated elevations cannot produce a tow. The AI includes earned slipstream speed in its existing corner/braking plan.

A nearby-car radar and side arrows show physical proximity, including lapped cars. The HUD names the next ranked rival and shows an approximate gap based on progress and current speed, not an official timing split. The rear camera switches immediately while C, gamepad Y or the touch button is held, and returns to chase view on release. Pause and restart clear held/view state; recovery clears the tow and resets the gearbox/camera.

The automatic gearbox provides five forward gears, reverse, neutral and engine RPM with shift hysteresis. This models audiovisual engine feedback; the existing continuous torque curve still drives the kart. Engine pitch and load now follow RPM and throttle, with a brief dip during shifts. Filtered tyre noise follows actual slip and surface, and stops in the air, menus or pause. Sound remains optional.

Completed laps show their time and difference against the best earlier/saved lap for five simulation seconds. Pause freezes this feedback. The best lap is visible during racing; the result lists all three lap splits. Result handling is idempotent so repeated display cannot award cup points twice.

Jump height now gates floor traps, shells, turbo pads and pickups; a high jump can clear traps without collecting objects on the ground. Coins use two animated instanced meshes for the entire course, retaining bobbing, spinning, collection and respawn while reducing draw calls. No new packages or external assets are required.

## Handling update

Version 5 replaces direct heading changes with a bicycle steering model and a separate momentum vector. Steering becomes less sensitive at speed, recenters quickly and responds faster to countersteering. Stationary karts cannot turn on the spot; steering reverses naturally when backing up. Acceleration tapers toward top speed, hills affect engine load and boost expiration sheds excess speed gradually.

Tyres have a limited lateral grip budget shared with acceleration and braking. Ice and grass reduce grip. Drifting lowers rear grip, allows countersteering and charges turbo only during a slide. Releasing drift restores grip progressively. Steering in the air changes the body orientation slightly while retaining the launch trajectory; landing boosts remain available.

Braking stops the kart before reverse engages after a 0.25-second hold. Gas brakes reverse motion before accelerating forwards. Gamepad sticks have a rescaled deadzone, triggers provide proportional throttle/brake and the D-pad can steer. Keyboard and touch retain the existing controls. Road-edge assistance acts only when the player is not actively steering or drifting.

Kart collisions apply mass-weighted impulses; barrier contacts remove outward velocity while preserving motion along the road. Wrong-way detection now includes backing up against the race direction. Recovery clears steering, yaw and slip state.

The 3D renderer interpolates physics poses between the fixed simulation steps. Body pitch and roll follow measured acceleration; wheels turn according to steering angle and accumulated travel. The chase camera blends heading with slide direction, looks into turns and resets after recovery.

## Implementation

The rival update uses a cached curvature plan and a grip/braking envelope covering the next 560 course units. Steering inverts the bicycle model, and the planned lane follows the inside of bends. Rivals choose passing lanes, predict moving obstacles, slow for imminent hazards and pursue pickups when the approach is safe. They plan take-off speed for curved landings and release charged drifts with a cooldown. Item tactics hold redundant boosts, reserve straight shots for aligned targets and avoid attacking protected opponents.

Hyggelig uses 88% base top speed with conservative cornering. Sport uses 106% and Expert 117%, with small fixed differences between rivals. Sport and Expert get a launch boost; their item cooldowns are 1.25 and 0.7 seconds. These profiles are fixed throughout a race. The player's physics and time-trial car remain unchanged.

js/kart-racer-data.js owns spline geometry, surface regions, ramps and obstacles. Physics, AI, rendering and the minimap share the same 1,024 samples. Side routes follow the road projection and do not bypass the twelve lap checkpoints. Their narrow safe area rewards accurate steering; leaving it incurs the normal off-road penalty.

js/kart-racer.js runs fixed 60 Hz physics and separately simulates jump height. js/kart-racer-3d.js renders course mechanics and particles; js/kart-racer-world.js batches landscape geometry. Weather and particle counts are capped. Mobile retains its reduced pixel ratio and shadow settings.

Settings stay under wutborg.kart.v2. Personal records now use track-id:v6:difficulty (or time), since slipstream and jump interactions change race times. Earlier records remain in storage. Highscore submissions identify version 6.

## Validation

npm run test:kart covers 45 checks, including eighteen complete races with all eight drivers (six courses × three difficulties). In addition to lap integrity, items, storage and geometry, it checks steering at rest and in reverse, high-speed steering, proportional inputs, the reverse delay, smooth boost expiration, countersteering, ice traction, airborne momentum, glancing barriers, collision momentum/energy, controller reconnects and equivalent physics under 30/60/144 Hz render schedules. Controller behavior is simulated; a physical controller and physical phones still require hands-on testing.

npm run test:expansions tests launching, landing boosts, obstacle clearance, side routes and ice alongside Mario and Borgstorm extensions.

npm run test:kart-ai runs 14 checks for rival profiles, starts, ice anticipation, passing, obstacle prediction, safe pickups, ramp setup, item tactics and drift release. It compares the new AI against the previous controller using the same physics, driver, pickups and moving hazards over three laps on each of the six tracks. The deterministic benchmark measured 20.0% shorter total race time for Sport; Expert was another 4.9% quicker overall and finished faster on every course. These are controlled simulations, not a prediction of a human player's win rate.

npm run test:kart-racing runs 21 checks for slipstream, radar, gears/RPM, lap comparisons, airborne interactions, rear view, command edges/reconnects, collision height, ghost interpolation/capture/validation/isolation and storage quota handling. The browser scenario `?scenario=racing` passed 27 integration checks including the Web Audio graph, rear camera, HUD, coin hiding/respawn and frozen lap feedback. `?scenario=refinement` passed 33 checks for focus restoration, held Escape, touch/gamepad recovery, gamepad race launch/retry, full time-trial recording/playback, ghost timing, pause and GPU resource cleanup. `?scenario=ghost-view` exposes that same recorded run for visual inspection. Portrait 390 × 844 and landscape 844 × 390 screenshots verified the time-trial HUD and recovery/rear-view buttons. Browser QA disables score submissions and persistence.

Serve the repository and open scripts/game-expansion.browser-test.html for isolated visual scenes without saved results. The existing scripts/kart-racer.browser-test.html covers the full six-race cup; ?scenario=preview&track=0&stop=10 supports course indices 0–5, an optional &at=0.46 starting fraction and &difficulty=expert (or normal/relaxed). The rival update's live Expert preview ran for 12 seconds on Frosttinderne without runtime errors. Browser screenshots verify local rendering; they do not establish performance on physical phones.

The six-race browser integration test exercises race completion, totals, final standings, restart, rendering budget and GPU resource cleanup.

The October 7 handling check (`scripts/kart-racer.browser-test.html?scenario=handling`) passed all 17 browser checks. Version 6 also passed the expanded full Grand Prix integration run: 52 checks, including all six races, three lap splits per result, duplicate-point protection and GPU cleanup. The same desktop menu now uses 261 draw calls, down from the previously measured 322; the existing budget of fewer than 300 passes. Browser checks do not establish physical controller or phone performance.
