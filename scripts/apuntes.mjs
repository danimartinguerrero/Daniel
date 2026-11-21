// Brings Daniel's notes and lab reports from the public repository danimartinguerrero/apuntes into the
// site: the PDFs are copied to public/apuntes/ (not committed; every build fetches them again), and
// src/data/apuntes.json lists each one with its subject, kind and page count. A PDF added to that
// repository shows up on the site at the next build.
// With --soft (as `npm run build` runs it) a failure is reported and the saved list is kept: the links
// then point at the PDFs on GitHub.
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const REPO = 'https://github.com/danimartinguerrero/apuntes';
const CACHE = new URL('../.cache/apuntes/', import.meta.url).pathname;
const OUT = new URL('../public/apuntes/', import.meta.url).pathname;
const DATA = new URL('../src/data/apuntes.json', import.meta.url);
const soft = process.argv.includes('--soft');

// Subject by the file's name; the order matters (first match wins).
const SUBJECTS = [
  [/p[eé]ndulos|momento de inercia|ondas estacionarias|quincke|doppler/i, 'Laboratorio de Mecánica y Ondas'],
  [/gas perfecto/i, 'Termodinámica I'],
  [/mec[aá]nica i\b/i, 'Mecánica I'],
  [/electromagnetismo|electrost[aá]tica|multipolar|conductores|diel[eé]ctricos/i, 'Electromagnetismo I'],
  [/ecuaciones diferenciales|ode\b|green|serie entera|sturm/i, 'Ecuaciones Diferenciales'],
];
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tidy = (name) => name
  .replace(/\.pdf$/i, '')
  .replace(/\s*\((oscuro)\)/i, '')
  .replace(/\.?\s*Informe definitivo/i, '')
  .replace(/\s*\(([^)]*Daniel Mart[ií]n[^)]*)\)/i, '')
  .replace(/^Informe de la pr[aá]ctica (\d+)\.\s*/i, 'Práctica $1. ')
  .trim();

async function sync() {
  if (existsSync(`${CACHE}.git`)) execFileSync('git', ['-C', CACHE, 'pull', '--ff-only', '-q'], { stdio: 'inherit' });
  else execFileSync('git', ['clone', '--depth', '1', '-q', REPO, CACHE], { stdio: 'inherit' });
  await mkdir(OUT, { recursive: true });
  const files = (await readdir(CACHE)).filter((f) => f.toLowerCase().endsWith('.pdf')).sort((a, b) => a.localeCompare(b, 'es'));
  const items = [];
  for (const file of files) {
    const s = slug(file.replace(/\.pdf$/i, ''));
    await copyFile(`${CACHE}${file}`, `${OUT}${s}.pdf`);
    const bytes = await readFile(`${CACHE}${file}`);
    let pages = null;
    try { pages = (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount(); } catch { /* left out */ }
    const coauthor = file.match(/\(([^)]*Daniel Mart[ií]n[^)]*)\)/i)?.[1] ?? null;
    items.push({
      file, slug: s, title: tidy(file),
      kind: /informe|pr[aá]ctica \d/i.test(file) ? 'informe' : 'apuntes',
      subject: SUBJECTS.find(([re]) => re.test(file))?.[1] ?? 'Otros',
      dark: /oscuro/i.test(file),
      coauthor,
      pages, kb: Math.round((await stat(`${CACHE}${file}`)).size / 1024),
      github: `${REPO}/blob/main/${encodeURIComponent(file)}`,
    });
  }
  // Drop copies of files that left the repository.
  for (const f of await readdir(OUT)) if (!items.some((i) => `${i.slug}.pdf` === f)) await rm(`${OUT}${f}`);
  await writeFile(DATA, `${JSON.stringify({ repo: REPO, fetched: new Date().toISOString().slice(0, 10), items }, null, 2)}\n`);
  console.log(`${items.length} PDFs from ${REPO}`);
}

try {
  await sync();
} catch (err) {
  if (!soft) throw err;
  console.warn(`Notes not synced (${err.message}); building with the saved list, linking to GitHub.`);
}
