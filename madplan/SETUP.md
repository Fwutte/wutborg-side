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

Cloudflare Access anbefales, så kun familien kan læse og ændre data. Det er
gratis for op til 50 brugere:

1. Gå til **Zero Trust → Access → Applications → Add an application**.
2. Opret en self-hosted app for familiens domæne med stierne `/madplan*` og
   `/api/*`.
3. Tillad familiens e-mailadresser via one-time PIN eller Google-login.

Uden Access er både madplanen og API'et offentligt tilgængelige.
