# Wutborg Kart, version 2

The game is available at `kart-racer.html`. It uses the existing, locally vendored Three.js runtime. No new packages or external assets are required.

## Play

- Three different spline tracks: Kløversløjfen, Solskinsbugten and Midnatskronen.
- Eight original drivers with different speed, acceleration, steering and weight.
- Single race, three-race Grand Prix (15/12/10/8/6/4/2/1 points), and time trial. Equal cup points are resolved by the latest race's finishing order.
- Three AI difficulties; optional automatic acceleration and steering assistance.
- Drift charges blue, orange and purple turbo; release to use the boost.
- Six items, coins, boost pads, track map, wrong-way detection and recovery.
- Keyboard: arrows/WASD, Shift/X to drift, Space/Z for items, R to recover, Escape to pause.
- Gamepad: left stick steering, RT/A acceleration, LT brake, RB drift, X item. Gamepad controls are implemented but have not been tested with a physical controller.
- Touch controls include steering, brake/reverse, drift, item, manual gas when needed and a landscape pause button.

## Structure

- `js/kart-racer-data.js`: drivers and closed cubic B-spline tracks sampled by arc length. Shared geometry is used by physics, rendering and minimaps.
- `js/kart-racer.js`: fixed 60 Hz physics, AI, checkpoints, items, audio, input, results and an overhead Canvas fallback when WebGL cannot initialize.
- `js/kart-racer-3d.js`: procedural kart models and scenery, instanced environment meshes, chase camera, particles and GPU resource cleanup. No DOM sprite is used for the player.
- `css/kart-racer.css`: menu, racing HUD, dialogs and portrait/landscape layouts.

Racers must cross all twelve gates in order before a lap counts. Reverse travel reduces progress. Large coordinate jumps are ignored. The track's run-off area counts as a valid gate crossing; leaving the road still slows the kart. Finished racers retain their finish time and rank ahead of unfinished racers.

Settings and personal records are stored under `wutborg.kart.v2`, separately from the old oval-track records. Records distinguish track and difficulty, with separate time-trial records. Existing site highscore integration includes `version: 2` in its details. Storage and audio failures do not prevent play.

## Validation

Run `npm run test:kart` for 22 behavioral checks, including nine complete races with all eight drivers (three tracks × three difficulties). Tests cover lap integrity, run-off, reverse travel, recovery, collisions, item protection, countdown, finish order, storage and simultaneous touch inputs.

Run `npm run validate` for the full site's existing checks, including the 3D renderer's syntax check.

For browser integration, serve the repository over HTTP and open `scripts/kart-racer.browser-test.html`. The fixture performs 27 checks, including an actual three-race Grand Prix. It replaces persistence and highscore submission in the test page, so simulated races do not overwrite saved records. Optional scenarios:

- `?scenario=preview&track=0&stop=10`: use AI inputs to drive for ten seconds, then show a paused frame with rendering metrics. Track is 0, 1 or 2.
- `?scenario=result`: show the final Grand Prix results.

Verified in the local Chromium browser at desktop, 390×844 portrait and 844×390 landscape sizes. Observed about 59–60 rendered frames per second in the sampled scenes, with 186–229 draw calls. This is a local measurement, not a guarantee for other hardware. The WebGL-disabled fallback also completed a race and displayed its result.

On context loss, the current race pauses while WebGL restores. Browsers that cannot initialize WebGL start in the playable Canvas fallback. Real iOS/Android hardware and controller audio output were not part of this validation.
