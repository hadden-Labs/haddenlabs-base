/**
 * =============================================================================
 *  Setup.js — Esquema de la base de dades i migracions
 *
 *  Res d'aquí s'executa sol. Cada funció `activarX()` es crida UN COP a mà des
 *  de l'editor d'Apps Script, i totes són:
 *
 *   - ADDITIVES: creen el que falti i no esborren ni modifiquen mai res que ja
 *     hi hagi. Es poden repetir sense por.
 *   - SILENCIOSES fins que s'executen: mentre no es criden, la peça nova no
 *     apareix enlloc i la resta de l'app funciona igual.
 *
 *  Aquesta és la part que MÉS s'oblida. Si un canvi de codi afegeix una fulla
 *  o una columna, cal dir-ho explícitament en tancar la sessió: el full no
 *  s'actualitza sol.
 * =============================================================================
 */

var PROP_ID_FULL = 'ID_FULL';

/** Enllaça aquest script amb un full concret (només per a scripts autònoms). */
function configurarFull(idFull) {
  PropertiesService.getScriptProperties().setProperty(PROP_ID_FULL, String(idFull).trim());
  return 'Full configurat: ' + idFull;
}

/** Diu quin full s'està fent servir i com s'ha trobat. Per diagnosticar. */
function quinFullFaServir() {
  var actiu = null;
  try { actiu = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  var id = PropertiesService.getScriptProperties().getProperty(PROP_ID_FULL);
  var ss = _ss_();
  var msg =
    'Full: ' + ss.getName() + '\n' +
    'Id:   ' + ss.getId() + '\n' +
    'Com:  ' + (actiu ? 'script lligat (getActiveSpreadsheet)' : 'per id desat a les propietats') + '\n' +
    'Propietat ID_FULL: ' + (id || '(no definida)');
  Logger.log(msg);
  return msg;
}


// -----------------------------------------------------------------------------
//  Esquema base
// -----------------------------------------------------------------------------

/**
 * Les fulles que necessita qualsevol app nascuda d'aquest esquelet.
 *
 * No hi ha cap fulla de negoci: aquesta és la infraestructura. El teu domini
 * afegeix les seves amb la seva pròpia `activarX()`.
 */
var ESQUEMA_BASE = {
  USUARIS:  ['id_usuari', 'nom', 'email', 'id_rol', 'hash', 'salt', 'actiu', 'ultim_acces'],
  ROLS:     ['id_rol', 'nom_rol', 'descripcio'],
  PERMISOS: ['id_rol', 'modul', 'veure', 'crear', 'editar', 'eliminar', 'exportar', 'administrar'],
  MENUS:    ['clau_modul', 'etiqueta_ca', 'icona', 'ordre', 'actiu'],
  SESSIONS: ['token', 'id_usuari', 'creat', 'expira'],
  CONFIG:   ['clau', 'valor']
};

// La fulla RESETS no és aquí a posta: la crea sola Auth.js el primer cop que
// algú demana un restabliment. No cal tenir-la si ningú no l'ha feta servir.

var ROLS_BASE = [
  ['1', 'Administrador', 'Ho pot tot'],
  ['2', 'Usuari', 'Accés normal']
];

/**
 * La matriu de permisos que el codi dona per bona.
 *
 * ⚠️ Aquesta matriu NO arriba sola al full. Després de tocar-la cal executar
 * `aplicarPermisosPerDefecte()` des de l'editor. Fa un upsert per (rol, mòdul):
 * no toca cap rol o mòdul que no surti aquí, però SÍ que sobreescriu els que hi
 * surten — si n'has ajustat algun a mà al full, el perdràs.
 */
function _construirPermisos_() {
  var tot = { veure: true, crear: true, editar: true, eliminar: true, exportar: true, administrar: true };
  var nomes_veure = { veure: true, crear: false, editar: false, eliminar: false, exportar: false, administrar: false };

  return [
    { rol: '1', modul: 'EXEMPLE', p: tot },
    { rol: '1', modul: 'USUARIS', p: tot },
    { rol: '2', modul: 'EXEMPLE', p: nomes_veure },
    { rol: '2', modul: 'USUARIS', p: { veure: false, crear: false, editar: false, eliminar: false, exportar: false, administrar: false } }
  ];
}

var MENUS_BASE = [
  // clau_modul, etiqueta, icona, ordre, actiu
  ['EXEMPLE', 'Exemple', 'llista', 10, true],
  ['USUARIS', 'Usuaris', 'persones', 90, true]
];


// -----------------------------------------------------------------------------
//  Arrencada
// -----------------------------------------------------------------------------

/**
 * Crea les fulles base i l'administrador inicial. Executar UN COP.
 * Segura de repetir: no esborra res.
 */
function crearFullIInicialitzar() {
  var ss = _ss_();
  var creades = [];

  Object.keys(ESQUEMA_BASE).forEach(function (nom) {
    if (_crearFullaSiFalta_(ss, nom, ESQUEMA_BASE[nom])) creades.push(nom);
  });

  _afegirFilesSiFalten_(ss, 'ROLS', 'id_rol', ROLS_BASE.map(function (r) {
    return { id_rol: r[0], nom_rol: r[1], descripcio: r[2] };
  }));

  aplicarPermisosPerDefecte();
  _aplicarMenusPerDefecte_(ss);

  _escriureConfig_(ss, 'NOM_APP', _llegirConfig_(ss, 'NOM_APP', 'La meva app'));

  var admin = _crearAdminSiCal_(ss);

  var msg = 'Fulles creades: ' + (creades.length ? creades.join(', ') : 'cap (ja hi eren)') +
            '\n' + admin;
  Logger.log(msg);
  return msg;
}

/** Crea l'administrador inicial si no hi ha cap usuari. Torna la contrasenya. */
function _crearAdminSiCal_(ss) {
  var usuaris = _objectes_('USUARIS');
  if (usuaris.length) return 'Ja hi havia usuaris: no s\'ha creat cap administrador.';

  var clau = Utilities.getUuid().slice(0, 12);
  var salt = Utilities.getUuid();
  _afegirAmbId_('USUARIS', 'id_usuari', 'U', {
    nom: 'Administrador',
    email: 'admin@example.com',
    id_rol: '1',
    hash: _hashContrasenya_(clau, salt),
    salt: salt,
    actiu: true,
    ultim_acces: ''
  });

  return 'ADMINISTRADOR CREAT\n' +
         '  correu:      admin@example.com   (canvia\'l des d\'Usuaris)\n' +
         '  contrasenya: ' + clau + '\n' +
         '  ⚠️ Apunta-te-la ARA: no torna a sortir enlloc.';
}

/** Escriu al full la matriu de permisos del codi. Upsert per (rol, mòdul). */
function aplicarPermisosPerDefecte() {
  var ss = _ss_();
  var sh = ss.getSheetByName('PERMISOS');
  if (!sh) throw new Error('Executa abans crearFullIInicialitzar().');

  var r = _llegir_('PERMISOS');
  var accions = ['veure', 'crear', 'editar', 'eliminar', 'exportar', 'administrar'];
  var existents = {};
  r.dades.forEach(function (fila, i) {
    existents[String(fila[r.mapa.id_rol]) + '|' + String(fila[r.mapa.modul])] = i + 2;
  });

  var nous = 0, actualitzats = 0;
  _construirPermisos_().forEach(function (def) {
    var clau = def.rol + '|' + def.modul;
    var parcial = {};
    accions.forEach(function (a) { parcial[a] = !!def.p[a]; });

    if (existents[clau]) {
      _actualitzar_('PERMISOS', existents[clau], parcial);
      actualitzats++;
    } else {
      parcial.id_rol = def.rol;
      parcial.modul = def.modul;
      sh.appendRow(r.cap.map(function (c) {
        return parcial.hasOwnProperty(c) ? parcial[c] : '';
      }));
      _invalidarCauFulla_('PERMISOS');
      r = _llegir_('PERMISOS');
      nous++;
    }
  });

  buidarCau();   // si no, el full diu una cosa i l'app en fa una altra 30 minuts
  var msg = 'Permisos: ' + nous + ' nous, ' + actualitzats + ' actualitzats. Cau buidat.';
  Logger.log(msg);
  return msg;
}

function _aplicarMenusPerDefecte_(ss) {
  _afegirFilesSiFalten_(ss, 'MENUS', 'clau_modul', MENUS_BASE.map(function (m) {
    return { clau_modul: m[0], etiqueta_ca: m[1], icona: m[2], ordre: m[3], actiu: m[4] };
  }));
  buidarCau();
}

/**
 * Ensenya els permisos i els menús REALS del full, i on no coincideixen amb el
 * codi. És la manera de confirmar que `aplicarPermisosPerDefecte()` hi ha
 * arribat: el full i el codi poden divergir en silenci durant mesos.
 */
function comprovarPermisosDelFull() {
  var accions = ['veure', 'crear', 'editar', 'eliminar', 'exportar', 'administrar'];
  var alFull = {};
  _objectes_('PERMISOS').forEach(function (f) {
    var o = {};
    accions.forEach(function (a) { o[a] = _bool_(f[a]); });
    alFull[String(f.id_rol) + '|' + String(f.modul)] = o;
  });

  var linies = [], diferencies = 0;
  _construirPermisos_().forEach(function (def) {
    var clau = def.rol + '|' + def.modul;
    var f = alFull[clau];
    if (!f) { linies.push('FALTA AL FULL  ' + clau); diferencies++; return; }
    var difs = accions.filter(function (a) { return !!def.p[a] !== f[a]; });
    if (difs.length) { linies.push('DIFEREIX       ' + clau + ' → ' + difs.join(', ')); diferencies++; }
    else linies.push('ok             ' + clau);
  });

  Object.keys(alFull).forEach(function (clau) {
    var alCodi = _construirPermisos_().some(function (d) { return d.rol + '|' + d.modul === clau; });
    if (!alCodi) linies.push('només al full  ' + clau + ' (no el toca aplicarPermisosPerDefecte)');
  });

  var msg = linies.join('\n') + '\n\n' +
    (diferencies ? diferencies + ' diferència(es): executa aplicarPermisosPerDefecte().'
                 : 'El full i el codi diuen el mateix.');
  Logger.log(msg);
  return msg;
}



// -----------------------------------------------------------------------------
//  Activacions per peça
//
//  TOTES les `activarX()` viuen aquí i no al servei del seu mòdul. Dos motius:
//
//   1. Es busquen en un sol lloc quan cal recordar què queda per executar.
//   2. A Apps Script una funció que has de poder executar des de l'editor ha
//      de ser PÚBLICA (amb sufix _ no surt ni al desplegable de Run), i tota
//      funció pública és invocable des del navegador per qualsevol que tingui
//      la pàgina oberta. Tenir-les juntes recorda la regla que se'n deriva:
//      **una activarX() ha de ser inofensiva si algú la crida des de fora** —
//      additiva, repetible, i que no retorni res que no es pugui ensenyar.
//      Res que esborri, reveli o reconfiguri va en una d'aquestes.
//
//  (Per això `_crearAdminSiCal_`, que retorna una contrasenya, porta sufix _ i
//  només la crida `crearFullIInicialitzar` des de dins.)
// -----------------------------------------------------------------------------

/** Crea la fulla del mòdul d'exemple. Executar UN COP. Additiva i repetible. */
function activarExemple() {
  var creada = _crearFullaSiFalta_(_ss_(), FULLA_EXEMPLE,
    ['id_exemple', 'titol', 'descripcio', 'id_usuari', 'creat']);
  var msg = creada ? 'Fulla ' + FULLA_EXEMPLE + ' creada.'
                   : 'La fulla ' + FULLA_EXEMPLE + ' ja hi era: res a fer.';
  Logger.log(msg);
  return msg;
}

// -----------------------------------------------------------------------------
//  Helpers de migració additiva — reutilitza'ls per a cada peça nova
// -----------------------------------------------------------------------------

/** Crea la fulla amb la seva capçalera si no existeix. True si l'ha creada. */
function _crearFullaSiFalta_(ss, nom, capcalera) {
  if (ss.getSheetByName(nom)) return false;
  var sh = ss.insertSheet(nom);
  sh.getRange(1, 1, 1, capcalera.length).setValues([capcalera]).setFontWeight('bold');
  sh.setFrozenRows(1);
  _invalidarCauFulla_(nom);
  return true;
}

/** Afegeix una columna al final si encara no hi és. True si l'ha afegida. */
function _afegirColumnaSiFalta_(ss, nomFulla, nomColumna, valorPerDefecte) {
  var sh = ss.getSheetByName(nomFulla);
  if (!sh) return false;

  var cap = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  if (cap.indexOf(nomColumna) !== -1) return false;

  var col = cap.length + 1;
  sh.getRange(1, col).setValue(nomColumna).setFontWeight('bold');

  if (valorPerDefecte !== undefined && sh.getLastRow() > 1) {
    var n = sh.getLastRow() - 1;
    var valors = [];
    for (var i = 0; i < n; i++) valors.push([valorPerDefecte]);
    sh.getRange(2, col, n, 1).setValues(valors);
  }
  _invalidarCauFulla_(nomFulla);
  return true;
}

/** Afegeix les files que falten, identificades per una columna clau. */
function _afegirFilesSiFalten_(ss, nomFulla, columnaClau, files) {
  var sh = ss.getSheetByName(nomFulla);
  if (!sh) return 0;

  var r = _llegir_(nomFulla);
  var ja = {};
  r.dades.forEach(function (f) { ja[String(f[r.mapa[columnaClau]])] = true; });

  var afegides = 0;
  files.forEach(function (obj) {
    if (ja[String(obj[columnaClau])]) return;
    sh.appendRow(r.cap.map(function (c) { return obj.hasOwnProperty(c) ? obj[c] : ''; }));
    afegides++;
  });

  if (afegides) _invalidarCauFulla_(nomFulla);
  return afegides;
}
