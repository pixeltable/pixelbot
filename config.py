# config.py - Centralized configuration for the application

# --- LLM & Model IDs ---
# Embedding model for text-based semantic search (documents, transcripts, memory, history)
EMBEDDING_MODEL_ID = "intfloat/multilingual-e5-large-instruct"
# Vision-language model for image/frame semantic search
CLIP_MODEL_ID = "openai/clip-vit-base-patch32"
# Audio transcription model
WHISPER_MODEL_ID = "whisper-1"
# Image generation model
DALLE_MODEL_ID = "dall-e-3"
# Main reasoning LLM (tool use, final answer)
CLAUDE_MODEL_ID = "claude-3-5-sonnet-latest"
# Follow-up question LLM
MISTRAL_MODEL_ID = "mistral-small-latest"

# --- Default System Prompts ---
# Initial prompt for tool selection/analysis
INITIAL_SYSTEM_PROMPT = """Identify the best tool(s) to answer the user's query based on the available data sources (documents, images, news, financial data)."""
# Final prompt for synthesizing the answer
FINAL_SYSTEM_PROMPT = """Based on the provided context and the user's query, provide a very concise answer, ideally just a few words."""

# --- Default LLM Parameters ---
# Set to None to use the underlying API defaults
DEFAULT_MAX_TOKENS: int | None = 1024
DEFAULT_STOP_SEQUENCES: list[str] | None = None  # e.g., ["\n\nHuman:"]
DEFAULT_TEMPERATURE: float | None = 0.7
DEFAULT_TOP_K: int | None = None
DEFAULT_TOP_P: float | None = None

# --- Consolidated Parameters Dictionary ---
DEFAULT_PARAMETERS = {
    "max_tokens": DEFAULT_MAX_TOKENS,
    "stop_sequences": DEFAULT_STOP_SEQUENCES,
    "temperature": DEFAULT_TEMPERATURE,
    "top_k": DEFAULT_TOP_K,
    "top_p": DEFAULT_TOP_P,
}

# --- Persona Presets Definition --- #
# These will be added to a new user's persona table on first login.
PERSONA_PRESETS = {
    "Personal Assistant": {
        "initial_prompt": "You are a helpful and friendly personal assistant. Use available tools and context to answer the user's questions clearly and concisely.",
        "final_prompt": "Provide a clear, friendly, and concise answer based on the gathered information and the user's query.",
        "llm_params": {
            "max_tokens": 1500,
            "stop_sequences": None,
            "temperature": 0.7,
            "top_k": None,
            "top_p": None,
        }
    },
    "Visual Analyst": {
        "initial_prompt": "You are an expert visual analyst. Prioritize information extracted from images and video frames to answer the user's query. Describe visual elements and patterns accurately.",
        "final_prompt": "Based primarily on the provided visual context (images, video frames), generate a detailed analysis answering the user's query. Mention specific visual details observed.",
        "llm_params": {
            "max_tokens": 2000,
            "stop_sequences": None,
            "temperature": 0.4,
            "top_k": None,
            "top_p": None,
        }
    },
    "Research Assistant": {
        "initial_prompt": "You are a meticulous research assistant. Synthesize information from various sources (documents, news, financial data, web searches) to construct a comprehensive answer. Identify key findings and cite sources where applicable.",
        "final_prompt": "Compile the research findings from the provided context into a well-structured and informative summary that directly addresses the user's query. Highlight key data points or conclusions.",
        "llm_params": {
            "max_tokens": 2500,
            "stop_sequences": None,
            "temperature": 0.6,
            "top_k": None,
            "top_p": None,
        }
    },
    "Technical Guide": {
        "initial_prompt": "You are a technical guide. Focus on providing accurate technical details, explanations, or code examples based on the user's query and available context.",
        "final_prompt": "Generate a technically accurate and precise response, potentially including code snippets or step-by-step instructions, based on the user's query and the gathered information.",
        "llm_params": {
            "max_tokens": 2000,
            "stop_sequences": None,
            "temperature": 0.3,
            "top_k": None,
            "top_p": None,
        }
    }
}
