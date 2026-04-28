FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY utils ./utils
COPY nginx ./nginx
COPY worker ./worker
RUN npm ci
RUN npm run build --workspace utils
RUN npm run build --workspace nginx
RUN npm run build --workspace worker

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY . .
RUN npm install --omit=dev
COPY --from=builder /app/worker/dist ./worker/dist
COPY --from=builder /app/utils/dist ./utils/dist
COPY --from=builder /app/nginx/dist ./nginx/dist

CMD ["npm", "run", "start", "--workspace", "worker"]
