# Bygger Tikkr i flera steg, så att den färdiga imagen bara innehåller det som
# faktiskt behövs för att köra — inte byggverktyg och källkod. Ger en image på
# några hundra MB istället för flera GB, vilket gör deploy snabb.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# --- Steg 1: installera beroenden -------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
# npm ci kräver en lockfil och ger exakt samma versioner varje bygge — det vill
# vi ha. Finns ingen lockfil ännu (allra första bygget) faller vi tillbaka på
# npm install. Se README om hur lockfilen skapas och checkas in.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

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

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
