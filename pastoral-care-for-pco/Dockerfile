# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --legacy-peer-deps

# Copy application source code
COPY . .

# Build the application (Vite frontend + ESBuild Node backend)
RUN npm run build

# Remove development dependencies to reduce image size (Optional but recommended)
# We can use npm prune, but since we just run node on dist/, npm ci --omit=dev can be tricky with esbuild output if it needs any runtime deps.
# Standard node:20 image handles the start fine.

# Expose Cloud Run port
EXPOSE 8080

# Configure environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Start the application
CMD [ "npm", "start" ]
