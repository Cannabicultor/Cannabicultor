#!/bin/zsh

# Atajo de conveniencia desde la raíz del proyecto
# Ejecuta exactamente lo mismo que pipeline/run-discovery.sh
#
# Si da "permission denied", ejecuta:
#   chmod +x run-discovery.sh pipeline/run-discovery.sh

exec ./pipeline/run-discovery.sh "$@"
