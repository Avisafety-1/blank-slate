FROM alpine:3.22 AS certificates

RUN apk add --no-cache ca-certificates

FROM bluenviron/mediamtx:latest

# MediaMTX-imaget er minimalt og kan mangle systemets CA-pakke. Uten denne
# kan HTTP-auth mot Supabase feile med "certificate signed by unknown authority".
COPY --from=certificates /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

# MediaMTX gjør ingen omkoding: H.264 fra RTMP kopieres rått til WebRTC.
COPY mediamtx.yml /mediamtx.yml

EXPOSE 1935/tcp 8889/tcp 8189/tcp

ENTRYPOINT ["/mediamtx", "/mediamtx.yml"]