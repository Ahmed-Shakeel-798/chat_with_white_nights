FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build the React app
RUN npm run build

# Expose port (for dev, production uses nginx/server)
EXPOSE 5173

# Development: use vite dev server
CMD ["npm", "run", "dev", "--", "--host"]
