// All progression content lives here: stats, sub-skills, milestone abilities,
// hidden skills, evolutions, weapons and enemies.
// Adding a new hidden skill = adding an entry to `hidden` (plus its effect in game.js).
//
// Condition types used by hidden skills and evolutions:
//   { skill: 'rapier', min: 8 }        sub-skill level
//   { stat: 'VIT', min: 9 }            base stat value
//   { counter: 'gooEaten', min: 12 }   anything the game counts (see counterNames)
//   { unlocked: 'riposte' }            another hidden skill is already unlocked
window.GAME_DATA = {
  stats: [
    { id: 'STR', name: 'Strength', desc: 'Greatsword damage and knockback.' },
    { id: 'DEX', name: 'Dexterity', desc: 'Rapier damage and critical chance.' },
    { id: 'VIT', name: 'Vitality', desc: 'Max health and damage reduction.' },
    { id: 'AGI', name: 'Agility', desc: 'Move speed, dodge recovery, stamina.' },
    { id: 'INT', name: 'Intellect', desc: 'Fire damage, mana and mana regen.' },
  ],

  // Sub-skills level up by doing the thing. Each one feeds base stats:
  // { stat: 'DEX', every: 5 } means +1 DEX at levels 5, 10, 15...
  subskills: [
    { id: 'rapier', name: 'Rapier', desc: 'Grows when rapier strikes land.', stats: [{ stat: 'DEX', every: 5 }, { stat: 'AGI', every: 10 }] },
    { id: 'greatsword', name: 'Greatsword', desc: 'Grows when greatsword swings land.', stats: [{ stat: 'STR', every: 5 }, { stat: 'VIT', every: 10 }] },
    { id: 'fire', name: 'Fire Magic', desc: 'Grows when your fire hurts something.', stats: [{ stat: 'INT', every: 5 }, { stat: 'DEX', every: 15 }] },
    { id: 'block', name: 'Guarding', desc: 'Grows when you absorb hits with your guard. Parries count most.', stats: [{ stat: 'VIT', every: 5 }, { stat: 'STR', every: 12 }] },
    { id: 'evasion', name: 'Evasion', desc: 'Grows when you roll. Rolling through an attack counts most.', stats: [{ stat: 'AGI', every: 5 }] },
    { id: 'endurance', name: 'Endurance', desc: 'Grows when you take damage and keep going.', stats: [{ stat: 'VIT', every: 4 }] },
    { id: 'running', name: 'Running', desc: 'Grows as you sprint.', stats: [{ stat: 'AGI', every: 8 }, { stat: 'VIT', every: 16 }] },
  ],

  // Visible milestones: reach the level, get the ability.
  abilities: [
    { id: 'lunge', name: 'Lunge', skill: 'rapier', level: 5, desc: 'Special (F): dash forward and pierce everything in your path.' },
    { id: 'flurry', name: 'Flurry', skill: 'rapier', level: 10, desc: 'Every 4th hit in a quick chain deals 2.2× damage.' },
    { id: 'pinpoint', name: 'Pinpoint', skill: 'rapier', level: 20, desc: '+15% critical chance. Criticals deal 2.5× instead of 1.8×.' },
    { id: 'wideArc', name: 'Wide Arc', skill: 'greatsword', level: 5, desc: 'Greatsword swings reach wider and farther.' },
    { id: 'whirlwind', name: 'Whirlwind', skill: 'greatsword', level: 10, desc: 'Special (F): spin three times, hitting everything around you.' },
    { id: 'staggeringBlows', name: 'Staggering Blows', skill: 'greatsword', level: 20, desc: 'Greatsword hits stun enemies for half a second.' },
    { id: 'fireBurst', name: 'Fire Burst', skill: 'fire', level: 5, desc: 'Special (F): a ring of fire bursts around you and leaves burning ground.' },
    { id: 'ignite', name: 'Ignite', skill: 'fire', level: 10, desc: 'Fireballs set enemies on fire.' },
    { id: 'twinFlame', name: 'Twin Flame', skill: 'fire', level: 20, desc: 'Fireballs fly in pairs.' },
    { id: 'steadyGuard', name: 'Steady Guard', skill: 'block', level: 5, desc: 'Blocking costs 40% less stamina.' },
    { id: 'bulwark', name: 'Bulwark', skill: 'block', level: 15, desc: 'Your guard covers twice as wide an angle.' },
    { id: 'quickFeet', name: 'Quick Feet', skill: 'evasion', level: 5, desc: 'Your roll recovers 30% faster.' },
    { id: 'longRoll', name: 'Long Roll', skill: 'evasion', level: 15, desc: 'Rolls cover 40% more ground.' },
    { id: 'grit', name: 'Grit', skill: 'endurance', level: 10, desc: 'Regenerate health after 4 seconds without being hurt.' },
    { id: 'lightStep', name: 'Light Step', skill: 'running', level: 10, desc: 'Sprinting costs 40% less stamina.' },
  ],

  // Hidden skills: no level shown, no requirements shown until you earn them.
  // `kind` is just flavor for the Skill Book: grounded, weird or combined.
  // `hint.source`: who can tell you about it in game ('master' or 'hermit').
  hidden: [
    {
      id: 'riposte', name: 'Riposte', kind: 'grounded',
      desc: 'After a perfect parry, your next rapier strike deals triple damage.',
      conds: [{ skill: 'rapier', min: 8 }, { counter: 'perfectParries', min: 25 }],
      hint: { source: 'master', text: '"A blade that only attacks is half a blade. Catch their steel at the last instant, then answer with the point."' },
    },
    {
      id: 'ironHide', name: 'Iron Hide', kind: 'grounded',
      desc: 'Every hit you take is reduced by 3 before anything else.',
      conds: [{ stat: 'VIT', min: 9 }, { counter: 'damageTaken', min: 900 }],
      hint: { source: 'master', text: '"Some fighters grow hard the way old leather does. By being struck. A great deal."' },
    },
    {
      id: 'windStep', name: 'Wind Step', kind: 'grounded',
      desc: 'Perfect dodges give back 20 stamina and make your next hit a critical.',
      conds: [{ stat: 'AGI', min: 8 }, { counter: 'perfectDodges', min: 40 }],
      hint: { source: 'master', text: '"Let the blow pass through the space you just left. Do it often enough and the wind starts to remember you."' },
    },
    {
      id: 'secondWind', name: 'Second Wind', kind: 'grounded',
      desc: 'Below 25% health, stamina regenerates twice as fast and you deal 30% more damage.',
      conds: [{ counter: 'lowHpSeconds', min: 40 }],
      hint: { source: 'master', text: '"The ones who linger at death\'s door and keep swinging sometimes learn to fight from there."' },
    },
    {
      id: 'juggernaut', name: 'Juggernaut', kind: 'combined',
      desc: 'Sprinting into enemies slams them aside. Damage scales with Strength.',
      conds: [{ skill: 'greatsword', min: 8 }, { skill: 'running', min: 8 }, { counter: 'sprintHits', min: 30 }],
      hint: { source: 'master', text: '"Most people stop running before they swing. Most people."' },
    },
    {
      id: 'flameFencer', name: 'Flame Fencer', kind: 'combined',
      desc: 'Rapier hits set enemies on fire.',
      conds: [{ skill: 'rapier', min: 10 }, { skill: 'fire', min: 8 }, { counter: 'burningRapierHits', min: 40 }],
      hint: { source: 'hermit', text: 'Steel and flame. I once watched a duelist who only struck foes that were already burning. Her blade caught the habit.' },
    },
    {
      id: 'toxicBlood', name: 'Toxic Blood', kind: 'weird',
      desc: 'You are immune to poison. Enemies that hit you up close become poisoned.',
      conds: [{ counter: 'poisonSeconds', min: 90 }],
      hint: { source: 'hermit', text: 'The toads of the Toadmire. If you let their venom run its course, over and over, your blood may decide to join them.' },
    },
    {
      id: 'slimeGut', name: 'Slime Gut', kind: 'weird',
      desc: 'Eating slime goo heals 25 health and regenerates more over 3 seconds.',
      conds: [{ counter: 'gooEaten', min: 12 }],
      hint: { source: 'hermit', text: 'Slime goo is edible. Technically. Eat enough and the stomach adapts. Do not tell the Master I wrote this.' },
    },
    {
      id: 'ashWalker', name: 'Ash Walker', kind: 'weird',
      desc: 'Burning ground no longer hurts you. Standing in fire restores mana instead.',
      conds: [{ counter: 'fireStandSeconds', min: 45 }],
      hint: { source: 'hermit', text: 'Fire walkers are not born. They stand in the fire until the fire gives up.' },
    },
  ],

  // Evolutions: upgrade a hidden skill you already have.
  evolutions: [
    {
      id: 'counterFlourish', name: 'Counter Flourish', from: 'riposte', kind: 'evolution',
      desc: 'Perfect parries also strike every enemy around you.',
      conds: [{ unlocked: 'riposte' }, { counter: 'riposteUses', min: 30 }],
      hint: { source: 'master', text: '"Your riposte answers one blade. A true master answers all of them at once. Keep answering."' },
    },
    {
      id: 'venomBulwark', name: 'Venom Bulwark', from: 'toxicBlood', kind: 'evolution',
      desc: 'Blocking a close attack poisons the attacker. Poison you cause hurts twice as much.',
      conds: [{ unlocked: 'toxicBlood' }, { skill: 'block', min: 10 }],
      hint: { source: 'hermit', text: 'Poisoned blood behind a raised guard. Whoever strikes that guard will taste it.' },
    },
    {
      id: 'gelatinousBody', name: 'Gelatinous Body', from: 'slimeGut', kind: 'evolution',
      desc: '15% chance to absorb a hit completely. You jiggle. It is undignified.',
      conds: [{ unlocked: 'slimeGut' }, { counter: 'gooEaten', min: 40 }, { skill: 'endurance', min: 10 }],
      hint: { source: 'hermit', text: 'Keep eating the goo and keep taking hits. At some point the line between you and slime gets blurry.' },
    },
  ],

  counterNames: {
    perfectParries: 'Perfect parries',
    damageTaken: 'Damage taken',
    poisonSeconds: 'Seconds spent poisoned',
    gooEaten: 'Slime goo eaten',
    fireStandSeconds: 'Seconds standing in fire',
    lowHpSeconds: 'Seconds below 25% health',
    burningRapierHits: 'Rapier hits on burning enemies',
    sprintHits: 'Greatsword hits while sprinting',
    perfectDodges: 'Perfect dodges',
    riposteUses: 'Ripostes landed',
    kills: 'Enemies defeated',
    deaths: 'Times fallen',
  },

  weapons: {
    rapier: { name: 'Rapier', type: 'melee', dmg: 7, range: 62, arc: 0.6, cd: 0.28, windup: 0.06, dur: 0.16, sta: 5, special: 'lunge' },
    greatsword: { name: 'Greatsword', type: 'melee', dmg: 17, range: 76, arc: 2.0, cd: 0.72, windup: 0.2, dur: 0.34, sta: 15, special: 'whirlwind' },
    staff: { name: 'Ember Staff', type: 'ranged', dmg: 9, cd: 0.42, mana: 6, speed: 430, life: 1.1, special: 'fireBurst' },
  },
  weaponOrder: ['rapier', 'greatsword', 'staff'],

  enemies: {
    slime: { name: 'Slime', tier: 1, hp: 22, speed: 62, dmg: 6, r: 14, aggro: 260 },
    toad: { name: 'Bog Toad', tier: 2, hp: 30, speed: 70, dmg: 4, r: 15, aggro: 320, keep: 210, cd: 2.2, poison: 4 },
    skeleton: { name: 'Barrow Skeleton', tier: 2, hp: 42, speed: 84, dmg: 12, r: 15, aggro: 300, range: 54, windup: 0.55, cd: 1.3 },
    imp: { name: 'Cinder Imp', tier: 3, hp: 28, speed: 96, dmg: 7, r: 13, aggro: 340, keep: 240, cd: 2.6 },
    dummy: { name: 'Training Dummy', tier: 0, hp: 1e9, speed: 0, dmg: 0, r: 16, aggro: 0 },
  },

  npcText: {
    masterName: 'Fencing Master Oren',
    hermitName: "The Hermit's Notes",
    masterIntro: '"Another one who wants to be strong. Here is my only free lesson: nobody hands you strength. Swing a blade and your hand learns. Take a beating and your body learns. Do strange things and, well, strange things happen. Come back and ask me about techniques. I hear rumors."',
    hermitIntro: 'A stack of notes in cramped handwriting. The first page reads: "Things the Master will not tell you, because he thinks they are beneath a swordsman."',
    masterEmpty: '"I have told you everything I know. Now go and find out what I don\'t."',
    hermitEmpty: 'The remaining pages are recipes for mushroom soup.',
  },

  gooLines: [
    'You eat the slime goo. It tastes like pond water and regret.',
    'Still wobbly. Still terrible.',
    'Your stomach makes a noise you have never heard before.',
    'Honestly, it is growing on you.',
    'Slurp.',
  ],
};
