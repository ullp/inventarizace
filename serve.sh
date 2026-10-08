#!/usr/bin/env bash
# IQ-Čtečka – spustí lokální HTTP server pro vývoj/testování.
# Použití:  ./serve.sh  [port]        (výchozí port 8000)
# Kamera v mobilu vyžaduje HTTPS nebo localhost.
set -e
PORT="${1:-8000}"
cd "$(dirname "$0")"
echo "IQ-Čtečka běží na:  http://localhost:$PORT/"
echo "Ukončení: Ctrl+C"
echo
python3 -m http.server "$PORT"
