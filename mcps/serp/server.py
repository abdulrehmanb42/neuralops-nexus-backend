"""
NeuralOps SerpAPI MCP Server — standalone
Provides product search via Google Shopping, BestBuy, Walmart.

Transport: streamable-http — port 8000
Add in NeuralOps: transport=http, url=http://localhost:9043/mcp

Env vars:
  SERPAPI_KEY  — get one free at serpapi.com (100 searches/month)
"""
import os
import httpx
from fastmcp import FastMCP

SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")
SERPAPI_URL = "https://serpapi.com/search"

STORE_ALIASES = {
    "bestbuy": "Best Buy",
    "walmart": "Walmart",
    "amazon": "Amazon",
    "target": "Target",
    "costco": "Costco",
    "newegg": "Newegg",
}

mcp = FastMCP(
    "NeuralOps SerpAPI",
    instructions=(
        "SerpAPI/Shopping MCP for NeuralOps. "
        "Search products across Google Shopping, BestBuy, and Walmart."
    ),
)


async def _search(query: str, extra_params: dict | None = None) -> dict:
    params = {
        "engine": "google_shopping",
        "q": query,
        "api_key": SERPAPI_KEY,
        "num": 20,
        **(extra_params or {}),
    }
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(SERPAPI_URL, params=params)
        r.raise_for_status()
        return r.json()


@mcp.tool()
async def search_products(query: str, store: str = "", limit: int = 10) -> str:
    """
    Search for products across major retailers via Google Shopping.

    Args:
        query: Product search term (e.g. 'iPhone 15', 'Samsung 4K TV')
        store: Filter by store — bestbuy, walmart, amazon, target, or blank for all
        limit: Max results (default 10)

    Returns:
        HTML table of products with name, store, price, and link.
    """
    if not SERPAPI_KEY:
        return "❌ SERPAPI_KEY is not configured. Sign up at serpapi.com."

    try:
        data = await _search(query)
    except Exception as e:
        return f"❌ Search error: {e}"

    results = data.get("shopping_results", [])
    if not results:
        return f"No products found for '{query}'."

    store_label = STORE_ALIASES.get(store.lower().strip(), store.strip())
    if store_label:
        results = [r for r in results if store_label.lower() in r.get("source", "").lower()]
        if not results:
            return f"No results from '{store_label}' for '{query}'. Try leaving store blank."

    results = results[:limit]

    store_colors = {
        "best buy": "#003b64", "walmart": "#0071ce",
        "amazon": "#ff9900", "target": "#cc0000",
    }
    rows = ""
    for p in results:
        title = (p.get("title") or "")[:60]
        price = p.get("price", "N/A")
        source = p.get("source", "Unknown")
        rating = p.get("rating", "")
        reviews = p.get("reviews", "")
        link = p.get("link", "#")
        thumbnail = p.get("thumbnail", "")
        rating_str = f"{rating}⭐ ({reviews})" if rating else "—"
        img = f'<img src="{thumbnail}" width="40" height="40" style="object-fit:contain" />' if thumbnail else ""
        color = next((v for k, v in store_colors.items() if k in source.lower()), "#555")
        rows += f"""
        <tr>
          <td style="width:50px">{img}</td>
          <td><a href="{link}" target="_blank">{title}</a></td>
          <td><span style="background:{color};color:white;padding:2px 8px;border-radius:4px;font-size:12px">{source}</span></td>
          <td style="text-align:right;font-weight:bold;color:green">{price}</td>
          <td style="font-size:12px">{rating_str}</td>
        </tr>"""

    heading = f" — {store_label}" if store_label else " — All Stores"
    return f"""<<<HTML>>>
<div style="font-family:sans-serif">
  <h3>🛍️ Shopping: "{query}"{heading} ({len(results)} results)</h3>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead style="background:#333;color:white">
      <tr><th></th><th>Product</th><th>Store</th><th>Price</th><th>Rating</th></tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
  <p style="color:#888;font-size:11px">Powered by Google Shopping</p>
</div>
<<<END>>>"""


@mcp.tool()
async def compare_prices(query: str) -> str:
    """
    Compare prices for a product across all major retailers.

    Args:
        query: Product to compare (e.g. 'iPad Air 2024', 'Sony WH-1000XM5')

    Returns:
        HTML price comparison table sorted cheapest first.
    """
    if not SERPAPI_KEY:
        return "❌ SERPAPI_KEY is not configured."

    try:
        data = await _search(query)
    except Exception as e:
        return f"❌ Search error: {e}"

    results = data.get("shopping_results", [])
    if not results:
        return f"No products found for '{query}'."

    by_store: dict[str, dict] = {}
    for p in results:
        source = p.get("source", "Unknown")
        price_str = p.get("price", "")
        try:
            price_num = float(price_str.replace("$", "").replace(",", ""))
        except Exception:
            price_num = float("inf")
        if source not in by_store or price_num < by_store[source]["price_num"]:
            by_store[source] = {
                "title": (p.get("title") or "")[:55],
                "price": price_str or "N/A",
                "price_num": price_num,
                "link": p.get("link", "#"),
                "rating": p.get("rating", ""),
                "thumbnail": p.get("thumbnail", ""),
            }

    sorted_stores = sorted(by_store.items(), key=lambda x: x[1]["price_num"])
    cheapest = sorted_stores[0][1]["price_num"] if sorted_stores else float("inf")

    rows = ""
    for i, (store, info) in enumerate(sorted_stores):
        badge = " 🏆 Best Price" if i == 0 else ""
        diff = ""
        if i > 0 and cheapest < float("inf") and info["price_num"] < float("inf"):
            diff = f'<span style="color:#d9534f;font-size:12px"> (+${info["price_num"]-cheapest:.2f})</span>'
        rating_str = f"{info['rating']}⭐" if info["rating"] else ""
        img = f'<img src="{info["thumbnail"]}" width="35" height="35" style="object-fit:contain" />' if info["thumbnail"] else ""
        bg = "#f0fff0" if i == 0 else "white"
        rows += f"""
        <tr style="background:{bg}">
          <td style="width:45px">{img}</td>
          <td><a href="{info['link']}" target="_blank">{info['title']}</a></td>
          <td><b>{store}</b></td>
          <td style="text-align:right;font-weight:bold;color:{'green' if i==0 else '#333'}">{info['price']}{diff}</td>
          <td>{rating_str}</td>
          <td style="color:green;font-size:13px">{badge}</td>
        </tr>"""

    return f"""<<<HTML>>>
<div style="font-family:sans-serif">
  <h3>💰 Price Comparison: "{query}"</h3>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead style="background:#333;color:white">
      <tr><th></th><th>Product</th><th>Store</th><th>Price</th><th>Rating</th><th></th></tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
  <p style="color:#888;font-size:11px">Prices from Google Shopping — click to buy</p>
</div>
<<<END>>>"""


@mcp.tool()
async def search_bestbuy(query: str, limit: int = 10) -> str:
    """Search BestBuy products via Google Shopping."""
    return await search_products(query, store="bestbuy", limit=limit)


@mcp.tool()
async def search_walmart(query: str, limit: int = 10) -> str:
    """Search Walmart products via Google Shopping."""
    return await search_products(query, store="walmart", limit=limit)


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
