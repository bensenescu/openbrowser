FROM alpine:3.19

# Install only essential packages
RUN apk add --no-cache \
    chromium \
    ca-certificates

EXPOSE 3000

# Run Chromium with remote debugging on port 3000
CMD ["chromium-browser", \
     "--headless", \
     "--disable-gpu", \
     "--no-sandbox", \
     "--disable-setuid-sandbox", \
     "--disable-dev-shm-usage", \
     "--remote-debugging-port=3000", \
     "--remote-debugging-address=0.0.0.0"]
