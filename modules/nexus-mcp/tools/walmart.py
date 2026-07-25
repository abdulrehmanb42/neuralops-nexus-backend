"""
Walmart MCP tools.

API docs: https://developer.walmart.com/
Requires WALMART_CLIENT_ID and WALMART_CLIENT_SECRET env vars.

Note: Walmart API uses OAuth 2.0 client credentials.
"""
import httpx
import time
from fastmcp import FastMCP
from config import WALMART_CLIENT_ID, WALMART_CLIENT_SECRET, WALMART_BASE_URL

mcp = FastMCP("Walmart")

_token_cache: dict = {"token": None, "expires_at": 0}


async def _get_token() -> str:
    """Get or refresh Walmart OAuth token."""
    now = time.time()
    if _token_cache["token"] and _token_cache["expires_at"] > now + 60:
        return _token_cache["token"]

    async with httpx.AsyncClient() as c:
        r = await c.post(
            "https://marketplace.walmartapis.com/v3/token",
            data={"grant_type": "client_credentials"},
            auth=(WALMART_CLIENT_ID, WALMART_CLIENT_SECRET),
            headers={
                "WM_SVC.NAME": "NeuralOps",
                "WM_QOS.CORRELATION_ID": "neuralops-mcp",
                "Accept": "application/json",
            },
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()

    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 900)
    return _token_cache["token"]


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "WM_SVC.NAME": "NeuralOps",
        "WM_QOS.CORRELATION_ID": "neuralops-mcp",
        "Accept": "application/json",
    }


@mcp.tool()
async def walmart_search_products(query: str, page_size: int = 10) -> str:
    """
    Search Walmart product catalog.

    Args:
        query: Search term (e.g. 'Samsung TV', 'Nike shoes')
        page_size: Number of results (max 25)

    Returns:
        HTML table of matching products with item ID, name, price, availability.
    """
    if not WALMART_CLIENT_ID or not WALMART_CLIENT_SECRET:
        return "❌ WALMART_CLIENT_ID or WALMART_CLIENT_SECRET is not configured."

    token = await _get_token()
    async with httpx.AsyncClient(base_url=WALMART_BASE_URL, timeout=15) as c:
        r = await c.get(
            "/items/search",
            params={"query": query, "numItems": page_size},
            headers=_headers(token),
        )
        r.raise_for_status()
        data = r.json()

    items = data.get("items", [])
    if not items:
        return f"No products found for '{query}'."

    rows = ""
    for item in items:
        price = item.get("salePrice") or item.get("msrp") or "N/A"
        price_str = f"${price}" if price != "N/A" else "N/A"
        available = "✅" if item.get("availableOnline") else "❌"
        rows += f"""
        <tr>
          <td>{item.get('itemId')}</td>
          <td>{str(item.get('name',''))[:60]}</td>
          <td style="text-align:right">{price_str}</td>
          <td style="text-align:center">{available}</td>
          <td>{item.get('categoryPath','')}</td>
        </tr>"""

    return f"""<<<HTML>>>
<div style="font-family:sans-serif">
  <h3>Walmart Search: "{query}" ({len(items)} results)</h3>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead style="background:#0071ce;color:white">
      <tr>
        <th>Item ID</th><th>Name</th><th>Price</th><th>Online</th><th>Category</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
</div>
<<<END>>>"""


@mcp.tool()
async def walmart_get_item(item_id: str) -> str:
    """
    Get full details for a Walmart item by item ID.

    Args:
        item_id: Walmart item ID

    Returns:
        HTML card with full product details.
    """
    if not WALMART_CLIENT_ID or not WALMART_CLIENT_SECRET:
        return "❌ WALMART_CLIENT_ID or WALMART_CLIENT_SECRET is not configured."

    token = await _get_token()
    async with httpx.AsyncClient(base_url=WALMART_BASE_URL, timeout=15) as c:
        r = await c.get(f"/items/{item_id}", headers=_headers(token))
        r.raise_for_status()
        item = r.json()

    price = item.get("salePrice") or item.get("msrp") or "N/A"
    available = "✅ Available" if item.get("availableOnline") else "❌ Not available"

    return f"""<<<HTML>>>
<div style="font-family:sans-serif;max-width:700px">
  <h2>{item.get('name')}</h2>
  <table border="0" cellpadding="6" style="width:100%">
    <tr><td><b>Item ID</b></td><td>{item.get('itemId')}</td></tr>
    <tr><td><b>Brand</b></td><td>{item.get('brandName','N/A')}</td></tr>
    <tr><td><b>Category</b></td><td>{item.get('categoryPath','N/A')}</td></tr>
    <tr><td><b>Price</b></td><td style="color:green"><b>${price}</b></td></tr>
    <tr><td><b>Online</b></td><td>{available}</td></tr>
    <tr><td><b>Model</b></td><td>{item.get('modelNumber','N/A')}</td></tr>
    <tr><td><b>UPC</b></td><td>{item.get('upc','N/A')}</td></tr>
  </table>
  <p style="color:#555">{item.get('shortDescription','')}</p>
  <a href="{item.get('productUrl','')}" target="_blank">View on Walmart →</a>
</div>
<<<END>>>"""


@mcp.tool()
async def walmart_check_inventory(item_id: str) -> str:
    """
    Check inventory/availability status for a Walmart item.

    Args:
        item_id: Walmart item ID

    Returns:
        Inventory availability summary.
    """
    if not WALMART_CLIENT_ID or not WALMART_CLIENT_SECRET:
        return "❌ WALMART_CLIENT_ID or WALMART_CLIENT_SECRET is not configured."

    token = await _get_token()
    async with httpx.AsyncClient(base_url=WALMART_BASE_URL, timeout=15) as c:
        r = await c.get(f"/inventory", params={"sku": item_id}, headers=_headers(token))
        r.raise_for_status()
        data = r.json()

    qty = data.get("quantity", {}).get("amount", 0)
    unit = data.get("quantity", {}).get("unit", "EACH")
    status = "✅ In Stock" if qty > 0 else "❌ Out of Stock"

    return f"""**Walmart Inventory** (Item: {item_id})
- Status: {status}
- Quantity: {qty} {unit}"""
