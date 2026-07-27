"""
Code Execution MCP tools.

Write code files to a remote server and execute them via SSH.
Supports Python, Node.js, and Bash. Uses SFTP to transfer files
and SSH to run them.

Env vars:
  SSH_DEFAULT_HOST / PORT / USER / PASSWORD / KEY_PATH — same SSH credentials
  CODE_WORK_DIR  — base directory for code files (default: /home/ubuntu/code)
"""
import asyncio
import io
import os
import uuid
from fastmcp import FastMCP
import paramiko
from config import (
    SSH_DEFAULT_HOST, SSH_DEFAULT_PORT, SSH_DEFAULT_USER,
    SSH_DEFAULT_PASSWORD, SSH_DEFAULT_KEY_PATH, SSH_COMMAND_TIMEOUT,
    CODE_WORK_DIR,
)

mcp = FastMCP("Code")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _connect(host, port, username, password, key_path) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    kwargs: dict = {"hostname": host, "port": port, "username": username, "timeout": 10}
    if key_path:
        kwargs["key_filename"] = key_path
    elif password:
        kwargs["password"] = password
    else:
        raise ValueError("SSH password or key_path required.")
    client.connect(**kwargs)
    return client


def _resolve(host, port, username, password, key_path):
    return (
        host or SSH_DEFAULT_HOST,
        port or SSH_DEFAULT_PORT,
        username or SSH_DEFAULT_USER,
        password or SSH_DEFAULT_PASSWORD,
        key_path or SSH_DEFAULT_KEY_PATH,
    )


def _exec(client: paramiko.SSHClient, cmd: str) -> tuple[str, str, int]:
    _, stdout, stderr = client.exec_command(cmd, timeout=SSH_COMMAND_TIMEOUT)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return out, err, code


LANG_EXT = {"python": ".py", "bash": ".sh", "node": ".js", "javascript": ".js"}
LANG_RUN  = {"python": "python3", "bash": "bash", "node": "node", "javascript": "node"}


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def run_code(
    code: str,
    language: str = "python",
    filename: str = "",
    host: str = "",
    port: int = 0,
    username: str = "",
    password: str = "",
    key_path: str = "",
) -> str:
    """
    Write code to the remote server and execute it immediately.

    Args:
        code: The source code to run.
        language: 'python' | 'bash' | 'node' / 'javascript' (default: python)
        filename: Optional filename (auto-generated if blank)
        host / port / username / password / key_path: SSH credentials (use defaults if blank)

    Returns:
        Execution output wrapped in <<<TERMINAL>>> markers.
    """
    lang = language.lower()
    if lang not in LANG_EXT:
        return f"❌ Unsupported language '{language}'. Choose: {', '.join(LANG_EXT)}"

    host, port, username, password, key_path = _resolve(host, port, username, password, key_path)
    if not host:
        return "❌ No SSH host configured."

    ext = LANG_EXT[lang]
    runner = LANG_RUN[lang]
    fname = filename or f"tmp_{uuid.uuid4().hex[:8]}{ext}"
    remote_path = f"{CODE_WORK_DIR}/{fname}"

    def _run():
        client = _connect(host, port, username, password, key_path)
        try:
            # Ensure work dir exists
            _exec(client, f"mkdir -p {CODE_WORK_DIR}")
            # Write file via SFTP
            sftp = client.open_sftp()
            with sftp.open(remote_path, "w") as f:
                f.write(code)
            sftp.close()
            # Execute
            cmd = f"cd {CODE_WORK_DIR} && {runner} {fname} 2>&1"
            out, err, exit_code = _exec(client, cmd)
            return out, err, exit_code
        finally:
            client.close()

    try:
        out, err, exit_code = await asyncio.to_thread(_run)
    except Exception as e:
        return f"<<<TERMINAL>>>\\n❌ Error: {e}\\n<<<END>>>"

    combined = out + (f"\n[stderr]\n{err}" if err.strip() else "")
    header = f"[{username}@{host}] {runner} {fname}"
    return (
        f"<<<TERMINAL>>>\n{header}\n{'─' * len(header)}\n"
        f"{combined}\n[exit code: {exit_code}]\n<<<END>>>"
    )


