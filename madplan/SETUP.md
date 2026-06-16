# Opsætning af madplanen

Madplanen bruger kun Cloudflare Pages, Pages Functions og D1 på gratisniveauet.
Der skal ikke tilføjes betalingskort eller aktiveres betalte Workers-funktioner.

## Første opsætning

1. Log ind fra repo-roden:

   ```sh
   npx wrangler login
   ```

2. Opret D1-databasen:

   ```sh
   npx wrangler d1 create madplan
   ```

   Kopiér det viste `database_id` til `wrangler.toml` i stedet for
   `00000000-0000-0000-0000-000000000000`.

3. Kør migrationen mod produktion:

   ```sh
   npx wrangler d1 migrations apply madplan --remote
   ```

4. Bind databasen til Pages-projektet i Cloudflare-dashboardet:
   **Workers & Pages → wutborg-side → Settings → Bindings → Add → D1 database**.
   Brug variabelnavnet `DB`, vælg databasen `madplan`, og deploy igen.

5. Push ændringerne til GitHub. Cloudflare Pages udgiver derefter siden på
   `/madplan`.

## Lokal udvikling

```sh
npx wrangler d1 migrations apply madplan --local
npx wrangler pages dev .
```

Åbn `http://localhost:8788/madplan`.

Databasen kan inspiceres lokalt med:

```sh
npx wrangler d1 execute madplan --local --command "SELECT id, plan_date, meal_type, dish_name FROM meal_plan"
```

## Adgangsbeskyttelse

Madplanen bruger sin egen enhedsgodkendelse og kræver hverken Cloudflare Zero
Trust, betalingskort eller en App Store-app. Adgang gives, når mindst én af
disse betingelser er opfyldt:

```text
godkendt hjemme-IP ELLER gyldig signatur fra en registreret enhed
```

Telefonens private nøgle oprettes som en ikke-eksportérbar P-256-nøgle og
gemmes i browserens lokale nøglelager. D1 gemmer kun public key, kortlivede
engangskoder og tilbagekaldelige sessions.

### 1. Kør auth-migrationen

Kør alle nye migrationer mod produktion:

```sh
npx wrangler d1 migrations apply madplan --remote
```

Migration `0002_device_auth.sql` opretter tabellerne til enheder, engangskoder
og sessions.

### 2. Opret en opsætningskode

Hvis hjemmets internet har skiftende IP, fx ved 5G, skal telefoner registreres
med en hemmelig opsætningskode i stedet for IP-godkendelse.

Lav en lang tilfældig kode:

```sh
node -e "console.log(crypto.randomUUID() + '-' + crypto.randomUUID())"
```

Kopier hele værdien. Den skal ikke ind i Git eller i kildekoden.

### 3. Gem opsætningskoden i Cloudflare

1. Gå til **Workers & Pages → wutborg-side → Settings → Variables and
   Secrets**.
2. Tilføj en produktionsvariabel. Vælg **Secret**, hvis dashboardet giver den
   mulighed:

   ```text
   Name:  MADPLAN_SETUP_KEY
   Value: <den-lange-tilfældige-kode>
   ```

3. Deploy Pages-projektet igen.

`MADPLAN_SETUP_KEY` bruges kun til at registrere, liste og fjerne godkendte
enheder. Når en telefon er registreret, bruger den sin egen private nøgle og
behøver ikke opsætningskoden ved almindelig brug.

### Valgfrit: godkend en fast IP

Hvis I senere får en stabil offentlig IP, kan den tilføjes som en genvej:

```text
Name:  MADPLAN_TRUSTED_IPS
Value: <hjemmets-offentlige-ip>
```

Flere IP-adresser adskilles med komma:

```text
203.0.113.10,2001:db8::1234
```

Ved 5G-internet bør `MADPLAN_TRUSTED_IPS` normalt udelades, fordi IP'en kan
skifte ofte.

### 4. Registrer en Android-telefon

1. Åbn `https://wutborg.dk/madplan/` i Chrome på Android.
2. Vælg **⋮ → Føj til startskærm** eller **Installer app**.
3. Åbn den installerede **Madplan** fra startskærmen.
4. Hvis siden viser låseskærmen, indtast:
   - navn, fx `Min Android`
   - opsætningskoden fra `MADPLAN_SETUP_KEY`
5. Tryk **Godkend denne telefon**.
6. Luk appen, åbn den igen, og test på mobilnettet.

Hvis telefonen allerede har adgang, kan enhedsnøglen udskiftes via
nøgleknappen øverst i madplanen.

Registrer nøglen inde i den installerede app, ikke kun i Chrome, så nøglen
oprettes i det lager appen faktisk bruger fremover.

### 5. Fjern en telefon

1. Åbn madplanen fra en allerede godkendt enhed.
2. Tryk på nøgleknappen.
3. Indtast opsætningskoden, hvis siden beder om den.
4. Tryk **Vis aktive enheder**.
5. Tryk **Fjern** ud for telefonen.

Alle telefonens aktive sessions slettes med det samme. Hvis browserdata eller
den installerede PWA slettes, forsvinder privatnøglen også, og telefonen skal
registreres igen med opsætningskoden.

### Lokal udvikling

`localhost` godkendes automatisk, når requesten ikke har Cloudflares
`CF-Connecting-IP`-header. Hverken `MADPLAN_TRUSTED_IPS` eller
`MADPLAN_SETUP_KEY` er derfor nødvendig ved `npx wrangler pages dev .`.
