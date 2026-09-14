/**
 * proves/sincronia.js — què hi ha a l'editor d'Apps Script que no és aquí.
 *
 *   node proves/sincronia.js
 *
 * Es passa al COMENÇAR, abans de tocar res, i altra vegada abans de
 * `clasp push`. No escriu res: baixa el projecte remot a un directori
 * temporal i el compara amb `src/`.
 *
 * Per què existeix: `clasp push` envia la llista SENCERA de fitxers i
 * substitueix la de l'editor. Si algú ha tocat el codi des del navegador
 * —que a Apps Script és el camí natural, no una excepció— aquell canvi
 * desapareix sense preguntar i sense quedar enlloc. Git no en sap res:
 * `git status` surt net perquè el canvi mai va arribar a git.
 *
 * L'esquelet dona per fet que git va primer perquè el projecte neix d'un
 * `clasp create` amb l'script buit. En un projecte ADOPTAT —l'script ja
 * existia i tenia codi— això no és cert, i llavors aquesta comprovació és
 * l'única cosa que hi ha entre un `clasp push` i la feina d'algú.
 *
 * Sortida:  0 coincideixen · 1 divergeixen · 2 no s'ha pogut comprovar
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ARREL = path.join(__dirname, '..');

function plegar(codi, motiu, consell) {
  console.log('\n  ' + motiu);
  if (consell) console.log('  ' + consell);
  console.log('');
  process.exit(codi);
}

// --- 1) On és l'script remot ---
let projecte;
try {
  projecte = JSON.parse(fs.readFileSync(path.join(ARREL, '.clasp.json'), 'utf8'));
} catch (e) {
  plegar(2, 'No hi ha .clasp.json: no sé quin script remot mirar.',
            'Recupera l\'scriptId del CLAUDE.md i fes `clasp clone-script <id> --rootDir src`.');
}
const scriptId = projecte.scriptId;
const rootDir = path.join(ARREL, projecte.rootDir || 'src');
if (!scriptId) plegar(2, '.clasp.json no porta scriptId.');
if (!fs.existsSync(rootDir)) plegar(2, 'No trobo el directori ' + rootDir + '.');

// --- 2) Baixar el remot a un lloc que no sigui el projecte ---
// MAI a src/: `clasp pull` sobreescriu, i si aquesta comprovació destrueix
// el que ha de protegir no serveix de res.
const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'sincronia-'));
const remot = path.join(temporal, 'remot');
fs.mkdirSync(remot);
fs.writeFileSync(path.join(temporal, '.clasp.json'),
  JSON.stringify({ scriptId: scriptId, rootDir: 'remot' }));

const r = spawnSync('clasp', ['pull', '-P', temporal], { encoding: 'utf8' });
if (r.error && r.error.code === 'ENOENT') {
  plegar(2, 'No hi ha `clasp` instal·lat.', 'npm i -g @google/clasp');
}
if (r.status !== 0) {
  const raó = ((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(-3).join('\n  ');
  plegar(2, 'clasp no ha pogut baixar el projecte:\n  ' + raó,
            'Si és d\'autorització: `echo "$CLASPRC_B64" | base64 -d > ~/.clasprc.json`, o `clasp login`.');
}

// --- 3) Comparar ---
// Un fitxer de codi és .js aquí i .gs a l'editor segons com s'hagi configurat:
// es comparen per nom, no per extensió, o surten diferències que no ho són.
const TIPUS = { '.html': 'html', '.json': 'json', '.js': 'codi', '.gs': 'codi' };

function inventari(dir) {
  const m = new Map();
  for (const n of fs.readdirSync(dir)) {
    const ext = path.extname(n);
    if (!TIPUS[ext]) continue;
    m.set(path.basename(n, ext) + ' (' + TIPUS[ext] + ')',
          { nom: n, text: fs.readFileSync(path.join(dir, n), 'utf8') });
  }
  return m;
}

const net = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

// El servidor retorna el JSON amb el seu format. Reordenar-lo no és un canvi.
function canonic(s) {
  const ordena = (v) => Array.isArray(v) ? v.map(ordena)
    : (v && typeof v === 'object'
        ? Object.keys(v).sort().reduce((o, k) => (o[k] = ordena(v[k]), o), {})
        : v);
  try { return JSON.stringify(ordena(JSON.parse(s))); } catch (e) { return null; }
}

const aqui = inventari(rootDir);
const alla = inventari(remot);

console.log('\n  Sincronia amb Apps Script');
console.log('  script ' + scriptId.slice(0, 8) + '…' + scriptId.slice(-6) + '\n');

const avisos = [];
for (const clau of new Set([...alla.keys(), ...aqui.keys()].sort())) {
  const a = aqui.get(clau), b = alla.get(clau);
  const nom = (b || a).nom;

  if (!a) {
    avisos.push(clau);
    console.log('  NOMÉS A GAS  ' + nom + '   — un `clasp push` l\'esborraria');
    continue;
  }
  if (!b) {
    console.log('  només a git  ' + nom + '   — un `clasp push` el crearia');
    continue;
  }
  if (net(a.text) === net(b.text)) { console.log('  ok           ' + nom); continue; }

  const ca = canonic(a.text), cb = canonic(b.text);
  if (ca && ca === cb) { console.log('  ok           ' + nom + '   (només canvia el format)'); continue; }

  const la = net(a.text).split('\n'), lb = net(b.text).split('\n');
  let n = Math.abs(la.length - lb.length);
  for (let i = 0; i < Math.min(la.length, lb.length); i++) if (la[i] !== lb[i]) n++;
  avisos.push(clau);
  console.log('  DIFEREIX     ' + nom + '   — ' + n + (n === 1 ? ' línia' : ' línies') + '; un `clasp push` hi escriuria la versió d\'aquí');
}

fs.rmSync(temporal, { recursive: true, force: true });

if (!avisos.length) {
  console.log('\n  Git i l\'editor diuen el mateix.\n');
  process.exit(0);
}
console.log('\n  ' + avisos.length + (avisos.length === 1 ? ' diferència' : ' diferències')
  + ' que un `clasp push` es carregaria.');
console.log('  Mira-les abans de publicar. Per portar el que hi ha a l\'editor cap aquí:');
console.log('  `clasp pull` i després mirar-t\'ho amb `git diff`.\n');
process.exit(1);
