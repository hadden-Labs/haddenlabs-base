/**
 * =============================================================================
 *  Permissions.js — Permisos i construcció del menú
 *
 *  El token es valida SEMPRE en viu (Auth.js). Només es cauen la matriu de
 *  permisos i el menú, que canvien poc. Per refrescar-los: buidarCau().
 *
 *  Dos nivells de control, i tots dos són necessaris:
 *   1. PERMISOS (per rol)  — què pot fer un rol amb un mòdul. Editable al full.
 *   2. Propietat (per fila) — de qui és aquella fila. Viu al servei de cada
 *      mòdul, perquè algú ha de poder gestionar EL SEU registre i no el del
 *      veí encara que tots dos tinguin el mateix rol. El rol sol NO n'hi ha
 *      prou, i oblidar-ho és la limitació que arrossega IntranetSimpatica.
 * =============================================================================
 */

var CAU_SEGONS = 1800;                 // 30 minuts
var CLAU_CAU_PERMISOS = 'permisos_v1';
var CLAU_CAU_MENUS = 'menus_v1';


// -----------------------------------------------------------------------------
//  API pública (client)
// -----------------------------------------------------------------------------

/** Usuari + menú + config, en una sola crida (per carregar l'app). */
function obtenirContextInicial(token) {
  var val = validarToken(token);            // viu, definit a Auth.js
  if (!val.ok) return { ok: false };
  var ss = _ss_();
  var menu = _menuPerRol_(ss, val.usuari.id_rol);

  // Acoblament deliberat, i val la pena entendre'l abans de treure'l.
  //
  // Obrir l'app eren tres crides en cadena (context → catàlegs → llista). A
  // Apps Script cada crida és una execució sencera del servidor —arrencar el
  // runtime, validar la sessió, llegir el full—, o sigui tres esperes des del
  // mòbil. Amb això n'hi ha prou amb una.
  //
  // Per no haver de tocar aquest fitxer cada cop que canvia la pantalla
  // d'arribada, el que retorna surt d'una funció opcional que defineix cada
  // projecte: _dadesInicials_(token, menu). Si no existeix, no passa res.
  var inici = null;
  if (typeof _dadesInicials_ === 'function') {
    try { inici = _dadesInicials_(token, menu); } catch (e) { inici = null; }
  }

  return {
    ok: true,
    usuari: val.usuari,
    menu: menu,
    inici: inici,
    config: {
      nom: _llegirConfig_(ss, 'NOM_APP', 'La meva app')
    }
  };
}

/** Només el menú visible per a l'usuari. */
function obtenirMenu(token) {
  var val = validarToken(token);
  if (!val.ok) return { ok: false };
  var ss = _ss_();
  return { ok: true, menu: _menuPerRol_(ss, val.usuari.id_rol) };
}

/** Booleà, per amagar/mostrar botons al client (mai per seguretat real). */
function tePermis(token, modul, accio) {
  var val = validarToken(token);
  if (!val.ok) return false;
  var ss = _ss_();
  return _permisDe_(ss, val.usuari.id_rol, modul, accio);
}

/** Buida el cau de permisos i menús. Executa-la a mà si edites PERMISOS/MENUS. */
function buidarCau() {
  CacheService.getScriptCache().removeAll([CLAU_CAU_PERMISOS, CLAU_CAU_MENUS]);
  return 'Cau buidat.';
}


// -----------------------------------------------------------------------------
//  Guardià intern — el fan servir TOTS els serveis
// -----------------------------------------------------------------------------

/**
 * Valida sessió + permís. Retorna l'usuari si tot va bé; llança error si no.
 * Patró: cada funció de servidor l'ha de cridar ABANS de tocar dades.
 */
function _comprovarAcces_(token, modul, accio) {
  var val = validarToken(token);
  if (!val.ok) throw new Error('Sessió no vàlida o caducada. Torna a iniciar sessió.');
  var ss = _ss_();
  if (!_permisDe_(ss, val.usuari.id_rol, modul, accio)) {
    throw new Error('No tens permís per a aquesta acció.');
  }
  return val.usuari;
}

