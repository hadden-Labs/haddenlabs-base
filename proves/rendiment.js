/**
 * Banc de rendiment.
 *
 *   node proves/rendiment.js
 *
 * A Apps Script el temps se'n va en dos llocs: cada lectura o escriptura del
 * full és una anada i tornada als servidors de Google (desenes de mil·lisegons
 * cadascuna), i cada google.script.run és una execució sencera del servidor.
 * El codi en si no és el coll d'ampolla gairebé mai.
 *
 * Això carrega els serveis DE DEBÒ amb un full de mentida i compta les
 * operacions de full que fa cada punt d'entrada. No mesura mil·lisegons —que
 * dependrien d'aquesta màquina i no volen dir res— sinó anades i tornades, que
 * és el que de debò es paga.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');

// ---------------------------------------------------------------- comptadors
const comptes = { lectures: 0, escriptures: 0 };
function zero() { comptes.lectures = 0; comptes.escriptures = 0; }

// ------------------------------------------------------------- full de mentida
function fullFals(taules) {
  const fulles = {};
  for (const nom of Object.keys(taules)) fulles[nom] = fullaFalsa(nom, taules[nom]);

  return {
    getSheetByName: n => fulles[n] || null,
    getSpreadsheetTimeZone: () => 'Europe/Madrid',
    getId: () => 'FULL_FALS',
    getName: () => 'proves',
    insertSheet: n => (fulles[n] = fullaFalsa(n, [[]])),
    getSheets: () => Object.values(fulles)
  };
}

function fullaFalsa(nom, files) {
  const d = files.map(f => f.slice());
  const sh = {
    _nom: nom,
    _d: d,
    getDataRange: () => ({ getValues: () => { comptes.lectures++; return d.map(f => f.slice()); } }),
    getLastRow: () => d.length,
    getLastColumn: () => (d[0] ? d[0].length : 0),
    appendRow: f => { comptes.escriptures++; d.push(f.slice()); },
    getRange: (fila, col, nf, nc) => ({
      getValues: () => {
        comptes.lectures++;
        const out = [];
        for (let i = 0; i < (nf || 1); i++) {
          out.push((d[fila - 1 + i] || []).slice(col - 1, col - 1 + (nc || 1)));
        }
        return out;
      },
      setValue: v => { comptes.escriptures++; (d[fila - 1] = d[fila - 1] || [])[col - 1] = v; },
      setValues: vs => {
        comptes.escriptures++;
        vs.forEach((f, i) => {
          d[fila - 1 + i] = d[fila - 1 + i] || [];
          f.forEach((v, j) => { d[fila - 1 + i][col - 1 + j] = v; });
        });
      },
      clearContent: () => { comptes.escriptures++; },
      setFontWeight: () => sh, setBackground: () => sh, setFontColor: () => sh, setValue2: () => sh
    }),
    setFrozenRows: () => sh,
    autoResizeColumns: () => sh,
    deleteRow: i => { comptes.escriptures++; d.splice(i - 1, 1); }
  };
  return sh;
}

// ------------------------------------------------------------------ fixture
//
// Un full amb dades plausibles. Creix-lo a mesura que creixi l'app: mesurar
// sobre tres files no diu res, perquè el cost de llegir una fulla no depèn de
// quantes files té sinó de quantes VEGADES la llegeixes.
// Relatiu a AVUI, mai una data clavada: un fixture amb la data escrita a mà
// envelleix i un dia la sessió de prova neix caducada, que és un error que
// costa de veure perquè sembla un problema del codi i és del fixture.
const ARA = new Date();

function fixture() {
  const usuaris = [['U-000001', 'Admin', 'a@x.cat', '1', 'h', 's', true, ARA]];
  for (let i = 2; i <= 12; i++) {
    usuaris.push(['U-0000' + String(i).padStart(2, '0'), 'Usuari ' + i,
                  'u' + i + '@x.cat', '2', 'h', 's', true, ARA]);
  }

  const exemples = [];
  for (let i = 1; i <= 60; i++) {
    exemples.push(['EX-' + String(i).padStart(6, '0'), 'Element ' + i, '',
                   'U-0000' + String((i % 11) + 2).padStart(2, '0'),
                   new Date(ARA.getTime() - i * 86400000)]);
  }

  return {
    CONFIG:   [['clau', 'valor'], ['NOM_APP', 'Proves']],
    USUARIS:  [['id_usuari', 'nom', 'email', 'id_rol', 'hash', 'salt', 'actiu', 'ultim_acces'], ...usuaris],
    ROLS:     [['id_rol', 'nom_rol', 'descripcio'], ['1', 'Administrador', ''], ['2', 'Usuari', '']],
    PERMISOS: [['id_rol', 'modul', 'veure', 'crear', 'editar', 'eliminar', 'exportar', 'administrar']],
    MENUS:    [['clau_modul', 'etiqueta_ca', 'icona', 'ordre', 'actiu'],
               ['EXEMPLE', 'Exemple', 'llista', 10, true]],
    SESSIONS: [['token', 'id_usuari', 'creat', 'expira'],
               ['T', 'U-000001', ARA, new Date(ARA.getTime() + 86400000)]],
    RESETS:   [['token', 'id_usuari', 'creat', 'expira', 'usat']],
    EXEMPLES: [['id_exemple', 'titol', 'descripcio', 'id_usuari', 'creat'], ...exemples]
  };
}

function carregar() {
  const taules = fixture();
  const ss = fullFals(taules);
  const cau = {};

  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({
      _tot: cau,
      get: k => (k in cau ? cau[k] : null),
      put: (k, v) => { cau[k] = v; },
      remove: k => { delete cau[k]; },
      removeAll: ks => ks.forEach(k => delete cau[k])
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'FULL_FALS', setProperty() {} }) },
    Utilities: {
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
      computeDigest: (a, v) => Array.from(String(v)).map(c => c.charCodeAt(0) & 255),
      DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
      formatDate: (d, tz, f) => {
        const p = n => String(n).padStart(2, '0');
        if (f === 'HH:mm') return p(d.getHours()) + ':' + p(d.getMinutes());
        if (f === 'yyyy-MM-dd') return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
        if (f === 'dd/MM/yyyy') return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
        return d.toISOString();
      }
    },
    Logger: { log() {} },
    MailApp: { sendEmail() {} },
    ScriptApp: { getService: () => ({ getUrl: () => 'http://x' }) },
    HtmlService: {}, Session: {}, console
  };
  vm.createContext(ctx);

  for (const f of fs.readdirSync(SRC).filter(n => n.endsWith('.js'))) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  // Permisos reals a la fulla, com els deixa aplicarPermisosPerDefecte().
  // S'escriu a la fulla ja creada i no al fixture: fullaFalsa en fa una còpia,
  // així que tocar el fixture després no arribaria enlloc.
  const ACCIONS = ['veure','crear','editar','eliminar','exportar','administrar'];
  ctx._construirPermisos_().forEach(d =>
    ss.getSheetByName('PERMISOS')._d.push([d.rol, d.modul, ...ACCIONS.map(a => !!d.p[a])]));
  return ctx;
}

// ----------------------------------------------------------------------- mides
const ctx = carregar();

/** Buida el cau que sobreviu entre peticions (sessions, permisos, menús). */
function buidarCauGlobal() {
  const c = ctx.CacheService.getScriptCache();
  if (c._tot) Object.keys(c._tot).forEach(k => delete c._tot[k]);
}

