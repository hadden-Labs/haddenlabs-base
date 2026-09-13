#!/usr/bin/env bash
# crea-projecte.sh — un projecte nou a partir de l'esquelet.
#
#   ./crea-projecte.sh ../la-meva-app "La meva app" "#1f3a5f"
#
# Copia l'esquelet, genera la paleta amb haddenlabs-estil i deixa el projecte
# a punt de `clasp create`. No toca res de fora del directori de destí.
set -euo pipefail

ORIGEN="$(cd "$(dirname "$0")" && pwd)"
# El sistema visual es clona al costat. Es busca un nivell amunt (repos
# germans) i dos (per si aquest esquelet viu dins d'un altre repositori).
ESTIL=""
for c in "$ORIGEN/../haddenlabs-estil" "$ORIGEN/../../haddenlabs-estil"; do
  [ -f "$c/genera.js" ] && ESTIL="$(cd "$c" && pwd)" && break
done

DESTI="${1:-}"
NOM="${2:-}"
COLOR="${3:-}"

if [ -z "$DESTI" ] || [ -z "$NOM" ] || [ -z "$COLOR" ]; then
  echo "ús: $0 <directori> <nom de l'app> <color de marca>"
  echo "ex:  $0 ../la-meva-app \"La meva app\" \"#1f3a5f\""
  exit 2
fi
[ -e "$DESTI" ] && { echo "Ja existeix: $DESTI"; exit 1; }
[ -n "$ESTIL" ] || { echo "No trobo haddenlabs-estil. Clona'l al costat d'aquest repositori."; exit 1; }

mkdir -p "$DESTI"
cp -r "$ORIGEN/src" "$ORIGEN/proves" "$DESTI/"
rm -f "$DESTI/proves/previsualitza.html"

# La paleta es GENERA, no es copia: cada projecte té el seu to i els grisos
# van tenyits cap a ell.
node "$ESTIL/genera.js" "$COLOR" "$NOM" > "$DESTI/src/Marca.html"
cp "$ESTIL/Base.html" "$DESTI/src/Base.html"

# El nom tambe a les dades falses de la previsualitzacio: si no, cada
# projecte nou s'obre dient "La meva app" i sembla que la copia ha fallat.
sed -i.bak "s/La meva app/${NOM//\//\\/}/g" "$DESTI/proves/previsualitza.js"
rm -f "$DESTI/proves/previsualitza.js.bak"

cat > "$DESTI/.gitignore" <<'EOF'
.clasp.json
.clasprc.json
node_modules/
proves/previsualitza.html
EOF

# Heredoc SENSE cometes: expandeix variables, que és el que volem per a
# $NOM. Per això qualsevol $ALTRA_COSA que hagi de sortir LITERAL al fitxer
# va escapada (\$). Sense escapar, \$CLASPRC_B64 hi escriuria la credencial
# OAuth de debò, i el CLAUDE.md es commiteja.
cat > "$DESTI/CLAUDE.md" <<EOF
# $NOM

