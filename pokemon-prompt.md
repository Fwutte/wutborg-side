Du er verdens bedste kodeagent. Du skal bygge et browserbaseret Pokémon battle-spil til min eksisterende statiske hjemmeside.

KONTEKST
- Hjemmesiden er en statisk hjemmeside med HTML/CSS/JavaScript-filer.
- Den ligger i et GitHub-repository og deployes via Cloudflare Pages.
- Lav løsningen så den kan køre direkte i browseren uden backend.
- Undgå tunge frameworks, medmindre projektet allerede bruger et framework.
- Hvis projektet i forvejen er ren HTML/CSS/JS, så byg også dette i ren HTML/CSS/JS.
- Målet er et spil, der føles som en klassisk Game Boy Advance monster-battle, inspireret af Pokémon FireRed, men uden at kopiere officielle sprites, musik, lyde, tekstbokse eller UI direkte.

VIGTIG JURIDISK/ASSET-REGEL
- Brug IKKE rom-filer, ripped assets, officielle sprites fra FireRed, officiel musik, officielle sound effects eller direkte kopierede UI-elementer.
- Lav i stedet original pixel-art-inspireret grafik, CSS-baserede monsterkort, simple silhouette sprites, egne animationer og egne WebAudio-lyde.
- Pokémon-navne og kampdata må kun bruges som fan-/uddannelsesdemo. Byg koden så det senere er let at udskifte Pokémon-data med egne originale monstre, hvis siden skal gøres mere juridisk sikker.
- Skriv en kort disclaimer nederst på spillets side: “Fan-made battle demo. This project is not affiliated with Nintendo, Game Freak or The Pokémon Company.”

HOVEDMÅL
Byg et Pokémon battle-spil, hvor brugeren kan:
1. Vælge hvilken Pokémon man selv vil spille med.
2. Vælge hvilken Pokémon man vil kæmpe imod.
3. Vælge level for begge Pokémon.
4. Starte en 1-mod-1 battle.
5. Bruge fire moves i klassisk turbaseret kamp.
6. Se HP-bars, battle-log, attack-animationer, status, type-effektivitet og vinder/taber.
7. Søge og filtrere i alle Pokémon, der kan mødes/fås i Pokémon FireRed.
8. Spille på både desktop og mobil.

DATAKRAV
Lav en datamodel, der understøtter alle Pokémon, som kan mødes/fås i Pokémon FireRed.

Brug denne praktiske definition:
- “FireRed-tilgængelige Pokémon” betyder Pokémon, som kan findes, vælges, modtages, fiskes, trades, gives som gave, optræde statisk/legendary eller på anden måde være relevante i Pokémon FireRed.
- Start med FireRed specifikt, ikke LeafGreen, men strukturer data sådan at LeafGreen senere kan tilføjes som filter.
- Hvis en datakilde ikke komplet dækker gave-Pokémon, fossils, starters, legendaries eller trades, så lav en manuel override-liste i datafilen med feltet source: "manual-curated".

Brug PokéAPI som primær datakilde, men cache data lokalt i projektet:
- Lav gerne et script: /scripts/build-pokemon-data.mjs
- Scriptet må hente fra PokéAPI og skrive en statisk JSON-fil:
  /data/pokemon-firered.json
- Selve spillet må helst bruge den lokale JSON-fil, så spillet virker hurtigt og ikke afhænger af API-kald hver gang.
- Hvis projektet ikke har Node/npm, så lav i stedet en statisk /data/pokemon-firered.json manuelt struktureret og dokumentér hvordan den kan udvides.

Datamodellen skal mindst indeholde:
{
  "id": 25,
  "name": "pikachu",
  "displayName": "Pikachu",
  "types": ["electric"],
  "baseStats": {
    "hp": 35,
    "attack": 55,
    "defense": 40,
    "specialAttack": 50,
    "specialDefense": 50,
    "speed": 90
  },
  "availability": {
    "fireRed": true,
    "leafGreen": true/false,
    "methods": ["wild", "gift", "static", "trade", "starter", "fossil", "legendary"],
    "locations": ["Viridian Forest"]
  },
  "movesByLevel": [
    {
      "level": 1,
      "name": "thundershock"
    }
  ],
  "battleMoves": [
    {
      "name": "Thunder Shock",
      "type": "electric",
      "power": 40,
      "accuracy": 100,
      "pp": 30,
      "priority": 0,
      "categoryGen3": "special",
      "effect": null
    }
  ],
  "sprite": {
    "mode": "original-placeholder",
    "front": null,
    "back": null,
    "cssColorHint": "#f6d743"
  }
}

