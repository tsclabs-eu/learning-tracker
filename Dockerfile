FROM node:22 AS builder

RUN mkdir /app

COPY /app/package*.json /app/

WORKDIR /app

RUN npm install

COPY /app /app

# Our Runtime Container
FROM gcr.io/distroless/nodejs22-debian12 AS production

COPY --chown=65532:65532 --from=builder /app /app

USER nonroot

WORKDIR /app

CMD [ "/app/app.js" ]
