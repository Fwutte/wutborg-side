# Opgave til kodeagent: Madplan-underside på familiehjemmesiden

> Kopiér hele dette dokument ind i din kodeagent (Codex i VS Code).
> \*\*Vedhæft samtidig disse fem filer\*\*, som er udgangspunktet og ikke skal bygges fra bunden: `index\_madplan.html`, `manifest.json`, `sw.js`, `icon.svg`, `schema.sql`.

\---

## 1\. Mål

Tilføj en **madplans-underside** til en eksisterende familiehjemmeside, så familien fra mobilen kan vedligeholde og opdatere en **fælles** ugentlig madplan, et bibliotek af retter og en indkøbsliste. Det skal være en **PWA** (installérbar, virker offline for selve siden), og data skal ligge i **SQLite**.

Siden skal ligge på stien **`/madplan`** og må ikke ændre eller forstyrre den eksisterende side.

\---

## 2\. Hårde rammer — MÅ IKKE KOSTE NOGET

Hjemmesiden hostes på **Cloudflare** (gratis abonnement) og deployes via **GitHub** (push → Cloudflare Pages bygger og udgiver automatisk). Alt nedenstående SKAL kunne køre på Cloudflares **gratis plan**:

* **Cloudflare Pages** til statiske filer (allerede i brug).
* **Pages Functions** (`/functions`-mappen) som API. De kører som Workers på **Workers Free** (100.000 requests/dag).
* **Cloudflare D1** som database. D1 *er* SQLite. Gratis plan: **5 GB lager, 5 mio. læste rækker/dag, 100.000 skrevne rækker/dag** (nulstilles 00:00 UTC). Overskrides en grænse, fejler forespørgslerne — der opkræves **ikke** penge på Free-planen.

**Forbudt (kræver betaling eller er unødvendigt):** Workers **Paid**-opgradering, Hyperdrive, Durable Objects, R2, KV, Queues, Workers AI, Browser Rendering, Vectorize, Images. Tilføj **ikke** betalingskort og opgradér **ikke** kontoen. Brug udelukkende Pages + Pages Functions + D1.

**Omkostningshygiejne (skal følges, selv om tabellerne er små):**

* Alle forespørgsler skal bruge **prepared statements med `?`-parametre** (ingen strengsammensætning af brugerinput — både SQL-injection og rækkelæsning).
* Aldrig `SELECT \*` med fuld tabel-scan på ufiltrerede/uindekserede kolonner. Vælg eksplicitte kolonner og filtrér på indekserede felter (indekser er defineret i skemaet).

\---

## 3\. Arkitektur

```
Browser (PWA på /madplan)
        │  fetch  /api/...
        ▼
Cloudflare Pages Functions   (/functions/api/\*  — kører som Workers, gratis)
        │  env.DB  (D1 binding)
        ▼
Cloudflare D1  (SQLite, gratis)
```

Statisk frontend serveres af Pages. API'et er Pages Functions med en **D1-binding ved navn `DB`**. Samme domæne → ingen CORS.

\---

## 4\. FØRST: undersøg det eksisterende repo (gør dette før du skriver kode)

Lav ingen antagelser. Find ud af og notér:

1. **Build-output-mappen** som Pages serverer fra (fx repo-roden, `public/`, `dist/`, `\_site/`). De statiske madplan-filer skal lægges som `<output>/madplan/…`.
2. **Byggekommando/-opsætning** (statisk HTML uden build? en generator?). Madplan-tilføjelsen må **ikke** ændre den eksisterende build.
3. Findes der allerede en **`wrangler.toml`/`wrangler.jsonc`** eller en `functions/`-mappe? Hvis ja, **udvid** dem — overskriv intet eksisterende.
4. Sprog/konventioner i projektet (plain JS, TypeScript?). Match det. Er siden plain statisk HTML, så skriv Functions i **almindelig JavaScript** og indfør ingen frameworks eller build-trin.
5. Eksisterende navigation — om der er et naturligt sted at tilføje et link til `/madplan` (gør det diskret; omstrukturér ikke siden).

