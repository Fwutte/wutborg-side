# Roadmap: fra Mario-prototype til komplet platformspil

## Målet

Spillet skal føles som et klassisk 8-bit platformspil, men have egne baner, egen
musik og en struktur, der er nem at udvide. Den anbefalede første komplette
Wutborg-udgave er **4 verdener × 4 baner (16 baner)**. Når den er gennemtestet,
kan samme motor udvides til **8 verdener × 4 baner (32 baner)**, hvis målet er
samme baneantal som det oprindelige spil. Det giver ikke i sig selv samme omfang
af fjender, subområder, hemmeligheder og bosser.

En komplet udgave betyder her:

- en stabil platformmotor med ens fysik på desktop og mobil;
- small/super/fire Mario, løb, hop, crouch, skade og transformationer;
- datadrevne blokke, rør, hemmeligheder, platforme og underområder;
- mindst fem fjendefamilier samt skjolde og projektiler;
- sammenhængende kampagne, gemt progression, score, liv og fortsæt-funktion;
- intro, flagsekvens, tidsbonus, slot/boss og tydelige baneovergange;
- original chiptune-musik og komplette lydeffekter;
- automatiske engine-, bane- og browsertests.
- statisk vanilla HTML/CSS/JavaScript uden buildkrav eller nødvendig backend.

Highscore og andre onlinefunktioner skal være valgfrie. Hele kampagnen skal
kunne spilles lokalt, selv hvis et API er utilgængeligt.

## Allerede på plads

Prototypen har tre baner, tilemaps, kamera, acceleration, variabelt hop, coyote
time, jump buffer, mønter, bonusblokke, mursten, Goombas, svamp, checkpoints,
liv, timer, pause, mute, touchkontroller og lokal highscore.

Første NES-pass forbedrer nu 4:3-visningen, pixelskalaen, HUD/score,
fremadgående kamera, fjendeaktivering, blokbestemte svampe, 100-mønt-reglen,
baneintro og en kort baneafslutning. Det er et præsentations- og fundament-pass,
ikke den endelige motor.

## Faseplan

### Fase 0 — Produktspecifikation og asset-retning

- Vælg 16 eller 32 baner og fastlæg en konkret contentmatrix.
- Beslut sekventiel kampagne, midpoint-regler og om level select kun er debug,
  låses op efter gennemførsel eller tilbydes som en moderne valgmulighed.
- Fastlæg den logiske opløsning, målbare fysikværdier og kontrolskema.
- Beslut før mere assetproduktion, om spillet forbliver et privat fanprojekt,
  eller om navn, figurer og Nintendo-materiale erstattes før offentlig release.

**Godkendt når:** beslutninger, der ændrer engine-, kampagne- eller assetdesign,
er skrevet ned. En kildeangivelse eller “ikke-kommerciel” brug er ikke i sig
selv en licens eller tilladelse til tredjepartsmateriale.

### Fase 1 — Stabil motor og dataformat

- Behold fast 60 Hz simulation og tilføj reproducerbare fysiktests.
- Lav asset-preloader med loading- og fejltilstand.
- Del banedata i tile-, entity-, trigger- og scenery-lag.
- Erstat overlap-kollision med en deterministisk solver uden tunneling.
- Flyt motoren fra én stor fil til små moduler med klare interfaces.
- Tilføj en level-linter for ukendte symboler, overlap og manglende start/mål.

**Godkendt når:** samme input giver næsten samme position ved 30, 60 og 120 Hz;
ingen sprites strækkes; asset-fejl viser en brugbar fejltilstand; level-lint består;
der er ingen tunneling; og alle tre nuværende baner kan gennemføres uden consolefejl.

### Fase 2 — Den rigtige spillerfølelse

- Tilføj B/Run på tastatur og touch.
- Implementér gang, løb, acceleration, skid, vending og luftkontrol.
- Brug separate state-machines til idle, run, skid, jump, fall, crouch og death.
- Giv small, super og fire Mario korrekte hitboxes med fødderne på samme sted.
- Tilføj transformation, crouch og loftskontrol ved vækst.
- Tune hoppekurver og banernes afstande sammen.

**Godkendt når:** spilleren kan forudsige korte og lange hop, grafikken matcher
hitboxen, og ingen passage kræver tilfældige eller blinde hop.

### Fase 3 — Blokke, power-ups og fjender

- Definér indhold pr. blok: mønt, svamp/blomst, stjerne, 1-up eller tom.
- Tilføj coin-pop, animerede spørgsmålstegnsblokke og blokke, der rammer fjender.
- Implementér fire flower, fireballs, stjerne og 1-up.
- Tilføj Goomba, Koopa/skjold, Piranha, Bullet Bill, Buzzy Beetle og en flyvende
  fjende. En 32-baners udgave kræver også vand- og slotfjender eller egne
  tilsvarende varianter.
- Tilføj combo-score for flere fjender/skjolde i samme sekvens.
- Aktivér entities nær kameraet og fjern dem sikkert uden for verden.

**Godkendt når:** alle spillerformer, bloktyper, projektiler og fjender er dækket
af en automatiseret interaktionsmatrix.

### Fase 4 — Hele verdensværktøjskassen

