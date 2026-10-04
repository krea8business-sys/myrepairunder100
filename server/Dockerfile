FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN (npm ci --omit=dev || npm install --omit=dev) && npm i drizzle-orm pg --no-save
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY assets ./assets
EXPOSE 4000
USER node
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
