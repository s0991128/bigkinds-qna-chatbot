FROM node:22-alpine
WORKDIR /app
COPY public ./public
COPY server ./server
ENV NODE_ENV=production PORT=4173
EXPOSE 4173
USER node
CMD ["node", "server/server.mjs"]

