"""
BestBuy MCP tools.

API docs: https://developer.bestbuy.com/documentation
Requires BESTBUY_API_KEY env var.
"""
import httpx
from fastmcp import FastMCP
from config import BESTBUY_API_KEY, BESTBUY_BASE_URL

mcp = FastMCP("BestBuy")


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=BESTBUY_BASE_URL,
        params={"apiKey": BESTBUY_API_KEY, "format": "json"},
        timeout=15,
    )


@mcp.tool()
async def bestbuy_search_products(
    query: str,
    page_size: int = 10,
    category: str = "",
) -> str:
    """
    Search BestBuy product catalog.

    Args:
        query: Search term (e.g. 'iPhone 15', '4K TV')
        page_size: Number of results (max 100)
        category: Optional category ID to filter results

    Returns:
        HTML table of matching products with SKU, name, price, availability.
    """
    if not BESTBUY_API_KEY:
        return "❌ BESTBUY_API_KEY is not configured."

    search_filter = f'(search={query})'
    if category:
        search_filter = f'(categoryId={category}&search={query})'

    async with _client() as c:
        r = await c.get(
            f"/products{search_filter}",
            params={"show": "sku,name,salePrice,regularPrice,inStoreAvailability,onlineAvailability,shortDescription", "pageSize": page_size},
        )
        r.raise_for_status()
        data = r.json()

    products = data.get("products", [])
    if not products:
        return f"No products found for '{query}'."

    rows = ""
    for p in products:
        sale = f"${p.get('salePrice', 'N/A')}"
        regular = f"${p.get('regularPrice', 'N/A')}"
        price_cell = f"{sale}" if p.get('salePrice') != p.get('regularPrice') else sale
        in_store = "✅" if p.get("inStoreAvailability") else "❌"
        online = "✅" if p.get("onlineAvailability") else "❌"
        rows += f"""
        <tr>
          <td>{p.get('sku')}</td>
          <td>{p.get('name', '')[:60]}</td>
          <td style="text-align:right">{price_cell}</td>
          <td style="text-align:center">{in_store}</td>
          <td style="text-align:center">{online}</td>
        </tr>"""

    return f"""<<<HTML>>>
<div style="font-family:sans-serif">
  <h3>BestBuy Search: "{query}" ({len(products)} results)</h3>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead style="background:#003b64;color:white">
      <tr>
        <th>SKU</th><th>Name</th><th>Price</th><th>In-Store</th><th>Online</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
</div>
<<<END>>>"""


@mcp.tool()
async def bestbuy_get_product(sku: str) -> str:
    """
    Get full details for a BestBuy product by SKU.

    Args:
        sku: BestBuy product SKU number

    Returns:
        HTML card with full product details.
    """
    if not BESTBUY_API_KEY:
        return "❌ BESTBUY_API_KEY is not configured."

    async with _client() as c:
        r = await c.get(
            f"/products(sku={sku})",
            params={"show": "sku,name,salePrice,regularPrice,inStoreAvailability,onlineAvailability,shortDescription,longDescription,manufacturer,modelNumber,upc,customerReviewAverage,customerReviewCount,url"},
        )
        r.raise_for_status()
        data = r.json()

    products = data.get("products", [])
    if not products:
        return f"Product SKU {sku} not found."

    p = products[0]
    return f"""<<<HTML>>>
<div style="font-family:sans-serif;max-width:700px">
  <h2>{p.get('name')}</h2>
  <table border="0" cellpadding="6" style="width:100%">
    <tr><td><b>SKU</b></td><td>{p.get('sku')}</td></tr>
    <tr><td><b>Model</b></td><td>{p.get('modelNumber','N/A')}</td></tr>
    <tr><td><b>Manufacturer</b></td><td>{p.get('manufacturer','N/A')}</td></tr>
    <tr><td><b>Sale Price</b></td><td style="color:green"><b>${p.get('salePrice','N/A')}</b></td></tr>
    <tr><td><b>Regular Price</b></td><td>${p.get('regularPrice','N/A')}</td></tr>
    <tr><td><b>In-Store</b></td><td>{'✅ Available' if p.get('inStoreAvailability') else '❌ Not available'}</td></tr>
    <tr><td><b>Online</b></td><td>{'✅ Available' if p.get('onlineAvailability') else '❌ Not available'}</td></tr>
    <tr><td><b>Rating</b></td><td>{p.get('customerReviewAverage','N/A')} ⭐ ({p.get('customerReviewCount',0)} reviews)</td></tr>
  </table>
  <p style="color:#555">{p.get('shortDescription','')}</p>
  <a href="{p.get('url','')}" target="_blank">View on BestBuy →</a>
</div>
<<<END>>>"""


@mcp.tool()
async def bestbuy_check_availability(sku: str, store_id: str = "") -> str:
    """
    Check in-store and online availability for a product.

    Args:
        sku: BestBuy product SKU
        store_id: Optional specific store ID to check

    Returns:
        Availability status summary.
    """
    if not BESTBUY_API_KEY:
        return "❌ BESTBUY_API_KEY is not configured."

    async with _client() as c:
        r = await c.get(
            f"/products(sku={sku})",
            params={"show": "sku,name,salePrice,inStoreAvailability,onlineAvailability,onlineAvailabilityUpdateDate"},
        )
        r.raise_for_status()
        data = r.json()

    products = data.get("products", [])
    if not products:
        return f"Product SKU {sku} not found."

    p = products[0]
    in_store = "✅ In Stock" if p.get("inStoreAvailability") else "❌ Out of Stock"
    online = "✅ In Stock" if p.get("onlineAvailability") else "❌ Out of Stock"
    updated = p.get("onlineAvailabilityUpdateDate", "N/A")

    return f"""**{p.get('name')}** (SKU: {sku})
- In-Store: {in_store}
- Online: {online}
- Last updated: {updated}"""
