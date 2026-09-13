/**
 * =============================================================================
 *  Auth.gs — Autenticació i sessions
 *  Login amb correu + contrasenya, token de sessió, logout i recuperació.
 * =============================================================================
 */

// Iteracions del hash. NO canviar mai un cop existeixin usuaris: invalidaria
// totes les contrasenyes.
var ITERACIONS_HASH = 5000;

var DURADA_RESET_MINUTS = 30;


// -----------------------------------------------------------------------------
//  API pública (cridada des del client amb google.script.run)
// -----------------------------------------------------------------------------

/**
 * Valida credencials i, si són correctes, crea una sessió.
 * @return {Object} {ok:true, token, usuari:{...}} o {ok:false, error}
 */
function ferLogin(email, contrasenya) {
  email = String(email || '').trim().toLowerCase();
  contrasenya = String(contrasenya || '');
  if (!email || !contrasenya) {
    return { ok: false, error: 'Cal indicar el correu i la contrasenya.' };
  }

  var ss = _ss_();
  var usuaris = _objectes_('USUARIS');   // per _llegir_, que memoritza l'execució

  var u = null;
  for (var i = 0; i < usuaris.length; i++) {
    if (String(usuaris[i].email).trim().toLowerCase() === email) { u = usuaris[i]; break; }
  }

  // Un sol missatge per a "no existeix", "desactivat" i "contrasenya dolenta".
  // Distingir-los li diu a qualsevol que provi correus quins d'ells són comptes
  // reals, i això és mig atac fet. El cost és que un usuari desactivat no sap
  // per què no entra: assumit, perquè algú l'ha desactivat a posta i ho sap.
  var GENERIC = { ok: false, error: 'Correu o contrasenya incorrectes.' };
  if (!u) return GENERIC;

  // El bloqueig es mira ABANS de comprovar la contrasenya: si no, una tanda
  // d'intents seguiria costant una comparació de hash cada vegada.
  var minuts = _bloqueig_(u.id_usuari);
  if (minuts) {
    return {
      ok: false,
      error: 'Massa intents fallats. Torna-ho a provar d\'aquí a ' + minuts + ' minuts.'
    };
  }

  if (!_bool_(u.actiu)) { _apuntarFallada_(u.id_usuari); return GENERIC; }

  if (_hashContrasenya_(contrasenya, u.salt) !== String(u.hash)) {
    _apuntarFallada_(u.id_usuari);
    return GENERIC;
  }

  _netejarFallades_(u.id_usuari);

  var token = _crearSessio_(ss, u.id_usuari);
  _actualitzar_('USUARIS', u._fila, { ultim_acces: new Date() });
  return { ok: true, token: token, usuari: _obtenirUsuariPerId_(ss, u.id_usuari) };
}


// -----------------------------------------------------------------------------
//  Bloqueig per intents fallats
//
//  Cinc intents seguits i aquell usuari queda tancat 15 minuts. Sense això,
//  una contrasenya no és una barrera sinó un adorn: una màquina en prova
//  milers per minut i ningú se n'assabenta.
//
//  Es compta per usuari i no per IP perquè Apps Script no dona l'adreça de qui
//  crida. Per tant NO protegeix de qui reparteix els intents entre molts
//  comptes; protegeix del cas real, que és insistir contra un compte concret.
// -----------------------------------------------------------------------------

var LOGIN_INTENTS_MAX = 5;
var LOGIN_BLOQUEIG_MINUTS = 15;

function _bloqueig_(idUsuari) {
  var cau = CacheService.getScriptCache().get('loginfall_' + idUsuari);
  var n = cau ? Number(cau) : 0;
  return (n >= LOGIN_INTENTS_MAX) ? LOGIN_BLOQUEIG_MINUTS : 0;
}

/**
 * Compta una fallada. Es desa al cau i no al full a propòsit: el bloqueig ha
 * de caducar sol i no ha de deixar rastre que després calgui netejar.
 */
