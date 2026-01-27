# Dockerfile for Learning Tracker (All-in-One Mode)
# This image includes both frontend and API with database support
# Build with: docker build --build-arg VERSION=1.0.0 -t learning-tracker .

ARG VERSION=unknown

FROM node:22 AS builder

RUN mkdir /app

COPY /app/package*.json /app/

WORKDIR /app

RUN npm install --production

COPY /app /app

# Runtime Container
FROM gcr.io/distroless/nodejs22-debian12 AS production

ENV APP_MODE=all-in-one
ENV APP_VERSION=${VERSION}

# Default configuration
ENV PORT=3000 \
    LOG_LEVEL=info \
    LOG_OUTPUT=console \
    DB_TYPE=sqlite \
    DB_NAME=/data/learning.db \
    DB_HOST=localhost \
    DB_PORT=3306 \
    DB_USER=root \
    DB_PASSWORD=""

COPY --chown=65532:65532 --from=builder /app /app

USER nonroot

WORKDIR /app

EXPOSE 3000

CMD [ "/app/app.js" ]
