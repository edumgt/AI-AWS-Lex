FROM node:20-bookworm-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy app source
COPY . .

ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
EXPOSE 9000

CMD ["npm", "run", "dev"]
