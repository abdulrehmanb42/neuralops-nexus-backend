import os
from dotenv import load_dotenv

load_dotenv()

# -- BestBuy ------------------------------------------------------------------
BESTBUY_API_KEY = os.getenv("BESTBUY_API_KEY", "")
BESTBUY_BASE_URL = "https://api.bestbuy.com/v1"

# -- Walmart ------------------------------------------------------------------
WALMART_CLIENT_ID = os.getenv("WALMART_CLIENT_ID", "")
WALMART_CLIENT_SECRET = os.getenv("WALMART_CLIENT_SECRET", "")
WALMART_BASE_URL = "https://marketplace.walmartapis.com/v3"

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
