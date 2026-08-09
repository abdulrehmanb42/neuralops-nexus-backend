from fastapi import FastAPI, HTTPException
from .routers import embed, trigger

app = FastAPI(title="NeuralOps nexus-ai", version="1.0.0")

app.include_router(embed.router)
app.include_router(trigger.router)
