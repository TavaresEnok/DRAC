#!/usr/bin/env bash
# build-client.sh — gera um APK white-label assinado para um cliente.
#
#   ./scripts/build-client.sh <slug>
#
# Lê clients/<slug>/config.json, embute branding + servidor, builda em release,
# assina com a keystore PRÓPRIA do cliente (gerada na 1ª vez e reusada nas
# próximas, para que updates instalem por cima) e publica drac-<slug>.apk.
#
# Seguro para ser disparado por um worker: o slug é validado por regex e nada
# do usuário é interpolado em shell sem checagem.
set -euo pipefail

SLUG="${1:-}"
if [[ -z "$SLUG" ]]; then echo "uso: build-client.sh <slug>" >&2; exit 2; fi
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]{1,38}$ ]]; then
  echo "slug inválido (use a-z 0-9 -, 2-39 chars): $SLUG" >&2; exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_DIR="$MOBILE_DIR/clients/$SLUG"
CONFIG="$CLIENT_DIR/config.json"
[[ -f "$CONFIG" ]] || { echo "config não encontrada: $CONFIG" >&2; exit 2; }

# Toolchain local (sem conta Expo). Permite override por env.
export JAVA_HOME="${JAVA_HOME:-$HOME/toolchain/jdk-17.0.19+10}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/toolchain/android-sdk}"
# apksigner/keytool chamam `java` pelo PATH — garante o JDK disponível.
export PATH="$JAVA_HOME/bin:$PATH"
BUILD_TOOLS="$ANDROID_HOME/build-tools/36.0.0"
KEYSTORE_DIR="${KEYSTORE_DIR:-$HOME/toolchain/keystores}"
BUILDS_DIR="$MOBILE_DIR/builds"
# Diretório do HOST montado no nginx (vms-web:/usr/share/nginx/html/apk:ro).
# Publicar aqui sobrevive a rebuilds do container e dispensa `docker cp`.
APK_PUBLISH_DIR="${APK_PUBLISH_DIR:-$MOBILE_DIR/../../infra/apk}"
MIN_FREE_GB="${MIN_FREE_GB:-8}"

mkdir -p "$KEYSTORE_DIR" "$BUILDS_DIR" "$APK_PUBLISH_DIR"

# Guarda de disco: não buildar se o root estiver perto de encher (protege o
# streaming/gravação que rodam no mesmo servidor).
free_gb="$(df -BG --output=avail "$MOBILE_DIR" | tail -1 | tr -dc '0-9')"
if [[ "${free_gb:-0}" -lt "$MIN_FREE_GB" ]]; then
  echo "espaço insuficiente: ${free_gb}G livres (< ${MIN_FREE_GB}G)" >&2; exit 3
fi

PACKAGE_ID="$(node -e "process.stdout.write((require('$CONFIG').packageId||''))")"
if [[ ! "$PACKAGE_ID" =~ ^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$ ]]; then
  echo "packageId inválido em config.json: '$PACKAGE_ID'" >&2; exit 2
fi
APP_NAME="$(node -e "process.stdout.write((require('$CONFIG').appName||'$SLUG'))")"

echo ">> Cliente: $SLUG  |  app: $APP_NAME  |  pacote: $PACKAGE_ID"

# Logo da tela de login: troca o asset fixo pelo do cliente (com backup p/ restaurar).
LOGO_DST="$MOBILE_DIR/assets/branding/logo.png"
LOGO_BAK="$(mktemp)"
cp "$LOGO_DST" "$LOGO_BAK"
restore_logo() { cp "$LOGO_BAK" "$LOGO_DST"; rm -f "$LOGO_BAK"; }
trap restore_logo EXIT
# O cliente pode ter enviado o logo em qualquer formato (JPEG/WebP/etc) salvo
# como .png — o AAPT do Android recusa isso ("file failed to compile"). Então
# re-codifica para PNG REAL com ffmpeg (lê pelo conteúdo, não pela extensão).
# Se a conversão falhar, mantém o logo padrão e segue (não quebra o build).
if [[ -f "$CLIENT_DIR/logo.png" ]]; then
  if command -v ffmpeg >/dev/null 2>&1 && ffmpeg -y -loglevel error -i "$CLIENT_DIR/logo.png" -pix_fmt rgba "$LOGO_DST" 2>/dev/null; then
    echo ">> logo do cliente convertido para PNG válido"
  else
    echo ">> aviso: logo do cliente inválido/não convertível — usando o logo padrão"
  fi