Beskriv kort din plan ud fra fundene, før du implementerer.

\---

## 5\. Filstruktur der skal oprettes

Placér `functions/` i **repo-roden** (ikke inde i output-mappen). De statiske filer lægges i output-mappens `madplan/`.

```
<repo-rod>/
├─ functions/
│  └─ api/
│     ├─ \_helpers.js            # delte hjælpere (underscore = ikke en rute)
│     ├─ plan/
│     │  ├─ index.js            # GET  /api/plan?from=\&to=
│     │  └─ \[date].js           # PUT, DELETE /api/plan/:date
│     ├─ dishes/
│     │  ├─ index.js            # GET, POST /api/dishes
│     │  └─ \[id].js             # PATCH, DELETE /api/dishes/:id
│     └─ shopping/
│        ├─ index\_madplan.js            # GET, POST, DELETE(ryd afkrydsede) /api/shopping
│        └─ \[id].js             # PATCH, DELETE /api/shopping/:id
├─ migrations/
│  └─ 0001\_init.sql             # skemaet (fra vedhæftet schema.sql)
├─ wrangler.toml                # D1-binding (til lokal udvikling) — se §10
└─ <output>/madplan/
   ├─ index\_madplan.html                # vedhæftet frontend (tilrettet, se §8)
   ├─ manifest.json             # vedhæftet
   ├─ sw.js                     # vedhæftet
   └─ icon.svg                  # vedhæftet
```

\---

## 6\. Datamodel (D1 / SQLite)

Læg **indholdet af den vedhæftede `schema.sql`** i `migrations/0001\_init.sql` (forward-only migration). Skemaet er allerede korrekt og indeholder de nødvendige indekser. Til orientering er strukturen:

* **`dishes`** — bibliotek af retter: `id`, `name`, `category`, `notes`, `is\_favorite`, `created\_at`.
* **`meal\_plan`** — én post pr. dag pr. måltid: `id`, `plan\_date` (`YYYY-MM-DD`), `meal\_type` (default `'aftensmad'`), `dish\_id` (valgfri FK), `dish\_name` (snapshot — kilden til sandhed i visningen), `cook`, `notes`, `is\_done`, `updated\_at`.

  * Unikt indeks på `(plan\_date, meal\_type)` → bruges til upsert.
  * Indeks på `plan\_date` → bruges til uge-opslag.
* **`shopping\_items`** — `id`, `name`, `quantity`, `is\_checked`, `created\_at`.

`meal\_plan.dish\_name` gemmes som snapshot, så planen står ved magt, selv hvis en ret omdøbes/slettes. Appen læser `dish\_name` (ikke FK-join) ved visning.

\---

## 7\. API-kontrakt

Alle svar er JSON. Brug korrekte statuskoder (`200` ok, `400` valideringsfejl, `404`, `500`). Valider input og afkort strenge (matcher frontendens `maxlength`: ret/vare ≤ 80–120 tegn, `cook` ≤ 60, `notes` ≤ 200). `meal\_type` valideres mod `{'morgenmad','frokost','aftensmad'}`; default `'aftensmad'`.

