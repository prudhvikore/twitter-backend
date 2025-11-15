FROM node:20-alpine

WORKDIR /api

COPY package*.json .
RUN npm install
COPY app.js .

CMD ["node", "app.js"]