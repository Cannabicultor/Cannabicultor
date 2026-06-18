# Dockerfile para el pipeline de Cannabicultor
# Base: Node 20 (buen soporte para fetch nativo + Playwright futuro)
#
# Fases de construcción:
#  - Etapa actual: soporta scripts cheerio + @supabase (fetch puro)
#  - Futuro: cuando uses Playwright, descomenta las líneas de instalación de browsers
#    y usa la imagen oficial de Playwright o instala los browsers.

FROM node:20-slim AS base

# Dependencias del sistema necesarias para cheerio, puppeteer/playwright y certificados
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    # Para Playwright (descomentar cuando migres a navegadores reales):
    # libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 libasound2 \
    # fonts-liberation libappindicator3-1 xdg-utils \
    # && npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia package.json del pipeline (o usa el raíz con workspaces)
COPY package.json package-lock.json* ./

# Instala solo dependencias de producción por defecto
RUN npm ci --omit=dev || npm install --production

# Copia el código del pipeline y scripts compartidos
# (En una refactorización real moveremos extractors/lib aquí)
COPY . .

# Crea carpetas para volúmenes
RUN mkdir -p /app/data /app/logs

# Usuario no root (buena práctica)
RUN useradd -m -u 1001 pipelineuser && chown -R pipelineuser:pipelineuser /app
USER pipelineuser

# Puerto por defecto (útil si expones algún health endpoint más adelante)
EXPOSE 3000

# Comando por defecto (puede ser sobreescrito en compose o al hacer docker run)
# Para el scraper actual de breeders:
CMD ["node", "extractors/seedfinder-scraper.mjs"]
# Alternativas comunes:
# CMD ["node", "../enrich-breeders.mjs"]   # mientras migramos
# CMD ["node", "../enrich-varieties-detailed.mjs"]