fi

cd "$MOBILE_DIR"
export CLIENT="$SLUG"

echo ">> prebuild (--clean: regenera android/ do zero p/ o pacote deste cliente)…"
# --clean é essencial num builder multi-cliente: sem ele, restos do build do
# cliente anterior (ex.: autolinking gerado com o pacote antigo) quebram a
# compilação ("package com.ajustconsulting.drac<outro> does not exist").
npx expo prebuild --platform android --no-install --clean >/dev/null
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

# Gera APK só p/ celulares modernos (arm64-v8a). O prebuild traz 4 ABIs
# (armeabi-v7a 32-bit + x86/x86_64 de EMULADOR) que inflavam o APK ~3x (~97MB).
# Forçamos de 2 formas (à prova de falha): a property do plugin RN E o
# abiFilters do defaultConfig (controle definitivo do empacotamento de .so).
TARGET_ABIS="${TARGET_ABIS:-arm64-v8a}"
sed -i "s/^reactNativeArchitectures=.*/reactNativeArchitectures=$TARGET_ABIS/" android/gradle.properties
TARGET_ABIS="$TARGET_ABIS" node -e '
  const fs = require("fs"); const f = "android/app/build.gradle";
  let s = fs.readFileSync(f, "utf8");
  const abis = process.env.TARGET_ABIS.split(",").map(a => `"${a.trim()}"`).join(", ");
  if (!s.includes("abiFilters")) {
    s = s.replace(/defaultConfig\s*\{/, (m) => `${m}\n        ndk { abiFilters ${abis} }`);
    fs.writeFileSync(f, s);
  }
'

echo ">> gradle assembleRelease (baixa prioridade)…"
( cd android && nice -n 15 ionice -c3 ./gradlew assembleRelease \
    -PreactNativeArchitectures="$TARGET_ABIS" --no-daemon --console=plain >/dev/null )

UNSIGNED="$MOBILE_DIR/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$UNSIGNED" ]] || { echo "APK não gerado" >&2; exit 1; }

# Keystore própria do cliente (cria na 1ª vez; senha aleatória guardada ao lado).
KS="$KEYSTORE_DIR/$SLUG.jks"
PASS_FILE="$KEYSTORE_DIR/$SLUG.pass"
if [[ ! -f "$KS" ]]; then
  echo ">> gerando keystore para $SLUG…"
  head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' > "$PASS_FILE"
  chmod 600 "$PASS_FILE"
  "$JAVA_HOME/bin/keytool" -genkeypair -v -keystore "$KS" -alias "$SLUG" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass:file "$PASS_FILE" -keypass:file "$PASS_FILE" \
    -dname "CN=$APP_NAME, O=DRAC, C=BR" >/dev/null
fi

OUT="$BUILDS_DIR/drac-$SLUG.apk"
echo ">> assinando com a keystore do cliente…"
# Sem --key-pass: a senha da chave é a mesma do store (apksigner assume).
# Passar o mesmo arquivo nos dois faria o apksigner ler 2x e bater EOF.
"$BUILD_TOOLS/apksigner" sign \
  --ks "$KS" --ks-key-alias "$SLUG" \
  --ks-pass "file:$PASS_FILE" \
  --out "$OUT" "$UNSIGNED"
"$BUILD_TOOLS/apksigner" verify "$OUT" >/dev/null && echo ">> assinatura OK"

# Publica no diretório do host servido pelo nginx (sobrevive a rebuilds) +
# mantém a cópia em builds/.
cp -f "$OUT" "$APK_PUBLISH_DIR/drac-$SLUG.apk"

VERSION="$($BUILD_TOOLS/aapt dump badging "$OUT" 2>/dev/null | sed -n "s/.*versionName='\([^']*\)'.*/\1/p")"
echo "OK_APK=$OUT"
echo "OK_VERSION=$VERSION"
echo "OK_URL=/apk/drac-$SLUG.apk"
