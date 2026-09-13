/**
 * Comprovació de la matriu de permisos. Corre en aquest ordinador, sense
 * desplegar res ni obrir el full.
 *
 *   node proves/permisos.js
 *
 * Llegeix del codi dues coses i les creua:
 *  - quin permís exigeix cada funció pública (_comprovarAcces_ a src/*.js),
 *  - què concedeix cada rol (_construirPermisos_ a Setup.js).
 *
 * Serveix per veure d'un cop d'ull què pot fer cada rol de debò, sense haver
 * d'obrir l'app amb cinc usuaris diferents. Els errors de permisos són
 * silenciosos: o tanques la porta a qui la necessita, o l'obres a qui no.
 */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

// --- 1) Què exigeix cada funció ---
const FITXERS = fs.readdirSync(SRC).filter(n => n.endsWith('.js'));

// Dues passades: les constants MODUL_X es declaren en fitxers que poden venir
// després dels que les fan servir (MODUL_ENTRENAMENTS viu a RodaService.js i el
// fa servir EntrenamentsService.js), així que primer es recullen totes.
const MODULS = {};
for (const f of FITXERS) {
  const txt = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const m of txt.matchAll(/^var (MODUL_\w+) = '(\w+)';/gm)) MODULS[m[1]] = m[2];
}

