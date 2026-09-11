# Grafikopdatering · september 2026

## Super Mario World

- Nye animerede illustrationer af Mario med separate arme, ben, kasket, handsker, kappe og bevægelser under løb, hop og spin.
- Tre lokale, malede baggrunde med parallax: grøn dal, vinterlandskab og underjordisk borgsal. Nattebaner og slotte får egne farvetoner.
- Mønter roterer og glimter; alle power-ups, platforme, fjedre og hemmelige porte har nye illustrationer. Rør og blokke bruger nu den glatte, tegnede grafik.
- Terræn har overfladetekstur, græskanter og istapper. Tegnede terrænfelter caches frem for at blive bygget hvert billede.
- Canvas følger skærmens pixeltæthed op til 2×. Spillets koordinater, kollisioner og gemte fremskridt er uændrede.

Baggrundenes originale genereringsprompter og fremgangsmåde findes i [assets/mario-art/README.md](../assets/mario-art/README.md).

## Wutborg Kart

- Reflekterende lak, metal og visirer med en lokalt genereret miljøtekstur og en ny balance mellem sollys og lys fra himlen.
- Bløde skygger, detaljer på dækkene, lysende boost-effekter og energiskjold med tydelig lyskant.
- Mere detaljerede træer, græs, blomster, planter, klippeformationer, iskrystaller og gadelygter på natbanen.
- Tekstureret terræn og vejoverflader. Lavere ruhed på isbanen giver en anden materialefornemmelse end asfalt.
- Træer og sten deles op i rumlige grupper, så grafikmotoren kan undlade at tegne grupper uden for kameraets eller skyggelysets synsfelt. Mobilvisningen bruger færre detaljer.
- Hjelmens visir vender nu fremad sammen med føreren.

## Borgstorm

- Brostensvej, murværk, søjler, tårnbånd, buede porte, gitterværk, gulddetaljer og mere vegetation langs slagmarken.
- Detaljerne på belejringsport og tårne følger delene, når de ødelægges.
- Fakler, svævende partikler og flag med bølgende stof. Dekorationernes animationer respekterer reduceret bevægelse.
- Ny belysning, refleksioner og bløde skygger. Energiskjoldet har en lysende kant, der lader hæren være synlig.
- Den sidste bossfase bruger nu Barbarian-modellen i stedet for en forstørret almindelig fjende.

## Kontrol

`npm run validate` kontrollerer syntaks og de eksisterende spiltests. De nye grafikmoduler er tilføjet til syntakskontrollen.

`scripts/game-expansion.browser-test.html` har scener til visuel kontrol af begge Mario-landskaber, Mario-boss, Borgstorm-belejring, sidste bossfase og Kart på Frosttinderne. Den kan skifte til 390 pixels bred mobilvisning og udløse skjold/turbo. Den viser billedhastighed og registrerer JavaScript- og shaderfejl. Testscenerne gemmer ikke resultater.

`scripts/kart-racer.browser-test.html` kontrollerer de seks Grand Prix-runder, UI, input, grafikbudget og frigivelse af GPU-ressourcer. Brug `?scenario=preview&track=5&stop=8` til at måle junglebane under et rigtigt løb.

## Resultat af kontrollen

- Hele `npm run validate` bestod, inklusive 18 Kart-løb. Efter de sidste grafiske justeringer bestod syntakskontrollen med 43 OK og 0 fejl samt Mario-, Borgstorm 3D- og udvidelsestestene.
- Kart: 40 browserkontroller bestået, inklusive seks Grand Prix-runder og genopbygning af GPU-ressourcer.
- Lokal måling ved 1280 × 720: junglebane omkring 59 fps efter gruppering af træer, mod cirka 30 fps før samme optimering. Tegnede trekanter faldt fra 737.076 til 413.796 i målingen.
- Mario: omkring 60 fps i de kontrollerede scener, inklusive mobilvisning på 390 pixels.
- Borgstorm: mobilvisning med belejring målte cirka 54 fps efter samling af arkitektur, mod cirka 40 fps før.
- Skjold, turbo og den sidste Borgstorm-bossfase er visuelt kontrolleret uden registrerede JavaScript- eller shaderfejl. Målingerne er fra den lokale browser og er ikke et løfte om samme hastighed på alle telefoner.
