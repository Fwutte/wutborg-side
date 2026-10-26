# Wutborg Sprint

Original kart artwork created for Wutborg in Blender 4.5 LTS. No third-party
models, textures, fonts or remote runtime services are used by this asset.

- `wutborg-sprint.blend`: editable source with named chassis and wheel groups.
- `wutborg-sprint.glb`: game-ready export, including all eight material roles.
- `../../../scripts/build-kart-model.py`: reproducible Blender build/export script.

Rebuild from the repository root:

```sh
blender --background --factory-startup --python scripts/build-kart-model.py
```

The helpers in the build script accept the game's coordinates: X right, Y up,
Z forward. The exporter converts Blender's coordinates to glTF's Y-up system.
The four `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR` nodes have independent
steering/spin frames. Tyre radius is 0.342 scene units. The `Chassis` node contains
the static body and driver, merged by material to keep the draw count small.

`Paint` and `Accent` are recolored for each existing driver at runtime. Other
materials are `Carbon`, `Alloy`, `Rubber`, `Visor`, `Lamps` and `TailLamps`.
The GLB has no external dependencies or texture downloads. Each instantiated
kart owns cloned geometry/materials so course cleanup leaves the template intact.
If loading fails or times out after eight seconds, the existing procedural 3D
kart remains available; the existing Canvas fallback handles unavailable WebGL.

Serve the repository and open `scripts/kart-racer-model-preview.html` for a
rotatable close-up with all eight driver colors. The browser test at
`scripts/kart-racer.browser-test.html?scenario=blender` checks model loading,
colors, axes, wheel rotation, scene ownership and the existing menu draw budget.
