"""
NeuralOps Odoo ERP MCP Server — standalone
Provides ERP tools: customers, sales orders, products, inventory.

Transport: streamable-http — port 8000
Add in NeuralOps: transport=http, url=http://localhost:9044/mcp

Env vars:
  ERP_URL       — Odoo base URL (e.g. https://mycompany.odoo.com)
  ERP_DB        — Odoo database name (default: odoo)
  ERP_USERNAME  — Odoo login (default: admin)
  ERP_PASSWORD  — Odoo password (default: admin)
"""
import os
import httpx
from fastmcp import FastMCP

ERP_URL      = os.getenv("ERP_URL", "")
ERP_DB       = os.getenv("ERP_DB", "odoo")
ERP_USERNAME = os.getenv("ERP_USERNAME", "admin")
ERP_PASSWORD = os.getenv("ERP_PASSWORD", "admin")

mcp = FastMCP(
    "NeuralOps Odoo ERP",
    instructions=(
        "Odoo ERP MCP for NeuralOps. "
        "Provides tools for customers, sales orders, products, and inventory."
    ),
)

# ---------------------------------------------------------------------------
# Odoo session client
# ---------------------------------------------------------------------------

_client: httpx.AsyncClient | None = None
_authenticated = False


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30, follow_redirects=True)
    return _client


async def _authenticate() -> None:
    global _authenticated
    if _authenticated:
        return
    client = await _get_client()
    r = await client.post(
        f"{ERP_URL}/web/session/authenticate",
        json={
            "jsonrpc": "2.0", "method": "call", "id": 1,
            "params": {"db": ERP_DB, "login": ERP_USERNAME, "password": ERP_PASSWORD},
        },
        headers={"Content-Type": "application/json"},
    )
    r.raise_for_status()
    data = r.json()
    if data.get("error"):
        msg = data["error"].get("data", {}).get("message", str(data["error"]))
        raise RuntimeError(f"Odoo auth failed: {msg}")
    if not data.get("result", {}).get("uid"):
        raise RuntimeError("Odoo authentication failed — check ERP_DB / ERP_USERNAME / ERP_PASSWORD.")
    _authenticated = True


async def _call(model: str, method: str, args: list, kwargs: dict | None = None):
    await _authenticate()
    client = await _get_client()
    r = await client.post(
        f"{ERP_URL}/web/dataset/call_kw",
        json={
            "jsonrpc": "2.0", "method": "call", "id": 1,
            "params": {"model": model, "method": method, "args": args, "kwargs": kwargs or {}},
        },
        headers={"Content-Type": "application/json"},
    )
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        msg = data["error"].get("data", {}).get("message", str(data["error"]))
        raise RuntimeError(msg)
    return data["result"]


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

@mcp.tool()
async def list_orders(state: str = "all", limit: int = 20) -> str:
    """
    List sales orders from Odoo.

    Args:
        state: Filter — all | draft | sale | done | cancel
        limit: Max orders to return
    """
    if not ERP_URL:
        return "❌ ERP_URL is not configured."
    domain = [] if state == "all" else [["state", "=", state]]
    try:
        orders = await _call(
            "sale.order", "search_read", [domain],
            {"fields": ["name", "partner_id", "date_order", "amount_total", "state", "currency_id"], "limit": limit},
        )
    except Exception as e:
        return f"❌ ERP error: {e}"
    if not orders:
        return "No sales orders found."

    state_colors = {"draft": "#999", "sent": "#f0ad4e", "sale": "#5cb85c", "done": "#337ab7", "cancel": "#d9534f"}
    state_labels = {"draft": "Quotation", "sent": "Sent", "sale": "Confirmed", "done": "Done", "cancel": "Cancelled"}
    rows = ""
    for o in orders:
        s = o.get("state", "")
        color = state_colors.get(s, "#999")
        label = state_labels.get(s, s)
        customer = o["partner_id"][1] if o.get("partner_id") else "Unknown"
        currency = o["currency_id"][1] if o.get("currency_id") else ""
        date = str(o.get("date_order", ""))[:10]
        amount = f"{currency} {o.get('amount_total', 0):,.2f}"
        rows += f"""
        <tr>
          <td><b>{o.get('name')}</b></td><td>{customer}</td><td>{date}</td>
          <td style="text-align:right">{amount}</td>
          <td><span style="background:{color};color:white;padding:2px 8px;border-radius:4px;font-size:12px">{label}</span></td>
        </tr>"""

    return f"""<<<HTML>>>
<div style="font-family:sans-serif">
  <h3>Sales Orders ({len(orders)} shown)</h3>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead style="background:#875a7b;color:white">
      <tr><th>Order</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th></tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
</div>
<<<END>>>"""


