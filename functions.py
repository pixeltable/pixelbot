# functions.py - User-Defined Functions (UDFs) for the Pixeltable Agent
# ---------------------------------------------------------------------------
# This file contains Python functions decorated with `@pxt.udf`.
# These UDFs define custom logic (e.g., API calls, data processing)
# that can be seamlessly integrated into Pixeltable workflows.
# Pixeltable automatically calls these functions when computing columns
# in tables or views (as defined in setup_pixeltable.py).
# ---------------------------------------------------------------------------

# Standard library imports
import os
import traceback
from datetime import datetime
from typing import Optional, Dict, Any, List, Union

# Third-party library imports
import requests
import yfinance as yf
from duckduckgo_search import DDGS

# Pixeltable library
import pixeltable as pxt

# Pixeltable UDFs (User-Defined Functions) extend the platform's capabilities.
# They allow you to wrap *any* Python code and use it within Pixeltable's
# declarative data processing and workflow engine.
# Pixeltable handles scheduling, execution, caching, and error handling.


# Tool UDF: Fetches latest news using NewsAPI.
# Registered as a tool for the LLM via `pxt.tools()` in setup_pixeltable.py.
@pxt.udf
def get_latest_news(topic: str) -> str:
    """Fetch latest news for a given topic using NewsAPI."""
    try:
        api_key = os.environ.get("NEWS_API_KEY")
        if not api_key:
            return "Error: NewsAPI key not found in environment variables."

        url = "https://newsapi.org/v2/everything"
        params = {
            "q": topic,
            "apiKey": api_key,
            "sortBy": "publishedAt",
            "language": "en",
            "pageSize": 5,
        }

        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            return f"Error: NewsAPI request failed ({response.status_code}): {response.text}"

        data = response.json()
        articles = data.get("articles", [])

        if not articles:
            return f"No recent news found for '{topic}'."

        # Format multiple articles
        formatted_news = []
        for i, article in enumerate(articles[:3], 1):
            pub_date = datetime.fromisoformat(
                article["publishedAt"].replace("Z", "+00:00")
            ).strftime("%Y-%m-%d")
            formatted_news.append(
                f"{i}. [{pub_date}] {article['title']}\n   {article['description']}"
            )

        return "\n\n".join(formatted_news)

    except requests.Timeout:
        return "Error: NewsAPI request timed out."
    except requests.RequestException as e:
        return f"Error making NewsAPI request: {str(e)}"
    except Exception as e:
        return f"Unexpected error fetching news: {str(e)}."


# Tool UDF: Searches news using DuckDuckGo.
# Registered as a tool for the LLM via `pxt.tools()` in setup_pixeltable.py.
@pxt.udf
def search_news(keywords: str, max_results: int = 5) -> str:
    """Search news using DuckDuckGo and return results."""
    try:
        # DDGS requires entering the context manager explicitly
        with DDGS() as ddgs:
            results = list(
                ddgs.news(  # Convert iterator to list for processing
                    keywords=keywords,
                    region="wt-wt",
                    safesearch="off",
                    timelimit="m",  # Limit search to the last month
                    max_results=max_results,
                )
            )
            if not results:
                return "No news results found."

            # Format results for readability
            formatted_results = []
            for i, r in enumerate(results, 1):
                formatted_results.append(
                    f"{i}. Title: {r.get('title', 'N/A')}\n"
                    f"   Source: {r.get('source', 'N/A')}\n"
                    f"   Published: {r.get('date', 'N/A')}\n"
                    f"   URL: {r.get('url', 'N/A')}\n"
                    f"   Snippet: {r.get('body', 'N/A')}\n"
                )
            return "\n".join(formatted_results)
    except Exception as e:
        print(f"DuckDuckGo search failed: {str(e)}")
        return f"Search failed: {str(e)}."


