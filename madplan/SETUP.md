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

### 2. Find hjemmets offentlige IP

1. Forbind en computer til hjemmets Wi-Fi.
2. Åbn `https://www.cloudflare.com/cdn-cgi/trace`.
3. Kopiér værdien efter `ip=`.

Brug den adresse Cloudflare viser. En adresse som `192.168.x.x` eller
`10.x.x.x` er lokal og kan ikke bruges.

### 3. Indstil den godkendte IP

1. Gå til **Workers & Pages → wutborg-side → Settings → Variables and
   Secrets**.
2. Tilføj en almindelig produktionsvariabel:

   ```text
   Name:  MADPLAN_TRUSTED_IPS
   Value: <hjemmets-offentlige-ip>
   ```

3. Hvis flere IP-adresser skal godkendes, adskil dem med komma:

   ```text
   203.0.113.10,2001:db8::1234
   ```

4. Deploy Pages-projektet igen.

Hvis internetudbyderen ændrer den offentlige IP, skal variablen opdateres.
Adgang fra allerede registrerede telefoner fortsætter uafhængigt af IP'en.

### 4. Registrer en iPhone

1. Forbind iPhonen til hjemmets Wi-Fi.
2. Åbn `https://wutborg.dk/madplan/` i Safari.
3. Vælg **Del → Føj til hjemmeskærm**.
4. Luk Safari, og åbn den installerede **Madplan** fra hjemmeskærmen.
5. Tryk på nøgleknappen øverst.
6. Giv telefonen et navn, fx `Lottes iPhone`, og vælg
   **Godkend denne enhed**.
7. Slå Wi-Fi fra, luk appen helt, og åbn den igen på mobilnettet.

Gentag processen for hver telefon. Registrer nøglen inde i den installerede
app, ikke kun i Safari, så nøglen oprettes i det lager appen faktisk bruger.

### 5. Fjern en telefon

1. Åbn madplanen fra hjemmets godkendte IP.
2. Tryk på nøgleknappen.
3. Tryk **Fjern** ud for telefonen.

Alle telefonens aktive sessions slettes med det samme. Hvis browserdata eller
den installerede PWA slettes, forsvinder privatnøglen også, og telefonen skal
registreres igen fra hjemmets IP.

### Lokal udvikling

`localhost` godkendes automatisk, når requesten ikke har Cloudflares
`CF-Connecting-IP`-header. `MADPLAN_TRUSTED_IPS` er derfor ikke nødvendig ved
`npx wrangler pages dev .`.