const exigeix = [];                      // {fn, modul, accio, extra}
for (const f of FITXERS) {
  const txt = fs.readFileSync(path.join(SRC, f), 'utf8');
  let fnActual = null;
  for (const linia of txt.split('\n')) {
    const fn = linia.match(/^function ([a-zA-Z]\w*)\(/);
    if (fn) fnActual = fn[1];
    // L'acció pot ser literal ('editar') o calculada (dades.id ? … : …).
    // Les calculades s'han de veure igualment: un endpoint que no surt a la
    // taula sembla que no comprova res, que és just el contrari del que passa.
    // Ha de ser una CRIDA, no la declaració de _comprovarAcces_ (a
    // Permissions.js), que si no s'atribueix a la funció pública anterior.
    const ca = /^function /.test(linia)
      ? null
      : linia.match(/_comprovarAcces_\(token,\s*(\w+),\s*([^)]+)\)/);
    if (ca && fnActual && !fnActual.startsWith('_')) {
      const cru = ca[2].trim();
      const lit = cru.match(/^'(\w+)'$/);
      const accions = lit ? [lit[1]] : (cru.match(/'(\w+)'/g) || []).map(x => x.slice(1, -1));
      exigeix.push({
        fn: fnActual, modul: MODULS[ca[1]] || ca[1],
        accio: accions.join('/') || '?', dinamica: !lit, fitxer: f
      });
    }
  }
}
// Guardes d'administrar dins del cos. Només compten les de primer nivell
// (dos espais d'indentació): les que estan dins d'un if només s'apliquen a un
// cas concret —crearVehicle només demana administrar per posar-lo a nom d'un
// altre— i marcar-les aquí donaria una foto més restrictiva que la real.
for (const f of FITXERS) {
  const txt = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const b of txt.split(/^function /m)) {
    const nom = (b.match(/^([a-zA-Z]\w*)\(/) || [])[1];
    if (!nom) continue;
    const e = exigeix.find(x => x.fn === nom);
    if (e && /^ {2}if \(!_potAdministrar_\(/m.test(b)) e.extra = 'administrar';
  }
}

// --- 2) Què concedeix cada rol ---
// Es llegeix _construirPermisos_() del codi, no del full: aquesta prova diu
// què DIU EL CODI. Per saber què diu el full hi ha comprovarPermisosDelFull()
// des de l'editor d'Apps Script, i els dos poden divergir en silenci.
const setup = fs.readFileSync(path.join(SRC, 'Setup.js'), 'utf8');
const cos = setup.slice(setup.indexOf('function _construirPermisos_'));
eval(cos.slice(0, cos.indexOf('\n}\n') + 3));

// Els noms dels rols surten de ROLS_BASE al mateix Setup.js, perquè afegir un
// rol no obligui a tocar aquesta prova.
const rolsBase = setup.slice(setup.indexOf('var ROLS_BASE'));
eval('var ' + rolsBase.slice(rolsBase.indexOf('ROLS_BASE'), rolsBase.indexOf('];') + 2));
const ROLS = Object.fromEntries(ROLS_BASE.map(r => [r[0], r[1]]));

const ACCIONS = ['veure','crear','editar','eliminar','exportar','administrar'];
const concedeix = {};
for (const d of _construirPermisos_()) {
  (concedeix[d.rol] = concedeix[d.rol] || {})[d.modul] =
    Object.fromEntries(ACCIONS.map(a => [a, !!d.p[a]]));
}

function pot(rol, modul, accio) {
  return !!(concedeix[rol] && concedeix[rol][modul] && concedeix[rol][modul][accio]);
}

// --- 3) La taula ---
exigeix.sort((a,b) => (a.modul+a.fn).localeCompare(b.modul+b.fn));
const cols = Object.keys(ROLS);
console.log('\n  Qui pot cridar què  (· = no)\n');
console.log('  ' + 'funció'.padEnd(28) + 'exigeix'.padEnd(26) +
  cols.map(r => ROLS[r].slice(0,6).padEnd(8)).join(''));
console.log('  ' + '-'.repeat(28+26+cols.length*8));
for (const e of exigeix) {
  const req = e.modul + ':' + e.accio + (e.extra ? '+admin' : '');
  const cel = cols.map(r => {
    const alguna = e.accio.split('/').some(a => pot(r, e.modul, a));
    const ok = alguna && (!e.extra || pot(r, e.modul, 'administrar'));
    return (ok ? 'sí' : '·').padEnd(8);
  }).join('');
  console.log('  ' + e.fn.padEnd(28) + req.padEnd(26) + cel);
}

// --- 4) Cap servei pot tenir una funció pública sense comprovar l'accés ---
// És l'error que no es veu: una funció exposada a google.script.run sense
// _comprovarAcces_ la pot cridar qualsevol amb la pàgina oberta.
const SENSE_GUARDA = [];
for (const f of FITXERS.filter(n => n.endsWith('Service.js'))) {
  const txt = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const m of txt.matchAll(/^function ([a-zA-Z]\w*)\(/gm)) {
    if (!exigeix.some(e => e.fn === m[1])) SENSE_GUARDA.push(f + ' :: ' + m[1]);
  }
}

// --- 5) El que ha de passar sí o sí ---
//
// Aquí hi van les afirmacions del TEU projecte: "una família no veu el
// balanç", "un convidat no esborra res". Escriu-les en positiu i en negatiu:
// una matriu de permisos es trenca tant obrint de més com tancant de més.
//
// Les tres primeres no les esborris: valen per a qualsevol projecte.
console.log('\n  Comprovacions\n');
const esperat = [
  ['cap funció pública sense guarda',
     SENSE_GUARDA.length === 0, true],
  ['l\'administrador ho pot tot al seu mòdul',
     ACCIONS.every(a => pot('1','EXEMPLE',a)), true],
  ['un usuari normal no pot esborrar',
     pot('2','EXEMPLE','eliminar'), false],
];
if (SENSE_GUARDA.length) console.log('\n  SENSE _comprovarAcces_:\n' + SENSE_GUARDA.map(x => '    ' + x).join('\n'));
let ok = 0;
for (const [q, real, esp] of esperat) {
  const b = real === esp;
  if (b) ok++;
  console.log('  ' + (b ? 'ok   ' : 'FALLA') + ' ' + q + (b ? '' : `   (és ${real}, esperava ${esp})`));
}
console.log(`\n  ${ok}/${esperat.length}\n`);
process.exit(ok === esperat.length ? 0 : 1);
