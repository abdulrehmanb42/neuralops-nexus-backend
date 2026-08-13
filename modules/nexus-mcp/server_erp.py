"""
NeuralOps ERP MCP Server

Own process, own container, own <container-name>:8000/mcp endpoint.
Odoo tools: orders (list/detail/form), customers, products, inventory report.
See tools/erp.py for the actual tools.

Add to NeuralOps via Add MCP Server -> transport: http, url: http://<this-container>:8000/mcp
"""
from server import run_addon
from tools.erp import mcp as erp_mcp

if __name__ == "__main__":
    run_addon(erp_mcp)
