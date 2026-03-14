FROM node:20.18-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY index.js ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
