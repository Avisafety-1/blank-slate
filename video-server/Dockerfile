FROM bluenviron/mediamtx:latest AS mtx

FROM alpine:3.22

# ca-certificates: uten den feiler HTTP-auth mot Supabase med
#   "certificate signed by unknown authority".
# curl: brukes av runOnPublish/runOnUnpublish for å melde fra til AviSafe
#   med én gang en strøm starter eller stopper.
RUN apk add --no-cache ca-certificates curl
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

COPY --from=mtx /mediamtx /mediamtx

# MediaMTX gjør ingen omkoding: H.264 fra RTMP kopieres rått til WebRTC.
COPY mediamtx.yml /mediamtx.yml

EXPOSE 1935/tcp 8889/tcp 8189/tcp

ENTRYPOINT ["/mediamtx", "/mediamtx.yml"]
