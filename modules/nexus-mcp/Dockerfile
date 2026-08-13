# Stage 0: build the official GitHub MCP server binary from source
# (github.com/github/github-mcp-server) -- kept isolated to THIS addon
# image specifically so nexus-ai and the other addons never need a Go
# toolchain. Only the compiled binary is copied into the final stage below;
# the Go compiler itself never ends up in the image that actually ships.
FROM golang:1.25-bookworm AS github-mcp-builder
WORKDIR /src
# GOTOOLCHAIN=auto -- github-mcp-server's go.mod pins a minimum Go version
# that moves forward over time (hit go>=1.25.12 needed vs 1.23 pinned here
# on 2026-08-10). auto lets Go itself fetch whatever patch/minor go.mod
# actually demands instead of hard-failing when this base image's Go
# version eventually falls behind again.
ENV GOTOOLCHAIN=auto
RUN git clone --depth 1 https://github.com/github/github-mcp-server.git . \
    && go build -o /out/github-mcp-server ./cmd/github-mcp-server

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=github-mcp-builder /out/github-mcp-server /usr/local/bin/github-mcp-server

EXPOSE 8000

# server.py is a shared base module now, not an entrypoint -- every addon
# (server_shopping.py, server_erp.py, server_ssh.py, ...) is its own real
# server and gets its own container. docker-compose.yaml overrides `command`
# per service to pick which one runs; this default is just for `docker run`
# without an override.
CMD ["python", "server_shopping.py"]
