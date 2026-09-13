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

cat > "$DESTI/CLAUDE.md" <<EOF
# $NOM

(Descriu aquí què fa l'app i per a qui, en tres línies.)

Nascuda de l'esquelet \`BestPractises/base\`.

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