MOVE-KRAV
- Hver Pokémon skal ende med 4 battle moves, automatisk valgt ud fra level.
- Vælg de seneste level-up moves op til valgt level.
- Hvis der er færre end 4 moves, fyld op med tidligere moves.
- Hvis der stadig mangler moves, brug sikre fallback moves som Tackle, Scratch eller Pound, hvis typen/data passer.
- Moves skal have:
  - name
  - type
  - power
  - accuracy
  - pp
  - priority
  - categoryGen3
  - optional status effect
- Husk at i Gen 3 afhænger physical/special af move-typen, ikke af selve movet:
  Physical: normal, fighting, flying, poison, ground, rock, bug, ghost, steel
  Special: fire, water, grass, electric, psychic, ice, dragon, dark
  Status: moves uden damage.

BATTLE ENGINE
Lav battle engine som rene JavaScript-funktioner, adskilt fra UI.

Filer foreslået:
- /pokemon-battle.html
- /css/pokemon-battle.css
- /js/pokemon/data-loader.js
- /js/pokemon/battle-engine.js
- /js/pokemon/battle-ui.js
- /js/pokemon/type-chart.js
- /data/pokemon-firered.json
- /scripts/build-pokemon-data.mjs, hvis relevant

Battle engine skal understøtte:
1. Stat calculation
2. Turn order
3. Move accuracy
4. PP
5. Damage calculation
6. STAB
7. Type effectiveness
8. Critical hits
9. Random damage variance
10. Status effects
11. Fainting
12. Battle log
13. Simple AI

STAT FORMULA
Brug en forenklet men korrekt inspireret statberegning:
- IV: brug 15 som default, eller 31 hvis du vælger moderne maks. Vælg én og dokumentér det.
- EV: 0 som default.
- Nature: neutral 1.0 som default.

HP:
HP = floor(((2 * baseHP + IV + floor(EV / 4)) * level) / 100) + level + 10

Andre stats:
stat = floor((floor(((2 * baseStat + IV + floor(EV / 4)) * level) / 100) + 5) * natureModifier)

DAMAGE FORMULA
Implementér en Gen 3-inspireret damage formula:

baseDamage = floor(floor((((2 * level / 5 + 2) * power * attackStat / defenseStat) / 50)) + 2)

modifier = STAB * typeEffectiveness * critical * randomVariance * burnModifier * otherModifiers

damage = max(1, floor(baseDamage * modifier))

Hvor:
- STAB = 1.5 hvis angriberens type matcher move type, ellers 1
- typeEffectiveness = 0, 0.25, 0.5, 1, 2 eller 4
- critical = 2 ved critical hit, ellers 1
- randomVariance = tilfældigt tal mellem 0.85 og 1.00
- burnModifier = 0.5 hvis fysisk move og attacker er burned, ellers 1
- Hvis typeEffectiveness er 0, skal damage være 0, og battle-log skal sige at det ikke påvirker modstanderen.

TYPE CHART
Implementér en Gen 3 type chart med alle klassiske typer:
normal, fire, water, electric, grass, ice, fighting, poison, ground, flying, psychic, bug, rock, ghost, dragon, dark, steel

Vigtigt:
- Normal/Fighting rammer ikke Ghost.
- Electric rammer ikke Ground.
- Ground rammer ikke Flying.
- Psychic rammer ikke Dark.
- Poison rammer ikke Steel.
- Ghost er super effective mod Ghost/Psychic.
- Dark er super effective mod Ghost/Psychic.
- Steel og Dark skal være med, da FireRed er Gen 3.