# Tool UDF: Fetches financial data using yfinance.
# Integrates external Python libraries into the Pixeltable workflow.
# Registered as a tool for the LLM via `pxt.tools()` in setup_pixeltable.py.
@pxt.udf
def fetch_financial_data(ticker: str) -> str:
    """Fetch financial summary data for a given company ticker using yfinance."""
    try:
        if not ticker:
            return "Error: No ticker symbol provided."

        stock = yf.Ticker(ticker)

        # Get the info dictionary - this is the primary source now
        info = stock.info
        if (
            not info or info.get("quoteType") == "MUTUALFUND"
        ):  # Basic check if info exists and isn't a mutual fund (less relevant fields)
            # Attempt history for basic validation if info is sparse
            hist = stock.history(period="1d")
            if hist.empty:
                return f"Error: No data found for ticker '{ticker}'. It might be delisted or incorrect."
            else:  # Sometimes info is missing but history works, provide minimal info
                return f"Limited info for '{ticker}'. Previous Close: {hist['Close'].iloc[-1]:.2f} (if available)."

        # Select and format key fields from the info dictionary
        data_points = {
            "Company Name": info.get("shortName") or info.get("longName"),
            "Symbol": info.get("symbol"),
            "Exchange": info.get("exchange"),
            "Quote Type": info.get("quoteType"),
            "Currency": info.get("currency"),
            "Current Price": info.get("currentPrice")
            or info.get("regularMarketPrice")
            or info.get("bid"),
            "Previous Close": info.get("previousClose"),
            "Open": info.get("open"),
            "Day Low": info.get("dayLow"),
            "Day High": info.get("dayHigh"),
            "Volume": info.get("volume") or info.get("regularMarketVolume"),
            "Market Cap": info.get("marketCap"),
            "Trailing P/E": info.get("trailingPE"),
            "Forward P/E": info.get("forwardPE"),
            "Dividend Yield": info.get("dividendYield"),
            "52 Week Low": info.get("fiftyTwoWeekLow"),
            "52 Week High": info.get("fiftyTwoWeekHigh"),
            "Avg Volume (10 day)": info.get("averageDailyVolume10Day"),
            # Add more fields if desired
        }

        formatted_data = [
            f"Financial Summary for {data_points.get('Company Name', ticker)} ({data_points.get('Symbol', ticker).upper()}) - {data_points.get('Quote Type', 'N/A')}"
        ]
        formatted_data.append("-" * 40)

        for key, value in data_points.items():
            if value is not None:  # Only show fields that have a value
                formatted_value = value
                # Format specific types for readability
                if key in [
                    "Current Price",
                    "Previous Close",
                    "Open",
                    "Day Low",
                    "Day High",
                    "52 Week Low",
                    "52 Week High",
                ] and isinstance(value, (int, float)):
                    formatted_value = (
                        f"{value:.2f} {data_points.get('Currency', '')}".strip()
                    )
                elif key in [
                    "Volume",
                    "Market Cap",
                    "Avg Volume (10 day)",
                ] and isinstance(value, (int, float)):
                    if value > 1_000_000_000:
                        formatted_value = f"{value / 1_000_000_000:.2f}B"
                    elif value > 1_000_000:
                        formatted_value = f"{value / 1_000_000:.2f}M"
                    elif value > 1_000:
                        formatted_value = f"{value / 1_000:.2f}K"
                    else:
                        formatted_value = f"{value:,}"
                elif key == "Dividend Yield" and isinstance(value, (int, float)):
                    formatted_value = f"{value * 100:.2f}%"
                elif (
                    key == "Trailing P/E"
                    or key == "Forward P/E") and isinstance(value, (int, float)
                ):
                    formatted_value = f"{value:.2f}"

                formatted_data.append(f"{key}: {formatted_value}")

        # Optionally, add a line about latest financials if easily available
        try:
            latest_financials = stock.financials.iloc[:, 0]
            revenue = latest_financials.get("Total Revenue")
            net_income = latest_financials.get("Net Income")
            if revenue is not None or net_income is not None:
                formatted_data.append("-" * 40)
                fin_date = latest_financials.name.strftime("%Y-%m-%d")
                if revenue:
                    formatted_data.append(
                        f"Latest Revenue ({fin_date}): ${revenue / 1e6:.2f}M"
                    )
                if net_income:
                    formatted_data.append(
                        f"Latest Net Income ({fin_date}): ${net_income / 1e6:.2f}M"
                    )
        except Exception:
            pass  # Ignore errors fetching/parsing financials for this summary

        return "\n".join(formatted_data)

    except Exception as e:
        traceback.print_exc()  # Log the full error for debugging
        return f"Error fetching financial data for {ticker}: {str(e)}."


