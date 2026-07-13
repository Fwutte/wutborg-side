(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const TAU = Math.PI * 2;

  const normalizeAngle = (angle) => {
    let next = angle % TAU;
    if (next < 0) next += TAU;
    return next;
  };

  const angleDelta = (from, to) => {
    let delta = normalizeAngle(to) - normalizeAngle(from);
    if (delta > Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    return delta;
  };

  const makeOvalTrack = ({ id, name, palette, cx, cy, outerRx, outerRy, innerRx, innerRy, startAngle }) => {
    const checkpointAngles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
    const waypointAngles = Array.from({ length: 24 }, (_, index) => (index / 24) * TAU);
    const radiusX = (outerRx + innerRx) / 2;
    const radiusY = (outerRy + innerRy) / 2;
    const pointAt = (angle) => ({
      x: cx + Math.cos(angle) * radiusX,
      y: cy + Math.sin(angle) * radiusY,
    });
    const tangentAt = (angle) => Math.atan2(Math.cos(angle) * radiusY, -Math.sin(angle) * radiusX);
    const start = pointAt(startAngle);

    return {
      id,
      name,
      subtitle: "Kloversløjfen · begyndercircuit",
      width: cx * 2,
      height: cy * 2,
      cx,
      cy,
      outerRx,
      outerRy,
      innerRx,
      innerRy,
      radiusX,
      radiusY,
      startAngle,
      start,
      heading: tangentAt(startAngle),
      checkpointAngles,
      waypoints: waypointAngles.map((angle) => ({ ...pointAt(angle), angle })),
      itemBoxes: [0.38, 1.12, 2.18, 3.08, 4.1, 5.2].map((angle, index) => ({
        id: `${id}-box-${index + 1}`,
        ...pointAt(angle),
        angle,
        cooldown: 0,
      })),
      palette,
      pointAt,
      tangentAt,
      angleAt(x, y) {
        return normalizeAngle(Math.atan2((y - cy) / radiusY, (x - cx) / radiusX));
      },
      isRoad(x, y) {
        const dx = x - cx;
        const dy = y - cy;
        const outer = (dx * dx) / (outerRx * outerRx) + (dy * dy) / (outerRy * outerRy);
        const inner = (dx * dx) / (innerRx * innerRx) + (dy * dy) / (innerRy * innerRy);
        return outer <= 1 && inner >= 1;
      },
      isOffroad(x, y) {
        return !this.isRoad(x, y);
      },
      nearestRoadPoint(x, y) {
        const angle = this.angleAt(x, y);
        return pointAt(angle);
      },
    };
  };

  const DRIVERS = [
    { id: "mario", name: "Mario", color: "#e94343", accent: "#ffe263", className: "Mellem", maxSpeed: 360, acceleration: 220, handling: 2.7, weight: 1 },
    { id: "luigi", name: "Luigi", color: "#36a84c", accent: "#e7f6a4", className: "Mellem", maxSpeed: 358, acceleration: 224, handling: 2.75, weight: 1 },
    { id: "peach", name: "Peach", color: "#f080a8", accent: "#fff2b4", className: "Let", maxSpeed: 342, acceleration: 248, handling: 3.05, weight: 0.82 },
    { id: "toad", name: "Toad", color: "#f3f3ed", accent: "#e84c4c", className: "Let", maxSpeed: 338, acceleration: 254, handling: 3.12, weight: 0.78 },
    { id: "yoshi", name: "Yoshi", color: "#54c973", accent: "#ecfff0", className: "Let", maxSpeed: 346, acceleration: 240, handling: 2.98, weight: 0.85 },
    { id: "bowser", name: "Bowser", color: "#d9a52c", accent: "#57352d", className: "Tung", maxSpeed: 382, acceleration: 196, handling: 2.38, weight: 1.32 },
    { id: "daisy", name: "Daisy", color: "#f5a139", accent: "#fff3a0", className: "Mellem", maxSpeed: 354, acceleration: 230, handling: 2.82, weight: 0.95 },
    { id: "wario", name: "Wario", color: "#9158c8", accent: "#f6dc49", className: "Tung", maxSpeed: 376, acceleration: 204, handling: 2.45, weight: 1.25 },
  ];

  const ITEM_TYPES = {
    mushroom: { name: "Turbo-svamp", icon: "●", color: "#f2644f" },
    banana: { name: "Banan", icon: "◒", color: "#ffe15d" },
    shell: { name: "Grøn skal", icon: "◆", color: "#53c66d" },
  };

  const TRACKS = [
    makeOvalTrack({
      id: "clover-circuit",
      name: "Kloversløjfen",
      palette: { grass: "#6fc75b", grassDark: "#3f9f54", road: "#4d5564", roadEdge: "#f4eed2", sky: "#aee7ff", barrier: "#f2674c" },
      cx: 800,
      cy: 500,
      outerRx: 650,
      outerRy: 385,
      innerRx: 360,
      innerRy: 155,
      startAngle: (Math.PI * 3) / 2,
    }),
  ];

  window.WutborgKartData = {
    DRIVERS,
    ITEM_TYPES,
    TRACKS,
    TAU,
    clamp,
    normalizeAngle,
    angleDelta,
  };
})();
