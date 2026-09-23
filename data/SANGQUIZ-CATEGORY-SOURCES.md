# Sangquiz: kategorier og årstal

## Udvidelse september 2026

Hvert årti fra 1970 til 2019 har 110 danske og 110 internationale sange.
Der er tilføjet 572 forskellige sange fra de eksisterende kunstneres kataloger,
herunder albumnumre. Et kunstnervalg tilbydes kun, hvis puljen har mindst 100
brugbare sange før bogstavfilteret. Bogstaver er et ekstra filter og kan give
færre end 100 sange. Specialkategorierne spilles derfor indtil videre blandet.

`sangquiz-expansion-sources.json` dokumenterer hver tilføjet sang med kunstner-ID,
første udgivelsesdato og links til indspilning og officiel udgivelse hos
[MusicBrainz](https://musicbrainz.org/doc/Recording). Importen kræver en officiel
album-, single- eller EP-udgivelse tæt på indspilningens første udgivelsesår.
Kompilationer, liveudgivelser, interviews, videoer og remixes frasorteres.
Kunstnere med samme navn adskilles med MusicBrainz-ID.

`node scripts/expand-sangquiz-catalog.cjs` kan genskabe udvidelsen. Netværkscache
ligger i systemets midlertidige mappe; gennemgå ændringer i kildedokumentationen
ved en ny import. `node scripts/verify-sangquiz-expansion.cjs` kontrollerer de
valgte titler igen uden årtibegrænsning, så en senere udgivelse ikke skjuler et
tidligere originalår. Kør importen igen efter kontrollen og gentag kontrollen
for eventuelle erstatningssange, indtil alle poster har `yearChecked: true`.
`npm run validate` kontrollerer minimum 100 sange i alle ti
årti/kunstner-puljer, identiteter, kildehenvisninger og filteradfærd.

## Linkkontrol september 2026

`node scripts/audit-sangquiz-links.cjs` skriver `sangquiz-link-audit.json` med
kategorital, kontroltidspunkt og resultat for hvert link. Alle 30 eksisterende
direkte Spotify-links blev kontrolleret mod Spotifys offentlige embed-metadata:
korrekt titel, kunstner og offentlig afspilningsstatus. Ingen fejl blev fundet.

Resten er Spotify-søgelinks. Deres format og søgetekst kontrolleres, men en
søgeadresse beviser ikke, at en bestemt indspilning kan afspilles. Afspilning kan
desuden afhænge af konto og land. Der er derfor ikke opfundet direkte track-ID'er
eller markeret søgelinks som afspilningsverificerede.

Spillets manuelle linkkontrol må kun udelukke et eksisterende Spotify-track ved
HTTP 404/410. Netværksfejl, ratebegrænsning og midlertidige serverfejl skal lade
sangen blive i puljen.

## Udvælgelse

Udvidelsen fra juli 2026 prioriterer sange med bred genkendelighed i Danmark:

- internationale radio-, hitliste-, fest- og fællessangsklassikere
- enkelte særligt kendte danske hits
- en blanding af pop, rock, soul, dance og hiphop

Udvælgelsen er krydstjekket mod Official Charts' årtioversigter og lister over
store hits. Kataloget har en sikkerhedsmargin over kravet på 100 sange i hver
hovedkategori.

## Regel for årstal

Quizzen bruger året for indspilningens første dokumenterede offentlige
udgivelse. En albumudgivelse tæller derfor, selv om sangen først blev et
singlehit året efter. En tidligere regional udgivelse tæller også.

Eksempler:

- Stealers Wheel – `Stuck in the Middle with You`: 1972 (album før singlehit)
- Blue Swede – `Hooked on a Feeling`: 1973 (svensk udgivelse før USA-hittet)
- The Three Degrees – `When Will I See You Again`: 1973 (album før singlehit)
- John Paul Young – `Love Is in the Air`: 1977 (international udgivelse)
- The Bangles – `Eternal Flame`: 1988 (album før singlehit)
- Backstreet Boys – `Everybody (Backstreet's Back)`: 1997
- Sixpence None the Richer – `Kiss Me`: 1997 (album før singlehit)
- Lukas Graham – `7 Years`: 2015 (dansk udgivelse før internationalt hit)
- D-A-D – `Laugh 'n' 1/2`: 1991, rettet fra 1989 efter bandets
  [officielle albumdiskografi](https://d-a-d.com/music/riskin-it-all/).

## Kontrolkilder

- MusicBrainz `first-release-date`, gennemgået med
  `scripts/audit-sangquiz-years.cjs`
- Official Charts' årtihistorik og historiske hitlister
- Apple Music/Spotify-udgivelsesdata og officielle kunstnersider ved
  tvetydige album-/singleår

Målrettet kontrol af de nye sange:

```powershell
$env:SANGQUIZ_AUDIT_TAG = "catalog-expansion"
$env:SANGQUIZ_AUDIT_BATCH_SIZE = "1"
node scripts/audit-sangquiz-years.cjs
```
