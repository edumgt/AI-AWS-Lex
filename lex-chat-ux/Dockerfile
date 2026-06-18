FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=development
ENV HOST=0.0.0.0

EXPOSE 9000

CMD ["npm", "run", "dev"]
