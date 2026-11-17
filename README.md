# makefun-gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Revaaa28/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Revaaa28/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Costa Serena is an original top-down open-world crime game that plays in a desktop browser from static files: explore a sun-soaked coastal city on foot and in stolen cars, run fixer Vince Marlowe's five-job story chain, fight and flee a 0–5 star police response, and save your progress in the browser. Traffic, pedestrians, a working minimap HUD, WebAudio-synthesised sound, and a full wanted system are all in. No build step, no network requests: every file the game loads lives under game/.

## What's in the game

- A seeded coastal city on a 6×5 road grid: named bars, clubs, hotels and shops, parking lots full of stealable cars, parks, a beach and a pier.
- Five story jobs from fixer Vince Marlowe, told through phone intros: a package run, a marked-car theft, a buyer meet that needs the heat lost first, a timed cross-town delivery, and a three-star pier getaway.
- A living street: lane-keeping traffic that brakes, honks and panics, and pedestrians who stroll, wait and flee.
- A 0–5 star wanted system: witnessed crimes add heat, police cruisers hunt your last known position and ram, and cornering you fills the bust meter.
- Mouse-aim pistol combat with melee, health and regeneration, plus a busted and wasted flow with fines and respawns.
- HUD with cash, health, stars, objective banner and a live minimap; progress, cash and position persist in localStorage.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Move with WASD or the arrow keys, steal or enter a car with E, shoot with the mouse, and follow the gold beacon to start Vince's first job.

The handover program copies the game and its screenshots to an output directory and writes the dossier the judges read:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=revaaa28&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
