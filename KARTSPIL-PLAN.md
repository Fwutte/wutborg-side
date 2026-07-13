# Plan: Wutborg Kart

## Mål og retning

Byg et privat, Mario Kart-inspireret arkade-racerspil til Wutborgs spilarkiv.
Spillet skal være let at forstå, hurtigt at starte og fungere på både desktop og
mobil. Første komplette version består af:

- én spiller mod syv computerstyrede kørere;
- tre omgange pr. løb;
- fire baner samlet i én cup;
- otte valgbare kørere med forskellige, tydelige køreegenskaber;
- drifting, mini-turbo, terrænmodstand, sammenstød og genplacering på banen;
- item-bokse og mindst seks items;
- placering, omgangstid, slutresultat, lokal rekord og gemt cup-fremdrift;
- tastatur-, touch- og gamepadvenlig styring;
- statisk HTML/CSS/JavaScript uden buildkrav eller nødvendig backend.

Den tekniske grundidé er vigtig: simulationen foregår i en almindelig 2D-verden
med position, retning og hastighed. Den økonomiske model bygger først en simpel
top-down renderer oven på samme simulation. High-end-modellen udskifter senere
visningen med en poleret pseudo-3D/Mode-7-lignende renderer. Fysik, AI, banedata
og race-regler skal derfor være uafhængige af renderingen.

## Fast produktspecifikation

### Raceformat

- 8 kørere, 3 omgange og stående start med 3-2-1-signal.
- Cup med fire baner: grøn begyndercircuit, strand/havn, natlig spøgelsesbane og
  lavaborg.
- Point efter hvert løb og samlet pokal efter fire løb.
- Quick Race og Cup er de to første spiltilstande.
- Ingen netværksmultiplayer i første version.

### Styring

- Tastatur: WASD/piletaster, Shift/X drift, Space/Z item, Esc pause.
- Touch: venstre/højre, gas, bremse/drift og item med multitouch.
- Gas kan tilbydes automatisk på mobil som tilgængelighedsvalg.
- Gamepad er high-end-arbejde, men inputlaget skal kunne udvides til det.

### Kørere

Brug fire vægtklasser med mærkbare forskelle i topfart, acceleration, styring og
vægt. To kørere kan dele samme klasse. Data må ikke ligge hårdkodet i fysikken.

### Items

Første item-pulje:

1. Turbo-svamp: kort hastighedsboost.
2. Banan: stationær fælde og spin-out.
3. Grøn skal: projektil i kørselsretningen.
4. Rød skal: enkel målsøgende variant.
5. Stjerne: kort immunitet og fartbonus.
6. Lyn: sænker modstandere foran spilleren i stillingen.

Item-sandsynligheder afhænger af placeringen, men må aldrig garantere sejr.

## Foreslået filstruktur

- `kart-racer.html` — side, HUD, menuer, canvas og touchkontroller.
- `css/kart-racer.css` — layout, 4:3/16:9-spilramme, menuer og mobilkontroller.
- `js/kart-racer-data.js` — kørere, items, cups, baner og waypoints.
- `js/kart-racer.js` — bootstrap og samlet motor i den økonomiske fase.
- `scripts/kart-racer.test.cjs` — fysik-, bane-, omgangs-, item- og progressionstest.
- `assets/kart-racer/` — kørere, karts, banetiles, items, effekter og lyd.
- `minispil.html` — nyt kort og highscore-registrering.
- `package.json` — `test:kart` samt karttesten i `validate`.

`kart-racer.js` må gerne være én fil i den økonomiske fase, men klasserne skal
have rene grænser: `InputManager`, `Race`, `Kart`, `Track`, `RaceAI`,
`ItemSystem`, `Camera`, `Renderer`, `AudioManager` og `KartGame`.

## Fase A — økonomisk model

Den økonomiske model bygger et fuldt testbart fundament og én spilbar bane.
Den skal stoppe efter acceptkriterierne nedenfor og overlade avanceret
visualisering, tuning og indholdsproduktion til high-end-modellen.

### A1. Side og arkivintegration

- Opret de foreslåede filer og et kartkort i `minispil.html`.
- Følg samme navigation, footer, highscore-helper og visuelle ramme som de andre
  Wutborg-spil.
- Lav menu til Quick Race, kørervalg, banevalg, instruktioner og lyd.
- Brug simple CSS/canvas-placeholders, hvis de endelige assets ikke findes.

**Godkendt når:** siden åbner direkte og fra spilarkivet, har ingen døde links,
og kan bruges fra 390 px mobilbredde til desktop.

### A2. Deterministisk race-simulation

- Fast 60 Hz simulation med accumulator og maksimum for catch-up-steps.
- Karttilstand: position, heading, fart, acceleration, styring, vægt, terræn,
  spin, boost og invincibility.
