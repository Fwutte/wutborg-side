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

Cloudflare Access anbefales, så kun familien kan læse og ændre data. Brug to
separate `Allow`-politikker. Cloudflare behandler dem samlet som:

```text
godkendt IP ELLER (godkendt bruger OG Zero Trust-registreret mobilenhed)
```

Brug ikke en `Bypass`-politik til hjemme-IP'en. En almindelig `Allow`-politik
bevarer Access-kontrol og logning.

### 1. Beskyt madplanen og API'et

1. Gå til **Zero Trust → Access controls → Applications**.
2. Opret en self-hosted applikation for familiens domæne.
3. Beskyt både `/madplan*` og `/api/*`. Hvis dashboardet ikke tillader begge
   stier i samme applikation, opret to applikationer med de samme politikker.

### 2. Tillad den faste IP

Opret politikken `Godkendt hjemme-IP`:

```text
Action:  Allow
Include: IP ranges
Value:   <jeres-offentlige-ip>/32
```

Tilføj også hjemmets offentlige IPv6-adresse eller stabile IPv6-prefix, hvis
forbindelsen bruger IPv6. En dynamisk offentlig IP skal opdateres i Access,
når internetudbyderen ændrer den.

### 3. Registrer den godkendte mobil

1. Gå til **Zero Trust → Settings → WARP Client → Device enrollment
   permissions** og tillad kun familiens konkrete e-mailadresser. I nyere
   dashboardversioner kan punktet ligge under **Team and resources → Devices**.
2. Gå til **Zero Trust → Reusable components → Posture checks**.
3. Tilføj Cloudflare One Client-kontrollen **Require Gateway**, fx med navnet
   `Familie-mobil tilsluttet`.
4. Installer **Cloudflare One Agent** fra App Store på iPhone.
5. Åbn appen, indtast jeres Zero Trust-teamnavn, log ind med den godkendte
   e-mail, installer VPN-profilen, og sæt appen til `Connected`.

`Require Gateway` er valgt frem for den almindelige `Require WARP`-kontrol,
fordi Gateway-kontrollen kræver forbindelse til netop jeres Zero Trust-
organisation.

### 4. Tillad den registrerede mobil fra alle IP'er

Opret politikken `Godkendt familie-mobil`:

```text
Action:  Allow
Include: Emails
Value:   <godkendt-familie-email>
Require: Device posture
Value:   Familie-mobil tilsluttet
```

Kopiér begge politikker til både `/madplan*` og `/api/*`, hvis de er oprettet
som separate Access-applikationer.

### 5. Test

1. Slå Wi-Fi fra på mobilen og behold Cloudflare One Agent som `Connected`.
   Madplanen skal virke over mobilnettet.
2. Slå Cloudflare One Agent fra. Adgang over mobilnettet skal afvises.
3. Åbn siden fra hjemme-IP'en uden Agent. Adgang skal tillades.
4. Kontrollér **Zero Trust → Logs → Access** for de tre forsøg.

### Streng lås til præcis én telefon

Ovenstående løsning godkender en Zero Trust-registreret enhed plus en konkret
bruger. Den er passende til en lille familie, men brugeren kan i princippet
registrere en ekstra enhed.

Cloudflares `Device UUID`-kontrol kan låse adgangen til en specifik telefon,
men UUID'et kan ikke tildeles manuelt. Det kræver en MDM-konfiguration med
`unique_client_id`. Brug derfor kun denne variant, hvis familien allerede har
en MDM-løsning. Uden MDM bør uønskede enhedsregistreringer fjernes under
**Team and resources → Devices**.

Uden Access er både madplanen og API'et offentligt tilgængelige.
