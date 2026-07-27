"""
NeuralOps MCP Server

Single FastMCP server hosting all first-party tools:
  - BestBuy   — product search, detail, availability
  - Walmart   — product search, item detail, inventory
  - ERP       — orders (list/detail/form), customers, inventory report
  - SSH       — execute, list files, read file, server status

Transport: Streamable HTTP (default port 8000)
Add to NeuralOps via /add_mcp → http://nexus-mcp:8000

To add new tools:
  1. Create tools/mytools.py with a FastMCP instance
  2. Import and mount it below with mcp.mount()
  3. Rebuild the container
"""
from fastmcp import FastMCP
from tools.shopping import mcp as shopping_mcp
from tools.erp import mcp as erp_mcp
from tools.ssh import mcp as ssh_mcp

mcp = FastMCP(
    "NeuralOps MCP",
    instructions=(
        "NeuralOps first-party MCP server. "
        "Provides tools for Shopping (BestBuy, Walmart, Amazon via Google Shopping), "
        "ERP (Odoo), and SSH. "
        "Outputs use <<<HTML>>>, <<<TERMINAL>>>, and <<<FORM>>> markers "
        "for rich rendering in the NeuralOps chat UI."
    ),
)

mcp.mount(shopping_mcp, "shopping")
mcp.mount(erp_mcp, "erp")
mcp.mount(ssh_mcp, "ssh")

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
