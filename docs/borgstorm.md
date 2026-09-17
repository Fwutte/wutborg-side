# Borgstorm — genopbygget september 2026

Spillet åbnes på `battle-gates.html`. Den nye version bruger udelukkende `js/borgstorm/` til spilsimulation, grafik, lyd og styring. De gamle `battle-gates*.js` er ikke længere indlæst af spillet; de er foreløbig bevaret til de ældre tværgående regressionstests.

## Spillet

- 20 baner gennem fem riger. Hvert rige slutter med en borgherre på bane 4, 8, 12, 16 eller 20.
- Hæren marcherer automatisk. Piletaster/A/D og træk på canvas styrer den. Portknapperne vælger side og fremskynder marchen.
- Forstærkningsporte, gangeporte og tre specialenheder giver forskellige strategier. Bueskytter forbedrer pilesalver, skjolde mindsker skade, og kæmper gør ekstra skade på fjender.
- Fældefelter og fjendehære kan undviges. Alle baner slutter med en belejring i tre faser: port, borggård, borgherre.
- Q aktiverer skjoldmur; E affyrer en pilesalve. Evnerne kan også aktiveres via mobilknapper.
- Rolig, Eventyr og Veteran ændrer betænkningstid, skade, angrebsvarsling og pointfaktor. Alle baner kan vindes uden opgraderinger på alle tre niveauer.
- To stjerner kræver mindst 35 overlevende. Tre kræver mindst 65 og højst to træffere. Nye stjerner giver 50 mønter hver, og alle sejre giver yderligere 20. Genbesøg giver derfor altid fremgang.
- Rust hæren giver forstærkninger, rustning og en pointbonus fra fanebæreren, hver i fem niveauer.

## Grafik og drift

Lokale Three.js-filer og fire licenserede KayKit-figurer genbruges. Der hentes ingen runtimefiler fra CDN'er. Se `assets/borgstorm-3d/ASSET-LICENSES.md` for kilder og CC0-licens.

`node scripts/build-borgstorm-assets.cjs` bygger de fire runtimefiler i `assets/borgstorm-3d/optimized/` med de otte anvendte animationer. Geometri, skeletter og teksturer bevares. Samlet størrelse er reduceret fra 14,49 MB til 2,75 MB (cirka 81 %), mens kildefilerne bevares.

Den nye scene har selvstændig borgarkitektur, genererede sten- og græsteksturer, skygger, miljørefleksioner, træer, broer, en flod (lava/is i andre riger), fakler og atmosfæriske partikler. Borgens porte og tårne beskadiges i takt med faserne. Skjoldet bruger en gennemsigtig kanteffekt, og pilesalver tegnes som projektiler. Tropperne har gang-, kamp-, forsvars- og sejrsanimationer og enhedsspecifik udrustning.

Terrænet bruger instancing. Animerede enheder begrænses til 36 spillerenheder og 18 fjender på computer, 22 og 12 på mobil. Antallet i HUD er altid det virkelige soldatantal. Spillet har en spilbar 2D-reserve ved manglende eller mistet WebGL-kontekst. Reduceret bevægelse respekteres; pause og skjult fane stopper simulationen. Browseren afspiller først lyd efter brugerinput.

## Gemte spil

`wutborg.borgstorm.progress.v3` gemmer stjerner, mønter, opgraderinger, åbne baner, rekord, lyd og sværhedsgrad. Hvis v3 ikke findes, importeres v2-fremgangen uden at overskrive v2. Ødelagte og ugyldige værdier normaliseres. Blokeret lager vises som en forklaring; spillet kan stadig gennemføres i sessionen.

## Kontrol

- `npm run test:borgstorm`: 100 deterministiske kampagnegennemløb samt skade, specialenheder, evner, pause, forskellige billedhastigheder, migration og økonomi.
- `npm run test:borgstorm-3d`: syntaks, kobling mellem HTML og controller samt lokale karakterfiler/animationer.
- `npm run validate`: hele projektets eksisterende validering og nye Borgstorm-tests.
- `scripts/borgstorm.browser-test.html?autotest=1`: 32 integrerede browserkontroller af spillets rigtige knapper, dialoger, sejr/nederlag, næste bane, opgraderinger, grafikindlæsning og mobilvisning. Testen gemmer aldrig rekorder eller kampagnefremgang. Siden har manuelle forhåndsvisninger af alle fem riger, evner og 2D-reserve.

Browserkontrol er gennemført ved 1100 px og 390 px bredde. Den lokale forhåndsvisning er ikke en produktionsudgivelse.
