# Install NeuralOps Nexus
curl -fsSL https://raw.githubusercontent.com/mapax-io/neuralops-nexus/dev/install.sh | bash

# Django setup
docker compose exec nucleus-fat python manage.py migrate
docker compose exec nucleus-fat python manage.py seed_permissions
docker compose exec nucleus-fat python manage.py create_owner

# Install Tailscale (skip if already installed)
curl -fsSL https://tailscale.com/install.sh | sh

# Start Tailscale
sudo tailscale up

# Enable Funnel on port 8090
sudo tailscale funnel --bg 8090

# Check Docker networks
docker inspect fat-nexus-ai --format '{{json .NetworkSettings.Networks}}'
docker inspect filesystem-mcp --format '{{json .NetworkSettings.Networks}}'

# Connect filesystem MCP to fat-network if required
docker network connect fat-network filesystem-mcp
