"""
NeuralOps SSH MCP Server

Own process, own container, own <container-name>:8000/mcp endpoint.
Bundles SSH tools (execute, list_files, read_file, server_status) and Code
tools (run_code, write_file, read_file, list_files, install_package) into
one addon, since both use the exact same SSH_* credentials in config.py --
enabling "SSH access" naturally implies "can write and run scripts over
that same connection." Split into two separate addons later if you want
them independently enable-able.

Add to NeuralOps via Add MCP Server -> transport: http, url: http://<this-container>:8000/mcp
"""
from fastmcp import FastMCP
from server import run_addon
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
    run_addon(mcp)
