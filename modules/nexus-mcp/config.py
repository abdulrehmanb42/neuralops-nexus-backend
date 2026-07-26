import os
from dotenv import load_dotenv

load_dotenv()

# -- Shopping (SerpAPI Google Shopping) --------------------------------------
# One key covers BestBuy, Walmart, Amazon, Target and more.
# Sign up at serpapi.com — 100 free searches/month, no company verification.
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")

# -- ERP (Odoo) ---------------------------------------------------------------
ERP_TYPE = os.getenv("ERP_TYPE", "odoo")          # odoo | acumatica
ERP_URL = os.getenv("ERP_URL", "http://odoo:8069")
ERP_DB = os.getenv("ERP_DB", "odoo")
ERP_USERNAME = os.getenv("ERP_USERNAME", "admin")
ERP_PASSWORD = os.getenv("ERP_PASSWORD", "admin")

# -- SSH ----------------------------------------------------------------------
SSH_DEFAULT_HOST = os.getenv("SSH_DEFAULT_HOST", "")
SSH_DEFAULT_PORT = int(os.getenv("SSH_DEFAULT_PORT", "22"))
SSH_DEFAULT_USER = os.getenv("SSH_DEFAULT_USER", "")
SSH_DEFAULT_PASSWORD = os.getenv("SSH_DEFAULT_PASSWORD", "")
SSH_DEFAULT_KEY_PATH = os.getenv("SSH_DEFAULT_KEY_PATH", "")
SSH_COMMAND_TIMEOUT = int(os.getenv("SSH_COMMAND_TIMEOUT", "30"))

# Comma-separated list of allowed path prefixes for ssh_list_files / ssh_read_file.
# Example: "/var/log,/home/ubuntu/projects,/etc/nginx"
# If empty, ALL paths are allowed (not recommended for production).
_raw = os.getenv("SSH_ALLOWED_PATHS", "")
SSH_ALLOWED_PATHS: list[str] = [p.strip() for p in _raw.split(",") if p.strip()]

# Comma-separated list of allowed command prefixes for ssh_execute.
# Example: "df,free,uptime,systemctl status,ls,cat,tail,ps"
# If empty, ALL commands are allowed.
_raw_cmds = os.getenv("SSH_ALLOWED_COMMANDS", "")
SSH_ALLOWED_COMMANDS: list[str] = [c.strip() for c in _raw_cmds.split(",") if c.strip()]
