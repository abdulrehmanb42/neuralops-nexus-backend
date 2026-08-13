"""
NeuralOps GitHub MCP Server

A thin HTTP-exposed proxy over GitHub's own official open-source
github-mcp-server binary (github.com/github/github-mcp-server), compiled
from source in this container's own Dockerfile -- not a reimplementation.

Kept as its own addon container (not registered as a direct stdio command
from nexus-ai) specifically so nexus-ai never needs a Go toolchain baked
into its image: nexus-ai just connects to this container's :8000/mcp URL
like any other HTTP-transport MCP server, the same way it already talks to
mcp-shopping/mcp-erp/mcp-ssh.

Bridges stdio -> HTTP using FastMCP's create_proxy():
  nexus-ai --(HTTP)--> this container --(stdio, in-process subprocess)--> github-mcp-server binary

Single shared token for now (GITHUB_PERSONAL_ACCESS_TOKEN env var, set once
at deploy time via docker-compose/.env) -- multi-tenant per-request tokens
are explicitly out of scope for this pass. MCPServer.secrets_encrypted /
set_secrets() still exists for stdio-from-nexus-ai addons that DO need
per-company secrets later; this addon just doesn't use that path since it's
a single shared container, not something nexus-ai spawns itself.
"""
import os

from fastmcp.client.transports import StdioTransport
from fastmcp.server import create_proxy

from server import run_addon

_token = os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN", "")
if not _token:
    raise RuntimeError(
        "GITHUB_PERSONAL_ACCESS_TOKEN is not set -- required for the GitHub "
        "MCP server binary to authenticate against the GitHub API. Set it "
        "in .env / docker-compose.yaml for the mcp-github service."
    )

_backend = StdioTransport(
    command="/usr/local/bin/github-mcp-server",
    args=["stdio"],
    env={"GITHUB_PERSONAL_ACCESS_TOKEN": _token},
)

mcp = create_proxy(_backend, name="NeuralOps GitHub")

if __name__ == "__main__":
    run_addon(mcp)