@mcp.tool()
async def get_order_detail(order_name: str) -> str:
    """
    Get full detail of a sales order by name (e.g. S00042).

    Args:
        order_name: Order reference like S00001
    """
    if not ERP_URL:
        return "❌ ERP_URL is not configured."
    try:
        orders = await _call(
            "sale.order", "search_read",
            [[["name", "=", order_name]]],
            {"fields": ["name", "partner_id", "date_order", "amount_untaxed", "amount_tax",
                        "amount_total", "state", "order_line", "currency_id"], "limit": 1},
        )
    except Exception as e:
        return f"❌ ERP error: {e}"
    if not orders:
        return f"Order '{order_name}' not found."

    o = orders[0]
    customer = o["partner_id"][1] if o.get("partner_id") else "Unknown"
    currency = o["currency_id"][1] if o.get("currency_id") else ""
    lines_html = ""
    line_ids = o.get("order_line", [])
    if line_ids:
        try:
            lines = await _call("sale.order.line", "read", [line_ids],
                                {"fields": ["product_id", "name", "product_uom_qty", "price_unit", "price_subtotal"]})
            for l in lines:
                product = l["product_id"][1] if l.get("product_id") else l.get("name", "")
                lines_html += f"""
                <tr>
                  <td>{product}</td>
                  <td style="text-align:right">{l.get('product_uom_qty', 0)}</td>
                  <td style="text-align:right">{currency} {l.get('price_unit', 0):,.2f}</td>
                  <td style="text-align:right">{currency} {l.get('price_subtotal', 0):,.2f}</td>
                </tr>"""
        except Exception:
            lines_html = "<tr><td colspan='4'>Could not load order lines.</td></tr>"

    return f"""<<<HTML>>>
<div style="font-family:sans-serif;max-width:750px">
  <h2>Order: {o.get('name')}</h2>
  <table border="0" cellpadding="4" style="margin-bottom:16px">
    <tr><td><b>Customer</b></td><td>{customer}</td></tr>
    <tr><td><b>Date</b></td><td>{str(o.get('date_order', ''))[:10]}</td></tr>
    <tr><td><b>Status</b></td><td>{o.get('state', '').upper()}</td></tr>
  </table>
  <h4>Order Lines</h4>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead style="background:#875a7b;color:white">
      <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr>
    </thead>
    <tbody>{lines_html}</tbody>
  </table>
  <table border="0" cellpadding="4" style="margin-top:12px;float:right">
    <tr><td><b>Subtotal</b></td><td style="text-align:right">{currency} {o.get('amount_untaxed', 0):,.2f}</td></tr>
    <tr><td><b>Tax</b></td><td style="text-align:right">{currency} {o.get('amount_tax', 0):,.2f}</td></tr>
    <tr style="font-size:16px"><td><b>Total</b></td><td style="text-align:right"><b>{currency} {o.get('amount_total', 0):,.2f}</b></td></tr>
  </table>
</div>
<<<END>>>"""