# Context Assembly UDF: Combines various text-based search results and tool outputs.
# This function is called by a computed column in the `agents.tools` table
# to prepare the summarized context before the final LLM call.
# Demonstrates processing results from multiple Pixeltable search queries.
@pxt.udf
def assemble_multimodal_context(
    question: str,
    tool_outputs: Optional[List[Dict[str, Any]]],
    doc_context: Optional[List[Union[Dict[str, Any], str]]],
    memory_context: Optional[List[Dict[str, Any]]] = None,
    chat_memory_context: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    Constructs a single text block summarizing various context types
    (documents, memory bank items, chat history search results, and generic tool outputs)
    relevant to the user's question.
    Video/Audio transcript results will appear in 'tool_outputs' if the LLM chose to call those tools.
    Does NOT include recent chat history or image/video frame details.
    """
    # --- Image Handling Note ---
    # Image/Video frame context is handled in `assemble_final_messages`
    # as it requires specific formatting for multimodal LLM input.

    # Format document context inline
    doc_context_str = "N/A"
    if doc_context:
        doc_items = []
        for item in doc_context:
            # Safely extract text and source filename
            text = item.get("text", "") if isinstance(item, dict) else str(item)
            source = (
                item.get("source_doc", "Unknown Document")
                if isinstance(item, dict)
                else "Unknown Document"
            )
            source_name = os.path.basename(str(source))
            if text:
                doc_items.append(f"- [Source: {source_name}] {text}")
        if doc_items:
            doc_context_str = "\n".join(doc_items)

    # Format memory bank context
    memory_context_str = "N/A"
    if memory_context:
        memory_items = []
        for item in memory_context:
            # Safely extract details
            content = item.get("content", "")
            item_type = item.get("type", "unknown")
            language = item.get("language")
            sim = item.get("sim")
            context_query = item.get("context_query", "Unknown Query")
            # Use triple quotes for multi-line f-string clarity
            item_desc = f"""- [Memory Item | Type: {item_type}{f" ({language})" if language else ""} | Original Query: '{context_query}' {f"| Sim: {sim:.3f}" if sim is not None else ""}]
Content: {content[:100]}{"..." if len(content) > 100 else ""}"""
            memory_items.append(item_desc)
        if memory_items:
            memory_context_str = "\n".join(memory_items)

    # Format chat history search context
    chat_memory_context_str = "N/A"
    if chat_memory_context:
        chat_memory_items = []
        for item in chat_memory_context:
            content = item.get("content", "")
            role = item.get("role", "unknown")
            sim = item.get("sim")
            timestamp = item.get("timestamp")
            ts_str = (
                timestamp.strftime("%Y-%m-%d %H:%M") if timestamp else "Unknown Time"
            )
            item_desc = f"""- [Chat History | Role: {role} | Time: {ts_str} {f"| Sim: {sim:.3f}" if sim is not None else ""}]
Content: {content[:150]}{"..." if len(content) > 150 else ""}"""
            chat_memory_items.append(item_desc)
        if chat_memory_items:
            chat_memory_context_str = "\n".join(chat_memory_items)

    # Format tool outputs
    tool_outputs_str = str(tool_outputs) if tool_outputs else "N/A"

    # Construct the final summary text block
    text_content = f"""
ORIGINAL QUESTION:
{question}

AVAILABLE CONTEXT:

[TOOL RESULTS]
{tool_outputs_str}

[DOCUMENT CONTEXT]
{doc_context_str}

[MEMORY BANK CONTEXT]
{memory_context_str}

[CHAT HISTORY SEARCH CONTEXT] (Older messages relevant to the query)
{chat_memory_context_str}
"""

    return text_content.strip()


# Final Message Assembly UDF: Creates the structured message list for the main LLM.
# This handles the specific format required by multimodal models (like Claude 3.5 Sonnet)
# incorporating text, images, and potentially video frames.
# It is called by a computed column in the `agents.tools` table.
@pxt.udf
def assemble_final_messages(
    history_context: Optional[List[Dict[str, Any]]],
    multimodal_context_text: str,
    image_context: Optional[List[Dict[str, Any]]] = None,  # Input image results
    video_frame_context: Optional[
        List[Dict[str, Any]]
    ] = None,  # Input video frame results
) -> List[Dict[str, Any]]:
    """
    Constructs the final list of messages for the LLM, incorporating:
    - Recent chat history (user/assistant turns).
    - The main text context summary (docs, memory, tool outputs, etc.).
    - Image context (base64 encoded images).
    - Video frame context (base64 encoded video frames).

    This structure is required for multimodal LLMs like Claude 3.

    Args:
        history_context: Recent chat messages.
        multimodal_context_text: The combined text context from `assemble_multimodal_context`.
        image_context: List of image search results (containing base64 data).
        video_frame_context: List of video frame search results (containing base64 data).

    Returns:
        A list of messages formatted for the LLM API.
    """
    messages = []

    # 1. Add recent chat history (if any) in chronological order
    if history_context:
        for item in reversed(history_context):
            role = item.get("role")
            content = item.get("content")
            if role and content:
                messages.append({"role": role, "content": content})

    # 2. Prepare the content block for the final user message
    final_user_content = []

    # 2a. Add image blocks (if any)
    if image_context:
        for item in image_context:
            # Safely extract base64 encoded image data
            if isinstance(item, dict) and "encoded_image" in item:
                image_data = item["encoded_image"]
                # Ensure it's a string
                if isinstance(image_data, bytes):
                    image_data = image_data.decode("utf-8")
                elif not isinstance(image_data, str):
                    continue  # Skip invalid data

                # Append in the format required by the LLM API
                final_user_content.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",  # Assuming PNG, adjust if needed
                            "data": image_data,
                        },
                    }
                )

    # 2b. Add video frame blocks (if any) - NOTE: Currently illustrative, LLM support varies
    if video_frame_context:
        for item in video_frame_context:
            # Safely extract base64 encoded video frame data
            if isinstance(item, dict) and "encoded_video_frame" in item:
                video_frame_data = item["encoded_video_frame"]
                if isinstance(video_frame_data, bytes):
                    video_frame_data = video_frame_data.decode("utf-8")
                elif not isinstance(video_frame_data, str):
                    continue  # Skip invalid data

                # Append in the format required by the LLM API (adjust if API differs)
                final_user_content.append(
                    {
                        "type": "video_frame",  # Hypothetical type, check LLM docs
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",  # Frames are usually images
                            "data": video_frame_data,
                        },
                    }
                )

    # 2c. Add the main text context block
    final_user_content.append(
        {
            "type": "text",
            "text": multimodal_context_text,  # Use the pre-formatted summary
        }
    )

    # 3. Append the complete user message (potentially multimodal)
    messages.append({"role": "user", "content": final_user_content})

    return messages


# Follow-up Prompt Assembly UDF: Creates the input prompt for the follow-up LLM.
# Encapsulates the prompt template structure, making the workflow definition
# in setup_pixeltable.py cleaner and focusing it on data flow.
@pxt.udf
def assemble_follow_up_prompt(original_prompt: str, answer_text: str) -> str:
    """Constructs the formatted prompt string for the follow-up question LLM.

    This function encapsulates the prompt template to make it reusable and
    easier to see the input being sent to the LLM in the Pixeltable trace.
    Includes a few-shot example to guide the model.
    """
    # Updated template with clearer instructions and an example
    follow_up_system_prompt_template = """You are an expert assistant tasked with generating **exactly 3** relevant and concise follow-up questions based on an original user query and the provided answer. Focus *only* on the content provided.

**Instructions:**
1.  Read the <ORIGINAL_PROMPT_START> and <ANSWER_TEXT_START> sections carefully.
2.  Generate 3 distinct questions that logically follow from the information presented.
3.  The questions should encourage deeper exploration of the topic discussed.
4.  **Output ONLY the 3 questions**, one per line. Do NOT include numbering, bullet points, or any other text.

**Example:**

<ORIGINAL_PROMPT_START>
What are the main benefits of using Pixeltable for AI workflows?
</ORIGINAL_PROMPT_END>

<ANSWER_TEXT_START>
Pixeltable simplifies AI workflows by providing automated data orchestration, native multimodal support (text, images, video, audio), a declarative interface, and integrations with LLMs and ML models. It handles complex tasks like data versioning, incremental computation, and vector indexing automatically.
</ANSWER_TEXT_END>

How does Pixeltable handle data versioning specifically?
Can you elaborate on the declarative interface of Pixeltable?
What specific LLMs and ML models does Pixeltable integrate with?

**Now, generate questions for the following input:**

<ORIGINAL_PROMPT_START>
{original_prompt}
</ORIGINAL_PROMPT_END>

<ANSWER_TEXT_START>
{answer_text}
</ANSWER_TEXT_END>
"""
    return follow_up_system_prompt_template.format(
        original_prompt=original_prompt, answer_text=answer_text
    )
