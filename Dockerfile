# FROM node:18-alpine

# EXPOSE 8080

# WORKDIR /app

# ENV NODE_ENV=production

# COPY package.json package-lock.json* ./

# RUN npm ci --omit=dev && npm cache clean --force
# # Remove CLI packages since we don't need them in production by default.
# # Remove this line if you want to run CLI commands in your container.
# RUN npm remove @shopify/cli

# COPY . .

# RUN npm run build

# CMD ["npm", "run", "docker-start"]


FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force
# Remove CLI packages since we don't need them in production by default.
# Remove this line if you want to run CLI commands in your container.
RUN npm remove @shopify/cli

RUN npm run build

COPY . .

EXPOSE 8080

CMD ["npm", "run", "docker-start"]



# FROM node:18-alpine

# WORKDIR /app

# COPY package.json package-lock.json ./

# RUN npm install --production

# COPY . .

# EXPOSE 8080


# CMD ["node", "app.js"]