- Gas, bremse/baglæns, styrevinkel, friktion, offroad-modstand og vægkollision.
- Alle tuningsværdier samles i datakonstanter.

**Godkendt når:** samme inputspor giver næsten samme slutposition ved 30, 60 og
120 Hz, og karten kan ikke tunnelere gennem banens vægge.

### A3. Banedata og omgangskontrol

- 2D-baneformat med kørebart område, offroad, vægge, startlinje, ordered
  checkpoints, respawn-punkter, item-bokse og AI-waypoints.
- Byg én bred, enkel begyndercircuit med tydelige sving og få farer.
- Omgang tæller kun, når checkpoints passeres i korrekt rækkefølge.
- Genplacering bruger seneste sikre checkpoint og giver kort immunitet.
- Lav en linter for manglende start, checkpoint-rækkefølge og ugyldige spawns.

**Godkendt når:** genveje over startlinjen ikke giver omgange, tre omgange
afslutter løbet, og spilleren ikke kan softlockes uden for banen.

### A4. Enkel AI

- Syv AI-karts følger en lukket waypoint-linje med look-ahead-styring.
- AI har individuelle fartprofiler, let variation og enkel recovery.
- AI må bruge turbo-svamp, men øvrige items kan vente til A5.
- Ingen teleportering fremad og ingen skjult positionsændring under normalt løb.

**Godkendt når:** alle otte karts gennemfører ti automatiske løb uden softlock,
og resultaterne varierer uden at føles tilfældige.

### A5. Tre kerne-items

- Implementér turbo-svamp, banan og grøn skal.
- Item-bokse har cooldown og kan ikke udløses flere gange i samme frame.
- Kun ét holdt item ad gangen; HUD viser item tydeligt.
- Projektiler og fælder har ejer, levetid, kollisionsfilter og sikker oprydning.

**Godkendt når:** hvert item kan samles, bruges, ramme korrekt og forsvinde uden
duplikeret score, uendelige objekter eller skade på ejeren lige ved affyring.

### A6. Race-flow, lyd og lokal tilstand

- Intro, 3-2-1, aktivt løb, sidste omgang, målgang, resultat og næste løb.
- HUD: placering, omgang, tid, fart og item.
- Pause, mute, `visibilitychange`-pause og sikker genoptagelse.
- Gem bedste omgang, bedste løbstid og oplåst cup lokalt.
- Registrér kvalificerede resultater via eksisterende highscore-helper.
- Basale egne motor-, drift-, item-, countdown- og mållyde.

**Godkendt når:** et løb kan startes, pauses, gennemføres, genstartes og gemmes
uden tab eller duplikering af race-tilstand.

### A7. Test og økonomisk handoff

- Unit-tests for fysik, checkpoint-rækkefølge, omgang, placering, items og save.
- Statisk validering af alle scripts og nye links.
- Browser-smoke-test af menu, race, pause, målgang og mobil-layout.
- Dokumentér tuningskonstanter og kendte kompromiser i denne fil.
- Kør `npm.cmd run validate`; hele projektet skal bestå.

**Økonomisk stopkriterium:** én fuldt spilbar top-down-bane med 8 karts, tre
items, komplet race-flow, mobilstyring og tests. Modellen må ikke forsøge
pseudo-3D-rendering, avanceret drifting, fuld item-pulje eller fire polerede baner.

## Fase B — high-end model

High-end-modellen starter med en audit af Fase A og beholder data- og
simulationens offentlige interfaces. Den må refaktorere internt, når tests først
fastholder den eksisterende adfærd.

### B1. Pseudo-3D/Mode-7-lignende renderer

- Udskift top-down-spilvisningen med bag-karten-kamera og perspektivisk bane.
- Projektionen skal bruge simulationens 2D-positioner og må ikke eje fysikken.
- Render vej, terræn, kurver, højdeillusion, karts, items, skygger og scenery.
- Behold top-down renderer som debugvisning bag et udviklerflag.
- Pixelart skaleres heltalsnært uden udtværing.

**Godkendt når:** kollision og omgangsresultat er identisk i debug- og
pseudo-3D-visning, og kameraet ikke giver synlige spring ved sving eller respawn.

### B2. Drift og køreoplevelse

- Rigtig drift-state-machine: indgang, retning, greb, gnister og tre
  mini-turbo-niveauer.
- Kart-hop ved driftstart, skidmarks, landing og tydelig feedback ved offroad.
- Separate profiler for lette, mellem og tunge karts.
- Tune med målbare accelerationstider, bremselængder og svingradier.

**Godkendt når:** drifting er hurtigere ved dygtig brug, men almindelig styring
stadig kan gennemføre alle baner.

