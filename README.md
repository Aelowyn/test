# Skillbound

A small top-down fantasy prototype for testing one idea: **you get stronger by doing things, not by leveling up.**

- **Sub-skills** (Rapier, Greatsword, Fire Magic, Guarding, Evasion, Endurance, Running) level up when you use them.
- **Stats** (STR, DEX, VIT, AGI, INT) only come from sub-skills. Example: every 5 Rapier levels gives +1 DEX. There are no points to spend, so switching playstyle moves your build along with you.
- **Milestone abilities** unlock at visible sub-skill levels (Rapier 5 → Lunge).
- **Hidden skills** unlock from secret requirements, some grounded (perfect parries → Riposte), some weird (eat slime goo → Slime Gut). The Fencing Master and the Hermit's notes in town give rumors about them.
- **Evolutions** upgrade hidden skills you already have.
- **Soft cap:** XP per level grows as `8 × level^1.5`, so there is no hard max.

## Run it

Open `prototype/index.html` in a browser. No build step and no install.

Controls: WASD move, mouse aim, click attack, right-click block (just before a hit = parry), Space roll, Shift sprint, F special, 1/2/3 weapons, E interact or eat, Tab Skill Book. Touch controls appear on phones.

## Where things live

| File | What it is |
| --- | --- |
| `prototype/js/config.js` | Tuning: XP curve, XP multipliers, base stats |
| `prototype/js/data.js` | Content: stats, sub-skills, abilities, hidden skills, evolutions, weapons, enemies |
| `prototype/js/progression.js` | The progression system (XP, stats, counters, unlock checks, rumors) |
| `prototype/js/ui.js` | HUD, notifications and the Skill Book |
| `prototype/js/game.js` | World, combat, enemies, rendering |

To add a hidden skill, add an entry to `hidden` in `data.js` with its conditions. If it needs a new behavior, check `P.has('yourSkill')` where it should apply in `game.js`.
