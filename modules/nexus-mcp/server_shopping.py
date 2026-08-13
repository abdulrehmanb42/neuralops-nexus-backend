"""
NeuralOps Shopping MCP Server

Own process, own container, own <container-name>:8000/mcp endpoint.
Product search + price comparison across BestBuy/Walmart/Amazon/etc via
Google Shopping (SerpAPI). See tools/shopping.py for the actual tools.

Add to NeuralOps via Add MCP Server -> transport: http, url: http://<this-container>:8000/mcp
"""
from server import run_addon
from tools.shopping import mcp as shopping_mcp

if __name__ == "__main__":
    run_addon(shopping_mcp)
