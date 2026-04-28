FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=development

COPY package*.json ./
COPY tsconfig.base.json ./
COPY frontend ./frontend
COPY backend ./backend
COPY worker ./worker
COPY nginx ./nginx
COPY utils ./utils
RUN npm install
RUN ./node_modules/typescript/bin/tsc -p utils/tsconfig.json
RUN ./node_modules/typescript/bin/tsc -p nginx/tsconfig.json
RUN ./node_modules/typescript/bin/tsc -p worker/tsconfig.json

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY . .
RUN npm install --omit=dev
COPY --from=builder /app/worker/dist ./worker/dist
COPY --from=builder /app/utils/dist ./utils/dist
COPY --from=builder /app/nginx/dist ./nginx/dist

CMD ["npm", "run", "start", "--workspace", "worker"]
