FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY frontend ./frontend
COPY backend ./backend
COPY worker ./worker
COPY nginx ./nginx
COPY utils ./utils
RUN npm install
RUN cd utils && npx tsc -p tsconfig.json
RUN cd backend && npx tsc -p tsconfig.json

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY . .
RUN npm install --omit=dev
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/utils/dist ./utils/dist

EXPOSE 4000
CMD ["npm", "run", "start", "--workspace", "backend"]
