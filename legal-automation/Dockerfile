FROM node:18-alpine

WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache python3 make g++

# Copiar arquivos
COPY package*.json ./
RUN npm ci --only=production

# Copiar código
COPY . .

# Build TypeScript
RUN npm run build

# Criar diretórios necessários
RUN mkdir -p /app/certs /app/uploads /app/logs

# Expostar porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/index.js"]