@mcp.tool()
async def create_sale_order(customer_name: str, product_name: str,
                             quantity: float = 1.0, unit_price: float | None = None) -> str:
    """
    Create a confirmed sales order in Odoo.

    Args:
        customer_name: Customer name (must exist in Odoo)
        product_name: Product name (must exist in Odoo)
        quantity: Quantity
        unit_price: Override unit price (optional)
    """
    if not ERP_URL:
        return "❌ ERP_URL is not configured."
    try:
        partners = await _call("res.partner", "search_read",
                               [[["name", "ilike", customer_name]]], {"fields": ["id", "name"], "limit": 1})
        if not partners:
            return f"❌ Customer '{customer_name}' not found."
        partner = partners[0]

        products = await _call("product.product", "search_read",
                               [[["name", "ilike", product_name], ["active", "=", True]]],
                               {"fields": ["id", "name", "list_price"], "limit": 1})
        if not products:
            return f"❌ Product '{product_name}' not found."
        product = products[0]
        price = unit_price if unit_price is not None else product["list_price"]

        order_id = await _call("sale.order", "create", [{
            "partner_id": partner["id"],
            "order_line": [[0, 0, {"product_id": product["id"],
                                   "product_uom_qty": quantity, "price_unit": price}]],
        }])
        await _call("sale.order", "action_confirm", [[order_id]])
        orders = await _call("sale.order", "read", [[order_id]], {"fields": ["name", "amount_total", "currency_id"]})
        order = orders[0] if orders else {}
        ref = order.get("name", f"#{order_id}")
        currency = order["currency_id"][1] if order.get("currency_id") else ""
        total = order.get("amount_total", quantity * price)
    except Exception as e:
        return f"❌ ERP error: {e}"

    return f"""<<<HTML>>>
<div style="font-family:sans-serif;padding:12px;border:1px solid #5cb85c;border-radius:6px;background:#f0fff0">
  <h3 style="color:#3a7a3a;margin:0 0 8px">✅ Sales Order Confirmed</h3>
  <table border="0" cellpadding="4">
    <tr><td><b>Order Ref</b></td><td><b>{ref}</b></td></tr>
    <tr><td><b>Customer</b></td><td>{partner['name']}</td></tr>
    <tr><td><b>Product</b></td><td>{product['name']} × {quantity}</td></tr>
    <tr><td><b>Unit Price</b></td><td>{currency} {price:,.2f}</td></tr>
    <tr><td><b>Total</b></td><td><b>{currency} {total:,.2f}</b></td></tr>
  </table>
</div>
<<<END>>>"""


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

@mcp.tool()
async def list_customers(limit: int = 20, search: str = "") -> str:
    """
    List customers from Odoo.

    Args:
        limit: Max customers to return
        search: Optional name filter
    """
    if not ERP_URL:
        return "❌ ERP_URL is not configured."
    domain: list = [["customer_rank", ">", 0]]
    if search:
        domain.append(["name", "ilike", search])
    try:
        customers = await _call("res.partner", "search_read", [domain],
                                {"fields": ["name", "email", "phone", "city", "country_id"], "limit": limit})
    except Exception as e:
        return f"❌ ERP error: {e}"
    if not customers:
        return "No customers found."

    rows = ""
    for c in customers:
        country = c["country_id"][1] if c.get("country_id") else ""
        rows += f"""
        <tr>
          <td><b>{c.get('name')}</b></td><td>{c.get('email') or '—'}</td>
          <td>{c.get('phone') or '—'}</td><td>{c.get('city') or '—'}</td><td>{country}</td>
        </tr>"""

    return f"""<<<HTML>>>
<div style="font-family:sans-serif">
  <h3>Customers ({len(customers)} shown{f' — "{search}"' if search else ''})</h3>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead style="background:#875a7b;color:white">
      <tr><th>Name</th><th>Email</th><th>Phone</th><th>City</th><th>Country</th></tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
</div>
<<<END>>>"""