function _apuntarFallada_(idUsuari) {
  var cache = CacheService.getScriptCache();
  var clau = 'loginfall_' + idUsuari;
  var n = Number(cache.get(clau) || 0) + 1;
  cache.put(clau, String(n), LOGIN_BLOQUEIG_MINUTS * 60);
}

function _netejarFallades_(idUsuari) {
  CacheService.getScriptCache().remove('loginfall_' + idUsuari);
}


// Quant dura una sessió validada al cau. Curt a propòsit: tot el que la pot
// invalidar de debò (tancar sessió, desactivar l'usuari, canviar-li el rol o
// la contrasenya) esborra l'entrada explícitament, així que això només cobreix
// el cas que no es pot avisar —que la sessió caduqui sola— i vuit hores de
// sessió no noten tres minuts.
var CAU_SESSIO_SEGONS = 180;

function _clauCauSessio_(token) { return 'sess_' + token; }

/** Treu del cau les sessions d'un usuari (totes les que en tingui obertes). */
function _oblidarCauSessions_(ss, idUsuari) {
  var sh = ss.getSheetByName('SESSIONS');
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) return;
  var cap = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iToken = cap.indexOf('token');
  var iUser = cap.indexOf('id_usuari');
  var dades = sh.getRange(2, 1, lastRow - 1, cap.length).getValues();
  var claus = [];
  dades.forEach(function (r) {
    if (String(r[iUser]) === String(idUsuari)) claus.push(_clauCauSessio_(String(r[iToken])));
  });
  if (claus.length) CacheService.getScriptCache().removeAll(claus);
}

/**
 * Comprova si un token és vàlid i vigent.
 *
 * Es crida a CADA petició (_comprovarAcces_ hi passa sempre) i costava tres
 * lectures del full: SESSIONS, USUARIS i ROLS. Ara el resultat es recorda uns
 * minuts al cau, de manera que només la primera petició d'una tongada les paga.
 *
 * @return {Object} {ok:true, usuari:{...}} o {ok:false}
 */
function validarToken(token) {
  token = String(token || '').trim();
  if (!token) return { ok: false };

  var cache = CacheService.getScriptCache();
  var cru = cache.get(_clauCauSessio_(token));
  if (cru) {
    try { return { ok: true, usuari: JSON.parse(cru) }; } catch (e) { /* cau malmès */ }
  }

  var ss = _ss_();
  var sh = ss.getSheetByName('SESSIONS');
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) return { ok: false };

  var cap = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iToken = cap.indexOf('token');
  var iUser = cap.indexOf('id_usuari');
  var iExpira = cap.indexOf('expira');

  var dades = sh.getRange(2, 1, lastRow - 1, cap.length).getValues();
  var ara = new Date();

  for (var i = 0; i < dades.length; i++) {
    if (String(dades[i][iToken]) === token) {
      if (new Date(dades[i][iExpira]) > ara) {
        var u = _obtenirUsuariPerId_(ss, dades[i][iUser]);
        if (!u || !u.actiu) return { ok: false };
        cache.put(_clauCauSessio_(token), JSON.stringify(u), CAU_SESSIO_SEGONS);
        return { ok: true, usuari: u };
      }
      return { ok: false }; // trobat però caducat
    }
  }
  return { ok: false };
}


/** Tanca la sessió esborrant el token de SESSIONS. */
function ferLogout(token) {
  token = String(token || '').trim();
  if (!token) return { ok: true };

  // Primer el cau: si no, el token seguiria valent fins que caduqués l'entrada.
  CacheService.getScriptCache().remove(_clauCauSessio_(token));

  var ss = _ss_();
  var sh = ss.getSheetByName('SESSIONS');
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) return { ok: true };

  var cap = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iToken = cap.indexOf('token');
  var dades = sh.getRange(2, 1, lastRow - 1, cap.length).getValues();

  for (var i = dades.length - 1; i >= 0; i--) {
    if (String(dades[i][iToken]) === token) {
      sh.deleteRow(i + 2); // +2: capçalera + base 1
      _invalidarCauFulla_('SESSIONS');
    }
  }
  return { ok: true };
}


