"""
NeuralOps SerpAPI MCP Server

Hosts shopping/search tools powered by SerpAPI:
  - search_products (Google Shopping)
  - bestbuy_search, bestbuy_detail
  - walmart_search, walmart_detail

Transport: Streamable HTTP (port 8000)
Add to NeuralOps via /add_mcp → transport: http, url: http://nexus-serp-mcp:8000/mcp
"""
from fastmcp import FastMCP
from tools.shopping import mcp as shopping_mcp

mcp = FastMCP(
    "NeuralOps SerpAPI",
    instructions=(
        "SerpAPI/Shopping MCP server for NeuralOps. "
        "Provides product search across Google Shopping, BestBuy, and Walmart. "
        "Outputs use <<<HTML>>> markers."
    ),
)

mcp.mount(shopping_mcp, "serp")

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
