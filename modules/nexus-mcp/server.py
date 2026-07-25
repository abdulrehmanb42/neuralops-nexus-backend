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
from tools.bestbuy import mcp as bestbuy_mcp
from tools.walmart import mcp as walmart_mcp
from tools.erp import mcp as erp_mcp
from tools.ssh import mcp as ssh_mcp

mcp = FastMCP(
    "NeuralOps MCP",
    instructions=(
        "NeuralOps first-party MCP server. "
        "Provides tools for BestBuy, Walmart, ERP (Odoo), and SSH. "
        "Outputs use <<<HTML>>>, <<<TERMINAL>>>, and <<<FORM>>> markers "
        "for rich rendering in the NeuralOps chat UI."
    ),
)

mcp.mount("bestbuy", bestbuy_mcp)
mcp.mount("walmart", walmart_mcp)
mcp.mount("erp", erp_mcp)
mcp.mount("ssh", ssh_mcp)

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
