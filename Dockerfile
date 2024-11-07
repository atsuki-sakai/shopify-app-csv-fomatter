FROM node:18-alpine

WORKDIR /app

# パッケージファイルをコピーして依存関係をインストール
COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force
# Remove CLI packages since we don't need them in production by default.
# Remove this line if you want to run CLI commands in your container.
RUN npm remove @shopify/cli

# ソースコード全体をコピー
COPY . .

# ビルドを実行
RUN npm run build

EXPOSE 8080

CMD ["npm", "run", "docker-start"]
