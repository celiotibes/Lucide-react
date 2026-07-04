"""
Lucide-react Backend API
FastAPI application entry point

Integração com sistemas judiciais brasileiros:
- Portal Jus.br (CNJ)
- e-SAJ (TJSP)
- MNI (Malha Nacional de Interoperabilidade)

IA especializada em jurisprudência brasileira:
- RAG com jurisprudência (Legal-BERT-PT + Pinecone)
- NLP/NER para extração de entidades
- Cálculos jurídicos avançados
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create FastAPI instance
app = FastAPI(
    title="Lucide-react API",
    description="Plataforma de pesquisa jurídica, contábil e acadêmica integrada com tribunais",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Dev frontend
        "http://localhost:3000",  # Alternative
        os.getenv("VITE_API_URL", "").split("//")[1] if os.getenv("VITE_API_URL") else None,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# IMPORTS ROUTERS
# ============================================================================

from routes import processos, calculos

# ============================================================================
# ROUTES
# ============================================================================

# Incluir routers
app.include_router(processos.router)
app.include_router(calculos.router)

@app.get("/")
async def root():
    """API health check - root endpoint"""
    return {
        "status": "online",
        "service": "Lucide-react Backend API",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "lucide-react-backend",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/version")
async def get_version():
    """Get API version"""
    return {
        "version": "1.0.0",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "commit": os.getenv("GIT_COMMIT", "unknown")
    }


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc) if os.getenv("ENVIRONMENT") == "development" else "An error occurred",
            "timestamp": datetime.now().isoformat()
        }
    )


# ============================================================================
# STARTUP/SHUTDOWN
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize app on startup"""
    logger.info("🚀 Lucide-react Backend API iniciando...")
    logger.info(f"📊 Environment: {os.getenv('ENVIRONMENT', 'development')}")
    
    # TODO: Inicializar conexões
    # - Database (PostgreSQL)
    # - Cache (Redis)
    # - Serviços de IA (Pinecone, Claude API)
    # - Clientes externos (CNJ, TJSP, etc)


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("🛑 Lucide-react Backend API encerrando...")
    
    # TODO: Fechar conexões
    # - Database
    # - Cache
    # - Serviços externos


# ============================================================================
# PLACEHOLDER ROUTES (Para FASE 4)
# ============================================================================

@app.get("/processos/{numero}")
async def consultar_processo(numero: str):
    """
    Consultar processo no Portal Jus.br (FASE 4A)
    
    Args:
        numero: Número do processo (ex: 0000001-55.2026.7.15.0001)
    
    Returns:
        Dados do processo do tribunal
    """
    return {
        "status": "placeholder",
        "message": "Endpoint será implementado em FASE 4A",
        "numero": numero,
        "placeholder": True
    }


@app.post("/calcular/dano-material")
async def calcular_dano_material(body: dict):
    """
    Calcular indenização por dano material (FASE 4B)
    
    Body:
        - data_dano: str (ISO format)
        - valor_original: float
        - tipo_correccao: str (IPCA, TR, SELIC)
    
    Returns:
        Cálculo com valor corrigido, juros e total
    """
    return {
        "status": "placeholder",
        "message": "Endpoint será implementado em FASE 4B",
        "placeholder": True
    }


@app.post("/analisar/hermenautica")
async def analisar_hermenautica_com_rag(body: dict):
    """
    Gerar hermenêutica blindada com jurisprudência via RAG (FASE 4C)
    
    Body:
        - fatos: list[str]
        - analise_score: float
    
    Returns:
        Hermenêutica com 4 pilares + jurisprudência citada
    """
    return {
        "status": "placeholder",
        "message": "Endpoint será implementado em FASE 4C (RAG)",
        "placeholder": True
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("ENVIRONMENT") == "development"
    )
