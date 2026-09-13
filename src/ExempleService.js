/**
 * =============================================================================
 *  ExempleService.js — El patró d'un mòdul, sencer i mínim
 *
 *  Esborra'l quan tinguis el teu primer mòdul de debò. Mentrestant, mostra les
 *  cinc coses que ha de fer tot servei d'aquesta plataforma:
 *
 *   1. `_comprovarAcces_` a la PRIMERA línia de cada funció pública.
 *   2. Validar l'entrada al servidor, no al formulari.
 *   3. Ids propis, mai la posició de la fila.
 *   4. Comprovar la propietat quan el rol sol no n'hi ha prou.
 *   5. Escriure amb `_actualitzar_`/`_afegirAmbId_`, que mantenen el cau.
 * =============================================================================
 */

var MODUL_EXEMPLE = 'EXEMPLE';
var FULLA_EXEMPLE = 'EXEMPLES';

// -----------------------------------------------------------------------------
//  API pública — tot el que el client pot cridar
//
//  A Apps Script, QUALSEVOL funció d'aquest fitxer és invocable des del
//  navegador, es mostri o no el seu botó. Per això el permís es comprova aquí
//  i no amagant res a la interfície.
// -----------------------------------------------------------------------------

function llistarExemples(token) {
  _comprovarAcces_(token, MODUL_EXEMPLE, 'veure');
  if (!_existeixFulla_(FULLA_EXEMPLE)) return { ok: true, items: [] };

  var items = _objectes_(FULLA_EXEMPLE).map(function (f) {
    return {
      id: f.id_exemple,
      titol: String(f.titol || ''),
      descripcio: String(f.descripcio || ''),
      creat: _fmtData_(f.creat, 'dd/MM/yyyy')
    };
  });
  return { ok: true, items: items };
}

function crearExemple(token, dades) {
  var usuari = _comprovarAcces_(token, MODUL_EXEMPLE, 'crear');

  // La validació viu aquí i no al formulari: el formulari és una comoditat,
  // no una barrera. Qui cridi aquesta funció directament passa per aquí igual.
  var titol = String((dades && dades.titol) || '').trim();
  if (!titol) return { ok: false, error: 'El títol no pot estar buit.' };
  if (titol.length > 120) return { ok: false, error: 'El títol és massa llarg (màx. 120).' };

  var id = _afegirAmbId_(FULLA_EXEMPLE, 'id_exemple', 'EX', {
    titol: titol,
    descripcio: String((dades && dades.descripcio) || '').trim().slice(0, 1000),
    id_usuari: usuari.id_usuari,
    creat: new Date()
  });

  return { ok: true, id: id, items: llistarExemples(token).items };
}

function esborrarExemple(token, id) {
  var usuari = _comprovarAcces_(token, MODUL_EXEMPLE, 'eliminar');

  // Un id que ve del client es comprova SEMPRE contra el que existeix, abans
  // de fer-lo servir per a res.
  var fila = _perId_(FULLA_EXEMPLE, 'id_exemple', id);
  if (!fila) return { ok: false, error: 'Aquest element no existeix.' };

  // El rol diu QUÈ pots fer; de qui és AQUESTA fila ho decideix el servei.
  // Sense aquesta comprovació, qui pugui esborrar podria esborrar el de
  // qualsevol altre. És la limitació que arrossega IntranetSimpatica.
  if (!_potGestionarExemple_(usuari, fila)) {
    return { ok: false, error: 'Això no és teu.' };
  }

  _fulla_(FULLA_EXEMPLE).deleteRow(fila._fila);
  _invalidarCauFulla_(FULLA_EXEMPLE);   // hem escrit al full sense passar per _actualitzar_

  return { ok: true, items: llistarExemples(token).items };
}


// -----------------------------------------------------------------------------
//  Interns (sufix _ : no invocables des del client)
// -----------------------------------------------------------------------------

/** Propietat per fila: és teu, o tens permís d'administrar aquest mòdul. */
function _potGestionarExemple_(usuari, fila) {
  if (_potAdministrar_(usuari, MODUL_EXEMPLE)) return true;
  return String(fila.id_usuari) === String(usuari.id_usuari);
}