// -----------------------------------------------------------------------------
//  Recuperació de contrasenya ("he oblidat la contrasenya")
// -----------------------------------------------------------------------------

/**
 * Sol·licita un enllaç de restabliment per correu.
 * Sempre retorna {ok:true}, encara que el correu no existeixi, per no revelar
 * quines adreces estan donades d'alta.
 */
function demanarRestabliment(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'Cal indicar el correu electrònic.' };

  var ss = _ss_();
  var idUsuari = _idUsuariActiuPerEmail_(ss, email);

  if (idUsuari) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sh = _fullaResets_(ss);
      _netejarResetsCaducats_(sh);
      var ara = new Date();
      var expira = new Date(ara.getTime() + DURADA_RESET_MINUTS * 60 * 1000);
      var token = Utilities.getUuid();
      sh.appendRow([token, idUsuari, ara, expira, false]);
      _invalidarCauFulla_('RESETS');
      _enviarCorreuRestabliment_(ss, email, token);
    } finally {
      lock.releaseLock();
    }
  }
  return { ok: true, missatge: 'Si el correu existeix, rebràs un enllaç per restablir la contrasenya en breu.' };
}

/** Comprova que un token de restabliment sigui vàlid, no usat i no caducat. */
function validarTokenRestabliment(token) {
  token = String(token || '').trim();
  if (!token || !_filaResetVigent_(token)) {
    return { ok: false, error: 'Aquest enllaç no és vàlid o ha caducat. Torna a demanar-ne un.' };
  }
  return { ok: true };
}

