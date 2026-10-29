import fs from 'node:fs/promises';
import path from 'node:path';
const root = 'C:/Codex/oenskelandet';
const launcher = path.join(root, 'Start administration.cmd');
const backup = path.join(root, 'Start administration lokalt.cmd');
const url = 'https://wutborg.dk/oenskelandet/admin/';
const original = await fs.readFile(launcher, 'utf8');
if (!original.includes(url)) {
  try { await fs.writeFile(backup, original, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await fs.writeFile(launcher, '@echo off\r\nstart "" "' + url + '"\r\n');
}
await fs.writeFile(path.join(root, 'ONLINE-ADMINISTRATION.md'), `# Administration på nettet

Brug ${url}, eller dobbeltklik på **Start administration.cmd**. Du kan også bruge adressen på andre enheder. Log ind med Frederik.wutborg@live.dk og koden fra Cloudflare.

- **Gem kladde** gemmer arbejdet fælles på nettet, uden at besøgende ser ændringerne.
- **Forhåndsvis** viser den gemte kladde kun for administratoren.
- **Publicér på hjemmesiden** gør ændringerne synlige på https://wutborg.dk/oenskelandet/ med det samme.
- Billeder, PDF-filer og videoer kan uploades fra administrationen. Højst 100 MB pr. fil.
- Tidligere versioner kan indlæses som kladde under Historik. De seneste 50 versioner bevares.

Panelet **Forbrug og gratis grænser** viser denne løsnings forbrug og advarer ved 80 % af dens sikkerhedsgrænser. Systemet stopper ved 1 GB filer, 50.000 konservativt optalte filhandlinger pr. måned, 500.000 filvisninger pr. måned eller 1.000 gemninger pr. dag. Grænserne ligger under de relevante gratis kvoter. Måleren dækker kun denne løsning, ikke anden aktivitet på Cloudflare-kontoen.

Den oprindelige lokale version er bevaret. **Start administration lokalt.cmd** åbner den lokale kopi; ændringer i den kopi synkroniseres ikke automatisk til nettet. Det fælles indhold på nettet er nu den version, der skal redigeres.
`);
console.log('Online administration launcher installed; original local launcher preserved.');
