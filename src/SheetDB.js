/**
 * =============================================================================
 *  SheetDB.js — Accés a les fulles per NOM DE COLUMNA
 *  Evita repetir getDataRange + indexOf a cada servei.
 * =============================================================================
 */

// El full de càlcul resolt, memoritzat mentre dura l'execució.
var _ssMemo_ = null;

/**
 * El full de càlcul que fa de base de dades.
 *
 * Funciona en els dos muntatges possibles, que és el que evita l'error més
 * típic d'aquesta plataforma:
 *
 *  - Script LLIGAT a un full (Extensions > Apps Script des del propi full):
 *    getActiveSpreadsheet() ja el retorna.
 *  - Script AUTÒNOM (creat des de script.google.com): getActiveSpreadsheet()
 *    retorna null, i llavors s'obre pel seu id, desat a les propietats de
 *    l'script amb configurarFull('<id del full>') (vegeu Setup.js).
 */
function _ss_() {
  if (_ssMemo_) return _ssMemo_;

  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }

  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty(PROP_ID_FULL);
    if (!id) {
      throw new Error(
        'Aquest script no està lligat a cap full de càlcul. Executa una vegada ' +
        'configurarFull("ID_DEL_FULL") des de l\'editor d\'Apps Script, amb l\'id ' +
        'que surt a la URL del full: docs.google.com/spreadsheets/d/ID_DEL_FULL/edit'
      );
    }
    ss = SpreadsheetApp.openById(id);
  }

  _ssMemo_ = ss;
  return ss;
}

function _fulla_(nom) {
  var sh = _ss_().getSheetByName(nom);
  if (!sh) throw new Error('No existeix la fulla: ' + nom);
  return sh;
}

/** True si la fulla existeix (per a peces encara no activades). */
function _existeixFulla_(nom) {
  return !!_ss_().getSheetByName(nom);
}

/**
 * Lectures ja fetes en AQUESTA execució, per nom de fulla.
 *
 * A Apps Script cada getValues() és una anada i tornada als servidors de
 * Google. Els serveis llegeixen la mateixa fulla diverses vegades per petició
 * sense adonar-se'n (un mapa d'usuaris aquí, un altre allà), i cada una es
 * pagava sencera. Una petició = una execució = una vida d'aquesta variable, o
 * sigui que no hi ha risc de servir dades velles a la petició següent.
 */
var _cauFulles_ = {};

/** Oblida el que s'ha llegit d'una fulla (o de totes si no se'n diu cap). */
function _invalidarCauFulla_(nom) {
  if (nom) delete _cauFulles_[nom];
  else _cauFulles_ = {};
}

/** Retorna {cap, mapa:{header:col}, dades:[[...]]}. */
function _llegir_(nom) {
  if (_cauFulles_[nom]) return _cauFulles_[nom];

  var sh = _fulla_(nom);
  var rang = sh.getDataRange().getValues();
  var cap = rang.length ? rang[0] : [];
  var mapa = {};
  cap.forEach(function (c, i) { mapa[c] = i; });

  _cauFulles_[nom] = { cap: cap, mapa: mapa, dades: rang.slice(1) };
  return _cauFulles_[nom];
}

/** Files com a objectes {header: valor, _fila: numFilaReal}. */
function _objectes_(nom) {
  var r = _llegir_(nom);
  return r.dades.map(function (fila, i) {
    var o = { _fila: i + 2 };
    r.cap.forEach(function (c, j) { o[c] = fila[j]; });
    return o;
  });
}

/** Cerca la primera fila amb columnaId == valor (objecte) o null. */
function _perId_(nom, columnaId, valor) {
  var objs = _objectes_(nom);
  for (var i = 0; i < objs.length; i++) {
    if (String(objs[i][columnaId]) === String(valor)) return objs[i];
  }
  return null;
}

/**
 * Afegeix una fila generant un ID atòmic (PREFIX-000001) dins d'un LockService.
 *
 * Si ja ets DINS d'un bloqueig (comptar i inserir sense que ningú s'hi
 * coli entremig, per exemple), crida _afegirAmbIdSenseBloqueig_
 * directament: demanar dues vegades el mateix ScriptLock en una sola execució
 * es queda esperant fins que salta el timeout.
 *
 * @return {string} l'ID generat
 */
function _afegirAmbId_(nom, columnaId, prefix, objecte, digits) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return _afegirAmbIdSenseBloqueig_(nom, columnaId, prefix, objecte, digits);
  } finally {
    lock.releaseLock();
  }
}

/** Igual que _afegirAmbId_ però SENSE agafar el bloqueig (ja el tens tu). */
function _afegirAmbIdSenseBloqueig_(nom, columnaId, prefix, objecte, digits) {
  digits = digits || 6;
  var r = _llegir_(nom);
  var col = r.mapa[columnaId];
  var max = 0;
  r.dades.forEach(function (fila) {
    var m = String(fila[col] || '').match(/(\d+)\s*$/);
    if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
  });
  var seg = String(max + 1);
  while (seg.length < digits) seg = '0' + seg;
  var id = prefix + '-' + seg;

  objecte[columnaId] = id;
  var filaArr = r.cap.map(function (c) {
    return objecte.hasOwnProperty(c) ? objecte[c] : '';
  });
  _fulla_(nom).appendRow(filaArr);

  // El cau s'actualitza en comptes d'invalidar-se: inserir en un bucle tornaria a llegir
  // la fulla sencera a cada volta, que és precisament el que costa.
  r.dades.push(filaArr);
  return id;
}

