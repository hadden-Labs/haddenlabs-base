/**
 * =============================================================================
 *  Code.js — Punt d'entrada del web app
 * =============================================================================
 */

/** Serveix la pàgina principal. */
function doGet(e) {
  var tpl = HtmlService.createTemplateFromFile('Index');
  tpl.resetToken = _paramResetValid_(e);
  return tpl.evaluate()
    .setTitle(_llegirConfig_(_ss_(), 'NOM_APP', 'La meva app'))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Permet incloure altres fitxers HTML dins d'una plantilla. */
function include(nom) {
  return HtmlService.createHtmlOutputFromFile(nom).getContent();
}

/**
 * Extreu el paràmetre ?reset= de la URL si té format d'UUID; si no, ''.
 *
 * Es valida ABANS d'incrustar-lo a la plantilla: el que ve per la URL l'escriu
 * qui vulgui, i un valor amb cometes trencaria l'HTML/JS de la pàgina.
 */
function _paramResetValid_(e) {
  var v = (e && e.parameter && e.parameter.reset) ? String(e.parameter.reset) : '';
  return /^[0-9a-fA-F-]{10,60}$/.test(v) ? v : '';
}

/**
 * Què s'envia ja dins de la crida d'entrada (opcional).
 *
 * `obtenirContextInicial` crida aquesta funció si existeix, i el que retorni
 * arriba al client abans que el primer mòdul es pinti. Estalvia una espera
 * sencera al mòbil, que a Apps Script és una execució sencera del servidor.
 *
 * És un acoblament a propòsit: un endpoint que retorna més del que diu el seu
 * nom. Es paga de gust mentre estigui documentat aquí; si algun dia molesta,
 * el camí de tornada és treure-la, no afegir-n'hi més.
 *
 * @return {{modul: string, dades: *}|null}
 */
function _dadesInicials_(token, menu) {
  var potExemple = menu.some(function (m) { return m.clau === 'EXEMPLE'; });
  if (!potExemple) return null;
  try {
    return { modul: 'EXEMPLE', dades: llistarExemples(token) };
  } catch (e) {
    return null;   // mai fer caure l'arrencada de l'app per la precàrrega
  }
}
