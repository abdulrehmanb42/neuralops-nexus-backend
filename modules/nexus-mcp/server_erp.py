"""
NeuralOps ERP MCP Server

Hosts Odoo ERP tools only:
  - list_customers, create_customer
  - list_orders, create_sale_order, create_order_form
  - inventory_report
  - list_products, create_product

Transport: Streamable HTTP (port 8000)
Add to NeuralOps via /add_mcp → transport: http, url: http://nexus-erp-mcp:8000/mcp
"""
from fastmcp import FastMCP
from tools.erp import mcp as erp_mcp

mcp = FastMCP(
    "NeuralOps ERP",
    instructions=(
        "ERP MCP server for NeuralOps. "
        "Provides tools for Odoo: customers, sales orders, products, and inventory. "
        "Outputs use <<<HTML>>>, <<<FORM>>>, and <<<CONTEXT>>> markers."
    ),
)

mcp.mount(erp_mcp, "erp")

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