@mcp.tool()
async def write_file(
    path: str,
    content: str,
    host: str = "",
    port: int = 0,
    username: str = "",
    password: str = "",
    key_path: str = "",
) -> str:
    """
    Write (or overwrite) a file on the remote server.

    Args:
        path: Absolute or relative path (relative paths resolve inside CODE_WORK_DIR)
        content: File content to write
        host / port / username / password / key_path: SSH credentials

    Returns:
        Confirmation message.
    """
    host, port, username, password, key_path = _resolve(host, port, username, password, key_path)
    if not host:
        return "❌ No SSH host configured."

    remote_path = path if path.startswith("/") else f"{CODE_WORK_DIR}/{path}"

    def _run():
        client = _connect(host, port, username, password, key_path)
        try:
            # Ensure parent directory exists
            parent = "/".join(remote_path.split("/")[:-1])
            if parent:
                _exec(client, f"mkdir -p {parent}")
            sftp = client.open_sftp()
            with sftp.open(remote_path, "w") as f:
                f.write(content)
            sftp.close()
        finally:
            client.close()

    try:
        await asyncio.to_thread(_run)
    except Exception as e:
        return f"❌ Error writing file: {e}"

    return f"✅ File written: {remote_path}"


@mcp.tool()
async def read_file(
    path: str,
    max_lines: int = 150,
    host: str = "",
    port: int = 0,
    username: str = "",
    password: str = "",
    key_path: str = "",
) -> str:
    """
    Read a file from the remote server.

    Args:
        path: File path (relative resolves inside CODE_WORK_DIR)
        max_lines: Max lines to return (default 150)
        host / port / username / password / key_path: SSH credentials

    Returns:
        File contents wrapped in <<<TERMINAL>>> markers.
    """
    host, port, username, password, key_path = _resolve(host, port, username, password, key_path)
    if not host:
        return "❌ No SSH host configured."

    remote_path = path if path.startswith("/") else f"{CODE_WORK_DIR}/{path}"

    def _run():
        client = _connect(host, port, username, password, key_path)
        try:
            out, _, _ = _exec(client, f"head -n {max_lines} {remote_path} 2>&1")
            return out
        finally:
            client.close()

    try:
        content = await asyncio.to_thread(_run)
    except Exception as e:
        return f"❌ Error reading file: {e}"

    return f"<<<TERMINAL>>>\n[{remote_path}]\n{'─' * 40}\n{content}\n<<<END>>>"


@mcp.tool()
async def list_files(
    path: str = "",
    host: str = "",
    port: int = 0,
    username: str = "",
    password: str = "",
    key_path: str = "",
) -> str:
    """
    List files in a directory on the remote server.

    Args:
        path: Directory path (defaults to CODE_WORK_DIR)
        host / port / username / password / key_path: SSH credentials

    Returns:
        Directory listing wrapped in <<<TERMINAL>>> markers.
    """
    host, port, username, password, key_path = _resolve(host, port, username, password, key_path)
    if not host:
        return "❌ No SSH host configured."

    remote_path = path or CODE_WORK_DIR

    def _run():
        client = _connect(host, port, username, password, key_path)
        try:
            out, _, _ = _exec(client, f"ls -lah {remote_path} 2>&1")
            return out
        finally:
            client.close()

    try:
        listing = await asyncio.to_thread(_run)
    except Exception as e:
        return f"❌ Error listing files: {e}"

    return f"<<<TERMINAL>>>\n[{remote_path}]\n{listing}\n<<<END>>>"


@mcp.tool()
async def install_package(
    package: str,
    manager: str = "pip",
    host: str = "",
    port: int = 0,
    username: str = "",
    password: str = "",
    key_path: str = "",
) -> str:
    """
    Install a package on the remote server.

    Args:
        package: Package name (e.g. 'pandas', 'express')
        manager: 'pip' | 'npm' (default: pip)
        host / port / username / password / key_path: SSH credentials

    Returns:
        Installation output wrapped in <<<TERMINAL>>> markers.
    """
    host, port, username, password, key_path = _resolve(host, port, username, password, key_path)
    if not host:
        return "❌ No SSH host configured."

    if manager == "pip":
        cmd = f"pip3 install {package} --quiet 2>&1"
    elif manager == "npm":
        cmd = f"cd {CODE_WORK_DIR} && npm install {package} 2>&1"
    else:
        return f"❌ Unknown package manager '{manager}'. Use 'pip' or 'npm'."

    def _run():
        client = _connect(host, port, username, password, key_path)
        try:
            out, _, exit_code = _exec(client, cmd)
            return out, exit_code
        finally:
            client.close()

    try:
        out, exit_code = await asyncio.to_thread(_run)
    except Exception as e:
        return f"❌ Error installing package: {e}"

    status = "✅" if exit_code == 0 else "❌"
    return f"<<<TERMINAL>>>\n{status} {manager} install {package}\n{'─' * 40}\n{out}\n[exit code: {exit_code}]\n<<<END>>>"
