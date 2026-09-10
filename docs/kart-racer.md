# Wutborg Kart, version 3

The game is available at `kart-racer.html`. It uses the existing, locally vendored Three.js runtime. No new packages or external assets are required.

## Play

- Three rebuilt spline tracks, 2.5–2.9 times their previous length: Kløversløjfen (11,353 game units), Solskinsbugten (13,237) and Midnatskronen (15,444). All have wider roads, continuous hills and a bridge section.
- Stadium, flower valley, castle and windmills; coastal promenade, harbour houses and lighthouse; neon skyline, observatory and an illuminated tunnel. Everything is original procedural geometry, with no external asset downloads.
- Rounded kart bodies, detailed wheels and helmets, readable item boxes, embossed coins, skid marks, animated balloons, windmills and water. Desktop shadows follow the camera; mobile uses a lower pixel ratio and contact shadows.
- Eight original drivers with different speed, acceleration, steering and weight.
- Single race, three-race Grand Prix (15/12/10/8/6/4/2/1 points), and time trial. Equal cup points are resolved by the latest race's finishing order.
- Three AI difficulties; optional automatic acceleration and steering assistance.
- Drift charges blue, orange and purple turbo; release to use the boost.
- Six items, coins, boost pads, track map, wrong-way detection and recovery.
- Keyboard: arrows/WASD, Shift/X to drift, Space/Z for items, R to recover, Escape to pause.
- Gamepad: left stick steering, RT/A acceleration, LT brake, RB drift, X item. Gamepad controls are implemented but have not been tested with a physical controller.
- Touch controls include steering, brake/reverse, drift, item, manual gas when needed and a landscape pause button.

## Structure

- `js/kart-racer-data.js`: drivers and closed cubic B-spline tracks with 1,024 arc-length samples, map bounds and smooth height profiles. Shared geometry is used by physics, rendering and minimaps.
- `js/kart-racer.js`: fixed 60 Hz physics, AI, checkpoints, items, audio, input, results and an overhead Canvas fallback when WebGL cannot initialize.
- `js/kart-racer-3d.js`: procedural kart models and scenery, instanced environment meshes, chase camera, particles and GPU resource cleanup. No DOM sprite is used for the player.
- `js/kart-racer-world.js`: road-following terrain, bridges, tunnels, themed scenery, landmarks and sky. Static geometry is batched by material; repeated vegetation, rails and city details are instanced.
- `css/kart-racer.css`: menu, racing HUD, dialogs and portrait/landscape layouts.

Racers must cross all twelve gates in order before a lap counts. Reverse travel reduces progress. Large coordinate jumps are ignored. The track's run-off area counts as a valid gate crossing; leaving the road still slows the kart. Finished racers retain their finish time and rank ahead of unfinished racers.

Settings and personal records remain under `wutborg.kart.v2` so driver and control preferences survive. The new track records use `track-id:v3:difficulty` (or `time`), preventing the old short-course times from appearing as unbeatable records. Previous records are retained in storage. Highscore submissions include `version: 3`. Storage and audio failures do not prevent play.

Driving and collisions use the horizontal road projection. Karts, items and camera share the height profile; hills are not a free-flight or jump simulation. Both road edges and the run-off area remain continuous. Map graphics scale from each course's actual bounds.

## Validation

Run `npm run test:kart` for 25 behavioral checks, including nine complete races with all eight drivers (three tracks × three difficulties). Tests cover lap integrity, run-off, reverse travel, recovery, collisions, items, countdown, finish order, storage and touch inputs, plus height continuity, safe road curvature, map bounds and record separation.

Run `npm run validate` for the full site's existing checks, including the 3D renderer's syntax check.

For browser integration, serve the repository over HTTP and open `scripts/kart-racer.browser-test.html`. The fixture performs 28 checks, including an actual three-race Grand Prix, rendering each course and checking resource cleanup. It replaces persistence and highscore submission in the test page, so simulated races do not overwrite saved records. Optional scenarios:

- `?scenario=preview&track=0&stop=10`: use AI inputs to drive for ten seconds, then show a paused frame with rendering metrics. Track is 0, 1 or 2.
- Add `&at=0.46` to begin at a particular fraction of a lap, for inspecting a bridge or landmark. FPS uses wall-clock measurements after 30 warm-up frames.
- `?scenario=result`: show the final Grand Prix results.

Verified in the local Chromium browser at desktop, 390×844 portrait and 844×390 landscape sizes. Sampled scenes run approximately 56–59 FPS locally, with draw calls depending on the number of visible racers and items. This is a local measurement, not a guarantee for other hardware.

On context loss, the current race pauses while WebGL restores. Browsers that cannot initialize WebGL start in the playable Canvas fallback. Real iOS/Android hardware and controller audio output were not part of this validation.
