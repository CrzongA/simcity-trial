# Use Node.js 20 as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# The context will be the frontend directory when built from docker-compose
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port 5173 for Vite dev server
EXPOSE 5173

# Start development server
CMD ["npm", "run", "dev", "--", "--host"]
