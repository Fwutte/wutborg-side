(() => {
  "use strict";

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const laneForPosition = (position) => position < 0 ? 0 : 1;
  const formationColumns = (army) => clamp(Math.ceil(Math.sqrt(Math.max(army, 1) / 2)), 3, 7);
  const visibleUnits = (army) => clamp(Math.ceil(Math.max(army, 1) / 2), 8, 42);

  window.WutborgBattle3DLogic = { clamp, laneForPosition, formationColumns, visibleUnits };
})();
