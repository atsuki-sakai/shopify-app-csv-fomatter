FROM node:18-alpine

EXPOSE 3000

WORKDIR /app

# ソースコード全体をコピー
COPY . .
# パッケージファイルをコピーして依存関係をインストール
# COPY package.json package-lock.json* ./
ENV NODE_ENV=production


RUN npm ci --omit=dev && npm cache clean --force
# Remove CLI packages since we don't need them in production by default.
# Remove this line if you want to run CLI commands in your container.
RUN npm remove @shopify/cli

# ビルドを実行
RUN npm run build


CMD ["npm", "run", "docker-start"]
