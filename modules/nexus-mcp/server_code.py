"""
NeuralOps Code MCP Server

Hosts code execution tools:
  - run_code      — write + execute Python / Bash / Node on remote server
  - write_file    — write a file via SFTP
  - read_file     — read a file from server
  - list_files    — list directory contents
  - install_package — pip / npm install

Transport: Streamable HTTP (port 8000)
Add to NeuralOps via /add_mcp → transport: streamable-http, url: http://nexus-code-mcp:8000/mcp
"""
from fastmcp import FastMCP
from tools.code import mcp as code_mcp

mcp = FastMCP(
    "NeuralOps Code",
    instructions=(
        "Code execution MCP server for NeuralOps. "
        "Write and run Python, Bash, or Node.js code on the remote server. "
        "Can also read/write files and install packages. "
        "Outputs use <<<TERMINAL>>> markers."
    ),
)

mcp.mount(code_mcp, "code")

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
