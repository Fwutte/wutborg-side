# Sangquiz: særudgaver og årstal

Senest kontrolleret: 24. juli 2026.

## Puljer

- Julesange: 100 sange, dansk og internationalt.
- Grand Prix: 101 sange fra Dansk Melodi Grand Prix og Eurovision.
- Film og tv-serier: 100 sange, dansk og internationalt. Alle poster har både værktitel og typen `film` eller `tv-serie`.
- Nye standardkategorier: 70'erne, 80'erne, 90'erne, 00'erne, 10'erne og Rock. De genbruger tags fra den kuraterede standardpulje.

Puljerne er bevidst selvstændige. De indgår ikke i standardvalgene Blandet, Dansk eller Internationalt.

## Princip for årstal

Tidslinjen bruger den første udgivelse af den navngivne indspilning. Det er ikke automatisk filmens premieredato eller datoen på en nyere digital genudgivelse. Grand Prix-poster bruger sangens konkurrence- og udgivelsesår.

Årstallene er gennemgået mod følgende kilder:

- Eurovision Song Contests officielle historik: https://eurovision.tv/history
- MusicBrainz' release- og recording-metadata: https://musicbrainz.org/doc/Web_Service
- MusicBrainz' `first-release-date`, kontrolleret i batch for hele kataloget med `node scripts/audit-sangquiz-years.cjs`

Katalogkontrollen er et advarselssystem, ikke en automatisk rettelse. Digitale kataloger viser ofte datoen for en remaster, compilation eller genudgivelse. Afvigelser er derfor vurderet ud fra den oprindelige indspilning, og tydelige fejlmatch på titel alene afvises.

Kontrollen førte blandt andet til rettelser af D-A-D, Rasmus Seebach, Mads Langer, Pyrus, Stig Rossen, Julie Andrews, Chris Rea, Bruce Springsteen, DJ Jazzy Jeff & The Fresh Prince, Kim Larsen, Lis Sørensen, Lars H.U.G., Johnny Deluxe og Carpark Norths "32" (2013).
