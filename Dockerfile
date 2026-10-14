FROM node:20-alpine
WORKDIR /app
COPY server ./server
COPY package.json ./package.json
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server/server.js"]