### B3. Avanceret AI og placering

- Racing lines med alternative spor, overhaling, item-bokse og undvigelse.
- Kontrolleret catch-up via fartmål og beslutninger, ikke teleportering.
- Stabil positionsberegning ud fra omgang, checkpoint og afstand langs banen.
- AI skal håndtere drift, offroad, sammenstød, items og respawn.

**Godkendt når:** 100 simulerede cups gennemføres uden softlock, og både spiller
og AI kan vinde på tværs af fartprofiler.

### B4. Fuld item-pulje og balance

- Tilføj rød skal, stjerne og lyn.
- Sandsynlighedstabel pr. placeringsinterval og aktive item-begrænsninger.
- Forsvar, hitreaktion, spin, tabt fart, immunitet og kædereaktioner.
- Automatiseret balance-simulation med statistik for item-frekvens og comeback.

**Godkendt når:** items skaber positionsskift uden at dominere alle løb, og ingen
itemkombination kan holde en kart permanent ukontrollerbar.

### B5. Fire baner og præsentation

- Producer og håndtune de fire baner fra produktspecifikationen.
- Hver bane får eget farvetema, scenery, underlag, musik og mindst én mekanisk
  identitet uden at kræve en ny motor.
- Køreranimationer: idle, steer, drift, boost, hit, sejr og nederlag.
- Cup-intro, baneovergang, sidste omgang, podie og pokal.
- Original musik og lyde; lyd må ikke blokere første brugerinteraktion.

**Godkendt når:** alle baner kan gennemføres af alle vægtklasser, og cup-flowet
kan gennemspilles fra start til pokal uden genindlæsning.

### B6. Mobil, gamepad, performance og release-QA

- Multitouch uden tabte pointere, safe-area-layout og landscape/fullscreen.
- Gamepad med remapping, deadzones og forbind/afbryd-håndtering.
- Tastaturbetjente menuer, synligt fokus, reduceret bevægelse og justerbar shake.
- Browser-E2E for løb, pause, respawn, items, målgang, cup og save-migration.
- 30 minutters soak-test og profilering på måltelefon.

**Godkendt når:** ingen consolefejl, p95-frame under 16,7 ms på måltelefonen,
input behandles inden for én simulation-frame, og soak-testen viser ingen
vedvarende hukommelsesvækst.

## Testmatrix

- **Fysik:** acceleration, topfart, bremsning, styring, friktion, offroad, boost,
  drift, spin, væg- og kartkollision.
- **Race:** start, checkpointorden, omgang, genvej, sidste omgang, målgang,
  placering, point og cup.
- **Items:** pickup-cooldown, brug, ejerimmunitet, hit, levetid, cleanup,
  sandsynlighed og samtidige effekter.
- **AI:** waypoint-loop, recovery, overhaling, itemvalg og 10/100-løbs soak.
- **Persistence:** bedste tider, cup-status, reset og versionsmigration.
- **Browser:** menu til resultat, pause, skjult fane, asset-fejl og highscore.
- **Touch/gamepad:** samtidige inputs, pointer cancel, rotation, deadzones og
  afbrydelse midt i et løb.
- **Visuel:** startfelt, sving, drift, item-hit, sidste omgang, mål og podie.

## Handoff til den økonomiske model

Brug denne instruktion:

> Implementér Fase A1-A7 i `KARTSPIL-PLAN.md`. Hold simulation og renderer
> adskilt, byg kun én poleret nok top-down-bane, og stop ved det økonomiske
> stopkriterium. Genbrug Wutborgs navigation og highscore-helper. Tilføj tests og
> kør hele valideringen. Bevar uvedkommende brugerændringer. Commit og push kun,
> hvis jeg udtrykkeligt beder om det.

## Handoff til high-end-modellen

Brug denne instruktion efter Fase A er godkendt:

> Auditér Fase A mod `KARTSPIL-PLAN.md`, fasthold først eksisterende adfærd med
> tests, og implementér derefter Fase B1-B6. Prioritér pseudo-3D-rendering,
> driftfølelse og AI før content-polish. Gennemspil alle fire baner i browseren,
> test desktop og mobil, og aflever konkrete målinger for performance og soak.
> Bevar uvedkommende brugerændringer. Commit og push kun, hvis jeg udtrykkeligt
> beder om det.

## Definition of Done

Spillet er færdigt, når en ny spiller kan åbne spilarkivet, vælge en kører,
gennemføre en firebaners cup mod syv AI-karts på desktop eller mobil, forstå
items og drifting uden hjælp, få gemt sin rekord og vende tilbage uden tabt
fremdrift — uden consolefejl, softlocks eller mærkbar frame-instabilitet.