/**
 * Actualitza només les columnes indicades d'una fila concreta.
 *
 * Les columnes que toquen s'agrupen en trams contigus i cada tram s'escriu amb
 * una sola crida. Abans era un setValue() per columna, i canvis que van sempre
 * junts —hash i salt, per exemple— pagaven dues anades i tornades on n'hi
 * havia prou amb una.
 *
 * No s'escriu mai la fila sencera: només les cel·les que canvien de debò, per
 * no trepitjar una columna que hagi tocat algú altre mentrestant.
 */
function _actualitzar_(nom, numFila, objecteParcial) {
  var r = _llegir_(nom);
  var sh = _fulla_(nom);

  var cols = [];
  Object.keys(objecteParcial).forEach(function (c) {
    if (r.mapa.hasOwnProperty(c)) cols.push(r.mapa[c]);
  });
  if (!cols.length) return;
  cols.sort(function (a, b) { return a - b; });

  var valorDe = {};
  Object.keys(objecteParcial).forEach(function (c) {
    if (r.mapa.hasOwnProperty(c)) valorDe[r.mapa[c]] = objecteParcial[c];
  });

  var i = 0;
  while (i < cols.length) {
    var j = i;
    while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++;
    var tram = [];
    for (var k = i; k <= j; k++) tram.push(valorDe[cols[k]]);
    sh.getRange(numFila, cols[i] + 1, 1, tram.length).setValues([tram]);
    i = j + 1;
  }

  // Mantenir el cau al dia (numFila compta la capçalera, les dades no).
  var fila = r.dades[numFila - 2];
  if (fila) cols.forEach(function (c) { fila[c] = valorDe[c]; });
  else _invalidarCauFulla_(nom);
}

/** Zona horària del full (per formatar dates). */
function _tz_() {
  return _ss_().getSpreadsheetTimeZone();
}

/** Formata una data amb un patró; retorna '' si buida/invàlida. */
function _fmtData_(v, patro) {
  if (v === '' || v === null || v === undefined) return '';
  var d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, _tz_(), patro);
}

/** Converteix 'yyyy-MM-dd' (input date) a Date; '' si buit/invàlid. */
function _parseData_(s) {
  // Una data escrita directament al full (una clau de CONFIG, per exemple) arriba
  // com a Date, no com a text: retornar '' aquí la faria desaparèixer en silenci.
  if (s instanceof Date) return isNaN(s.getTime()) ? '' : s;
  s = String(s || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Una hora com a 'HH:MM', vingui com vingui del full.
 *
 * Google Sheets converteix tota sola una cel·la que digui "20:15" en un valor
 * d'HORA, i Apps Script el retorna com un Date del 30/12/1899 — l'època dels
 * fulls de càlcul. Fer-hi String() dona
 * "Sat Dec 30 1899 20:15:00 GMT-0014 (CET)", que és el que acabava sortint per
 * pantalla. I pitjor: una clau construïda amb això mai no coincideix amb una
 * construïda amb '20:15', de manera que els controls de duplicats fallaven.
 *
 * Per això cap servei no ha de fer String() sobre una hora mai: totes les hores passen
 * per aquí. Es formata amb la zona horària del FULL, que és la que Sheets va fer
 * servir per convertir el número de sèrie en Date; amb una altra, les dates de
 * 1899 ballen (Madrid tenia -0:14:44 abans del 1901).
 */
function _horaTxt_(v) {
  if (v === '' || v === null || v === undefined) return '';

  // Es comprova per DUCK TYPING, no amb "v instanceof Date". Els valors del
  // full creuen el pont Java/V8 d'Apps Script i hi ha casos en què instanceof
  // hi falla encara que l'objecte sigui una data de debò: llavors queia al
  // camí de text i sortia per pantalla "Sat Dec 30 1899 20:15:00 GMT-0014".
  if (typeof v.getTime === 'function' ||
      Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, _tz_(), 'HH:mm');
  }

  // Un número entre 0 i 1 en una columna d'hora només pot ser el número de
  // sèrie del full: la fracció del dia (20:15 = 0,84375).
  if (typeof v === 'number' && v >= 0 && v < 1) {
    var mins = Math.round(v * 24 * 60);
    return _hhmm_(Math.floor(mins / 60), mins % 60);
  }

  var s = String(v).trim();
  if (!s) return '';

  var m = s.match(/^(\d{1,2}):(\d{2})/);           // '20:15', '9:05', '18:00:00'
  if (!m) m = s.match(/\b(\d{1,2}):(\d{2}):\d{2}\b/); // xarxa de seguretat: un Date ja fet text
  if (!m) return s;

  return _hhmm_(Number(m[1]), m[2]);
}

/** 'HH:MM' amb zero al davant. */
function _hhmm_(h, m) {
  h = Number(h); m = String(m);
  if (m.length < 2) m = '0' + m;
  return (h < 10 ? '0' + h : String(h)) + ':' + m;
}

/** Normalitza una hora 'H:MM' o 'HH:MM' a 'HH:MM'; '' si buida, null si invàlida. */
function _parseHora_(s) {
  if (s instanceof Date) s = _horaTxt_(s);   // ve del full, ja normalitzada
  s = String(s || '').trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return (h < 10 ? '0' + h : String(h)) + ':' + m[2];
}

/** Llegeix una cel·la booleana de Sheets (pot arribar com a booleà o com a text). */
function _bool_(v) {
  return v === true || String(v).toLowerCase() === 'true';
}