|Metode|Sti|Body|Svar|
|-|-|-|-|
|GET|`/api/plan?from=YYYY-MM-DD\&to=YYYY-MM-DD`|–|`\[{plan\_date, meal\_type, dish\_id, dish\_name, cook, notes, is\_done}]` for intervallet|
|PUT|`/api/plan/:date`|`{meal\_type?, dish\_id?, dish\_name, cook?, notes?, is\_done?}`|upsert på `(date, meal\_type)` → `{ok:true}`|
|DELETE|`/api/plan/:date?meal\_type=aftensmad`|–|sletter dagens måltid → `{ok:true}`|
|GET|`/api/dishes`|–|`\[{id, name, category, is\_favorite}]`, favoritter først, dernæst alfabetisk (dansk sortering)|
|POST|`/api/dishes`|`{name, category?}`|opretter → `{id, name, category, is\_favorite:0}`|
|PATCH|`/api/dishes/:id`|`{is\_favorite?, name?, category?, notes?}`|opdaterer kun medsendte felter → `{ok:true}`|
|DELETE|`/api/dishes/:id`|–|`{ok:true}`|
|GET|`/api/shopping`|–|`\[{id, name, quantity, is\_checked}]`|
|POST|`/api/shopping`|`{name, quantity?}`|opretter → `{id, …}`|
|PATCH|`/api/shopping/:id`|`{is\_checked?, name?, quantity?}`|→ `{ok:true}`|
|DELETE|`/api/shopping/:id`|–|`{ok:true}`|
|DELETE|`/api/shopping`|–|sletter alle hvor `is\_checked=1` → `{ok:true}`|

### Reference-implementering (følg dette mønster for alle ruter)

`functions/api/\_helpers.js`:

```js
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
export const bad = (msg, status = 400) => json({ error: msg }, status);
export const isDate = (s) => typeof s === "string" \&\& /^\\d{4}-\\d{2}-\\d{2}$/.test(s);
export const MEALS = new Set(\["morgenmad", "frokost", "aftensmad"]);
```

`functions/api/plan/index.js`:

```js
import { json, bad, isDate } from "../\_helpers.js";

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isDate(from) || !isDate(to)) return bad("from/to skal være YYYY-MM-DD");
  const { results } = await env.DB.prepare(
    `SELECT plan\_date, meal\_type, dish\_id, dish\_name, cook, notes, is\_done
       FROM meal\_plan
      WHERE plan\_date BETWEEN ? AND ?
      ORDER BY plan\_date`
  ).bind(from, to).all();
  return json(results);
};
```

`functions/api/plan/\[date].js`:

