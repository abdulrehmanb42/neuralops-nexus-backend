"""
nexus-ai configuration — driven entirely by environment variables.
Swap any backend by changing a single env var, zero code changes.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Agent backend ─────────────────────────────────────────────────────────
    # Options: "pydantic_ai" | "agno" | "langgraph"
    AGENT_BACKEND: str = "pydantic_ai"

    # ── LLM ──────────────────────────────────────────────────────────────────
    # All LLM calls go through LiteLLM — one gateway for all providers.
    # Encode the provider in LLM_MODEL using LiteLLM's prefix format:
    #   "anthropic/claude-haiku-4-5-20251001"
    #   "openai/gpt-4o"
    #   "azure/gpt-4"
    #   "ollama/llama3"  (set OLLAMA_BASE_URL for the Ollama service)
    LLM_PROVIDER: str = "litellm"
    LLM_MODEL: str = "anthropic/claude-haiku-4-5-20251001"

    # ── Embedding ─────────────────────────────────────────────────────────────
    # Options: "fastembed" | "litellm"
    #   fastembed  — local ONNX, runs inside nexus-ai, no network, no GPU (default)
    #   litellm    — routes to any remote service; set EMBEDDING_MODEL with prefix:
    #                "ollama/nomic-embed-text", "openai/text-embedding-3-small"
    #                Set EMBEDDING_BASE_URL if needed (Ollama, Infinity, etc.)
    EMBEDDING_PROVIDER: str = "fastembed"
    EMBEDDING_MODEL: str = "nomic-ai/nomic-embed-text-v1.5"
    EMBEDDING_BASE_URL: str = ""

    # ── Vector store ──────────────────────────────────────────────────────────
    # Options: "chroma" | "qdrant" | "pgvector"
    # Default is now pgvector -- chromadb was removed from requirements.txt
    # (see that file's comment) to cut image size, so "chroma" is no longer
    # a working choice unless the package is reinstalled by hand.
    VECTOR_STORE: str = "pgvector"
    CHROMA_HOST: str = "nexus-chroma"
    CHROMA_PORT: int = 8000

    # pgvector backend -- reuses the SAME Postgres nucleus already runs
    # (same env var names as nucleus's DATABASES config in core/settings.py)
    # rather than a second database to configure. EMBEDDING_DIM must match
    # whatever EMBEDDING_MODEL actually produces -- 768 is
    # nomic-ai/nomic-embed-text-v1.5's dimension (the default above); change
    # this if you switch EMBEDDING_MODEL to something with a different
    # output size, or the VECTOR(N) column won't accept the embeddings.
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = ""
    POSTGRES_USER: str = ""
    POSTGRES_PASSWORD: str = ""
    EMBEDDING_DIM: int = 768

    # ── API keys / endpoints ──────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    # Ollama service URL — only needed when EMBEDDING_PROVIDER=litellm
    # and EMBEDDING_MODEL starts with "ollama/", or LLM_MODEL starts with "ollama/"
    OLLAMA_BASE_URL: str = "http://nexus-ollama:11434"

    # ── Internal auth (nexus-nucleus → nexus-ai calls) ───────────────────────
    INTERNAL_API_KEY: str = "change-me-in-production"

    # ── nexus-nucleus base URL (nexus-ai → nexus-nucleus calls) ───────────────
    # "nucleus" -- nucleus's docker-compose *service* name, not its
    # container_name (nexus-nucleus). Compose only guarantees the service
    # name resolves over the network's embedded DNS; container_name is
    # just a docker ps label unless it happens to also line up. Override
    # via env var in non-Compose setups.
    NEXUS_NUCLEUS_URL: str = "http://nucleus:8000"

    # ── Prompt tuning ─────────────────────────────────────────────────────────
    # How many past messages to pull as conversation history per trigger.
    # Lives here, not in nexus-nucleus, on purpose -- this is a prompt-quality
    # knob (see apps/managers/nucleus_client.py:fetch_history), tunable without
    # a nexus-nucleus deploy.
    HISTORY_DEPTH: int = 20

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
