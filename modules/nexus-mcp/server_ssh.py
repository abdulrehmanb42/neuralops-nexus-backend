"""
NeuralOps SSH MCP Server

Hosts SSH/DevOps tools and Code execution tools — both use SSH credentials:
  SSH tools:   execute, list_files, read_file, server_status
  Code tools:  run_code, write_file, read_file, list_files, install_package

Transport: Streamable HTTP (port 8000)
Add to NeuralOps via /add_mcp → transport: streamable-http, url: http://nexus-ssh-mcp:8000/mcp
"""
from fastmcp import FastMCP
from tools.ssh import mcp as ssh_mcp
from tools.code import mcp as code_mcp

mcp = FastMCP(
    "NeuralOps SSH",
    instructions=(
        "SSH/DevOps and Code Execution MCP server for NeuralOps. "
        "SSH tools: execute commands, browse files, read file contents, check server status. "
        "Code tools: write and run Python/Bash/Node.js scripts, install packages. "
        "Outputs use <<<TERMINAL>>> markers."
    ),
)

mcp.mount(ssh_mcp, "ssh")
mcp.mount(code_mcp, "code")

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
