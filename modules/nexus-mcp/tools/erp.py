"""
ERP MCP tools (Odoo).

Demonstrates M7 output types:
  - list_orders()     → <<<HTML>>> table
  - list_customers()  → <<<HTML>>> table
  - get_inventory_report() → <<<TERMINAL>>> output
  - create_order_form()    → <<<FORM>>> (HTML form)
  - get_order_detail()     → <<<HTML>>> detail card

Odoo uses JSON-RPC for all calls (single endpoint /web/dataset/call_kw).
Set ERP_URL, ERP_DB, ERP_USERNAME, ERP_PASSWORD in environment.
"""
import httpx
from fastmcp import FastMCP
from config import ERP_URL, ERP_DB, ERP_USERNAME, ERP_PASSWORD

mcp = FastMCP("ERP")

_session_cache: dict = {"uid": None, "password": None}


async def _authenticate() -> int:
    """Authenticate with Odoo and return user ID."""
    if _session_cache["uid"]:
        return _session_cache["uid"]

    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"{ERP_URL}/web/dataset/call_kw",
            json={
                "jsonrpc": "2.0",
                "method": "call",
                "params": {
                    "model": "res.users",
                    "method": "authenticate",
                    "args": [ERP_DB, ERP_USERNAME, ERP_PASSWORD, {}],
                    "kwargs": {},
                },
            },
        )
        r.raise_for_status()
        result = r.json().get("result")
        if not result:
            raise RuntimeError("Odoo authentication failed. Check ERP_DB, ERP_USERNAME, ERP_PASSWORD.")
        _session_cache["uid"] = result
        _session_cache["password"] = ERP_PASSWORD
        return result


async def _call(model: str, method: str, args: list, kwargs: dict | None = None) -> any:
    """Make an authenticated Odoo JSON-RPC call."""
    uid = await _authenticate()
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{ERP_URL}/web/dataset/call_kw",
            json={
                "jsonrpc": "2.0",
                "method": "call",
                "params": {
                    "model": model,
                    "method": method,
                    "args": [ERP_DB, uid, ERP_PASSWORD] + args,
                    "kwargs": kwargs or {},
                },
            },
        )
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            raise RuntimeError(data["error"].get("data", {}).get("message", str(data["error"])))
        return data["result"]


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

@mcp.tool()
async def list_orders(
    state: str = "all",
    limit: int = 20,
) -> str:
    """
    List sales orders from the ERP system.

    Args:
        state: Filter by order state: all | draft | sale | done | cancel
        limit: Max number of orders to return

    Returns:
        HTML table of orders with ID, customer, date, amount, status.
    """
    if not ERP_URL:
        return "❌ ERP_URL is not configured."

    domain = []
    if state != "all":
        domain = [["state", "=", state]]

    try:
        orders = await _call(
            "sale.order", "search_read",
            [domain],
            {"fields": ["name", "partner_id", "date_order", "amount_total", "state", "currency_id"], "limit": limit},
        )
    except Exception as e:
        return f"❌ ERP error: {e}"

    if not orders:
        return "No orders found."

    state_colors = {
        "draft": "#999", "sent": "#f0ad4e", "sale": "#5cb85c",
        "done": "#337ab7", "cancel": "#d9534f",
    }
    state_labels = {
        "draft": "Quotation", "sent": "Sent", "sale": "Confirmed",
        "done": "Done", "cancel": "Cancelled",
    }

    rows = ""
    for o in orders:
        s = o.get("state", "")
        color = state_colors.get(s, "#999")
        label = state_labels.get(s, s)
        customer = o.get("partner_id", [None, "Unknown"])[1] if o.get("partner_id") else "Unknown"
        currency = o.get("currency_id", [None, ""])[1] if o.get("currency_id") else ""
        date = str(o.get("date_order", ""))[:10]
        amount = f"{currency} {o.get('amount_total', 0):,.2f}"
        rows += f"""
        <tr>
          <td><b>{o.get('name')}</b></td>
          <td>{customer}</td>
          <td>{date}</td>
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
    Get full detail of a sales order by order name (e.g. S00042).

    Args:
        order_name: Order reference like S00001, S00042

    Returns:
        HTML card with order lines, totals, customer info.
    """
    if not ERP_URL:
        return "❌ ERP_URL is not configured."

    try:
        orders = await _call(
            "sale.order", "search_read",
            [[["name", "=", order_name]]],
            {"fields": ["name", "partner_id", "date_order", "amount_untaxed", "amount_tax",
                        "amount_total", "state", "order_line", "currency_id", "note"], "limit": 1},
        )
    except Exception as e:
        return f"❌ ERP error: {e}"

    if not orders:
        return f"Order '{order_name}' not found."

    o = orders[0]
    customer = o.get("partner_id", [None, "Unknown"])[1] if o.get("partner_id") else "Unknown"
    currency = o.get("currency_id", [None, ""])[1] if o.get("currency_id") else ""

    # Fetch order lines
    line_ids = o.get("order_line", [])
    lines_html = ""
    if line_ids:
        try:
            lines = await _call(
                "sale.order.line", "read",
                [line_ids],
                {"fields": ["product_id", "name", "product_uom_qty", "price_unit", "price_subtotal"]},
            )
            for l in lines:
                product = l.get("product_id", [None, ""])[1] if l.get("product_id") else l.get("name", "")
                lines_html += f"""
                <tr>
                  <td>{product}</td>
                  <td style="text-align:right">{l.get('product_uom_qty',0)}</td>
                  <td style="text-align:right">{currency} {l.get('price_unit',0):,.2f}</td>
                  <td style="text-align:right">{currency} {l.get('price_subtotal',0):,.2f}</td>
                </tr>"""
        except Exception:
            lines_html = "<tr><td colspan='4'>Could not load order lines.</td></tr>"

    return f"""<<<HTML>>>
<div style="font-family:sans-serif;max-width:750px">
  <h2>Order: {o.get('name')}</h2>
  <table border="0" cellpadding="4" style="margin-bottom:16px">
    <tr><td><b>Customer</b></td><td>{customer}</td></tr>
    <tr><td><b>Date</b></td><td>{str(o.get('date_order',''))[:10]}</td></tr>
    <tr><td><b>Status</b></td><td>{o.get('state','').upper()}</td></tr>
  </table>

  <h4>Order Lines</h4>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead style="background:#875a7b;color:white">
      <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr>
    </thead>
    <tbody>{lines_html}</tbody>
  </table>

  <table border="0" cellpadding="4" style="margin-top:12px;float:right">
    <tr><td><b>Subtotal</b></td><td style="text-align:right">{currency} {o.get('amount_untaxed',0):,.2f}</td></tr>
    <tr><td><b>Tax</b></td><td style="text-align:right">{currency} {o.get('amount_tax',0):,.2f}</td></tr>
    <tr style="font-size:16px"><td><b>Total</b></td><td style="text-align:right"><b>{currency} {o.get('amount_total',0):,.2f}</b></td></tr>
  </table>
</div>
<<<END>>>"""