(Descriu aquí què fa l'app i per a qui, en tres línies.)

Nascuda de l'esquelet \`haddenlabs-base\`.

## Recursos compartits de haddenLABs

Tres repositoris es clonen **al costat**, no a dins:

- \`../BestPractises/\` — criteri (\`AGENTS.md\`), **catàleg del que ja està
  resolt** (\`CATALOGO.md\`) i paranys d'Apps Script (\`gas/danos-conocidos.md\`).
- \`../haddenlabs-estil/\` — el sistema visual. Passar \`verifica.js\` abans de
  desplegar qualsevol canvi de color.
- \`../haddenlabs-base/\` — l'esquelet d'on ha sortit aquest projecte. **No és
  una dependència**: el codi d'aquí ja és teu i pots canviar-lo tot.

**Abans de construir res que faci olor de ja resolt** (mapes, calendaris,
fotos, accés, migracions, rendiment): mirar \`CATALOGO.md\`.

**En tancar la sessió**, a més d'actualitzar aquest fitxer: si has resolt
alguna cosa que *tornaries a escriure de zero si demà la necessités un altre
projecte*, afegeix-hi una fitxa. Si és específic d'aquest projecte, va aquí.

**Res d'això és obligatori.** El catàleg diu «això existeix i funciona així»,
no «fes-ho així», i el codi d'aquest projecte ja és teu: si l'estructura de
l'esquelet no encaixa aquí, **adapta-la**. L'única cosa que es demana a canvi
és **escriure per què**, en aquest mateix fitxer — sense el motiu, la sessió
següent veurà una desviació sense sentit i l'«arreglarà» cap a l'estàndard.

I si l'estàndard no encaixava, **això també s'anota** al catàleg («Dónde el
estándar no encajó»): val més que una fitxa d'una cosa que sí va funcionar,
perquè marca fins on arriba.

## Nivell

(Una frase: quants usuaris, què passa si cau un dia, si hi ha dades personals
o diners. Serveix sobretot per saber què NO cal construir. Vegeu
\`../BestPractises/AGENTS.md\`.)

## Estat

Acabat de crear. Encara no desplegat.

### Pendent d'executar des de l'editor d'Apps Script

1. \`crearFullIInicialitzar()\` — crea les fulles i l'administrador inicial.
   **Apunta la contrasenya que surt al registre: no torna a sortir.**
2. \`activarExemple()\` — crea la fulla del mòdul d'exemple.

## Configuració de clasp

- \`scriptId\`: l'omple \`clasp create\`, a \`.clasp.json\` (que NO es commiteja).
- \`rootDir\`: \`src\`.
- **Desplegament de producció**: (apunta l'id aquí després del primer
  \`clasp deploy\`, i també l'URL de l'app. Si no, d'aquí a sis mesos no se sap
  quin dels desplegaments és el que fa servir la gent.)

En entorns remots hi sol haver una credencial OAuth a la variable d'entorn
\`CLASPRC_B64\` (base64 d'un \`.clasprc.json\`). Abans d'usar \`clasp\`:

\`\`\`bash
echo "\$CLASPRC_B64" | base64 -d > ~/.clasprc.json
\`\`\`

**Mai commitejar \`.clasprc.json\`**: porta els tokens OAuth del compte de
Google propietari de l'script. Ja és al \`.gitignore\`.

## Publicar un canvi

\`\`\`bash
git push                              # versionat
clasp push                            # a l'editor d'Apps Script
clasp redeploy <deploymentId> -d "…"  # als usuaris. SEMPRE el mateix.
\`\`\`

Un desplegament nou canvia l'URL i deixa els usuaris amb l'enllaç antic.

## Comprovacions abans de desplegar

\`\`\`bash
node proves/permisos.js                                    # cap funció sense guarda
node proves/rendiment.js                                   # anades i tornades
node proves/previsualitza.js && open proves/previsualitza.html   # als DOS modes
node ../haddenlabs-estil/verifica.js src/Marca.html src/Styles.html
\`\`\`
EOF

# Xarxa de seguretat: cap secret de l'entorn pot haver acabat dins del projecte.
# El CLAUDE.md es genera amb un heredoc que expandeix variables i es commiteja,
# així que un $ sense escapar hi escriuria la credencial de debò. Això ho atura
# abans que ningú faci el primer commit.
for VAR in CLASPRC_B64 GITHUB_TOKEN GH_TOKEN; do
  VAL="$(printenv "$VAR" || true)"
  [ -n "$VAL" ] && [ ${#VAL} -gt 12 ] || continue
  if grep -rqF "$VAL" "$DESTI" 2>/dev/null; then
    echo "  ATURAT: el valor de \$$VAR ha acabat dins de $DESTI."
    echo "  Revisa els heredocs de $0: el que ha de sortir literal va escapat (\\\$)."
    rm -rf "$DESTI"
    exit 1
  fi
done

echo
echo "  Projecte creat a $DESTI"
echo
echo "  Ara:"
echo "    cd $DESTI"
echo "    git init && git add . && git commit -m 'Projecte nou des de l'\''esquelet'"
echo "    clasp create --title \"$NOM\" --type sheets --rootDir src"
echo "    clasp push"
echo
echo "  I des de l'editor d'Apps Script, un cop:"
echo "    crearFullIInicialitzar()   (apunta la contrasenya que surti!)"
echo "    activarExemple()"
echo
