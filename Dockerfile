FROM node:22 AS builder

RUN mkdir /app

COPY /app/package*.json /app/

WORKDIR /app

RUN npm install

COPY /app /app

# Our Runtime Container
FROM gcr.io/distroless/nodejs22-debian12 AS production

COPY --from=builder  /app /app

RUN chown -R nonroot:nonroot /app

USER nonroot

CMD [ "/app/app.js" ]
