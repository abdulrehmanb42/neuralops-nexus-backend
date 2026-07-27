"""
Context narrative generators for MCP tool responses.

Each function receives raw Odoo record data and returns a natural-language
story suitable for embedding in a vector DB. Field names are woven into
sentences so semantic search works on both values and their meaning.

Usage:
    from tools.context import order_story, customer_story, product_story

    context_block = f"<<<CONTEXT>>>\\n{order_story(order, lines)}\\n<<<END>>>"
"""

from datetime import datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _date(val: str) -> str:
    """Format ISO datetime string to readable date."""
    if not val:
        return "an unknown date"
    try:
        return datetime.fromisoformat(str(val)[:19]).strftime("%B %d, %Y")
    except Exception:
        return str(val)[:10]


def _many2one(field, fallback: str = "Unknown") -> str:
    """Extract name from Odoo many2one tuple [id, name]."""
    if isinstance(field, (list, tuple)) and len(field) >= 2:
        return str(field[1])
    return fallback


# ---------------------------------------------------------------------------
# Sales Order
# ---------------------------------------------------------------------------

def order_story(order: dict, lines: list | None = None) -> str:
    """
    Generate a narrative description of a sales order.

    Args:
        order: sale.order record dict from Odoo
        lines: list of sale.order.line record dicts (optional)
    """
    name = order.get("name", "Unknown")
    customer = _many2one(order.get("partner_id"), "an unknown customer")
    date = _date(order.get("date_order", ""))
    state_map = {
        "draft": "a draft quotation",
        "sent": "a sent quotation awaiting confirmation",
        "sale": "a confirmed sales order",
        "done": "a completed and locked order",
        "cancel": "a cancelled order",
    }
    state = state_map.get(order.get("state", ""), order.get("state", ""))
    currency = _many2one(order.get("currency_id"), "")
    total = order.get("amount_total", 0)
    untaxed = order.get("amount_untaxed", 0)
    tax = order.get("amount_tax", 0)

    story = (
        f"Sales order {name} was placed by {customer} on {date} "
        f"and is currently {state}. "
        f"The total amount is {currency} {total:,.2f}, "
        f"comprising {currency} {untaxed:,.2f} before tax "
        f"and {currency} {tax:,.2f} in taxes. "
    )

    if lines:
        if len(lines) == 1:
            line = lines[0]
            product = _many2one(line.get("product_id"), line.get("name", "a product"))
            qty = line.get("product_uom_qty", 0)
            unit = line.get("price_unit", 0)
            story += (
                f"It contains {qty:.0f} unit(s) of {product} "
                f"at {currency} {unit:,.2f} each. "
            )
        else:
            items = []
            for line in lines:
                product = _many2one(line.get("product_id"), line.get("name", "product"))
                qty = line.get("product_uom_qty", 0)
                items.append(f"{qty:.0f}x {product}")
            story += f"It contains the following items: {', '.join(items)}. "

    note = order.get("note") or ""
    if note:
        story += f"Internal note: {note.strip()}. "

    return story.strip()


# ---------------------------------------------------------------------------
# Customer / Partner
# ---------------------------------------------------------------------------

def customer_story(customer: dict) -> str:
    """
    Generate a narrative description of a customer contact.

    Args:
        customer: res.partner record dict from Odoo
    """
    name = customer.get("name", "Unknown")
    email = customer.get("email") or None
    phone = customer.get("phone") or None
    city = customer.get("city") or None
    country = _many2one(customer.get("country_id"), None)
    rank = customer.get("customer_rank", 0)
    is_company = customer.get("is_company", False)

    entity = "company" if is_company else "individual contact"
    story = f"{name} is a {entity} registered as a customer in the ERP system. "

    location_parts = [p for p in [city, country] if p]
    if location_parts:
        story += f"They are based in {', '.join(location_parts)}. "

    contacts = []
    if email:
        contacts.append(f"email {email}")
    if phone:
        contacts.append(f"phone {phone}")
    if contacts:
        story += f"Their contact details are: {' and '.join(contacts)}. "

    if rank > 1:
        story += f"They have a customer rank of {rank}, indicating a high-value customer. "

    return story.strip()


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------

def product_story(product: dict) -> str:
    """
    Generate a narrative description of a product.

    Args:
        product: product.template or product.product record dict from Odoo
    """
    name = product.get("name", "Unknown")
    ref = product.get("default_code") or None
    price = product.get("list_price") or product.get("price_unit") or 0
    ptype = product.get("type", "")
    is_storable = product.get("is_storable", False)
    qty = product.get("qty_available")
    forecast = product.get("virtual_available")

    type_label = {
        "consu": "a goods/consumable product",
        "service": "a service",
        "combo": "a combo product",
    }.get(ptype, "a product")

    if is_storable:
        type_label = "a storable product with inventory tracking"

    story = f"{name} is {type_label} in the ERP catalog. "

    if ref:
        story += f"Its internal reference code is {ref}. "

    if price:
        story += f"The listed sales price is {price:,.2f}. "

    if qty is not None:
        story += f"Current stock on hand is {qty:.0f} units. "
        if forecast is not None and forecast != qty:
            story += f"The forecasted quantity is {forecast:.0f} units. "
        if qty <= 0:
            story += "The product is currently out of stock. "

    return story.strip()


# ---------------------------------------------------------------------------
# Inventory snapshot (multiple products)
# ---------------------------------------------------------------------------

def inventory_story(products: list) -> str:
    """
    Generate a narrative summary of the current inventory state.

    Args:
        products: list of product.product record dicts from Odoo
    """
    if not products:
        return "The inventory is currently empty with no storable products on record."

    total = len(products)
    out_of_stock = [p for p in products if p.get("qty_available", 0) <= 0]
    low_stock = [p for p in products if 0 < p.get("qty_available", 0) <= 5]

    lines = [product_story(p) for p in products]
    summary = "\n".join(lines)

    header = (
        f"The inventory contains {total} storable product(s). "
    )
    if out_of_stock:
        names = ", ".join(p.get("name", "Unknown") for p in out_of_stock)
        header += f"{len(out_of_stock)} product(s) are out of stock: {names}. "
    if low_stock:
        names = ", ".join(p.get("name", "Unknown") for p in low_stock)
        header += f"{len(low_stock)} product(s) have low stock (5 or fewer units): {names}. "

    return f"{header}\n\n{summary}".strip()


# ---------------------------------------------------------------------------
# Composite context block builder
# ---------------------------------------------------------------------------

def make_context_block(*stories: str) -> str:
    """
    Wrap one or more story strings in a <<<CONTEXT>>> marker block.

    Usage:
        make_context_block(customer_story(c), order_story(o))
    """
    combined = "\n\n".join(s for s in stories if s and s.strip())
    return f"<<<CONTEXT>>>\n{combined}\n<<<END>>>"
