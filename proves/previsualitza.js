/**
 * proves/previsualitza.js — munta l'app sencera en un sol fitxer HTML estàtic,
 * amb un servidor de mentida, per poder-la mirar (i fotografiar) sense
 * desplegar-la ni tocar dades de debò.
 *
 *   node proves/previsualitza.js [sortida.html]
 *
 * Substitueix els `<?!= include('X') ?>` d'Index.html pel contingut real de
 * cada fitxer i injecta un `google.script.run` fals. El que es veu aquí és
 * EXACTAMENT el mateix HTML i el mateix CSS que serveix Apps Script.
 *
 * Mira-t'ho sempre ALS DOS MODES (clar i fosc): el mode fosc és on apareixen
 * els defectes de contrast, i no es veuen fins que algú obre l'app de nit.
 *
 * Paràmetres a la URL del fitxer resultant:
 *   ?login    la pantalla d'entrada en comptes de l'app
 *
 * Quan afegeixis un mòdul: posa'l a INCLOU i dona-li dades falses a DADES.
 */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

const llegir = (n) => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8');

// ---------------------------------------------------------------- dades falses
const EXEMPLES = [
  { id: 'EX-000001', titol: 'Un primer element', descripcio: '', creat: '03/02/2026' },
  { id: 'EX-000002', titol: 'Un segon element amb un títol força més llarg del compte', descripcio: '', creat: '11/02/2026' },
  { id: 'EX-000003', titol: 'I un tercer', descripcio: '', creat: '27/02/2026' }
];

const DADES = {
  obtenirContextInicial: {
    ok: true,
    usuari: { id_usuari: 'U-000001', nom: 'Maria', rol: 'Administrador', id_rol: '1' },
    // Un sol mòdul: amb un de sol la barra de navegació no es pinta
    // (body.sense-tabs), que és el comportament correcte. Quan afegeixis el
    // segon mòdul, posa'l aquí i la barra apareixerà sola.
    menu: [
      { clau: 'EXEMPLE', etiqueta: 'Exemple', icona: 'llista', ordre: 10 }
    ],
    inici: { modul: 'EXEMPLE', dades: { ok: true, items: EXEMPLES } },
    config: { nom: 'La meva app' }
  },
  llistarExemples: { ok: true, items: EXEMPLES },
  crearExemple:    { ok: true, id: 'EX-000004', items: EXEMPLES },
  esborrarExemple: { ok: true, items: EXEMPLES.slice(1) },
  ferLogin:        { ok: true, token: 'previsualitza' },
  validarToken:    { ok: true }
};

const STUB = `
<script>
  // google.script.run de mentida. Respon amb un retard petit a propòsit: sense
  // ell no es veuen mai els esquelets de càrrega, que són la meitat de la
  // sensació de velocitat de l'app.
  var DADES = ${JSON.stringify(DADES, null, 2)};
  window.google = { script: { run: (function () {
    // Encadenable com el de debò: withSuccessHandler / withFailureHandler es
    // poden posar en qualsevol ordre i tornen un objecte nou, i qualsevol
    // altra propietat és una crida al servidor.
    function runner(ok, err) {
      return new Proxy({}, {
        get: function (_, nom) {
          if (nom === 'withSuccessHandler') return function (f) { return runner(f, err); };
          if (nom === 'withFailureHandler') return function (f) { return runner(ok, f); };
          if (typeof nom !== 'string') return undefined;
          return function () {
            var res = DADES[nom];
            setTimeout(function () {
              if (res === undefined) {
                var e = new Error('Sense dades falses per a: ' + nom);
                if (err) err(e); else console.warn(e.message);
              } else if (ok) { ok(res); }
            }, 220);
          };
        }
      });
    }
    return runner(null, null);
  })() } };

  try {
    if (location.search.indexOf('login') >= 0) localStorage.removeItem('app_token');
    else localStorage.setItem('app_token', 'previsualitza');
  } catch (e) {}
</script>`;

const html = llegir('Index')
  .replace(/<\?!= include\('(\w+)'\);?\s*\?>/g, (_, n) => llegir(n))
  .replace(/<\?!= JSON\.stringify\(resetToken\) \?>/g, '""')
  .replace('</head>', STUB + '\n</head>');

const sortida = process.argv[2] || path.join(__dirname, 'previsualitza.html');
fs.writeFileSync(sortida, html);
console.log('Escrit: ' + sortida);
