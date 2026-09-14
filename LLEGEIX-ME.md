# haddenlabs-base

L'esquelet d'una app de haddenLABs: Apps Script + Google Sheets,
mòbil primer. Porta ja resolt tot el que no és el teu problema —accés, dades,
permisos, carcassa, proves— perquè el primer dia es pugui dedicar al domini.

**No és una llibreria.** Es **copia** a un projecte nou i a partir d'aquí és
teu: pots canviar-ho tot. L'única part que segueix viva fora és el sistema
visual (`../haddenlabs-estil`), que sí que se sincronitza.

Els tres repositoris de haddenLABs es clonen **al costat**, no un dins de
l'altre:

```
~/projectes/
  haddenlabs-base/      ← aquest: d'on surten els projectes nous
  haddenlabs-estil/     ← el sistema visual (paleta, components, verifica.js)
  BestPractises/        ← criteri, catàleg del que ja està resolt, paranys de GAS
  la-meva-app/
```

---

## Començar

```bash
./crea-projecte.sh ../la-meva-app "La meva app" "#1f3a5f"
cd ../la-meva-app
git init && git add . && git commit -m "Projecte nou des de l'esquelet"
clasp create --title "La meva app" --type sheets --rootDir src
clasp push
```

I des de l'editor d'Apps Script, **un cop**:

1. `crearFullIInicialitzar()` — crea les fulles i un administrador.
   **Apunta la contrasenya que surt al registre: no torna a sortir enlloc.**
2. `activarExemple()` — crea la fulla del mòdul d'exemple.

Si l'script no està lligat a cap full: `configurarFull('<id del full>')` abans.

---

## Adoptar un script que ja existeix

El camí de dalt dona per fet que git va primer: l'script neix buit amb
`clasp create` i tot el codi surt d'aquí. Quan l'script **ja existeix i té
codi** —algú el va escriure a l'editor i ara se li vol posar control de
versions— la direcció és la contrària i l'ordre importa:

```bash
mkdir la-meva-app && cd la-meva-app
clasp clone-script <scriptId> --rootDir src
git init && git add . && git commit -m "El projecte tal com era a l'editor"
```

**El primer commit ha de ser una còpia fidel, sense arreglar res.** Si es
barregen canvis amb la còpia, després no hi ha manera de saber què hi havia
de debò a l'editor.

Tres coses que no venen soles i s'han d'escriure al `CLAUDE.md`:

- **L'`scriptId`**, perquè `.clasp.json` no es commiteja i sense ell no es pot
  tornar a lligar el repositori amb l'script.
- **Qui mana**, git o l'editor, mentre les dues coses estiguin vives. En un
  projecte adoptat la resposta no és òbvia, i `clasp push` no pregunta.
- **Què d'aquí no encaixa amb l'esquelet i per què** —que és el que demana
  `../BestPractises/AGENTS.md` §5. Un projecte adoptat gairebé mai no
  s'assembla a l'esquelet, i això no és un defecte a corregir.

I copiar-hi `proves/sincronia.js`: és el projecte adoptat qui més el
necessita, perquè és l'únic on l'editor pot anar per davant de git.

---

## Què hi ha

| Fitxer | Què resol |
|---|---|
| `SheetDB.js` | Les fulles **per nom de columna**, amb memòria de lectura per execució. Es poden reordenar columnes al Sheet sense tocar codi. |
| `Auth.js` | Login, sessions amb cau de 3 minuts, **bloqueig per intents**, i recuperació de contrasenya per correu. |
| `Permissions.js` | Matriu de permisos **editable al full**, amb cau de 30 minuts, i `_comprovarAcces_`. |
| `Setup.js` | Esquema, les `activarX()` i els helpers de migració additiva. |
| `Code.js` | `doGet`, i el hook `_dadesInicials_` que estalvia una espera en obrir. |
| `Index.html` | Carcassa: `app-bar` a dalt, `tabbar` a baix, icones SVG i els helpers `App.*`. |
| `Marca` · `Base` · `Styles` | Paleta generada · components compartits · el teu CSS. |
| `Exemple*` | Un mòdul sencer i mínim, per copiar-ne el patró. Esborra'l quan tinguis el teu. |
| `proves/` | Quatre comprovacions que corren aquí, sense desplegar res. |

---

## Les comprovacions, i quan passar-les

```bash
node proves/sincronia.js       # què hi ha a l'editor que no és aquí
node proves/permisos.js        # cap funció pública sense guarda + qui pot cridar què
node proves/rendiment.js       # anades i tornades i operacions de full
node proves/previsualitza.js   # l'app sencera en un HTML estàtic
node ../haddenlabs-estil/verifica.js src/Marca.html src/Styles.html
```

- **`sincronia.js`** va primer, i es passa DUES vegades: en obrir la sessió,
  abans de tocar res, i altra vegada just abans de `clasp push`. Baixa el
  projecte remot a un directori temporal i el compara amb `src/`; no escriu
  res.

  El motiu és un fet de la plataforma: **`clasp push` envia la llista sencera
  de fitxers i substitueix la de l'editor**. Qui hagi tocat el codi des del
  navegador —que a Apps Script és el camí natural, no una excepció— es queda
  sense aquell canvi, sense avís i sense que quedi enlloc. I `git status` surt
  net, perquè el canvi mai va arribar a git: no hi ha cap altra manera
  d'assabentar-se'n que anar-ho a mirar.

  Sortida: `0` coincideixen · `1` divergeixen · `2` no s'ha pogut comprovar
  (sense `.clasp.json`, sense credencial o sense xarxa). Un `2` **no és un
  verd**: vol dir que no ho saps.