```js
import { json, bad, isDate, MEALS } from "../\_helpers.js";

export const onRequestPut = async ({ params, request, env }) => {
  const date = params.date;
  if (!isDate(date)) return bad("Ugyldig dato");
  const b = await request.json().catch(() => ({}));
  const meal\_type = b.meal\_type || "aftensmad";
  if (!MEALS.has(meal\_type)) return bad("Ugyldig meal\_type");
  const dish\_name = String(b.dish\_name || "").trim().slice(0, 120);
  if (!dish\_name) return bad("dish\_name mangler");
  await env.DB.prepare(
    `INSERT INTO meal\_plan (plan\_date, meal\_type, dish\_id, dish\_name, cook, notes, is\_done, updated\_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
     ON CONFLICT(plan\_date, meal\_type) DO UPDATE SET
       dish\_id=?3, dish\_name=?4, cook=?5, notes=?6, is\_done=?7, updated\_at=datetime('now')`
  ).bind(
    date, meal\_type, b.dish\_id ?? null, dish\_name,
    String(b.cook || "").slice(0, 60), String(b.notes || "").slice(0, 200), b.is\_done ? 1 : 0
  ).run();
  return json({ ok: true });
};

export const onRequestDelete = async ({ params, request, env }) => {
  const date = params.date;
  if (!isDate(date)) return bad("Ugyldig dato");
  const meal\_type = new URL(request.url).searchParams.get("meal\_type") || "aftensmad";
  await env.DB.prepare("DELETE FROM meal\_plan WHERE plan\_date = ? AND meal\_type = ?")
    .bind(date, meal\_type).run();
  return json({ ok: true });
};
```

Implementér de øvrige ruter (`dishes`, `shopping`) efter præcis samme mønster: `env.DB.prepare(...).bind(...).all()/.first()/.run()`, prepared statements, validering, JSON-svar. For PATCH med valgfrie felter: byg `SET`-klausulen kun ud fra de medsendte nøgler (stadig parametriseret).

\---

## 8\. Frontend (brug den vedhæftede `index\_madplan.html`)

Behold design, layout og dansk tekst **uændret**. Den vedhæftede fil indeholder allerede et `store`-objekt med in-memory demodata og er kommenteret med, hvor datalaget skal udskiftes. Lav følgende ændringer:

1. **Udskift datalaget med kald til API'et.** Behold en lokal in-memory cache i samme form som det nuværende `store`, så render-funktionerne stort set er uændrede (de læser fra cachen synkront). Hydrér cachen fra API'et pr. visning, og efter hver mutation: kald API'et → hent den berørte del igen → re-render.

   Mønster:

   ```js
   const API = "/api";
   const jget  = async (u) => { const r = await fetch(API + u); if (!r.ok) throw new Error(await r.text()); return r.json(); };
   const jsend = async (m, u, body) => { const r = await fetch(API + u, { method: m, headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }); if (!r.ok) throw new Error(await r.text()); return r.json(); };

   // eksempel: hent ugen og fyld cachen, så renderPlan() kan læse synkront
   async function loadWeek() {
     const from = iso(weekStart), to = iso(addDays(weekStart, 6));
     const rows = await jget(`/plan?from=${from}\&to=${to}`);
     cache.plan = {};
     for (const r of rows) cache.plan\[r.plan\_date] = { dishId: r.dish\_id, name: r.dish\_name, cook: r.cook, notes: r.notes, done: r.is\_done };
     render();
   }
   ```

   * `getPlan/getDishes/getShopping` → læs fra cachen.
   * `setPlan(date,…)` → `await jsend("PUT", "/plan/"+date, {...})` → `await loadWeek()`.
   * `clearPlan(date)` → `await jsend("DELETE", "/plan/"+date)` → `await loadWeek()`.
   * `addDish/toggleFav` → POST/PATCH `/dishes` → `await loadDishes()`.
   * `addShop/toggleShop/clearChecked` → POST/PATCH/DELETE `/shopping` → `await loadShopping()`.

   Når du skifter en visning eller uge, så kald den relevante `load…()`. Tilføj enkel fejlhåndtering (vis fx en toast "Kunne ikke gemme" ved et afvist kald).

2. **PWA på understi.** Filerne fungerer allerede til `/madplan/`, fordi stier er relative: når alle fire filer ligger i `madplan/`, registreres `sw.js` med scope `/madplan/`, og `manifest`-stien er relativ. Kontrollér blot at `start\_url` og `scope` opløses til `/madplan/`, og at service-workerens cache-liste peger på `/madplan/`-skallen. API-kald går til absolut `/api/...`. (Service-workeren cacher kun selve siden offline; offline-skrivninger/synk er ikke en del af denne version.)
3. Behold `theme-color`, ikon og fonte som de er.

   \---

   ## 9\. Opsætning (engangs — beskriv tydeligt, hvad *mennesket* skal gøre)

   Agenten skriver al kode og `wrangler.toml`. Følgende trin kræver indlogning/dashboard og udføres af mennesket. Skriv dem i en kort `madplan/SETUP.md`:

1. **Log ind:** `npx wrangler login`
2. **Opret databasen:** `npx wrangler d1 create madplan` → kopiér det viste `database\_id` ind i `wrangler.toml` (se §10).
3. **Kør migration mod produktion:** `npx wrangler d1 migrations apply madplan --remote`
4. **Bind databasen i Pages (det produktions-deploys bruger):** Cloudflare-dashboard → Workers \& Pages → vælg Pages-projektet → **Settings → Bindings → Add → D1 database** → variabelnavn **`DB`** → vælg databasen `madplan` → Deploy.
5. **Push til GitHub** → Pages bygger og udgiver. `/madplan` er nu live, og Functions har `env.DB`.

   **Lokal udvikling:**

   ```sh
npx wrangler d1 migrations apply madplan --local
npx wrangler pages dev <output-mappe> --d1 DB=madplan --compatibility-date=2026-06-01
# åbn http://localhost:8788/madplan
# inspicér lokalt: npx wrangler d1 execute madplan --local --command "SELECT \* FROM meal\_plan"
```

   \---

   ## 10\. `wrangler.toml`

   Hold den minimal. **Tilføj `pages\_build\_output\_dir` og evt. byggenøgler kun, hvis de matcher projektets nuværende Pages-opsætning** — ellers risikerer du at ændre, hvordan den eksisterende side bygges. D1-bindingen herunder bruges til lokal udvikling; produktionsbindingen sættes i dashboardet (§9.4).

   ```toml
name = "<eksisterende-pages-projektnavn>"
compatibility\_date = "2026-06-01"
# pages\_build\_output\_dir = "<sæt KUN hvis det matcher nuværende build-output>"

\[\[d1\_databases]]
binding = "DB"
database\_name = "madplan"
database\_id = "<fra wrangler d1 create>"
```

   `database\_id` er **ikke** hemmeligt og må gerne committes. Commit **aldrig** API-tokens eller andre hemmeligheder. Tilføj **ikke** `nodejs\_compat` eller andre compatibility-flag (ikke nødvendigt her).

   \---

   ## 11\. Adgangsbeskyttelse (stærkt anbefalet — og gratis)

   En familie-madplan bør ikke kunne redigeres af hele internettet. Den reneste gratis løsning er **Cloudflare Access (Zero Trust)**, der er gratis for op til 50 brugere:

* Dashboard → **Zero Trust → Access → Applications → Add a self-hosted application** for domænet, med **path** `/madplan\*` (og `/api/\*`).
* Policy: tillad jeres e-mailadresser (one-time PIN på mail, eller Google-login).

  Appen fungerer også uden dette (blot ubeskyttet). Implementér ikke selv login-logik medmindre Access fravælges; i så fald er et simpelt fælles-kodeord gemt som Pages-miljøvariabel og tjekket i skrive-endpoints et acceptabelt minimum. Marker dette som valgfrit, men anbefal Access.

  \---

  ## 12\. Definition of done (acceptkriterier)

* \[ ] `/madplan` viser ugevisning med "I dag" øverst, klikbare dage, retter-bibliotek og indkøbsliste — uændret design ift. den vedhæftede fil.
* \[ ] Data persisteres i D1: tilføj/redigér en ret på en dag → genindlæs siden → ændringen er der. To forskellige enheder ser **samme** madplan.
* \[ ] Alle API-ruter virker med korrekte statuskoder og validering; alle D1-kald bruger prepared statements med `?`-parametre.
* \[ ] PWA: kan "Føj til hjemmeskærm" på mobil; selve siden åbner offline (data kræver netværk).
* \[ ] Den eksisterende side er fuldstændig uændret og deployer som før.
* \[ ] Intet kræver betaling: kun Pages + Pages Functions + D1, ingen Workers Paid-opgradering, intet betalingskort, ingen forbudte tjenester.
* \[ ] `migrations/0001\_init.sql` og `madplan/SETUP.md` er på plads med de manuelle trin.

  \---

  ## 13\. Det du IKKE skal gøre

* Ingen betalte tjenester eller kontoopgradering. Ingen R2/KV/Durable Objects/Hyperdrive m.fl.
* Rør ikke den eksisterende sides indhold, build eller ruter (ud over et diskret link til `/madplan`).
* Brug **ikke** `localStorage`/`sessionStorage` til data — al delt data går gennem API'et og D1.
* Indfør ikke et tungt framework eller build-trin, hvis siden er plain statisk HTML.
* Ingen `SELECT \*`-fuldscanninger; ingen strengsammensætning af brugerinput i SQL.
* Commit ingen hemmeligheder.

