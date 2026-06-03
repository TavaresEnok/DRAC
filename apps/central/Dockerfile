FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY apps/central/package.json ./package.json
COPY apps/central/src ./src
COPY apps/central/public ./public
COPY apps/central/scripts ./scripts

EXPOSE 9765
CMD ["node", "src/server.js"]
