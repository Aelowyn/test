// Tuning knobs. Change numbers here to change how the game feels.
window.GAME_CONFIG = {
  // XP needed to go from level L to L+1 = base * L^exponent.
  // This is the soft cap: every level costs more than the last,
  // so early levels fly by and high levels take real dedication.
  xpCurve: { base: 8, exponent: 1.5 },

  // Global XP multiplier, and the extra multiplier for "fast test mode"
  // (toggle it in the Skill Book).
  xpMultiplier: 1,
  fastModeMultiplier: 4,

  // Every stat starts here. Sub-skills add on top.
  baseStat: 5,

  // Elite enemies (more HP, more damage, double XP) appear more often
  // as your total skill level rises.
  eliteChancePerLevel: 0.004,
  eliteChanceMax: 0.35,

  world: { w: 2400, h: 1600 },

  saveKey: 'skillbound-save-v1',
  autosaveSeconds: 8,
};
