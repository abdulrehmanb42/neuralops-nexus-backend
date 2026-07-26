"""Quick MCP server test — run with: python test_mcp.py"""
import httpx
import json

BASE = "http://localhost:8010/mcp"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}


def parse_event(text: str) -> dict | None:
    for line in text.splitlines():
        if line.startswith("data: "):
            return json.loads(line[6:])
    return None


with httpx.Client(timeout=30) as client:
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

    # 4. Call shopping search
    print("\n3. Testing shopping search (iPhone 15, BestBuy)...")
    r = client.post(BASE, headers=headers, json={
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "shopping_search",
            "arguments": {"query": "iPhone 15", "store": "bestbuy", "limit": 3},
        },
        "id": 3,
    })
    result = parse_event(r.text)
    if result and "result" in result:
        content = result["result"].get("content", [{}])[0].get("text", "")
        print("   ✅ Got response!")
        print(f"   Preview: {content[:200]}...")
    elif result and "error" in result:
        print(f"   ❌ Error: {result['error']}")
    else:
        print(f"   Raw: {r.text[:300]}")
