"""
Shared base/launcher for NeuralOps first-party MCP addon servers.

This file is NOT an entrypoint by itself anymore -- it holds the one piece
of boilerplate every addon needs (start a FastMCP instance as a standalone
Streamable HTTP server) so each addon's own server_<name>.py file can stay
tiny and just say "run me with this tool set."

Each addon is its own real MCP server: its own process, its own container,
its own hostname on the Docker network, its own <container-name>:8000/mcp
URL -- not paths mounted under one shared server. See server_shopping.py,
server_erp.py, server_ssh.py for the actual entrypoints.

Env vars (all optional, sensible defaults):
  MCP_HOST  -- bind address, default 0.0.0.0
  MCP_PORT  -- port, default 8000
  MCP_PATH  -- HTTP path, default /mcp

To add a new addon:
  1. Create tools/mytool.py with its own FastMCP instance (mcp = FastMCP("MyTool"))
  2. Create server_mytool.py:

       from server import run_addon
       from tools.mytool import mcp as mytool_mcp

       if __name__ == "__main__":
           run_addon(mytool_mcp)

  3. Add a service for it in docker-compose.yaml (command: python server_mytool.py)
"""
import os
from fastmcp import FastMCP


def run_addon(mcp: FastMCP, default_port: int = 8000) -> None:
    """Start a single addon's FastMCP instance as a standalone Streamable HTTP server."""
    host = os.getenv("MCP_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_PORT", str(default_port)))
    path = os.getenv("MCP_PATH", "/mcp")
    print(f"[{mcp.name}] listening on http://{host}:{port}{path}")
    mcp.run(transport="streamable-http", host=host, port=port, path=path)
