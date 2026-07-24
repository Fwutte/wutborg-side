# Sangquiz: kategorier og årstal

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
