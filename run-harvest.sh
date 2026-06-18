#!/bin/zsh
# Atajo desde la raíz
#
# Si da "permission denied", ejecuta:
#   chmod +x run-harvest.sh pipeline/run-harvest.sh

exec ./pipeline/run-harvest.sh "$@"