TURN ORDER
- Højeste priority går først.
- Ved samme priority går højeste speed først.
- Ved samme speed vælges tilfældigt.
- Hvis en Pokémon fainted, må den ikke angribe bagefter.

STATUS EFFECTS
Implementér mindst disse:
- poison: mister 1/8 max HP efter hver tur.
- burn: mister 1/8 max HP efter hver tur og fysisk attack halveres.
- paralysis: speed halveres og 25% chance for ikke at angribe.
- sleep: sover 1-3 ture.
- freeze: 20% chance for at tø op pr. tur.
- confusion kan være bonus, ikke krav.

For MVP må status moves være simple, men de skal være datadrevne, så flere effekter kan tilføjes senere.

AI
Lav tre sværhedsgrader:
1. Easy: vælger tilfældigt move med PP.
2. Normal: vælger oftere move med høj type effectiveness.
3. Smart: beregner forventet damage og vælger bedste move, men kan stadig lave små “menneskelige” fejl 15% af tiden.

BRUGERFLOW
Lav en flot startskærm:
- Titel: “Monster Battle Arena”
- Undertitel: “FireRed-inspired fan battle demo”
- To paneler:
  1. Vælg din Pokémon
  2. Vælg modstander
- Søgning efter navn.
- Filter efter type.
- Filter efter availability method: wild, starter, gift, fossil, legendary osv.
- Level selector for begge, fx 5-100.
- Random-knap for player.
- Random-knap for opponent.
- “Start Battle”-knap.

Når battle starter:
- Vis modstander øverst/højre.
- Vis spiller nederst/venstre.
- Begge har:
  - navn
  - level
  - HP bar
  - aktuel HP / max HP
  - status icon
- Nederst skal der være klassisk battle menu:
  - Fight
  - Info
  - Restart
  - New Battle
- Når man trykker Fight, vis fire move-knapper.
- Hver move-knap viser:
  - move name
  - type
  - PP
  - power
  - accuracy
- Battle-log skal skrive korte linjer:
  - “Pikachu used Thunder Shock!”
  - “It’s super effective!”
  - “Charmander lost 18 HP!”
  - “Charmander fainted!”
- UI-tekster må gerne være på dansk, men move/Pokémon names bør blive på engelsk.

GRAFISK STIL
Lav et grafisk løft, der føles retro og spilagtigt:
- Pixel-art-inspireret layout.
- Store tydelige knapper.
- Rounded battle boxes.
- HP-bars med smooth animation.
- Attack-animation:
  - attacker slider lidt frem
  - defender shaker
  - hit flash
  - HP bar falder gradvist
- Baggrund:
  - simpel battle arena med gradient/himmel/mark
  - ikke direkte kopi af FireRed background
- Pokémon visuals:
  - Brug original placeholder-art:
    - CSS-genererede monster silhouettes
    - farvede pixel cards
    - type-baserede auraer
    - simple SVG shapes lavet selv
  - Må ikke kopiere officielle sprites.
- Tilføj små WebAudio beep/attack/hit sounds, men ingen eksterne lydfiler.
- Respektér prefers-reduced-motion.

MOBIL OG TILGÆNGELIGHED
- Spillet skal fungere på mobil.
- Knapper skal være store nok til touch.
- Keyboard support:
  - Enter/Space aktiverer valgt knap
  - Escape går tilbage fra move-menu
- God kontrast.
- Ingen blinkende effekter, der kan være ubehagelige.
- Battle-log skal kunne læses af screen readers, fx aria-live="polite".

PERFORMANCE
- Spillet skal være hurtigt på mobil.
- Datafil må gerne være optimeret.
- Lazy-load battle data.
- Undgå unødvendige store billeder.
- Ingen tunge biblioteker.
- Hvis der bruges API-fetch ved build-time, skal runtime stadig bruge lokal JSON.

LOCALSTORAGE
Gem:
- sidste valgte player Pokémon
- sidste valgte opponent Pokémon
- sidste valgte levels
- valgt difficulty

