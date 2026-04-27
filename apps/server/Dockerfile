FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/
RUN npm ci --workspace @voicechat/server --include-workspace-root
COPY apps/server ./apps/server
RUN npm run build -w @voicechat/server

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY apps/server/rooms.yaml ./apps/server/rooms.yaml
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["node", "dist/index.js"]
