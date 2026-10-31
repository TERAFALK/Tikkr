# Bygger Tikkr i flera steg, så att den färdiga imagen bara innehåller det som
# faktiskt behövs för att köra — inte byggverktyg och källkod. Ger en image på
# några hundra MB istället för flera GB, vilket gör deploy snabb.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# --- Steg 1: installera beroenden -------------------------------------------
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
# npm ci ger exakt samma versioner varje bygge.
#
# NYCKELN TILL PAKETREGISTRET ÄR EN BYGGSECRET. Den monteras bara under det här
# steget och hamnar varken i ett lager eller i imagens historik, vilket den hade
# gjort som ARG eller ENV. Se docs/drift.md punkt 11.
RUN --mount=type=secret,id=npm_token,required=true \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" npm ci

# --- Steg 2: bygg appen ------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Steg 3: den färdiga körbara imagen -------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Appen körs som en vanlig användare, inte root. Om någon skulle hitta ett hål
# i appen begränsar det vad angriparen kan göra i containern.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma-klienten som appen använder för att prata med databasen. Prismas
# KOMMANDOVERKTYG (migrationer) finns medvetet inte här — det drar med sig
# många beroenden. Migrationerna körs av "migrate"-containern istället, som
# använder builder-steget ovan där allt redan finns.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# PDF-biblioteket i sin helhet, med teckensnittsfilerna det läser vid körning.
# Next spårar inte filer som öppnas dynamiskt, och en saknad .afm-fil gör att
# varje PDF-export misslyckas.
COPY --from=builder /app/node_modules/pdfkit ./node_modules/pdfkit
COPY --from=builder /app/node_modules/fontkit ./node_modules/fontkit

# Vilken version imagen är byggd ur, t.ex. "v1.2.0". Sätts av
# ops/release.sh och visas i /api/health, så att det går att se vad som
# kör utan att logga in på servern. Ligger sist, så att en ny version inte
# gör stegen ovan ogiltiga i byggets cache.
ARG TIKKR_VERSION=dev
ENV TIKKR_VERSION=$TIKKR_VERSION
LABEL se.tikkr.version=$TIKKR_VERSION

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