FEJLHÅNDTERING
- Hvis data ikke kan hentes, vis venlig fejlbesked.
- Hvis en Pokémon mangler moves, brug fallback moves.
- Hvis en move mangler power, behandl den som status move.
- Hvis en accuracy mangler, antag 100.
- Hvis en Pokémon mangler visual, brug type-baseret placeholder.

TESTKRAV
Lav battle engine testbar og tilføj simple tests.

Minimum tests:
1. Electric move mod Water giver super effective.
2. Electric move mod Ground giver no effect.
3. Normal move mod Ghost giver no effect.
4. STAB giver højere damage end samme move uden STAB.
5. Hurtigste Pokémon angriber først ved samme priority.
6. Move med 0 PP kan ikke bruges.
7. Fainted Pokémon angriber ikke.
8. Burn halverer fysisk damage.
9. Poison reducerer HP efter tur.
10. AI vælger et super effective move oftere end et dårligt move på Normal/Smart.

Hvis projektet ikke har test framework:
- Lav /js/pokemon/battle-engine.test.js
- Lav en simpel Node-baseret test-runner eller en /pokemon-test.html side, der viser pass/fail.

ACCEPTANCE CRITERIA
Spillet er færdigt når:
- Man kan åbne pokemon-battle.html direkte i browseren.
- Man kan vælge player Pokémon.
- Man kan vælge opponent Pokémon.
- Man kan vælge level.
- Man kan starte battle.
- Man kan vælge mellem fire moves.
- Modstanderen vælger moves automatisk.
- HP går korrekt ned.
- Type effectiveness virker.
- Battle slutter med win/loss.
- UI er flot, retro, responsivt og mobilvenligt.
- Der er ingen officielle/rippede Pokémon FireRed assets.
- Existing website må ikke ødelægges.
- Der skal være et link til spillet fra forsiden eller spiloversigten, hvis sådan en findes.
- Koden skal være ryddelig, kommenteret hvor nødvendigt og opdelt i moduler.

IMPLEMENTERINGSPLAN
Arbejd i denne rækkefølge:

FASE 1 – Repo-inspektion
- Undersøg eksisterende filstruktur.
- Find ud af hvor nye spil-sider normalt placeres.
- Find ud af om der er fælles header/menu/style.
- Lav ikke store ændringer i eksisterende filer uden grund.

FASE 2 – Data
- Opret pokemon-firered.json med mindst en komplet MVP-liste.
- Ideelt: generér data via build script fra PokéAPI.
- Sørg for at data indeholder base stats, types og moves.
- Tilføj manual overrides for FireRed availability.

FASE 3 – Battle engine
- Byg type chart.
- Byg stat calculation.
- Byg damage calculation.
- Byg turn resolution.
- Byg status handling.
- Byg AI.

FASE 4 – UI
- Byg selection screen.
- Byg battle screen.
- Byg move menu.
- Byg battle log.
- Byg restart/new battle flow.

FASE 5 – Grafik og polish
- Retro layout.
- CSS animations.
- HP bar animation.
- Original placeholder monster visuals.
- Sounds via WebAudio.

FASE 6 – Tests og kvalitet
- Tilføj tests.
- Test manuelt i browser.
- Test mobil viewport.
- Test edge cases:
  - no PP
  - immunity
  - faint
  - status
  - missing data

FASE 7 – Integration
- Tilføj link til spillet fra relevant eksisterende side.
- Sørg for at Cloudflare Pages kan deploye det som statisk site.
- Giv en kort opsummering af ændrede filer.
- Giv mig kommandoer/instruktioner til at teste lokalt.

EKSTRA KVALITET
Gør gerne spillet ekstra lækkert med:
- Type badges
- “It’s super effective!” animation
- Victory screen
- Random battle button
- Pokémon comparison før battle
- “Play again” button
- Small screen shake ved critical hit
- Critical hit text
- Status icons
- Tooltip/info modal for type effectiveness
- Difficulty selector

VIGTIGT
Byg først en solid 1v1 battle. Undgå at gøre scope for stort med catching, inventory, full teams, evolution, overworld eller multiplayer. Det kan komme senere. Kernen er: vælg Pokémon, vælg modstander, kæmp, og få en spilfølelse der minder om klassisk FireRed battle uden at kopiere assets.