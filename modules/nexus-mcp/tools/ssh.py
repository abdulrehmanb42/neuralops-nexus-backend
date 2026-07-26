"""
SSH MCP tools.

Connect to remote servers and execute commands or browse files.
Credentials are read from env vars (SSH_DEFAULT_*) or passed per-call.

Uses paramiko for SSH connections.
"""
import asyncio
import io
from fastmcp import FastMCP
import paramiko
from config import (
    SSH_DEFAULT_HOST, SSH_DEFAULT_PORT, SSH_DEFAULT_USER,
    SSH_DEFAULT_PASSWORD, SSH_DEFAULT_KEY_PATH, SSH_COMMAND_TIMEOUT,
    SSH_ALLOWED_PATHS, SSH_ALLOWED_COMMANDS,
)


def _check_path(path: str) -> str | None:
    """Return error message if path is not allowed, else None."""
    if not SSH_ALLOWED_PATHS:
        return None  # no restriction configured
    normalized = path.rstrip("/")
    for allowed in SSH_ALLOWED_PATHS:
        if normalized.startswith(allowed.rstrip("/")):
            return None
    return f"❌ Access denied: '{path}' is outside allowed paths ({', '.join(SSH_ALLOWED_PATHS)})."


def _check_command(command: str) -> str | None:
    """Return error message if command is not allowed, else None."""
    if not SSH_ALLOWED_COMMANDS:
        return None  # no restriction configured
    cmd_lower = command.strip().lower()
    for allowed in SSH_ALLOWED_COMMANDS:
        if cmd_lower.startswith(allowed.lower()):
            return None
    return f"❌ Command not allowed: '{command.split()[0]}'. Allowed: {', '.join(SSH_ALLOWED_COMMANDS)}."

mcp = FastMCP("SSH")


