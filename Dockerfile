# This Dockerfile sets up a Node.js application.
# It installs dependencies, builds the application, and runs it in production mode.
# Use this Dockerfile to create a Docker image for your Node.js application.
# Make sure to uncomment the migration and seed commands if needed.
# Use the command `docker build -t your-image-name .` to build the image.       
FROM node:22-alpine 
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

# Stage 2: Install dependencies
COPY package.json pnpm-lock.yaml node_modules public ./

# Stage 3: Build the Next.js app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --chown=nextjs:nodejs standalone ./
COPY --chown=nextjs:nodejs static ./.next/static
RUN pnpm install --frozen-lockfile

# Stage 4: Production runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]