/** Estableix la contrasenya nova a partir d'un token vàlid i el consumeix. */
function restablirContrasenyaAmbToken(token, novaContrasenya) {
  token = String(token || '').trim();
  novaContrasenya = String(novaContrasenya || '');
  if (novaContrasenya.length < 6) {
    return { ok: false, error: 'La contrasenya ha de tenir com a mínim 6 caràcters.' };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var fila = _filaResetVigent_(token);
    if (!fila) return { ok: false, error: 'Aquest enllaç no és vàlid o ha caducat. Torna a demanar-ne un.' };

    var ss = _ss_();
    var uSh = ss.getSheetByName('USUARIS');
    var uDades = uSh.getDataRange().getValues();
    var uCap = uDades[0];
    var iId = uCap.indexOf('id_usuari');
    var iHash = uCap.indexOf('hash');
    var iSalt = uCap.indexOf('salt');

    var filaUsuari = -1;
    for (var i = 1; i < uDades.length; i++) {
      if (String(uDades[i][iId]) === String(fila.idUsuari)) { filaUsuari = i; break; }
    }
    if (filaUsuari === -1) return { ok: false, error: 'Usuari no trobat.' };

    var salt = Utilities.getUuid();
    var hash = _hashContrasenya_(novaContrasenya, salt);
    uSh.getRange(filaUsuari + 1, iHash + 1).setValue(hash);
    uSh.getRange(filaUsuari + 1, iSalt + 1).setValue(salt);
    _invalidarCauFulla_('USUARIS');

    fila.sheet.getRange(fila.fila, fila.colUsat + 1).setValue(true);
    _invalidarCauFulla_('RESETS');
    _tancarSessionsUsuari_(ss, fila.idUsuari);

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}


// -----------------------------------------------------------------------------
//  Interns
// -----------------------------------------------------------------------------

/** id_usuari actiu que té aquest correu, o '' si no existeix / no és actiu. */
function _idUsuariActiuPerEmail_(ss, email) {
  var sh = ss.getSheetByName('USUARIS');
  var dades = sh.getDataRange().getValues();
  var cap = dades[0];
  var iId = cap.indexOf('id_usuari');
  var iEmail = cap.indexOf('email');
  var iActiu = cap.indexOf('actiu');
  for (var i = 1; i < dades.length; i++) {
    if (String(dades[i][iEmail]).trim().toLowerCase() === email) {
      return _bool_(dades[i][iActiu]) ? dades[i][iId] : '';
    }
  }
  return '';
}

/** Retorna la fulla RESETS, creant-la (amb capçaleres) si encara no existeix. */
function _fullaResets_(ss) {
  var sh = ss.getSheetByName('RESETS');
  if (!sh) {
    sh = ss.insertSheet('RESETS');
    sh.getRange(1, 1, 1, 5).setValues([['token', 'id_usuari', 'creat', 'expira', 'usat']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** {sheet, fila, idUsuari, colUsat} del token vigent (no usat, no caducat), o null. */
function _filaResetVigent_(token) {
  var ss = _ss_();
  var sh = _fullaResets_(ss);
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) return null;

  var cap = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iToken = cap.indexOf('token');
  var iUser = cap.indexOf('id_usuari');
  var iExpira = cap.indexOf('expira');
  var iUsat = cap.indexOf('usat');

  var dades = sh.getRange(2, 1, lastRow - 1, cap.length).getValues();
  var ara = new Date();

  for (var i = 0; i < dades.length; i++) {
    if (String(dades[i][iToken]) === token) {
      if (_bool_(dades[i][iUsat])) return null;
      if (!(new Date(dades[i][iExpira]) > ara)) return null;
      return { sheet: sh, fila: i + 2, idUsuari: dades[i][iUser], colUsat: iUsat };
    }
  }
  return null;
}

/** Esborra de RESETS les files ja usades o caducades (manteniment). */
function _netejarResetsCaducats_(sh) {
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) return;
  var cap = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iExpira = cap.indexOf('expira');
  var iUsat = cap.indexOf('usat');
  var dades = sh.getRange(2, 1, lastRow - 1, cap.length).getValues();
  var ara = new Date();

  var vius = dades.filter(function (r) {
    return !_bool_(r[iUsat]) && r[iExpira] && new Date(r[iExpira]) > ara;
  });

  sh.getRange(2, 1, lastRow - 1, cap.length).clearContent();
  if (vius.length) sh.getRange(2, 1, vius.length, cap.length).setValues(vius);
  _invalidarCauFulla_('RESETS');
}

/** Tanca (esborra) totes les sessions actives d'un usuari, per seguretat. */
function _tancarSessionsUsuari_(ss, idUsuari) {
  _oblidarCauSessions_(ss, idUsuari);   // abans d'esborrar les files
  var sh = ss.getSheetByName('SESSIONS');
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) return;
  var cap = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iUser = cap.indexOf('id_usuari');
  var dades = sh.getRange(2, 1, lastRow - 1, cap.length).getValues();
  for (var i = dades.length - 1; i >= 0; i--) {
    if (String(dades[i][iUser]) === String(idUsuari)) sh.deleteRow(i + 2);
  }
  _invalidarCauFulla_('SESSIONS');
}

/** Envia el correu amb l'enllaç de restabliment. */
function _enviarCorreuRestabliment_(ss, email, token) {
  var nomApp = _llegirConfig_(ss, 'NOM_APP', 'La meva app');
  var url = ScriptApp.getService().getUrl() + '?reset=' + encodeURIComponent(token);
  var assumpte = 'Restabliment de contrasenya — ' + nomApp;
  var cos =
    'Hola,\n\n' +
    'Hem rebut una sol·licitud per restablir la teva contrasenya.\n' +
    'Fes clic a l\'enllaç següent per definir-ne una de nova (vàlid ' + DURADA_RESET_MINUTS + ' minuts):\n\n' +
    url + '\n\n' +
    'Si no has estat tu qui ho ha demanat, pots ignorar aquest correu: ' +
    'la teva contrasenya actual continuarà funcionant.\n';
  MailApp.sendEmail(email, assumpte, cos);
}

/** Crea una sessió nova (amb bloqueig) i retorna el token. */
function _crearSessio_(ss, idUsuari) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    _netejarSessionsCaducades_(ss);

    var sh = ss.getSheetByName('SESSIONS');
    var ara = new Date();
    var hores = Number(_llegirConfig_(ss, 'DURACIO_SESSIO_HORES', 8)) || 8;
    var expira = new Date(ara.getTime() + hores * 3600 * 1000);
    var token = Utilities.getUuid();

    sh.appendRow([token, idUsuari, ara, expira]);
    _invalidarCauFulla_('SESSIONS');
    return token;
  } finally {
    lock.releaseLock();
  }
}