/**
 * True si el mòdul està engegat a la fulla MENUS.
 * Un mòdul apagat no ha de sortir enlloc: ni al menú ni escampat per altres
 * pantalles. Si no, apagar-lo el treu del menú però el deixa colant-se per
 * l'Inici, que és pitjor que no apagar-lo.
 */
function _modulActiu_(clau) {
  var menus = _carregarMenus_(_ss_());
  for (var i = 0; i < menus.length; i++) {
    if (menus[i].clau === String(clau)) return true;
  }
  return false;
}

/** True si el rol de l'usuari pot administrar aquest mòdul (salta la propietat). */
function _potAdministrar_(usuari, modul) {
  var ss = _ss_();
  return _permisDe_(ss, usuari.id_rol, modul, 'administrar');
}


// -----------------------------------------------------------------------------
//  Interns
// -----------------------------------------------------------------------------

function _menuPerRol_(ss, idRol) {
  var menus = _carregarMenus_(ss);
  var permRol = _carregarPermisos_(ss)[String(idRol)] || {};
  return menus.filter(function (m) {
    var p = permRol[m.clau];
    return p && p.veure;
  });
}

function _permisDe_(ss, idRol, modul, accio) {
  var permRol = _carregarPermisos_(ss)[String(idRol)];
  if (!permRol) return false;
  var p = permRol[modul];
  return !!(p && p[accio] === true);
}

/** Llegeix PERMISOS i el torna com a mapa { rol: { modul: {accions...} } }. */
function _carregarPermisos_(ss) {
  var cache = CacheService.getScriptCache();
  var cru = cache.get(CLAU_CAU_PERMISOS);
  if (cru) { try { return JSON.parse(cru); } catch (e) {} }

  var dades = ss.getSheetByName('PERMISOS').getDataRange().getValues();
  var cap = dades[0];
  var iRol = cap.indexOf('id_rol');
  var iModul = cap.indexOf('modul');
  var accions = ['veure', 'crear', 'editar', 'eliminar', 'exportar', 'administrar'];
  var idx = {};
  accions.forEach(function (a) { idx[a] = cap.indexOf(a); });

  var map = {};
  for (var i = 1; i < dades.length; i++) {
    var rol = String(dades[i][iRol]);
    var modul = String(dades[i][iModul]);
    if (!rol || !modul) continue;
    if (!map[rol]) map[rol] = {};
    var obj = {};
    accions.forEach(function (a) { obj[a] = _bool_(dades[i][idx[a]]); });
    map[rol][modul] = obj;
  }
  cache.put(CLAU_CAU_PERMISOS, JSON.stringify(map), CAU_SEGONS);
  return map;
}

/** Llegeix MENUS (només actius, ordenats). */
function _carregarMenus_(ss) {
  var cache = CacheService.getScriptCache();
  var cru = cache.get(CLAU_CAU_MENUS);
  if (cru) { try { return JSON.parse(cru); } catch (e) {} }

  var dades = ss.getSheetByName('MENUS').getDataRange().getValues();
  var cap = dades[0];
  var iClau = cap.indexOf('clau_modul');
  var iEt = cap.indexOf('etiqueta_ca');
  var iIco = cap.indexOf('icona');
  var iOrdre = cap.indexOf('ordre');
  var iActiu = cap.indexOf('actiu');

  var llista = [];
  for (var i = 1; i < dades.length; i++) {
    if (!_bool_(dades[i][iActiu])) continue;
    llista.push({
      clau: String(dades[i][iClau]),
      etiqueta: String(dades[i][iEt]),
      icona: String(dades[i][iIco]),
      ordre: Number(dades[i][iOrdre]) || 0
    });
  }
  llista.sort(function (a, b) { return a.ordre - b.ordre; });
  cache.put(CLAU_CAU_MENUS, JSON.stringify(llista), CAU_SEGONS);
  return llista;
}
