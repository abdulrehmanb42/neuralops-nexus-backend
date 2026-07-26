"""Quick MCP server test — run with: python test_mcp.py [shopping|erp|ssh|all]"""
import httpx
import json
import sys

BASE = "http://localhost:8000/mcp"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}

MODE = sys.argv[1] if len(sys.argv) > 1 else "all"


def parse_event(text: str) -> dict | None:
    for line in text.splitlines():
        if line.startswith("data: "):
            return json.loads(line[6:])
    return None


def call_tool(client, headers, name, args, label):
    print(f"\n--- {label} ---")
    r = client.post(BASE, headers=headers, json={
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": name, "arguments": args},
        "id": 99,
    })
    result = parse_event(r.text)
    if result and "result" in result:
        content = result["result"].get("content", [{}])[0].get("text", "")
        print(f"✅ OK — preview: {content[:300]}...")
    elif result and "error" in result:
        print(f"❌ Error: {result['error']}")
    else:
        print(f"Raw: {r.text[:300]}")


with httpx.Client(timeout=60) as client:
    # 1. Initialize — get session ID
    print("1. Initializing session...")
    r = client.post(BASE, headers=HEADERS, json={
        "jsonrpc": "2.0",
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1.0"},
        },
        "id": 1,
    })
    session_id = r.headers.get("mcp-session-id")
    print(f"   Session ID: {session_id}")
    headers = {**HEADERS, "Mcp-Session-Id": session_id}

    # 2. Send initialized notification
    client.post(BASE, headers=headers, json={
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
    })

    # 3. List tools
    print("\n2. Listing tools...")
    r = client.post(BASE, headers=headers, json={
        "jsonrpc": "2.0", "method": "tools/list", "id": 2,
    })
    result = parse_event(r.text)
    tools = result["result"]["tools"] if result else []
    print(f"   Found {len(tools)} tools:")
    for t in tools:
        print(f"   - {t['name']}")

    # ---- SHOPPING ----
    if MODE in ("shopping", "all"):
        call_tool(client, headers, "shopping_search",
                  {"query": "iPhone 15", "store": "bestbuy", "limit": 3},
                  "Shopping: search iPhone 15 on BestBuy")

    # ---- ERP ----
    if MODE in ("erp", "all"):
        call_tool(client, headers, "erp_list_customers",
                  {"limit": 5},
                  "ERP: list_customers")

        call_tool(client, headers, "erp_list_orders",
                  {"state": "all", "limit": 5},
                  "ERP: list_orders")

        call_tool(client, headers, "erp_inventory_report",
                  {"limit": 10},
                  "ERP: inventory_report")

        call_tool(client, headers, "erp_create_order_form",
                  {"customer_name": "Test Customer"},
                  "ERP: create_order_form")

        call_tool(client, headers, "erp_create_customer",
                  {"name": "TechCorp Ltd", "email": "info@techcorp.com", "phone": "+1-555-0100", "city": "New York", "country_code": "US"},
                  "ERP: create_customer")

        call_tool(client, headers, "erp_create_product",
                  {"name": "NeuralOps Demo Widget", "price": 99.99, "product_type": "storable"},
                  "ERP: create_product")

        call_tool(client, headers, "erp_create_sale_order",
                  {"customer_name": "Acme", "product_name": "Widget", "quantity": 3},
                  "ERP: create_sale_order")

    # ---- SSH ----
    if MODE in ("ssh", "all"):
        call_tool(client, headers, "ssh_server_status",
                  {},
                  "SSH: server_status")
