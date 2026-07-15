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

  const makeOvalTrack = ({
    id, name, subtitle, difficulty, palette, cx, cy, outerRx, outerRy, innerRx, innerRy,
    startAngle, itemBoxAngles, boostAngles, coinAngles, decorations = [],
  }) => {
    const checkpointAngles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
    const waypointAngles = Array.from({ length: 32 }, (_, index) => (index / 32) * TAU);
    const radiusX = (outerRx + innerRx) / 2;
    const radiusY = (outerRy + innerRy) / 2;
    const pointAt = (angle) => ({ x: cx + Math.cos(angle) * radiusX, y: cy + Math.sin(angle) * radiusY });
    const tangentAt = (angle) => Math.atan2(Math.cos(angle) * radiusY, -Math.sin(angle) * radiusX);
    const pointOffsetAt = (angle, lateral = 0) => {
      const point = pointAt(angle);
      const heading = tangentAt(angle);
      return { x: point.x - Math.sin(heading) * lateral, y: point.y + Math.cos(heading) * lateral };
    };
    const start = pointAt(startAngle);

    return {
      id,
      name,
      subtitle,
      difficulty,
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
      itemBoxes: itemBoxAngles.map((angle, index) => ({
        id: `${id}-box-${index + 1}`,
        ...pointOffsetAt(angle, index % 2 === 0 ? -38 : 38),
        angle,
      })),
      boostPads: boostAngles.map((angle, index) => ({ id: `${id}-boost-${index + 1}`, ...pointOffsetAt(angle), angle })),
      coins: coinAngles.map((angle, index) => ({
        id: `${id}-coin-${index + 1}`,
        ...pointOffsetAt(angle, ((index % 3) - 1) * 42),
        angle,
      })),
      decorations,
      palette,
      pointAt,
      pointOffsetAt,
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
      nearestRoadPoint(x, y) {
        return pointAt(this.angleAt(x, y));
      },
    };
  };

  const DRIVERS = [
    { id: "mario", name: "Mario", color: "#e94343", accent: "#ffe263", sprite: "car_red_1.png", rearSprite: "raceCarRed_NE.png", className: "Mellem", maxSpeed: 360, acceleration: 220, handling: 2.7, weight: 1 },
    { id: "luigi", name: "Luigi", color: "#36a84c", accent: "#e7f6a4", sprite: "car_green_2.png", rearSprite: "raceCarGreen_NE.png", className: "Mellem", maxSpeed: 358, acceleration: 224, handling: 2.75, weight: 1 },
    { id: "peach", name: "Peach", color: "#f080a8", accent: "#fff2b4", sprite: "car_red_4.png", rearSprite: "raceCarRed_NE.png", className: "Let", maxSpeed: 342, acceleration: 248, handling: 3.05, weight: 0.82 },
    { id: "toad", name: "Toad", color: "#f3f3ed", accent: "#e84c4c", sprite: "car_blue_3.png", rearSprite: "raceCarWhite_NE.png", className: "Let", maxSpeed: 338, acceleration: 254, handling: 3.12, weight: 0.78 },
    { id: "yoshi", name: "Yoshi", color: "#54c973", accent: "#ecfff0", sprite: "car_green_5.png", rearSprite: "raceCarGreen_NE.png", className: "Let", maxSpeed: 346, acceleration: 240, handling: 2.98, weight: 0.85 },
    { id: "bowser", name: "Bowser", color: "#d9a52c", accent: "#57352d", sprite: "car_yellow_5.png", rearSprite: "raceCarOrange_NE.png", className: "Tung", maxSpeed: 382, acceleration: 196, handling: 2.38, weight: 1.32 },
    { id: "daisy", name: "Daisy", color: "#f5a139", accent: "#fff3a0", sprite: "car_yellow_2.png", rearSprite: "raceCarOrange_NE.png", className: "Mellem", maxSpeed: 354, acceleration: 230, handling: 2.82, weight: 0.95 },
    { id: "wario", name: "Wario", color: "#9158c8", accent: "#f6dc49", sprite: "car_black_4.png", rearSprite: "raceCarWhite_NE.png", className: "Tung", maxSpeed: 376, acceleration: 204, handling: 2.45, weight: 1.25 },
  ];

  const ITEM_TYPES = {
    mushroom: { name: "Turbo-svamp", icon: "🍄", color: "#f2644f" },
    banana: { name: "Banan", icon: "🍌", color: "#ffe15d" },
    shell: { name: "Grøn skal", icon: "◆", color: "#53c66d" },
    redShell: { name: "Rød skal", icon: "◆", color: "#ef514f" },
    star: { name: "Stjerne", icon: "★", color: "#ffd85c" },
    lightning: { name: "Lyn", icon: "⚡", color: "#8fd7ff" },
  };

  const TRACKS = [
    makeOvalTrack({
      id: "clover-circuit",
      name: "Kloversløjfen",
      subtitle: "Bred parkbane med lange driftsving",
      difficulty: "Begynder",
      palette: { grass: "#6fc75b", grassDark: "#3f9f54", road: "#4d5564", roadEdge: "#f4eed2", sky: "#aee7ff", barrier: "#f2674c" },
      cx: 800, cy: 500, outerRx: 650, outerRy: 385, innerRx: 360, innerRy: 155,
      startAngle: (Math.PI * 3) / 2,
      itemBoxAngles: [0.38, 1.12, 2.18, 3.08, 4.1, 5.2],
      boostAngles: [0.12, 3.35],
      coinAngles: [0.65, 0.82, 1.62, 1.79, 2.62, 2.79, 3.72, 3.89, 4.72, 4.89, 5.65, 5.82],
      decorations: [
        { asset: "tribune_full.png", x: 670, y: 430, scale: 2.4 },
        { asset: "tree_large.png", x: 125, y: 115, scale: 1.25 }, { asset: "tree_small.png", x: 1440, y: 120, scale: 1.4 },
        { asset: "tree_large.png", x: 140, y: 850, scale: 1.15 }, { asset: "tree_small.png", x: 1430, y: 835, scale: 1.5 },
      ],
    }),
    makeOvalTrack({
      id: "sunset-bay",
      name: "Solnedgangsbugten",
      subtitle: "Hurtig kystbane med smal asfalt",
      difficulty: "Øvet",
      palette: { grass: "#efb75a", grassDark: "#da7850", road: "#424b5d", roadEdge: "#fff0c9", sky: "#ffbf83", barrier: "#4fc1d9" },
      cx: 800, cy: 500, outerRx: 670, outerRy: 350, innerRx: 390, innerRy: 175,
      startAngle: Math.PI / 2,
      itemBoxAngles: [0.25, 0.95, 1.85, 2.65, 3.55, 4.45, 5.35],
      boostAngles: [1.45, 4.58],
      coinAngles: [0.5, 0.68, 1.28, 1.46, 2.35, 2.53, 3.18, 3.36, 4.05, 4.23, 5.1, 5.28],
      decorations: [
        { asset: "tribune_full.png", x: 660, y: 435, scale: 2.7 },
        { asset: "tires_white.png", x: 190, y: 475, scale: 2 }, { asset: "tires_red.png", x: 1365, y: 480, scale: 2 },
        { asset: "tree_small.png", x: 140, y: 120, scale: 1.2 }, { asset: "tree_small.png", x: 1410, y: 855, scale: 1.2 },
      ],
    }),
    makeOvalTrack({
      id: "midnight-crown",
      name: "Midnatskronen",
      subtitle: "Teknisk nattecircuit med høj fart",
      difficulty: "Ekspert",
      palette: { grass: "#243a57", grassDark: "#14263e", road: "#3c4152", roadEdge: "#7bd9ff", sky: "#101a31", barrier: "#e85b78" },
      cx: 800, cy: 500, outerRx: 615, outerRy: 415, innerRx: 355, innerRy: 215,
      startAngle: (Math.PI * 3) / 2,
      itemBoxAngles: [0.48, 1.25, 2.05, 2.85, 3.65, 4.45, 5.25],
      boostAngles: [0.02, 2.95, 5.95],
      coinAngles: [0.72, 0.9, 1.62, 1.8, 2.55, 2.73, 3.48, 3.66, 4.4, 4.58, 5.25, 5.43],
      decorations: [
        { asset: "tribune_full.png", x: 650, y: 430, scale: 2.8 },
        { asset: "barrier_red.png", x: 205, y: 170, scale: 2.2 }, { asset: "barrier_white.png", x: 1325, y: 805, scale: 2.2 },
        { asset: "tree_large.png", x: 90, y: 845, scale: 1.25 }, { asset: "tree_large.png", x: 1420, y: 135, scale: 1.25 },
      ],
    }),
  ];

  window.WutborgKartData = { DRIVERS, ITEM_TYPES, TRACKS, TAU, clamp, normalizeAngle, angleDelta };
})();