/**
 * Es mesuren ESCENARIS, no funcions soltes.
 *
 * El que nota algú no és el cost d'una crida sinó el d'una acció sencera:
 * obrir l'app, desar una cosa. Cada `crida()` d'un escenari és una anada i
 * tornada, perquè a Apps Script cada google.script.run és una execució
 * completa del servidor.
 *
 * "Fred" és la primera vegada, amb el cau buit. "Calent" és el cas normal:
 * algú que ja té la sessió oberta i fa una segona cosa. Mira sempre el calent.
 */
const escenaris = [
  ['obrir l\'app', (crida) => {
    crida(() => ctx.obtenirContextInicial('T'));
  }],
  ['llistar', (crida) => {
    crida(() => ctx.llistarExemples('T'));
  }],
  ['crear un element', (crida) => {
    crida(() => ctx.crearExemple('T', { titol: 'Nou' }));
  }],
  ['esborrar-ne un', (crida) => {
    crida(() => ctx.esborrarExemple('T', 'EX-000001'));
  }]
];

// Amb el `crida` real: compta anades i tornades i reinicia la memòria per
// execució, que és el que passa de debò entre dues peticions.
function correr(fn, fred) {
  if (fred) { buidarCauGlobal(); }
  zero();
  let anades = 0;
  fn((f) => { anades++; ctx._invalidarCauFulla_(); f(); });
  return { anades, ops: comptes.lectures + comptes.escriptures };
}

console.log('\n  El que costa cada acció  (el que compta és el CALENT)\n');
console.log('  ' + 'acció'.padEnd(24) + 'anades i tornades'.padEnd(20) + 'operacions de full');
console.log('  ' + ' '.repeat(24) + 'fred'.padEnd(10) + 'calent'.padEnd(10) + 'fred'.padEnd(8) + 'calent');
console.log('  ' + '-'.repeat(64));

let totalAnades = 0, totalOps = 0;
for (const [nom, fn] of escenaris) {
  const fred = correr(fn, true);
  const calent = correr(fn, false);
  totalAnades += calent.anades; totalOps += calent.ops;
  console.log('  ' + nom.padEnd(24) +
    String(fred.anades).padEnd(10) + String(calent.anades).padEnd(10) +
    String(fred.ops).padEnd(8) + String(calent.ops));
}
console.log('  ' + '-'.repeat(64));
console.log('  ' + 'TOTAL (calent)'.padEnd(24) + ' '.repeat(10) +
  String(totalAnades).padEnd(10) + ' '.repeat(8) + String(totalOps) + '\n');

// Sense llindar que falli: això és un termòmetre, no una prova. El que importa
// és la tendència entre dues sessions, no un número absolut. Apunta el total
// al CLAUDE.md quan el moguis, com fa CotxeFutbol.
