FROM bluenviron/mediamtx:latest

# MediaMTX gjør ingen omkoding: H.264 fra RTMP kopieres rått til WebRTC.
COPY mediamtx.yml /mediamtx.yml

EXPOSE 1935/tcp 8889/tcp 8189/tcp

ENTRYPOINT ["/mediamtx", "/mediamtx.yml"]
