FROM node:22 AS builder

RUN mkdir /app

COPY /app/package*.json /app/

WORKDIR /app

RUN npm install

COPY /app /app

# Our Runtime Container
FROM gcr.io/distroless/nodejs22-debian12 AS production

COPY --chown=nonroot:nonroot --from=builder /app /app

USER nonroot

CMD [ "/app/app.js" ]
