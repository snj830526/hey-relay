FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build # tsc로 빌드하는 과정이 필요함
EXPOSE 3000
CMD ["node", "dist/index.js"]