@mcp.tool()
async def create_order_form(customer_name: str = "") -> str:
    """
    Show a form to create a new sales order in the ERP.

    Args:
        customer_name: Pre-fill customer name (optional)

    Returns:
        HTML form for creating a sales order.
    """
    return f"""<<<FORM>>>
<div style="font-family:sans-serif;max-width:600px">
  <h3>Create Sales Order</h3>
  <form id="create-order-form">
    <div style="margin-bottom:12px">
      <label style="display:block;font-weight:bold;margin-bottom:4px">Customer *</label>
      <input name="customer" type="text" value="{customer_name}"
        placeholder="Customer name or ID"
        style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px" required />
    </div>

    <div style="margin-bottom:12px">
      <label style="display:block;font-weight:bold;margin-bottom:4px">Order Date *</label>
      <input name="date_order" type="date"
        style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px" required />
    </div>

    <div style="margin-bottom:12px">
      <label style="display:block;font-weight:bold;margin-bottom:4px">Product</label>
      <input name="product" type="text" placeholder="Product name or reference"
        style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px" />
    </div>

    <div style="display:flex;gap:12px;margin-bottom:12px">
      <div style="flex:1">
        <label style="display:block;font-weight:bold;margin-bottom:4px">Quantity</label>
        <input name="quantity" type="number" value="1" min="1"
          style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px" />
      </div>
      <div style="flex:1">
        <label style="display:block;font-weight:bold;margin-bottom:4px">Unit Price</label>
        <input name="unit_price" type="number" step="0.01" placeholder="0.00"
          style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px" />
      </div>
    </div>

    <div style="margin-bottom:16px">
      <label style="display:block;font-weight:bold;margin-bottom:4px">Notes</label>
      <textarea name="note" rows="3" placeholder="Internal notes..."
        style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px"></textarea>
    </div>

    <button type="submit"
      style="background:#875a7b;color:white;padding:10px 24px;border:none;border-radius:4px;cursor:pointer;font-size:14px">
      Create Order
    </button>
  </form>
  <p style="color:#888;font-size:12px;margin-top:8px">
    Fill the form and reply with "submit order" to create it in Odoo.
  </p>
</div>
<<<END>>>"""


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

@mcp.tool()
async def list_customers(limit: int = 20, search: str = "") -> str:
    """
    List customers from the ERP system.

    Args:
        limit: Max number of customers to return
        search: Optional name filter

    Returns:
        HTML table of customers with contact info.
    """
    if not ERP_URL:
        return "❌ ERP_URL is not configured."

    domain = [["customer_rank", ">", 0]]
    if search:
        domain.append(["name", "ilike", search])

    try:
        customers = await _call(
            "res.partner", "search_read",
            [domain],
            {"fields": ["name", "email", "phone", "city", "country_id", "customer_rank"], "limit": limit},
        )
    except Exception as e:
        return f"❌ ERP error: {e}"

    if not customers:
        return "No customers found."

    rows = ""
    for c in customers:
        country = c.get("country_id", [None, ""])[1] if c.get("country_id") else ""
        rows += f"""
        <tr>
          <td><b>{c.get('name')}</b></td>
          <td>{c.get('email') or '—'}</td>
          <td>{c.get('phone') or '—'}</td>
          <td>{c.get('city') or '—'}</td>
          <td>{country}</td>
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


# ---------------------------------------------------------------------------
# Inventory Report
# ---------------------------------------------------------------------------

@mcp.tool()
async def inventory_report(limit: int = 30) -> str:
    """
    Get current inventory/stock levels report.

    Returns:
        Terminal-style inventory report with product stock levels.
    """
    if not ERP_URL:
        return "❌ ERP_URL is not configured."

    try:
        products = await _call(
            "product.product", "search_read",
            [[["active", "=", True], ["type", "=", "product"]]],
            {"fields": ["name", "default_code", "qty_available", "virtual_available", "uom_id"], "limit": limit},
        )
    except Exception as e:
        return f"❌ ERP error: {e}"

    if not products:
        return "No products found in inventory."

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

    report = "\n".join(lines)
    return f"<<<TERMINAL>>>\n{report}\n<<<END>>>"
