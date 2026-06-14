Du er en ekstremt dygtig senior frontend game developer. Du skal bygge et komplet, flot og spilbart 2D platformspil inspireret af klassiske Mario-spil med samme type spilfølelse: løb, hop, fjender, mønter, blokke, power-ups og baner.

Projektet er en statisk hjemmeside med HTML/CSS/JavaScript, som skal kunne køre direkte i browseren og deployes på Cloudflare Pages/GitHub uden backend, database eller build-system. Brug helst ren HTML, CSS og JavaScript. Hvis projektet allerede har en struktur, så følg den. Ødelæg ikke eksisterende filer eller navigation.

Målet:
Lav et færdigt browserbaseret 2D platformspil med høj spiloplevelse, flot grafik, god styring og poleret finish. Spillet skal føles som et rigtigt lille retro-platformspil og ikke bare en simpel prototype.

Vigtige krav:

1. Teknologi
- Brug HTML5 Canvas til selve spillet.
- Brug vanilla JavaScript.
- Brug CSS til layout, menu, knapper, mobilkontroller og visuel polish.
- Spillet skal virke på desktop og mobil/tablet.
- Lav grafikken selv med Canvas, CSS, simple SVG/data-URI eller genererede pixel/cartoon sprites i kode.
- Ingen backend.

2. Spilfølelse og styring
Implementér platformer-fysik med:
- Acceleration og deceleration, så spilleren ikke føles stiv.
- Tyngdekraft.
- Hop med variabel højde afhængigt af hvor længe man holder knappen nede.
- “Coyote time”, så spilleren stadig kan hoppe et splitsekund efter at have forladt en platform.
- “Jump buffer”, så et hop registreres kort før man lander.
- Kollisionssystem mod banens tiles, blokke, rør, platforme og fjender.
- Smooth kamerafølge, så kameraet følger spilleren vandret.
- Skærmen må ikke ryste eller hakke.

Kontroller:
- Desktop: piletaster/WASD til bevægelse, Space/W/ArrowUp til hop, Esc til pause.
- Mobil: store touch-knapper nederst på skærmen til venstre, højre og hop.
- Kontrollerne skal være nemme nok til at et barn kan spille.

3. Gameplay
Spillet skal indeholde:
- Startmenu med titel, “Start spil”, “Sådan spiller du” og evt. “Vælg bane”.
- Mindst 3 baner.
- En tutorial-agtig første bane, der lærer spilleren at hoppe, samle mønter og undgå fjender.
- Mønter/collectibles.
- Spørgsmålstegn-blokke eller bonusblokke med mønter/power-ups.
- Ødelæggelige eller interaktive blokke.
- Fjender, der går frem og tilbage.
- Fjender skal kunne besejres ved at hoppe på dem.
- Spilleren tager skade ved berøring fra siden.
- Power-up, der gør spilleren større eller giver ekstra liv/skjold.
- Checkpoints.
- Flag/mål ved slutningen af banen.
- Game over-skærm.
- Level complete-skærm.
- Pausemenu.
- Liv/health-system.
- Mønttæller.
- Timer eller bane-progress, hvis det giver mening.

4. Banedesign
Lav banerne som tilemaps i JavaScript, så de er nemme at udvide.
Brug symboler i arrays, fx:
- X = jord/platform
- ? = bonusblok
- C = coin
- E = enemy
- P = player start
- F = finish
- U = power-up
- R = pipe/forhindring

Banerne skal være bredere end skærmen, så der er sidescroll.
Sørg for at banerne er fair, sjove og gradvist sværere.
Undgå umulige hop.

5. Grafik og stemning
Lav en flot, venlig og farverig stil:
- Blå himmel.
- Skyer med parallax-effekt.
- Bakker/buske i baggrunden.
- Tydelige platforme.
- Animeret spillerfigur.
- Animerede fjender.
- Mønter skal rotere/glimte.
- Blokke skal have lille “bump”-animation når de rammes.
- Power-ups skal være tydelige.
- Spillet skal føles levende.

6. Lyd
Lav simple lyde med Web Audio API, så der ikke kræves lydfiler:
- Hoplyd.
- Møntlyd.
- Fjende besejret.
- Power-up.
- Skade.
- Level complete.
- Game over.
Tilføj mute-knap.

7. UI og polish
Spillet skal have:
- Flot startskærm.
- HUD med liv, mønter og bane.
- Pauseknap.
- Mute-knap.
- Instruktionsskærm.
- Responsivt design.
- Tydelig restart-knap.
- Smooth transitions mellem menu, spil, pause og game over.
- Knapper skal være store og tydelige.

8. Kodekvalitet
Strukturer koden pænt:
- Game loop med requestAnimationFrame.
- Separér logik i klasser eller moduler:
  - Game
  - Player
  - Enemy
  - Level
  - TileMap
  - Camera
  - AudioManager
  - InputManager
  - UI
- Kommentér de vigtigste dele.
- Undgå unødvendig kompleksitet.
- Koden skal være nem at udvide med flere baner, fjender og power-ups.

9. Filstruktur
Hvis projektet allerede har en passende struktur, så brug den. Ellers lav fx:
- platformer.html
- css/platformer.css
- js/platformer.js

Hvis hjemmesiden har en forside eller menu, så tilføj et link til spillet uden at ødelægge eksisterende links.

10. Performance
- Spillet skal køre flydende.
- Brug Canvas effektivt.
- Undgå tunge biblioteker.
- Sørg for at spillet fungerer i Chrome, Edge, Safari og på mobilbrowser.
- Ingen console errors.

11. Særligt vigtigt
Dette skal ikke være en halvfærdig demo. Det skal være et færdigt lille spil, der kan lægges online og spilles af besøgende.
Prioritér spiloplevelse, grafik, animationer og god styring over highscore-systemer.
Highscore er ikke vigtigt, medmindre det er meget nemt at tilføje uden at gå ud over resten.

Arbejd sådan:
1. Gennemgå først projektets eksisterende filstruktur.
2. Vælg den mindst invasive måde at tilføje spillet på.
3. Implementér spillet fuldt.
4. Test manuelt i browseren.
5. Ret fejl.
6. Sørg for at spillet virker både på desktop og mobil.
7. Afslut med en kort rapport over:
   - Hvilke filer du har oprettet/ændret.
   - Hvordan man åbner spillet.
   - Hvilke funktioner der er implementeret.
   - Eventuelle kendte begrænsninger.

Acceptkriterier:
- Spillet kan startes fra en menu.
- Spilleren kan løbe, hoppe og lande korrekt.
- Der er mindst 3 spilbare baner.
- Der er fjender, mønter, blokke, power-up og mål.
- Man kan vinde og tabe.
- Der er mobilkontroller.
- Der er lyd og mute-knap.
- Spillet har flot grafik.
- Spillet virker som statisk HTML/CSS/JS uden backend.