- **`permisos.js`** és la que no et pots saltar. A Apps Script **tota funció
  pública és invocable des del navegador**, es mostri o no el seu botó: aquesta
  prova troba la que s'ha quedat sense `_comprovarAcces_`.
- **`rendiment.js`** no falla mai: és un termòmetre. El que importa és la
  tendència entre sessions, no el número. Apunta el total al `CLAUDE.md` quan
  el moguis.
- **`previsualitza.js`** munta l'app en un sol fitxer amb un `google.script.run`
  de mentida. **Mira-t'ho sempre als DOS modes**: el fosc és on surten els
  defectes de contrast, i no es noten fins que algú obre l'app de nit.
- **`verifica.js`** mesura contrastos. Passa'l **abans de desplegar** qualsevol
  canvi de color.

L'esquelet surt de fàbrica amb les quatre en verd.

---

## Afegir un mòdul

Cinc passos, i el mòdul d'exemple els fa tots:

1. **`XService.js`** amb `var MODUL_X = 'X'` i una `_comprovarAcces_(token,
   MODUL_X, 'accio')` a la **primera línia** de cada funció pública.
2. **`X.html`**: un IIFE que crida `App.registrarModul('X', {render})`.
3. **`activarX()` a `Setup.js`** que crea la fulla. Additiva i repetible.
4. **`_construirPermisos_()` i `MENUS_BASE`** a `Setup.js`, i executar
   `aplicarPermisosPerDefecte()` des de l'editor — **no hi arriba sol**.
5. **`<?!= include('X'); ?>`** a `Index.html` i el mòdul a `previsualitza.js`.

Després, `node proves/permisos.js`.

---

## Quatre coses que no són opinió

La resta d'aquest fitxer és una proposta i s'adapta. Aquestes quatre no, i no
per rigidesa: **tres són fets de la plataforma i una és un número**. No estan en
discussió perquè no depenen del criteri de ningú.


1. **`_comprovarAcces_` a la primera línia.** Amagar un botó no és seguretat.
   I el rol sol no n'hi ha prou: de qui és *aquella fila* ho decideix el
   servei (mira `_potGestionarExemple_`).
2. **Qui escriu al full sense passar per `_actualitzar_`/`_afegirAmbId_` ha de
   cridar `_invalidarCauFulla_(nom)`.** Si no, la mateixa execució seguirà
   veient dades velles. (Aquesta depèn de la memòria de lectura de `SheetDB`:
   si algun dia la treus, la regla se'n va amb ella.) Els punts es troben amb
   `grep -nE "\.(setValues?|deleteRows?|appendRow|clearContent)" src/*.js`.
3. **Res que canviï el full s'executa sol.** Ni les `activarX()` ni
   `aplicarPermisosPerDefecte()`. En tancar la sessió, **dir-ho**.
4. **Una superfície amb text blanc surt de `--marca-sup`, mai de `--marca`**,
   que en mode fosc s'aclareix. Això ho diu `verifica.js` amb un número, no
   una opinió sobre el gust.

I una cinquena que **sí** és una decisió nostra, no un fet, però que val la
pena mantenir mentre l'esquelet i els projectes comparteixin el sistema visual:
`Base.html` no s'edita aquí dins. Es canvia a `haddenlabs-estil` i es torna a
sincronitzar. El dia que un projecte necessiti un component que allà no encaixa,
que se'l faci al seu `Styles.html` i **ho escrigui** — això és un límit del
sistema visual i va al catàleg.

---

## El que NO porta, i per què

- **Cap mòdul d'usuaris.** Mentre no en tinguis un, els usuaris s'editen a la
  fulla `USUARIS` — que és perfectament raonable per a aquestes apps, i és el
  mateix criteri que fa que els permisos siguin editables al full. Quan el
  necessitis, `CotxeFutbol/src/UsuarisService.js` és la referència.
- **Cap login per PIN.** CotxeFutbol en té un per anar ràpid provant, i està
  documentat com a deliberadament insegur. Les dreceres de proves tenen
  tendència a quedar-s'hi, i una que ve de fàbrica s'hi queda segur. El que
  sí que s'ha portat és el **bloqueig per intents**, que allà només protegia
  el PIN i aquí protegeix el login de debò.
- **Cap camp de negoci.** L'esquema base només porta infraestructura.

---

## D'on surt cada peça

Gairebé res d'això és nou: s'ha extret de **CotxeFutbol**, que és on aquestes
peces han madurat més, i el catàleg (`../BestPractises/CATALOGO.md`) diu de
cada una on és l'original i quina decisió no òbvia porta dins.

Tres coses **sí** que s'han canviat respecte a l'original, i val la pena
saber-ho perquè són millores que encara no han tornat enrere:

- El **bloqueig per intents** ara protegeix `ferLogin`, no només el PIN.
- El missatge d'error del login **no distingeix** "no existeix" de
  "desactivat" de "contrasenya dolenta": distingir-ho li diu a qualsevol que
  provi correus quins són comptes reals.
- `obtenirContextInicial` ja no sap com es diu el mòdul d'arribada: ho demana
  a `_dadesInicials_`, que defineix cada projecte.

I una cosa que l'esquelet fa bé i els dos projectes existents encara no:
separar **Marca** (generat) de **Base** (sincronitzat) de **Styles** (propi).
Tots dos tenen encara un `Styles.html` monolític.