def _connect(
    host: str,
    port: int,
    username: str,
    password: str,
    key_path: str,
) -> paramiko.SSHClient:
    """Create an authenticated SSH connection."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connect_kwargs: dict = {"hostname": host, "port": port, "username": username, "timeout": 10}
    if key_path:
        connect_kwargs["key_filename"] = key_path
    elif password:
        connect_kwargs["password"] = password
    else:
        raise ValueError("Either SSH password or key_path must be provided.")

    client.connect(**connect_kwargs)
    return client


def _resolve(host: str, port: int, username: str, password: str, key_path: str) -> tuple:
    """Fall back to env defaults for any empty fields."""
    return (
        host or SSH_DEFAULT_HOST,
        port or SSH_DEFAULT_PORT,
        username or SSH_DEFAULT_USER,
        password or SSH_DEFAULT_PASSWORD,
        key_path or SSH_DEFAULT_KEY_PATH,
    )


@mcp.tool()
async def ssh_execute(
    command: str,
    host: str = "",
    port: int = 0,
    username: str = "",
    password: str = "",
    key_path: str = "",
) -> str:
    """
    Execute a shell command on a remote server via SSH.

    Args:
        command: Shell command to run (e.g. 'df -h', 'systemctl status nginx')
        host: SSH host (uses SSH_DEFAULT_HOST if blank)
        port: SSH port (uses SSH_DEFAULT_PORT if 0)
        username: SSH username (uses SSH_DEFAULT_USER if blank)
        password: SSH password (uses SSH_DEFAULT_PASSWORD if blank)
        key_path: Path to private key file (uses SSH_DEFAULT_KEY_PATH if blank)

    Returns:
        Terminal output of the command (stdout + stderr).
    """
    host, port, username, password, key_path = _resolve(host, port, username, password, key_path)
    if not host:
        return "❌ No SSH host configured. Set SSH_DEFAULT_HOST or pass host parameter."

    if err := _check_command(command):
        return err

    def _run():
        client = _connect(host, port, username, password, key_path)
        try:
            stdin, stdout, stderr = client.exec_command(command, timeout=SSH_COMMAND_TIMEOUT)
            out = stdout.read().decode("utf-8", errors="replace")
            err = stderr.read().decode("utf-8", errors="replace")
            exit_code = stdout.channel.recv_exit_status()
            return out, err, exit_code
        finally:
            client.close()

    try:
        out, err, exit_code = await asyncio.to_thread(_run)
    except Exception as e:
        return f"<<<TERMINAL>>>\n❌ SSH Error: {e}\n<<<END>>>"

    header = f"[{username}@{host}] $ {command}"
    output = out + (f"\n[stderr]\n{err}" if err.strip() else "")
    footer = f"\n[exit code: {exit_code}]"

    return f"<<<TERMINAL>>>\n{header}\n{'─' * len(header)}\n{output}{footer}\n<<<END>>>"


@mcp.tool()
async def ssh_list_files(
    path: str = "~",
    host: str = "",
    port: int = 0,
    username: str = "",
    password: str = "",
    key_path: str = "",
) -> str:
    """
    List files and directories on a remote server.

    Args:
        path: Remote path to list (default: home directory)
        host: SSH host (uses SSH_DEFAULT_HOST if blank)
        port: SSH port
        username: SSH username
        password: SSH password
        key_path: Path to private key file

    Returns:
        Terminal-style file listing.
    """
    host, port, username, password, key_path = _resolve(host, port, username, password, key_path)
    if not host:
        return "❌ No SSH host configured."

    if err := _check_path(path):
        return err

    def _run():
        client = _connect(host, port, username, password, key_path)
        try:
            stdin, stdout, stderr = client.exec_command(
                f"ls -lah {path} 2>&1", timeout=SSH_COMMAND_TIMEOUT
            )
            return stdout.read().decode("utf-8", errors="replace")
        finally:
            client.close()

    try:
        listing = await asyncio.to_thread(_run)
    except Exception as e:
        return f"❌ SSH Error: {e}"

    return f"<<<TERMINAL>>>\n[{username}@{host}:{path}]\n{listing}\n<<<END>>>"


@mcp.tool()
async def ssh_read_file(
    file_path: str,
    host: str = "",
    port: int = 0,
    username: str = "",
    password: str = "",
    key_path: str = "",
    max_lines: int = 100,
) -> str:
    """
    Read the contents of a file on a remote server.

    Args:
        file_path: Absolute path to the file on the remote server
        host: SSH host
        port: SSH port
        username: SSH username
        password: SSH password
        key_path: Path to private key file
        max_lines: Maximum lines to return (default 100)

    Returns:
        File contents as terminal output.
    """
    host, port, username, password, key_path = _resolve(host, port, username, password, key_path)
    if not host:
        return "❌ No SSH host configured."

    if err := _check_path(file_path):
        return err

    def _run():
        client = _connect(host, port, username, password, key_path)
        try:
            stdin, stdout, stderr = client.exec_command(
                f"head -n {max_lines} {file_path} 2>&1", timeout=SSH_COMMAND_TIMEOUT
            )
            return stdout.read().decode("utf-8", errors="replace")
        finally:
            client.close()

    try:
        content = await asyncio.to_thread(_run)
    except Exception as e:
        return f"❌ SSH Error: {e}"

    return f"<<<TERMINAL>>>\n[{file_path} on {host}]\n{'─' * 40}\n{content}\n<<<END>>>"


@mcp.tool()
async def ssh_server_status(
    host: str = "",
    port: int = 0,
    username: str = "",
    password: str = "",
    key_path: str = "",
) -> str:
    """
    Get a quick system status overview of a remote server (CPU, memory, disk).

    Args:
        host: SSH host
        port: SSH port
        username: SSH username
        password: SSH password
        key_path: Path to private key file

    Returns:
        Terminal-style server status report.
    """
    host, port, username, password, key_path = _resolve(host, port, username, password, key_path)
    if not host:
        return "❌ No SSH host configured."

    status_cmd = (
        'echo "=== UPTIME ===" && uptime && '
        'echo "" && echo "=== MEMORY ===" && free -h && '
        'echo "" && echo "=== DISK ===" && df -h && '
        'echo "" && echo "=== CPU LOAD ===" && cat /proc/loadavg'
    )

    def _run():
        client = _connect(host, port, username, password, key_path)
        try:
            stdin, stdout, stderr = client.exec_command(status_cmd, timeout=SSH_COMMAND_TIMEOUT)
            return stdout.read().decode("utf-8", errors="replace")
        finally:
            client.close()

    try:
        output = await asyncio.to_thread(_run)
    except Exception as e:
        return f"❌ SSH Error: {e}"

    return f"<<<TERMINAL>>>\nServer Status: {host}\n{'=' * 40}\n{output}\n<<<END>>>"
