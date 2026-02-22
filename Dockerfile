FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src/ ./src/
COPY mascots/ ./mascots/
COPY prompts/ ./prompts/
RUN mkdir -p /app/data
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "--experimental-sqlite", "src/discord/server.ts"]
