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
RUN npm run build --workspace frontend

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY . .
RUN npm install --omit=dev
COPY --from=builder /app/frontend/.next ./frontend/.next

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "frontend"]