- Rør med overgange til underjordiske og hemmelige rum.
- Bevægelige/faldende platforme, broer, elevators, springs og vines.
- Vand, lava, faldgruber og vertikale sektioner.
- Hemmelige blokke, bonusrum, warp-rør og checkpoints, hvor de giver mening.
- Rigtig flagsekvens: greb, slide, flag ned, gang til slot og tid-til-score.
- Slotbaner med boss, brosekvens og redning.

**Godkendt når:** alle overgange bevarer form, score, mønter, timer og korrekt
returposition; platforme, vand/lava, boss og flagsekvens består deres E2E-tests;
og ingen sektion kan softlocke spilleren.

### Fase 5 — Kampagne og progression

- Byg først et sekventielt world-flow med usynligt midpoint-respawn. Level select
  er kun debug eller en oplåst/valgfri moderne funktion efter Fase 0-beslutningen.
- Definér regler for liv, fortsæt, game over, genstart og gemte power-ups.
- Tilføj eventuelt bedste tider og score efter kerneprogressionen. Kun komplette
  kampagner kvalificeres, og gameplay må ikke duplikere collectibles eller score.
  LocalStorage og lokale scores kan ikke gøres manipulationssikre.
- Tilføj pause ved skjult browserfane og sikker genoptagelse.

**Godkendt når:** en kampagne kan startes, fortsættes, vindes og nulstilles uden
at miste eller duplikere tilstand.

### Fase 6 — Én gold-standard verden

Byg først én komplet verden med fire forskellige baner:

1. Overworld/tutorial.
2. Underground eller rør/bonusrum.
3. Athletic/nat med bevægelige platforme.
4. Slot med boss.

Denne verden bliver kvalitetsmål for fysik, grafik, hemmeligheder, sværhedsgrad
og tidsforbrug, før resten af indholdet produceres.

**Godkendt når:** hele verden kan gennemføres som small Mario, og playtestere
forstår styringen uden mundtlig hjælp.

### Fase 7 — Indhold og lyd

- Producer verdener i pakker á fire baner med en tydelig sværhedsprogression.
- Tilføj originale overworld-, underground-, night-, water- og castle-temaer.
- Lav original Web Audio-chiptune med pulse-, triangle- og noise-stemmer.
- Tilføj hurry-up, death, clear og boss-musik uden at kopiere Nintendo-melodier.
- Udvid animationer, tileframes, partikkeleffekter og skærmovergange.

**Godkendt når:** 16 baner består level-lint og manuel gennemspilning; musik
stopper/genoptages korrekt ved pause og mute; og der er ingen manglende assets.
Derefter kan indholdet udvides til 32 baner uden en ny engine-ombygning.

### Fase 8 — Mobil, tilgængelighed og release-QA

- Touchlayout med A/B, justerbar placering, safe areas og landscape/fullscreen.
- Tastaturbetjente menuer, synlig fokus, reduceret bevægelse og justerbar shake.
- Test Chrome, Edge, Safari samt telefon og tablet.
- Kør 30 minutters soak-test, visuelle regressioner og performanceprofilering.
- Mål stabil frame-tid, hukommelse, input latency og alle netværksfejl.

**Godkendt når:** spillet virker fra 390 px mobil til desktop, har ingen strakte
sprites eller consolefejl, input behandles inden for én simulation-frame,
p95-frame er under 16,7 ms på måltelefonen, og en 30-minutters soak-test viser
ingen vedvarende hukommelsesvækst.

## Testplan

- **Unit:** acceleration, hoppekurve, jump buffer, coyote time, kollisionssider,
  stomp, skade, transformation, blokindhold, score og kamera.
- **Frame rate:** afspil samme inputspor ved 30/60/120 Hz og sammenlign resultat.
- **Level-lint:** start, mål, symbolsæt, entity-overlap, rørmål og mulige hop.
- **Browser-E2E:** menu → intro → spil → pause → død/respawn → game over/retry →
  mål → næste bane; fuld kampagne/continue; rør/subarea-retur; power-up mellem
  baner; localStorage-reset/migration; asset-load-fejl og score-eligibilitet.
- **Touch:** retning + hop/run samtidigt, pointer cancel, rotation og fullscreen.
- **Visuel regression:** menu, alle spillerformer, blokke, fjender, flag og mobil.
- **Playtest:** registrér dødssted, gennemførselstid og steder med misforstået input.

## Beslutninger før den fulde produktion

1. Skal den første komplette udgave være 16 eller 32 baner?
2. Skal de tre nuværende baner migreres eller erstattes af den nye gold-standard?
3. Skal slutudgaven være et privat fan-spil, eller skal navn og Nintendo-assets
   erstattes før offentlig udgivelse? Den nuværende README beskriver privat,
   ikke-kommerciel brug, men det dokumenterer ikke en licens.

Disse tre beslutninger hører til Fase 0 og skal være taget før storstilet
figur-, animation-, lyd- og kampagneproduktion.

## Realistisk størrelsesorden

- Stabil trebaners v2 med ny motor og fulde kerneinteraktioner: **3–5 udvikleruger**.
- Komplet 16-baners Wutborg-kampagne: **8–12 udvikleruger**.
- 32 baner med bredere fjende-, biome- og bossindhold: **12–20 udvikleruger**.

Estimaterne forudsætter løbende playtest og genbrug af den samme engine. Nyt
banedesign, grafik og musik er den største usikkerhed efter motorfaserne.