/** Esborra de SESSIONS les files amb expira <= ara. */
function _netejarSessionsCaducades_(ss) {
  var sh = ss.getSheetByName('SESSIONS');
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) return;

  var cap = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iExpira = cap.indexOf('expira');
  var dades = sh.getRange(2, 1, lastRow - 1, cap.length).getValues();
  var ara = new Date();

  var vius = dades.filter(function (r) {
    return r[iExpira] && new Date(r[iExpira]) > ara;
  });

  sh.getRange(2, 1, lastRow - 1, cap.length).clearContent();
  if (vius.length) {
    sh.getRange(2, 1, vius.length, cap.length).setValues(vius);
  }
  _invalidarCauFulla_('SESSIONS');
}

/** Dades públiques d'un usuari per id, o null. */
function _obtenirUsuariPerId_(ss, idUsuari) {
  var r = _llegir_('USUARIS');   // pel cau: USUARIS se sol tornar a llegir després
  var m = r.mapa;
  for (var i = 0; i < r.dades.length; i++) {
    if (String(r.dades[i][m['id_usuari']]) === String(idUsuari)) {
      var f = r.dades[i];
      return {
        id: f[m['id_usuari']],
        nom: f[m['nom']],
        cognoms: f[m['cognoms']],
        telefon: m.hasOwnProperty('telefon') ? f[m['telefon']] : '',
        id_rol: f[m['id_rol']],
        rol: _nomRol_(ss, f[m['id_rol']]),
        actiu: _bool_(f[m['actiu']])
      };
    }
  }
  return null;
}

/** Nom d'un rol pel seu id. */
function _nomRol_(ss, idRol) {
  var r = _llegir_('ROLS');
  for (var i = 0; i < r.dades.length; i++) {
    if (String(r.dades[i][r.mapa['id_rol']]) === String(idRol)) return r.dades[i][r.mapa['nom_rol']];
  }
  return '';
}

/** Llegeix un valor de la fulla CONFIG (clau-valor). */
function _llegirConfig_(ss, clau, defecte) {
  // Pel cau: una mateixa petició sol demanar diverses claus de CONFIG, i cada
  // una es pagava com una lectura sencera del full.
  var r = _llegir_('CONFIG');
  for (var i = 0; i < r.dades.length; i++) {
    if (String(r.dades[i][r.mapa['clau']]) === clau) {
      var v = r.dades[i][r.mapa['valor']];
      return (v === '' || v === null) ? defecte : v;
    }
  }
  return defecte;
}

/** Escriu (o crea) un valor a la fulla CONFIG (clau-valor). */
function _escriureConfig_(ss, clau, valor) {
  var r = _llegir_('CONFIG');
  for (var i = 0; i < r.dades.length; i++) {
    if (String(r.dades[i][r.mapa['clau']]) === clau) {
      _actualitzar_('CONFIG', i + 2, { valor: valor });   // +2: capçalera i base 1
      return;
    }
  }
  var fila = new Array(r.cap.length).fill('');
  fila[r.mapa['clau']] = clau;
  fila[r.mapa['valor']] = valor;
  _fulla_('CONFIG').appendRow(fila);
  _invalidarCauFulla_('CONFIG');
}


// -----------------------------------------------------------------------------
//  Hash de contrasenya
// -----------------------------------------------------------------------------

function _hashContrasenya_(text, salt) {
  var valor = salt + '::' + text;
  for (var i = 0; i < ITERACIONS_HASH; i++) {
    var bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, valor, Utilities.Charset.UTF_8
    );
    valor = _bytesAHex_(bytes);
  }
  return valor;
}

function _bytesAHex_(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] & 0xFF).toString(16);
    if (b.length === 1) b = '0' + b;
    hex += b;
  }
  return hex;
}