@mcp.tool()
async def create_customer(name: str, email: str = "", phone: str = "",
                           city: str = "", country_code: str = "") -> str:
    """
    Create a new customer in Odoo.

    Args:
        name: Customer/company name
        email: Email (optional)
        phone: Phone (optional)
        city: City (optional)
        country_code: ISO code e.g. US, GB, PK (optional)
    """
    if not ERP_URL:
        return "❌ ERP_URL is not configured."
    vals: dict = {"name": name, "customer_rank": 1, "is_company": True}
    if email:
        vals["email"] = email
    if phone:
        vals["phone"] = phone
    if city:
        vals["city"] = city
    if country_code:
        try:
            countries = await _call("res.country", "search_read",
                                    [[["code", "=", country_code.upper()]]], {"fields": ["id"], "limit": 1})
            if countries:
                vals["country_id"] = countries[0]["id"]
        except Exception:
            pass
    try:
        partner_id = await _call("res.partner", "create", [vals])
    except Exception as e:
        return f"❌ ERP error: {e}"

    return f"""<<<HTML>>>
<div style="font-family:sans-serif;padding:12px;border:1px solid #5cb85c;border-radius:6px;background:#f0fff0">
  <h3 style="color:#3a7a3a;margin:0 0 8px">✅ Customer Created</h3>
  <table border="0" cellpadding="4">
    <tr><td><b>Name</b></td><td>{name}</td></tr>
    <tr><td><b>Email</b></td><td>{email or '—'}</td></tr>
    <tr><td><b>Phone</b></td><td>{phone or '—'}</td></tr>
    <tr><td><b>City</b></td><td>{city or '—'}</td></tr>
    <tr><td><b>Odoo ID</b></td><td>#{partner_id}</td></tr>
  </table>
</div>
<<<END>>>"""


# ---------------------------------------------------------------------------
# Products & Inventory
# ---------------------------------------------------------------------------

@mcp.tool()
async def inventory_report(limit: int = 30) -> str:
    """Get current stock levels for all storable products."""
    if not ERP_URL:
        return "❌ ERP_URL is not configured."
    try:
        products = await _call(
            "product.product", "search_read",
            [[["active", "=", True], ["is_storable", "=", True]]],
            {"fields": ["name", "default_code", "qty_available", "virtual_available"], "limit": limit},
        )
    except Exception as e:
        return f"❌ ERP error: {e}"
    if not products:
        return "No storable products found."

    lines = [
        "=" * 70,
        f"{'INVENTORY REPORT':^70}",
        "=" * 70,
        f"{'REF':<15} {'PRODUCT':<35} {'ON HAND':>8} {'FORECAST':>8}",
        "-" * 70,
    ]
    for p in products:
        ref = (p.get("default_code") or "—")[:14]
        name = (p.get("name") or "")[:34]
        on_hand = p.get("qty_available", 0)
        forecast = p.get("virtual_available", 0)
        flag = " ⚠" if on_hand <= 0 else ""
        lines.append(f"{ref:<15} {name:<35} {on_hand:>8.0f} {forecast:>8.0f}{flag}")
    lines += ["-" * 70, f"Total products: {len(products)}", "=" * 70]

    return f"<<<TERMINAL>>>\n" + "\n".join(lines) + "\n<<<END>>>"


@mcp.tool()
async def create_product(name: str, price: float = 0.0,
                          internal_ref: str = "", product_type: str = "storable") -> str:
    """
    Create a new product in Odoo.

    Args:
        name: Product name
        price: Sales price
        internal_ref: SKU/reference (optional)
        product_type: storable | consu | service
    """
    if not ERP_URL:
        return "❌ ERP_URL is not configured."
    vals: dict = {"name": name, "list_price": price}
    if product_type == "storable":
        vals["type"] = "consu"
        vals["is_storable"] = True
    else:
        vals["type"] = product_type
    if internal_ref:
        vals["default_code"] = internal_ref
    try:
        product_id = await _call("product.template", "create", [vals])
    except Exception as e:
        return f"❌ ERP error: {e}"

    return f"""<<<HTML>>>
<div style="font-family:sans-serif;padding:12px;border:1px solid #5cb85c;border-radius:6px;background:#f0fff0">
  <h3 style="color:#3a7a3a;margin:0 0 8px">✅ Product Created</h3>
  <table border="0" cellpadding="4">
    <tr><td><b>Name</b></td><td>{name}</td></tr>
    <tr><td><b>Price</b></td><td>{price:,.2f}</td></tr>
    <tr><td><b>Type</b></td><td>{product_type}</td></tr>
    <tr><td><b>Odoo ID</b></td><td>#{product_id}</td></tr>
  </table>
</div>
<<<END>>>"""


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
