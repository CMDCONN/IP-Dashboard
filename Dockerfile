FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/dashboard.db

VOLUME /data

EXPOSE 3001

CMD ["node", "server/index.js"]
