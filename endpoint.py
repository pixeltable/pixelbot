# Standard library imports
import base64
import inspect
import io
import json
import logging
import os
import time
import traceback
import uuid
from datetime import datetime
from functools import wraps
from logging.handlers import RotatingFileHandler
from urllib.parse import urlparse

# Third-party library imports
from dotenv import load_dotenv
from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    send_file,
    Response,
    redirect,
    url_for,
    make_response,
    g,
    session # Add session
)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from PIL import Image
import pixeltable as pxt
from waitress import serve
from werkzeug.utils import secure_filename
import workos
from workos import WorkOSClient # Import WorkOSClient class

# Local application imports
import functions
import config

# Load environment variables
load_dotenv(override=True) # Force override of existing OS vars

# Initialize Flask app
app = Flask(__name__)

# --- WorkOS Configuration ---
WORKOS_API_KEY = os.environ.get("WORKOS_API_KEY")
WORKOS_CLIENT_ID = os.environ.get("WORKOS_CLIENT_ID")
WORKOS_REDIRECT_URI = os.environ.get("WORKOS_REDIRECT_URI")
WORKOS_COOKIE_PASSWORD = os.environ.get("WORKOS_COOKIE_PASSWORD")

# Initialize WorkOS Client
workos_client = None
if WORKOS_API_KEY and WORKOS_CLIENT_ID and WORKOS_REDIRECT_URI and WORKOS_COOKIE_PASSWORD:
    try:
        # Use WorkOSClient class directly
        workos_client = WorkOSClient(api_key=WORKOS_API_KEY, client_id=WORKOS_CLIENT_ID)
        app.logger.info("WorkOS Client initialized successfully.")
    except Exception as e:
        app.logger.error(f"Failed to initialize WorkOS Client: {e}", exc_info=True)
else:
    app.logger.warning("WorkOS environment variables (including COOKIE_PASSWORD) not fully configured. Authentication will fail.")
# --- End WorkOS Configuration ---

# --- Login Decorator ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if running in local auth mode
        if os.environ.get('AUTH_MODE') == 'local':
            # In local mode, set a default user and bypass WorkOS
            # You can customize the default user details as needed
            g.user = type('MockUser', (), {'id': 'local_user', 'email': 'local@example.com', 'first_name': 'Local', 'last_name': 'User'})() # Simple mock object
            g.user_id = 'local_user'
            app.logger.debug(f"Running in AUTH_MODE=local, using default user {g.user_id}")
            return f(*args, **kwargs)

        # --- Existing WorkOS Authentication Logic ---
        # Ensure WorkOS client and cookie password are available
        if not workos_client or not WORKOS_COOKIE_PASSWORD:
            app.logger.error("WorkOS Client or Cookie Password not configured for login check.")
            return jsonify({"error": "Authentication configuration error"}), 500

        sealed_session_cookie = request.cookies.get("wos_session")
        if not sealed_session_cookie:
            app.logger.info("No session cookie found, redirecting to login.")
            return redirect(url_for("login")) # Redirect to login if no cookie

        try:
            # Load and authenticate the session from the cookie
            session_obj = workos_client.user_management.load_sealed_session(
                sealed_session=sealed_session_cookie,
                cookie_password=WORKOS_COOKIE_PASSWORD,
            )
            auth_response = session_obj.authenticate()

            if auth_response.authenticated:
                # Store user info in Flask's request context global `g`
                g.user = auth_response.user
                g.user_id = auth_response.user.id
                app.logger.debug(f"User {g.user.email} authenticated, ID {g.user_id} stored in g.")
                return f(*args, **kwargs)
            else:
                # Session exists but is not authenticated (e.g., expired, needs refresh)
                app.logger.info(f"Session found but not authenticated (Reason: {auth_response.reason}), redirecting to login.")
                # For simplicity, redirect to login. Could implement refresh token logic here.
                response = make_response(redirect(url_for("login")))
                response.delete_cookie("wos_session") # Clear invalid cookie
                return response

        except Exception as e:
            # Handle errors loading/authenticating the session (e.g., invalid cookie, password mismatch)
            app.logger.error(f"Error authenticating session cookie: {str(e)}", exc_info=True)
            response = make_response(redirect(url_for("login")))
            response.delete_cookie("wos_session") # Clear potentially corrupt cookie
            return response

    return decorated_function
# --- End Login Decorator ---

# Initialize Limiter for rate limiting
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour", "100 per minute"],
    storage_uri="memory://",
)

# Define thumbnail sizes globally
THUMB_SIZE_SIDEBAR = (96, 96)
THUMB_SIZE = (128, 128)

# --- Helper Functions ---


def encode_image_base64(img):
    """Encodes a PIL Image to a base64 data URI string."""
    if not isinstance(img, Image.Image):
        app.logger.warning(f"encode_image_base64: Item is not a PIL image: {type(img)}")
        return None
    try:
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")  # Save as PNG for web compatibility
        encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{encoded}"  # Add data URI prefix
    except Exception as e:
        app.logger.error(f"Error encoding image to base64: {e}", exc_info=True)
        return None


def create_thumbnail_base64(img, size):
    """Creates a thumbnail of a PIL Image and returns its base64 data URI."""
    if img is None or not isinstance(img, Image.Image):
        app.logger.warning(
            f"create_thumbnail_base64 received invalid input: {type(img)}"
        )
        return None
    try:
        img_copy = img.copy()  # Work on a copy
        img_copy.thumbnail(size, Image.Resampling.LANCZOS)
        return encode_image_base64(img_copy)  # Reuse the base encoder
    except Exception as e:
        app.logger.error(f"Error creating thumbnail: {e}", exc_info=True)
        return None


# --- End Helper Functions ---

# Configure logging
if not os.path.exists("logs"):
    os.makedirs("logs")

file_handler = RotatingFileHandler("logs/app.log", maxBytes=10240, backupCount=10)
file_handler.setFormatter(
    logging.Formatter(
        "%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]"
    )
)
file_handler.setLevel(logging.INFO)
app.logger.addHandler(file_handler)
app.logger.setLevel(logging.INFO)
app.logger.info("Application startup")

# Pixeltable Table Mapping
TABLE_MAP = {
    "document": "agents.collection",
    "image": "agents.images",
    "video": "agents.videos",
    "audio": "agents.audios",
}


def get_pxt_table(table_key):
    """Safely gets a Pixeltable table using the TABLE_MAP."""
    table_name = TABLE_MAP.get(table_key)
    if not table_name:
        raise ValueError(f"Invalid table key: {table_key}")
    try:
        return pxt.get_table(table_name)
    except Exception as e:
        app.logger.error(
            f"Error accessing Pixeltable table '{table_name}': {str(e)}", exc_info=True
        )
        raise  # Re-raise to be handled by the calling endpoint


# Get the main agent table (outside initial try block for clarity)
try:
    tool_agent = pxt.get_table("agents.tools")
    if tool_agent is None:
        raise RuntimeError(
            "Database not initialized. Please run setup_pixeltable.py first!"
        )
    app.logger.info("Successfully connected to the tools (agent) table")
except Exception as e:
    app.logger.error(
        f"FATAL: Could not connect to primary database table 'agents.tools': {str(e)}",
        exc_info=True,
    )
    raise  # Critical error, stop the application

# File Upload Configuration
UPLOAD_FOLDER = "data"
ALLOWED_EXTENSIONS = {
    "pdf",
    "jpg",
    "jpeg",
    "png",
    "mp4",
    "mov",
    "avi",
    "txt",
    "md",
    "html",
    "xml",
    "mp3",
    "wav",
    "m4a",
    "csv",
    "xlsx",
}
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100MB limit


def allowed_file(filename):
    """Check if the uploaded file has an allowed extension."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/")
def home():
    """Render the main home page template, handling local auth mode or checking WorkOS session."""
    user_profile = None
    is_authenticated = False
    display_name = None

    # Handle local authentication mode
    if os.environ.get('AUTH_MODE') == 'local':
        app.logger.debug("Home: Running in AUTH_MODE=local.")
        is_authenticated = True
        display_name = "Local User"
        # Create a mock user profile consistent with login_required
        user_profile = {'id': 'local_user', 'email': 'local@example.com', 'first_name': 'Local', 'last_name': 'User'}
    else:
        # Handle standard WorkOS session check
        app.logger.debug("Home: Checking for WorkOS session.")
        # Check for WorkOS session only if client and password are configured
        if workos_client and WORKOS_COOKIE_PASSWORD:
            sealed_session_cookie = request.cookies.get("wos_session")
            if sealed_session_cookie:
                try:
                    session_obj = workos_client.user_management.load_sealed_session(
                        sealed_session=sealed_session_cookie,
                        cookie_password=WORKOS_COOKIE_PASSWORD,
                    )
                    auth_response = session_obj.authenticate()
                    if auth_response.authenticated:
                        is_authenticated = True
                        # Access attributes directly from auth_response.user
                        user = auth_response.user
                        user_profile = {"id": user.id, "email": user.email, "first_name": user.first_name, "last_name": user.last_name} # Create dict manually if needed
                        display_name = user.first_name or user.email or 'User'
                    else:
                         app.logger.debug(f"Home: Session found but not authenticated (Reason: {auth_response.reason})")
                         # Optionally delete invalid cookie here if needed
                except Exception as e:
                    app.logger.warning(f"Home: Error validating session cookie: {str(e)}")
                    # Optionally delete invalid cookie here if needed

    # Render the template with the determined authentication status
    try:
        return render_template(
            "index.html",
            user=user_profile, # Pass the full profile if needed elsewhere
            is_authenticated=is_authenticated,
            display_name=display_name # Pass display_name (will be 'Local User' or from WorkOS)
        )
    except Exception as e:
        app.logger.error(f"Error rendering home page: {str(e)}", exc_info=True) # Added exc_info
        return jsonify({"error": "Internal server error"}), 500


@app.route("/login")
def login():
    """Redirect the user to WorkOS AuthKit or handle local mode."""
    # If in local auth mode, just redirect home (user is implicitly logged in)
    if os.environ.get('AUTH_MODE') == 'local':
        app.logger.info("AUTH_MODE=local: Skipping WorkOS login, redirecting home.")
        return redirect(url_for("home"))

    # --- Existing WorkOS Login Logic ---
    if not workos_client or not WORKOS_REDIRECT_URI:
        app.logger.error("WorkOS Client or Redirect URI not initialized. Check configuration.")
        return jsonify({"error": "Authentication configuration error"}), 500

    try:
        # Generate the AuthKit authorization URL
        authorization_url = workos_client.user_management.get_authorization_url(
            provider="authkit", # Specify AuthKit provider
            redirect_uri=WORKOS_REDIRECT_URI,
            state={}, # Optional state parameters
        )
        app.logger.info("Redirecting to WorkOS AuthKit for authentication.")
        return redirect(authorization_url)
    except Exception as e:
        app.logger.error(f"Error generating WorkOS AuthKit authorization URL: {str(e)}", exc_info=True)
        return jsonify({"error": "Authentication failed"}), 500


@app.route("/auth/callback")
def auth_callback():
    """Handle the callback from WorkOS AuthKit or handle local mode."""
    # If in local auth mode, this route shouldn't be hit, but redirect home if it is.
    if os.environ.get('AUTH_MODE') == 'local':
        app.logger.warning("AUTH_MODE=local: /auth/callback accessed unexpectedly. Redirecting home.")
        return redirect(url_for("home"))

    # --- Existing WorkOS Callback Logic ---
    if not workos_client or not WORKOS_COOKIE_PASSWORD:
        app.logger.error("WorkOS Client or Cookie Password not initialized. Cannot process callback.")
        return redirect(url_for("home"))

    code = request.args.get("code")
    error = request.args.get("error")
    error_description = request.args.get("error_description")

    if error:
        app.logger.error(f"WorkOS AuthKit authentication error: {error} - {error_description}")
        return redirect(url_for("home"))

    if not code:
        app.logger.error("WorkOS AuthKit callback missing authorization code.")
        return redirect(url_for("home"))

    try:
        # Exchange the code for user profile information using AuthKit
        auth_response = workos_client.user_management.authenticate_with_code(
            code=code,
            session={"seal_session": True, "cookie_password": WORKOS_COOKIE_PASSWORD},
        )

        app.logger.info(f"User {auth_response.user.email} authenticated successfully via AuthKit. ID: {auth_response.user.id}")

        # --- Add Preset Personas for New Users --- #
        user_id = auth_response.user.id
        try:
            personas_table = pxt.get_table("agents.user_personas")
            existing_count = personas_table.where(personas_table.user_id == user_id).count()

            if existing_count == 0:
                app.logger.info(f"First login for user {user_id}. Adding preset personas...")
                presets_to_insert = []
                current_timestamp = datetime.now()
                for name, data in config.PERSONA_PRESETS.items():
                    presets_to_insert.append({
                        "user_id": user_id,
                        "persona_name": name,
                        "initial_prompt": data["initial_prompt"],
                        "final_prompt": data["final_prompt"],
                        "llm_params": data["llm_params"],
                        "timestamp": current_timestamp
                    })

                if presets_to_insert:
                    insert_status = personas_table.insert(presets_to_insert)
                    app.logger.info(f"Inserted {insert_status.num_rows} preset personas for user {user_id}.")
                else:
                    app.logger.warning(f"No presets defined in config.PERSONA_PRESETS for user {user_id}.")
            else:
                app.logger.debug(f"User {user_id} already has {existing_count} personas. Skipping preset insertion.")

        except Exception as persona_err:
            app.logger.error(f"Error checking/adding preset personas for user {user_id}: {persona_err}", exc_info=True)
            # Do not fail the login process, just log the error.
        # --- End Add Preset Personas --- #

        # Store the sealed session in a secure, http-only cookie
        response = make_response(redirect(url_for("home")))
        eight_hours_in_seconds = 8 * 60 * 60
        response.set_cookie(
            "wos_session",
            auth_response.sealed_session,
            secure=False,       # Send only over HTTPS
            httponly=True,     # Prevent client-side JS access
            samesite="Lax",    # Mitigate CSRF
            max_age=eight_hours_in_seconds, # Set cookie to expire in 8 hours
        )
        return response

    except workos.exceptions.BadRequestException as e: # Corrected exception type
         app.logger.error(f"WorkOS AuthKit callback error (Bad Request): {e.message}")
         return redirect(url_for("home"))
    except Exception as e:
        app.logger.error(f"Error processing WorkOS AuthKit callback: {str(e)}", exc_info=True)
        return redirect(url_for("home"))


@app.route("/logout")
def logout():
    """Log the user out using WorkOS AuthKit or clear local session."""
    # If in local auth mode, just clear the session cookie and redirect home
    if os.environ.get('AUTH_MODE') == 'local':
        app.logger.info("AUTH_MODE=local: Clearing local session and redirecting home.")
        response = make_response(redirect(url_for("home")))
        # Even though we don't set 'wos_session' in local mode, clear it just in case
        response.delete_cookie("wos_session")
        # Clear Flask's session if it was used to store the mock user
        session.clear()
        return response

    # --- Existing WorkOS Logout Logic ---
    # Ensure WorkOS client and cookie password are available
    if not workos_client or not WORKOS_COOKIE_PASSWORD:
        app.logger.error("WorkOS Client or Cookie Password not configured for logout.")
        # Redirect home even if config is missing, as we can't log out via WorkOS
        response = make_response(redirect(url_for("home")))
        response.delete_cookie("wos_session") # Attempt to clear local cookie anyway
        return response

    sealed_session_cookie = request.cookies.get("wos_session")
    if not sealed_session_cookie:
        app.logger.info("Logout attempted but no session cookie found.")
        return redirect(url_for("home")) # Already logged out locally

    try:
        # Load the session to get the logout URL
        session_obj = workos_client.user_management.load_sealed_session(
            sealed_session=sealed_session_cookie,
            cookie_password=WORKOS_COOKIE_PASSWORD,
        )
        logout_url = session_obj.get_logout_url()
        app.logger.info("Redirecting user to WorkOS logout URL.")

        # Create a response to redirect to WorkOS and delete the local cookie
        response = make_response(redirect(logout_url))
        response.delete_cookie("wos_session")
        return response

    except Exception as e:
        # Handle errors loading the session (e.g., invalid cookie)
        app.logger.error(f"Error loading session cookie during logout: {str(e)}", exc_info=True)
        # Still try to clear the local cookie and redirect home
        response = make_response(redirect(url_for("home")))
        response.delete_cookie("wos_session")
        return response


@app.route("/query", methods=["POST"])
@login_required
@limiter.limit("10 per minute")
def query():
    """Handle user queries, process them through the Pixeltable workflow, and return the answer."""
    query_text = request.form.get("query")
    persona_id = request.form.get("persona_id") # This is the persona_name from the DB
    if not query_text:
        return jsonify({"error": "Query text is required"}), 400

    # Get user_id from request context (set by @login_required)
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /query")
        return jsonify({"error": "Authentication error"}), 500

    try:
        app.logger.info(f"Processing query for user {user_id} with selected persona '{persona_id or 'DEFAULT'}': {query_text}")

        # --- Determine Prompts and Parameters (Simplified Logic) --- #
        # 1. Initialize with global defaults
        selected_initial_prompt = config.INITIAL_SYSTEM_PROMPT
        selected_final_prompt = config.FINAL_SYSTEM_PROMPT
        selected_llm_params = config.DEFAULT_PARAMETERS.copy()

        # 2. If a persona_id (name) is provided, try to fetch it from the DB
        if persona_id:
            app.logger.debug(f"Attempting to load persona '{persona_id}' from DB for user {user_id}")
            try:
                personas_table = pxt.get_table("agents.user_personas")
                persona_result = (
                    personas_table.where((personas_table.user_id == user_id) & (personas_table.persona_name == persona_id))
                    # MODIFIED: Use explicit aliasing in select
                    .select(
                        initial_prompt=personas_table.initial_prompt,
                        final_prompt=personas_table.final_prompt,
                        llm_params=personas_table.llm_params
                    )
                    .collect()
                )
                if len(persona_result) > 0:
                    custom_data = persona_result[0]
                    selected_initial_prompt = custom_data["initial_prompt"] # This should work now
                    selected_final_prompt = custom_data["final_prompt"]
                    # Update params, keeping defaults for any missing keys in the stored params
                    selected_llm_params.update(custom_data.get("llm_params", {}))
                    app.logger.info(f"Successfully loaded settings from persona '{persona_id}' for user {user_id}.")
                else:
                    app.logger.warning(f"Persona '{persona_id}' not found for user {user_id}. Falling back to default settings.")
                    # Defaults already set, no action needed
            except Exception as db_err:
                app.logger.error(f"Error fetching persona '{persona_id}': {db_err}. Falling back to default settings.", exc_info=True)
                # Defaults already set
        else:
            app.logger.info("No persona selected, using default agent settings.")
            # Defaults already set

        # --- End Determine Prompts and Parameters --- #

        # Insert the new query with the determined settings
        current_timestamp = datetime.now()
        tool_agent.insert(
            [
                {
                    "prompt": query_text,
                    "timestamp": current_timestamp,
                    "user_id": user_id,
                    "initial_system_prompt": selected_initial_prompt,
                    "final_system_prompt": selected_final_prompt,
                    # Use selected LLM params, ensuring all keys exist from defaults
                    "max_tokens": selected_llm_params.get("max_tokens", config.DEFAULT_PARAMETERS["max_tokens"]),
                    "stop_sequences": selected_llm_params.get("stop_sequences", config.DEFAULT_PARAMETERS["stop_sequences"]),
                    "temperature": selected_llm_params.get("temperature", config.DEFAULT_PARAMETERS["temperature"]),
                    "top_k": selected_llm_params.get("top_k", config.DEFAULT_PARAMETERS["top_k"]),
                    "top_p": selected_llm_params.get("top_p", config.DEFAULT_PARAMETERS["top_p"]),
                }
            ]
        )
        app.logger.debug(f"Query inserted for user {user_id}. Waiting briefly...")
        time.sleep(0.5) # Allow Pixeltable background computation

        # Retrieve the computed results for this specific query using the timestamp and user_id
        result = (
            tool_agent.where((tool_agent.timestamp == current_timestamp) & (tool_agent.user_id == user_id))
            .select(
                tool_agent.answer,
                tool_agent.doc_context,
                tool_agent.image_context,
                tool_agent.video_frame_context,
                tool_agent.tool_output,
                tool_agent.history_context,
                tool_agent.memory_context,
                tool_agent.chat_memory_context,
                follow_up_text=tool_agent.follow_up_text,
            )
            .collect()
        )

        if not result or len(result) == 0:
            app.logger.error("No results found after processing query")
            return jsonify({"error": "No results found"}), 500

        result_data = result[0]

        # Prepare Image Context for Frontend
        processed_image_context = []
        if "image_context" in result_data and result_data["image_context"]:
            for item in result_data["image_context"]:
                if (
                    isinstance(item, dict)
                    and "encoded_image" in item
                    and item["encoded_image"]
                ):
                    encoded_image_data = item["encoded_image"]
                    if isinstance(encoded_image_data, bytes):
                        encoded_image_data = encoded_image_data.decode("utf-8")
                    if isinstance(encoded_image_data, str) and encoded_image_data:
                        processed_image_context.append(
                            {"encoded_image": encoded_image_data}
                        )
                    else:
                        app.logger.warning(
                            f"Skipping image context item with unexpected data type or empty data: {type(encoded_image_data)}"
                        )

        # Prepare Video Frame Context for Frontend
        processed_video_frame_context = []
        if "video_frame_context" in result_data and result_data["video_frame_context"]:
            for item in result_data["video_frame_context"]:
                if (
                    isinstance(item, dict)
                    and "encoded_frame" in item
                    and item["encoded_frame"]
                ):
                    frame_data = item["encoded_frame"]
                    if isinstance(frame_data, bytes):
                        frame_data = frame_data.decode("utf-8")

                    if isinstance(frame_data, str) and frame_data:
                        frame_info = {
                            "encoded_frame": frame_data,
                            "sim": item.get("sim"),
                            "timestamp": item.get("timestamp"),
                        }
                        processed_video_frame_context.append(frame_info)
                    else:
                        app.logger.warning(
                            f"Skipping video frame context item with invalid data type or empty data: {type(frame_data)}"
                        )
                else:
                    app.logger.warning(
                        f"Skipping video frame context item due to missing data or invalid structure: {item}"
                    )

        # Insert into Chat History Table
        try:
            chat_history_table = pxt.get_table("agents.chat_history")
            # Insert user prompt
            chat_history_table.insert(
                [
                    {
                        "role": "user",
                        "content": query_text,
                        "timestamp": current_timestamp,
                        "user_id": user_id, # Added user_id
                    }
                ]
            )
            # Insert assistant answer
            answer = result_data.get("answer", "Error: Answer not generated.")
            if answer and not answer.startswith("Error:"):  # Only store valid answers
                chat_history_table.insert(
                    [
                        {
                            "role": "assistant",
                            "content": answer,
                            "timestamp": datetime.now(),
                            "user_id": user_id, # Added user_id
                        }
                    ]
                )
                app.logger.info(
                    f"Inserted user prompt and assistant answer into chat history for user {user_id}."
                )
            else:
                app.logger.warning(
                    f"Assistant answer not valid, not storing in history for user {user_id}. Answer: {answer}"
                )
        except Exception as history_err:
            app.logger.error(f"Error inserting into chat history for user {user_id}: {str(history_err)}")
            # Continue without failing the main request, but log the error

        # Prepare metadata
        metadata = {
            "timestamp": current_timestamp.isoformat(),
            "has_doc_context": bool(result_data.get("doc_context")),
            "has_image_context": bool(result_data.get("image_context")),
            "has_tool_output": bool(result_data.get("tool_output")),
            "has_history_context": bool(result_data.get("history_context")),
            "has_memory_context": bool(result_data.get("memory_context")),
            "has_chat_memory_context": bool(result_data.get("chat_memory_context")),
        }

        # Extract the final answer
        answer = result_data.get("answer", "Error: Answer not generated.")
        app.logger.info(f"Query processed successfully, answer length: {len(answer)}")
        return jsonify(
            {
                "answer": answer,
                "metadata": metadata,
                "image_context": processed_image_context,
                "video_frame_context": processed_video_frame_context,
                "follow_up_text": result_data.get("follow_up_text"),
            }
        )

    except Exception as e:
        app.logger.error(
            f"Error processing query '{query_text[:50]}...': {str(e)}", exc_info=True
        )
        return jsonify({"error": str(e), "details": traceback.format_exc()}), 500


@app.route("/upload", methods=["POST"])
@login_required
@limiter.limit("60 per minute")
def upload_file():
    """Handle file uploads, save them, and add references to the appropriate Pixeltable table."""
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file part"}), 400
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    if not allowed_file(file.filename):
        return jsonify(
            {
                "error": f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            }
        ), 400

    try:
        filename = secure_filename(file.filename)
        file_ext = filename.rsplit(".", 1)[1].lower()

        # Ensure upload directory exists
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)

        # Save the uploaded file
        file.save(file_path)

        file_uuid = str(uuid.uuid4())
        current_timestamp = datetime.now()

        # Determine table type and data column name
        table_key = None
        data_col = None
        if file_ext in {"pdf", "txt", "md", "html", "xml"}:
            table_key = "document"
            data_col = "document"
        elif file_ext in {"mp4", "mov", "avi"}:
            table_key = "video"
            data_col = "video"
        elif file_ext in {"jpg", "jpeg", "png"}:
            table_key = "image"
            data_col = "image"
        elif file_ext in {"mp3", "wav", "m4a"}:
            table_key = "audio"
            data_col = "audio"
        elif file_ext in {"csv", "xlsx"}:
            table_key = "tabular"
            data_col = "tabular"
        else:
            # This case should ideally not be reached due to allowed_file check, but good practice
            app.logger.error(
                f"Attempt to upload file with unhandled allowed extension: {file_ext}"
            )
            return jsonify(
                {"error": f"Internal error handling file type: {file_ext}"}
            ), 500

        # Add file reference to the correct Pixeltable table
        table = get_pxt_table(table_key)
        table.insert(
            [{data_col: file_path, "uuid": file_uuid, "timestamp": current_timestamp, "user_id": g.user_id}] # Added user_id
        )

        app.logger.info(
            f"File '{filename}' (UUID: {file_uuid}) uploaded and added to '{TABLE_MAP[table_key]}' table for user {g.user_id}"
        )
        return jsonify(
            {
                "message": f"File successfully uploaded and added to {table_key} table",
                "filename": filename,
                "uuid": file_uuid,
            }
        )

    except pxt.Error as pxt_err:
        app.logger.error(
            f"Pixeltable error during file upload '{filename}': {str(pxt_err)}",
            exc_info=True,
        )
        return jsonify(
            {"error": "Backend error storing file reference.", "details": str(pxt_err)}
        ), 500
    except Exception as e:
        app.logger.error(
            f"Error handling file upload '{filename if 'filename' in locals() else 'unknown'}': {str(e)}",
            exc_info=True,
        )
        return jsonify(
            {"error": "Server error handling upload.", "details": str(e)}
        ), 500


@app.route("/add_url", methods=["POST"])
@login_required
@limiter.limit("10 per hour")
def add_url():
    """Handle URL submissions, determine file type, and add to the appropriate Pixeltable table."""
    data = request.get_json()
    if not data or "url" not in data:
        return jsonify({"error": "URL is required"}), 400

    url = data["url"]
    app.logger.info(f"Attempting to add URL: {url}")

    try:
        # Basic validation: check if it looks like a URL
        parsed = urlparse(url)
        if not all([parsed.scheme, parsed.netloc]):
            raise ValueError("Invalid URL format")

        # Determine file type based on URL path extension
        path = parsed.path
        filename = os.path.basename(path)
        file_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        file_uuid = str(uuid.uuid4())
        current_timestamp = datetime.now()

        # Determine table type and data column name
        table_key = None
        data_col = None
        if file_ext in {"pdf", "txt", "md", "html", "xml"}:
            table_key = "document"
            data_col = "document"
        elif file_ext in {"mp4", "mov", "avi"}:
            table_key = "video"
            data_col = "video"
        elif file_ext in {"jpg", "jpeg", "png"}:
            table_key = "image"
            data_col = "image"
        elif file_ext in {"mp3", "wav", "m4a"}:
            table_key = "audio"
            data_col = "audio"
        elif file_ext in {"csv", "xlsx"}:
            table_key = "tabular"
            data_col = "tabular"
        else:
            app.logger.warning(
                f"Could not determine file type or unsupported extension for URL: {url}"
            )
            return jsonify(
                {
                    "error": f"Unsupported file type or cannot determine type from URL extension (supported: {', '.join(ALLOWED_EXTENSIONS)})"
                }
            ), 400

        # Add URL reference to the correct Pixeltable table
        table = get_pxt_table(table_key)
        table.insert(
            [{data_col: url, "uuid": file_uuid, "timestamp": current_timestamp, "user_id": g.user_id}] # Added user_id
        )

        app.logger.info(
            f"Added URL '{url}' (UUID: {file_uuid}) to '{TABLE_MAP[table_key]}' table for user {g.user_id}."
        )
        return jsonify(
            {
                "message": f"URL successfully added to {table_key} table",
                "url": url,
                "filename": filename or url,
                "uuid": file_uuid,
            }
        )

    except ValueError as ve:
        app.logger.error(f"Invalid URL provided: {url} - {str(ve)}")
        return jsonify({"error": str(ve)}), 400
    except pxt.Error as pxt_err:
        # Catch specific Pixeltable errors during table access or insertion
        error_detail = f"Pixeltable error processing URL '{url}': {str(pxt_err)}"
        app.logger.error(error_detail)
        app.logger.error(traceback.format_exc())
        # Return a more specific error if it's a Pixeltable issue
        return jsonify(
            {"error": "Backend error processing URL content.", "details": error_detail}
        ), 500
    except Exception as e:
        # Catch any other unexpected exceptions
        error_detail = f"Unexpected server error processing URL '{url}': {str(e)}"
        app.logger.error(error_detail)
        app.logger.error(traceback.format_exc())
        return jsonify(
            {"error": "Server error processing URL.", "details": error_detail}
        ), 500


@app.route("/workflow_detail/<path:timestamp_str>")
@login_required
@limiter.limit("60 per minute")
def get_workflow_detail(timestamp_str):
    """Fetch the full details for a specific workflow entry by timestamp, ensuring user ownership."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /workflow_detail")
        return jsonify({"error": "Authentication error"}), 500
    app.logger.debug(f"Fetching details for workflow timestamp: {timestamp_str} for user {user_id}")
    try:
        # Attempt to parse the timestamp string
        try:
            target_timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
        except ValueError:
            try:
                target_timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                app.logger.error(
                    f"Could not parse workflow detail timestamp string: {timestamp_str}"
                )
                return jsonify(
                    {
                        "error": "Invalid timestamp format. Expected YYYY-MM-DD HH:MM:SS[.ffffff]"
                    }
                ), 400

        workflow_table = pxt.get_table("agents.tools")

        # Select relevant columns for the specific timestamp
        result_df = (
            workflow_table.where((workflow_table.timestamp == target_timestamp) & (workflow_table.user_id == user_id)) # Added user_id filter
            .select(
                prompt=workflow_table.prompt,
                timestamp=workflow_table.timestamp,
                initial_system_prompt=workflow_table.initial_system_prompt,
                final_system_prompt=workflow_table.final_system_prompt,
                initial_response=workflow_table.initial_response,
                tool_output=workflow_table.tool_output,
                final_response=workflow_table.final_response,
                answer=workflow_table.answer,
                max_tokens=workflow_table.max_tokens,
                stop_sequences=workflow_table.stop_sequences,
                temperature=workflow_table.temperature,
                top_k=workflow_table.top_k,
                top_p=workflow_table.top_p,
            )
            .collect()
        )

        if len(result_df) == 0:
            app.logger.warning(
                f"No workflow entry found for timestamp: {timestamp_str} and user {user_id}"
            )
            return jsonify({"error": "Workflow entry not found"}), 404

        # Convert the first row of the DataFrame to a dictionary
        detail_data = result_df[0]

        # Prepare data for JSON serialization
        if "timestamp" in detail_data and isinstance(
            detail_data["timestamp"], datetime
        ):
            detail_data["timestamp"] = detail_data["timestamp"].isoformat()

        app.logger.info(
            f"Successfully retrieved details for timestamp: {timestamp_str}"
        )
        # Use Flask's jsonify directly
        return jsonify(detail_data)

    except Exception as e:
        app.logger.error(
            f"Error fetching workflow detail for {timestamp_str}: {str(e)}"
        )
        app.logger.error(traceback.format_exc())
        return jsonify(
            {"error": "Server error fetching details", "details": str(e)}
        ), 500


@app.route("/context_info", methods=["GET"])
@login_required
@limiter.exempt  # Allow frequent polling for context
def get_context_info():
    """
    Get application context FOR THE CURRENT USER: available tools, documents, images, videos, audios,
    initial/final prompts, and parameters from config.
    """
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /context_info")
        return jsonify({"error": "Authentication error"}), 500
    app.logger.debug(f"Received request for /context_info for user {user_id}")
    try:
        # 1. Get available tools (These are currently shared)
        available_tools = [
            {
                "name": "get_latest_news",
                "description": inspect.getdoc(functions.get_latest_news),
            },
            {
                "name": "fetch_financial_data",
                "description": inspect.getdoc(functions.fetch_financial_data),
            },
            {
                "name": "search_news",
                "description": inspect.getdoc(functions.search_news),
            },
        ]

        # 2. Get list of documents for the user
        document_list = []
        try:
            documents_table = get_pxt_table("document")
            docs_df = (
                documents_table.where(documents_table.user_id == user_id) # Added user_id filter
                .select(
                    doc_source=documents_table.document, uuid_col=documents_table.uuid
                )
                .collect()
                .to_pandas()
            )

            if not docs_df.empty:
                for index, row in docs_df.iterrows():
                    doc_source = row["doc_source"]
                    doc_uuid = row["uuid_col"]
                    filename = "Unknown Document Source"

                    # Determine filename based on source type (path or URL)
                    if isinstance(doc_source, str):
                        if doc_source.startswith("http"):
                            parsed_path = urlparse(doc_source).path
                            filename = os.path.basename(parsed_path) or "Web Document"
                        else:
                            filename = os.path.basename(doc_source)
                    # Add checks for other potential source types if needed (like FileUrl)
                    elif hasattr(doc_source, "filename") and isinstance(
                        getattr(doc_source, "filename", None), str
                    ):
                        filename = os.path.basename(doc_source.filename)
                    elif hasattr(doc_source, "fileurl") and isinstance(
                        getattr(doc_source, "fileurl", None), str
                    ):
                        if doc_source.fileurl.startswith("http"):
                            parsed_path = urlparse(doc_source.fileurl).path
                            filename = (
                                os.path.basename(parsed_path) or "Web Document FileUrl"
                            )
                        else:
                            filename = os.path.basename(doc_source.fileurl)
                    else:
                        app.logger.warning(
                            f"Unexpected document source type encountered for UUID {doc_uuid}: {type(doc_source)}"
                        )

                    document_list.append({"name": filename, "uuid": doc_uuid})
        except Exception as doc_err:
            app.logger.error(f"Error fetching documents for user {user_id}: {str(doc_err)}")

        # 3. Get list of images for the user
        image_list = []
        try:
            images_table = get_pxt_table("image")
            imgs_df = (
                images_table.where(images_table.user_id == user_id) # Added user_id filter
                .select(
                    img_source=images_table.image,
                    uuid_col=images_table.uuid,
                    thumbnail_col=images_table.thumbnail,
                )
                .collect()
                .to_pandas()
            )

            if not imgs_df.empty:
                for index, row in imgs_df.iterrows():
                    img_source = row["img_source"]
                    image_uuid = row["uuid_col"]
                    thumbnail_data_uri = None
                    filename = "Unknown Image Source"

                    # Determine filename (logic remains the same)
                    if isinstance(img_source, str):
                        if img_source.startswith("http"):
                            parsed_path = urlparse(img_source).path
                            filename = os.path.basename(parsed_path) or "Web Image"
                        else:
                            filename = os.path.basename(img_source)
                    elif hasattr(img_source, "filename") and isinstance(
                        getattr(img_source, "filename", None), str
                    ):
                        filename = os.path.basename(img_source.filename)
                    elif isinstance(img_source, Image.Image):
                        filename = f"In-Memory Image {index}"
                    elif hasattr(img_source, "fileurl") and isinstance(
                        getattr(img_source, "fileurl", None), str
                    ):
                        if img_source.fileurl.startswith("http"):
                            parsed_path = urlparse(img_source.fileurl).path
                            filename = (
                                os.path.basename(parsed_path) or "Web Image FileUrl"
                            )
                        else:
                            filename = os.path.basename(img_source.fileurl)
                    else:
                        app.logger.warning(
                            f"Unexpected image source type encountered for UUID {image_uuid}: {type(img_source)}"
                        )

                    # Attempt to create thumbnail
                    try:
                        pil_image = None
                        if isinstance(img_source, Image.Image):
                            pil_image = img_source
                        elif isinstance(img_source, str):
                            try:
                                if os.path.exists(img_source):
                                    pil_image = Image.open(img_source)
                                # Potentially add URL fetching here if needed
                                else:
                                    app.logger.warning(
                                        f"Cannot directly load image from string source: {img_source}"
                                    )
                            except Exception as load_err:
                                app.logger.error(
                                    f"Failed to load image from path {img_source}: {load_err}"
                                )
                        elif hasattr(img_source, "to_pil"):
                            pil_image = img_source.to_pil()
                        # Add check for FileUrl with to_pil
                        elif hasattr(img_source, "fileurl") and hasattr(
                            img_source, "to_pil"
                        ):
                            pil_image = img_source.to_pil()
                        else:
                            app.logger.warning(
                                f"Source is not PIL Image or convertible for UUID {image_uuid}: {type(img_source)}"
                            )

                        if pil_image:
                            thumbnail_data_uri = create_thumbnail_base64(
                                pil_image, THUMB_SIZE_SIDEBAR
                            )
                        else:
                            app.logger.warning(
                                f"Could not get PIL image object for source: {filename} (UUID: {image_uuid})"
                            )

                    except Exception as thumb_err:
                        app.logger.error(
                            f"Error generating thumbnail for image '{filename}' (UUID: {image_uuid}): {thumb_err}"
                        )

                    image_list.append(
                        {
                            "name": filename,
                            "thumbnail": thumbnail_data_uri,
                            "uuid": image_uuid,
                        }
                    )
        except Exception as img_err:
            app.logger.error(f"Error processing image list: {str(img_err)}")

        # 4. Get list of videos with thumbnails
        video_list = []
        try:
            videos_table = get_pxt_table("video")
            video_frames_view = pxt.get_table(
                "agents.video_frames"
            )  # Assumes view exists with uuid

            # Fetch all first frames efficiently using UUID
            first_frames_map = {}
            try:
                # Select the video UUID and the frame data for the first frame (pos 0)
                first_frames_df = (
                    video_frames_view.where(video_frames_view.pos == 0)
                    .select(
                        video_uuid=video_frames_view.uuid, frame=video_frames_view.frame
                    )
                    .collect()
                )

                if len(first_frames_df) > 0:
                    # Create a map from video UUID to its first frame (PIL Image)
                    df_pandas = first_frames_df.to_pandas()
                    first_frames_map = {
                        row["video_uuid"]: row["frame"]
                        for index, row in df_pandas.iterrows()
                        if row["frame"] is not None
                        and isinstance(row["frame"], Image.Image)
                    }
                    app.logger.info(
                        f"Successfully fetched and mapped {len(first_frames_map)} first frames by UUID."
                    )
                else:
                    app.logger.info(
                        "No first frames (pos=0) found in video_frames view."
                    )

            except Exception as frame_map_err:
                app.logger.error(
                    f"Error fetching or mapping first frames by UUID: {frame_map_err}"
                )
            # END: Fetch all first frames by UUID

            # Select videos AND their UUIDs from the main table
            vids_df = (
                videos_table.where(videos_table.user_id == user_id) # Added user_id filter
                .select(
                    video_col=videos_table.video, uuid_col=videos_table.uuid
                )
                .collect()
                .to_pandas()
            )

            if not vids_df.empty:
                for index, row in vids_df.iterrows():
                    vid_source = row["video_col"]
                    video_uuid = row["uuid_col"]
                    thumbnail_data_uri = None
                    filename = "Unknown Video Source"

                    # Determine filename
                    if isinstance(vid_source, str):
                        if vid_source.startswith("http"):
                            parsed_path = urlparse(vid_source).path
                            filename = os.path.basename(parsed_path) or "Web Video"
                        else:
                            filename = os.path.basename(vid_source)
                    elif hasattr(vid_source, "filename") and isinstance(
                        getattr(vid_source, "filename", None), str
                    ):
                        filename = os.path.basename(vid_source.filename)
                    elif hasattr(vid_source, "fileurl") and isinstance(
                        getattr(vid_source, "fileurl", None), str
                    ):
                        if vid_source.fileurl.startswith("http"):
                            parsed_path = urlparse(vid_source.fileurl).path
                            filename = (
                                os.path.basename(parsed_path) or "Web Video FileUrl"
                            )
                        else:
                            filename = os.path.basename(vid_source.fileurl)
                    else:
                        app.logger.warning(
                            f"Unexpected video source type encountered for UUID {video_uuid}: {type(vid_source)}"
                        )

                    # Look up frame in map using UUID
                    try:
                        first_frame_pil = first_frames_map.get(video_uuid)

                        if first_frame_pil:
                            thumbnail_data_uri = create_thumbnail_base64(
                                first_frame_pil, THUMB_SIZE_SIDEBAR
                            )
                        else:
                            app.logger.warning(
                                f"First frame not found in map for video: {filename} (UUID: {video_uuid})"
                            )

                    except Exception as frame_lookup_err:
                        app.logger.error(
                            f"Error looking up or processing frame for video '{filename}' (UUID: {video_uuid}): {frame_lookup_err}"
                        )
                    # END: Look up frame

                    video_list.append(
                        {
                            "name": filename,
                            "thumbnail": thumbnail_data_uri,
                            "uuid": video_uuid,
                        }
                    )
        except Exception as vid_err:
            app.logger.error(f"Error processing video list: {str(vid_err)}")

        # 5. Get list of audios
        audio_list = []
        try:
            audios_table = get_pxt_table("audio")
            audio_df = (
                audios_table.where(audios_table.user_id == user_id) # Added user_id filter
                .select(
                    audio_col=audios_table.audio, uuid_col=audios_table.uuid
                )
                .collect()
                .to_pandas()
            )

            if not audio_df.empty:
                for index, row in audio_df.iterrows():
                    audio_source = row["audio_col"]
                    audio_uuid = row["uuid_col"]
                    filename = "Unknown Audio Source"

                    # Determine filename (logic remains the same)
                    if isinstance(audio_source, str):
                        if audio_source.startswith("http"):
                            parsed_path = urlparse(audio_source).path
                            filename = os.path.basename(parsed_path) or "Web Audio"
                        else:
                            filename = os.path.basename(audio_source)
                    elif hasattr(audio_source, "filename") and isinstance(
                        getattr(audio_source, "filename", None), str
                    ):
                        filename = os.path.basename(audio_source.filename)
                    elif hasattr(audio_source, "fileurl") and isinstance(
                        getattr(audio_source, "fileurl", None), str
                    ):
                        if audio_source.fileurl.startswith("http"):
                            parsed_path = urlparse(audio_source.fileurl).path
                            filename = (
                                os.path.basename(parsed_path) or "Web Audio FileUrl"
                            )
                        else:
                            filename = os.path.basename(audio_source.fileurl)
                    else:
                        app.logger.warning(
                            f"Unexpected audio source type encountered for UUID {audio_uuid}: {type(audio_source)}"
                        )

                    audio_list.append({"name": filename, "uuid": audio_uuid})

        except Exception as audio_err:
            app.logger.error(f"Error fetching audio list: {str(audio_err)}")

        # 6. Get recent workflow data
        workflow_data = []
        try:
            workflow_table = pxt.get_table("agents.tools")
            wf_df = (
                workflow_table.where(workflow_table.user_id == user_id) # Added user_id filter
                .select(
                    workflow_table.timestamp,
                    workflow_table.prompt,
                    workflow_table.answer,
                )
                .order_by(workflow_table.timestamp, asc=False)
                .collect()
                .to_pandas()
            )
            if "timestamp" in wf_df.columns:
                # Include microseconds for accurate matching later
                wf_df["timestamp"] = wf_df["timestamp"].dt.strftime(
                    "%Y-%m-%d %H:%M:%S.%f"
                )
            workflow_data = wf_df.to_dict("records")
        except Exception as wf_err:
            app.logger.error(f"Error fetching workflow data: {str(wf_err)}")

        # 7. Get list of tabular files
        tabular_files = []
        try:
            tabular_dir = os.path.join(os.getcwd(), "data")
            if os.path.exists(tabular_dir) and os.path.isdir(tabular_dir):
                for filename in os.listdir(tabular_dir):
                    if filename.endswith((".csv", ".xlsx")):
                        tabular_files.append(filename)
        except Exception as tabular_err:
            app.logger.error(f"Error fetching tabular files: {str(tabular_err)}")

        app.logger.debug("Successfully generated context info")
        return jsonify(
            {
                "tools": available_tools,
                "documents": document_list,
                "images": image_list,
                "videos": video_list,
                "audios": audio_list,
                "tabular_files": tabular_files,
                "initial_prompt": config.INITIAL_SYSTEM_PROMPT,
                "final_prompt": config.FINAL_SYSTEM_PROMPT,
                "workflow_data": workflow_data,
                "parameters": config.DEFAULT_PARAMETERS,
            }
        )

    except Exception as e:
        app.logger.error(f"Error fetching context info: {str(e)}", exc_info=True)
        return jsonify(
            {"error": "Failed to retrieve context information", "details": str(e)}
        ), 500


@app.route("/delete_all", methods=["POST"])
@login_required
@limiter.limit("10 per hour")
def delete_all():
    """Delete all items from the specified table type."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /delete_all")
        return jsonify({"error": "Authentication error"}), 500

    try:
        data = request.get_json()
        file_type = data.get("type")

        if not file_type or file_type not in TABLE_MAP:
            valid_types = ", ".join(TABLE_MAP.keys())
            return jsonify(
                {
                    "error": f"Invalid or missing file type. Must be one of: {valid_types}"
                }
            ), 400

        app.logger.info(f"Attempting to delete all {file_type}s for user {user_id}")

        table = get_pxt_table(file_type)
        status = table.delete(where=table.user_id == user_id) # Added user_id filter
        deleted_count = status.num_rows

        app.logger.info(
            f"Deleted {deleted_count} {file_type} items from {TABLE_MAP[file_type]} table for user {user_id}"
        )
        return jsonify(
            {
                "message": f"Successfully deleted all {file_type}s ({deleted_count} items)",
                "should_refresh": True,
            }
        )

    except Exception as e:
        app.logger.error(
            f"Error deleting all {file_type if 'file_type' in locals() else 'unknown type'}s: {str(e)}",
            exc_info=True,
        )
        return jsonify({"error": f"Failed to delete all items: {str(e)}"}), 500


@app.route("/delete_history_entry/<timestamp_str>", methods=["DELETE"])
@login_required
@limiter.limit("30 per minute")
def delete_history_entry(timestamp_str):
    """Delete a specific history entry based on its timestamp."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /delete_history_entry")
        return jsonify({"error": "Authentication error"}), 500

    app.logger.info(
        f"Attempting to delete history entry with timestamp: {timestamp_str} for user {user_id}"
    )
    target_timestamp = None
    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
    ):  # Try parsing with and without microseconds
        try:
            target_timestamp = datetime.strptime(timestamp_str, fmt)
            break  # Stop if parsing is successful
        except ValueError:
            pass  # Continue to next format

    if target_timestamp is None:
        app.logger.error(f"Could not parse timestamp string: {timestamp_str}")
        return jsonify(
            {"error": "Invalid timestamp format. Expected YYYY-MM-DD HH:MM:SS[.ffffff]"}
        ), 400

    try:
        workflow_table = pxt.get_table("agents.tools")

        # Delete the row where the timestamp and user_id match
        status = workflow_table.delete(
            where=(workflow_table.timestamp == target_timestamp) & (workflow_table.user_id == user_id) # Added user_id filter
        )

        num_deleted = status.num_rows

        if num_deleted > 0:
            app.logger.info(
                f"Successfully deleted {num_deleted} history entry for timestamp: {timestamp_str} for user {user_id}"
            )
            return jsonify(
                {
                    "message": "History entry deleted successfully",
                    "num_deleted": num_deleted,
                }
            ), 200
        else:
            app.logger.warning(
                f"No history entry found matching timestamp: {timestamp_str} for user {user_id}"
            )
            return jsonify(
                {"message": "No entry found with that timestamp for this user", "num_deleted": 0}
            ), 404

    except Exception as e:
        app.logger.error(f"Error deleting history entry for {timestamp_str}: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify(
            {"error": "Server error deleting history entry", "details": str(e)}
        ), 500


@app.route("/save_memory", methods=["POST"])
@login_required
@limiter.limit("60 per minute")
def save_memory():
    """Save a memory item (code or text) to the Pixeltable table."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /save_memory")
        return jsonify({"error": "Authentication error"}), 500

    try:
        data = request.get_json()
        if (
            not data
            or "content" not in data
            or "type" not in data
            or "context_query" not in data
        ):
            return jsonify(
                {"error": "Missing required fields: content, type, context_query"}
            ), 400

        content = data["content"]
        memory_type = data["type"]
        context_query = data["context_query"]
        language = data.get("language")
        current_timestamp = datetime.now()

        # Validate type and language
        if memory_type not in ["code", "text"]:
            return jsonify({"error": 'Invalid type. Must be "code" or "text".'}), 400
        if memory_type == "text" and language:
            app.logger.warning("Language provided for type 'text', ignoring.")
            language = None
        if memory_type == "code" and not language:
            app.logger.warning(
                "No language provided for type 'code', defaulting to 'text'."
            )
            language = "text"

        try:
            memory_table = pxt.get_table("agents.memory_bank")
            memory_table.insert(
                [
                    {
                        "content": content,
                        "type": memory_type,
                        "language": language,
                        "context_query": context_query,
                        "timestamp": current_timestamp,
                        "user_id": user_id, # Added user_id
                    }
                ]
            )

            app.logger.info(
                f"Saved memory item (type: {memory_type}) for user {user_id} with timestamp {current_timestamp}"
            )
            return jsonify({"message": "Memory item saved successfully"}), 201

        except Exception as e:
            app.logger.error(
                f"Error inserting into memory_bank: {str(e)}", exc_info=True
            )
            return jsonify(
                {"error": "Server error saving memory item", "details": str(e)}
            ), 500

    except Exception as e:  # Catch validation or other errors before table access
        app.logger.error(
            f"Error processing save_memory request: {str(e)}", exc_info=True
        )
        return jsonify({"error": "Invalid request data", "details": str(e)}), 400


@app.route("/get_memory", methods=["GET"])
@login_required
# @limiter.exempt # Temporarily remove to diagnose 404
def get_memory():
    """Retrieve saved memory items, optionally filtering by search query."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /get_memory")
        return jsonify({"error": "Authentication error"}), 500

    search_query = request.args.get("search")
    query_result = None
    try:
        memory_table = pxt.get_table("agents.memory_bank")
        if search_query:
            app.logger.info(
                f"Searching memory bank for user {user_id} with query: '{search_query[:50]}...'"
            )
            sim = memory_table.content.similarity(search_query)
            query_result = (
                memory_table
                # MODIFIED: Combined where clauses
                .where((memory_table.user_id == user_id) & (sim > 0.7))
                .select(
                    content=memory_table.content,
                    type=memory_table.type,
                    language=memory_table.language,
                    context_query=memory_table.context_query,
                    timestamp=memory_table.timestamp,
                    sim=sim,
                )
                # REMOVED: Redundant where clause
                # .where(sim > 0.7) # Keep similarity filter
                .order_by(sim, asc=False)
                .limit(10)
                .collect()
            )
        else:
            app.logger.info(f"Fetching all memory items for user {user_id}")
            query_result = (
                memory_table.where(memory_table.user_id == user_id) # Keep user_id filter here
                .select(
                    content=memory_table.content,
                    type=memory_table.type,
                    language=memory_table.language,
                    context_query=memory_table.context_query,
                    timestamp=memory_table.timestamp,
                )
                .order_by(memory_table.timestamp, asc=False)
                .collect()
            )

        if len(query_result) == 0:
            app.logger.debug("Memory bank is empty or no results found.")
            return jsonify([])

        # Convert to pandas ONLY if results exist
        results_df = query_result.to_pandas()

        # Format timestamp consistently
        if "timestamp" in results_df.columns:
            results_df["timestamp"] = results_df["timestamp"].dt.strftime(
                "%Y-%m-%d %H:%M:%S.%f"
            )

        memory_data = results_df.to_dict("records")
        app.logger.debug(
            f"Successfully generated get_memory results ({len(memory_data)} items)"
        )
        return jsonify(memory_data)

    except pxt.Error as pxt_err:
        app.logger.error(
            f"Pixeltable error fetching memory items: {str(pxt_err)}", exc_info=True
        )
        return jsonify(
            {"error": "Backend error fetching memory data.", "details": str(pxt_err)}
        ), 500
    except Exception as e:
        app.logger.error(f"Error fetching memory items: {str(e)}", exc_info=True)
        return jsonify(
            {"error": "Server error fetching memory items", "details": str(e)}
        ), 500


@app.route("/delete_memory/<timestamp_str>", methods=["DELETE"])
@login_required
@limiter.limit("60 per minute")
def delete_memory(timestamp_str):
    """Delete a specific memory item based on its timestamp."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /delete_memory")
        return jsonify({"error": "Authentication error"}), 500

    app.logger.info(f"Attempting to delete memory item with timestamp: {timestamp_str} for user {user_id}")
    try:
        # Parse timestamp (expecting microseconds)
        try:
            target_timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
        except ValueError:
            app.logger.error(
                f"Could not parse memory timestamp string: {timestamp_str}"
            )
            return jsonify(
                {
                    "error": "Invalid timestamp format. Expected YYYY-MM-DD HH:MM:SS.ffffff"
                }
            ), 400

        memory_table = pxt.get_table("agents.memory_bank")
        status = memory_table.delete(where=(memory_table.timestamp == target_timestamp) & (memory_table.user_id == user_id)) # Added user_id filter
        num_deleted = status.num_rows

        if num_deleted > 0:
            app.logger.info(
                f"Successfully deleted {num_deleted} memory item for timestamp: {timestamp_str} for user {user_id}"
            )
            return jsonify(
                {
                    "message": "Memory item deleted successfully",
                    "num_deleted": num_deleted,
                }
            ), 200
        else:
            app.logger.warning(
                f"No memory item found matching timestamp: {timestamp_str} for user {user_id}"
            )
            return jsonify(
                {
                    "message": "No memory item found with that timestamp for this user",
                    "num_deleted": 0,
                }
            ), 404

    except Exception as e:
        app.logger.error(f"Error deleting memory item {timestamp_str}: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify(
            {"error": "Server error deleting memory item", "details": str(e)}
        ), 500


@app.route("/add_memory_manual", methods=["POST"])
@login_required
@limiter.limit("60 per minute")
def add_memory_manual():
    """Handle saving a memory item added manually via the Memory Bank tab."""
    # Get user_id from request context
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /add_memory_manual")
        return jsonify({"error": "Authentication error"}), 500

    try:
        data = request.get_json()
        if not data or "content" not in data or "type" not in data:
            return jsonify({"error": "Missing required fields: content, type"}), 400

        content = data["content"]
        memory_type = data["type"]
        language = data.get("language")
        context_query = data.get("context_query", "Manual Entry")
        current_timestamp = datetime.now()

        # Validate type
        if memory_type not in ["code", "text"]:
            return jsonify({"error": 'Invalid type. Must be "code" or "text".'}), 400

        # Ensure language is None if type is text, or default if missing for code
        if memory_type == "text":
            language = None
        elif memory_type == "code" and not language:
            app.logger.warning(
                "No language provided for manual code memory, defaulting to 'text'."
            )
            language = "text"

        try:
            memory_table = pxt.get_table("agents.memory_bank")
            memory_table.insert(
                [
                    {
                        "content": content,
                        "type": memory_type,
                        "language": language,
                        "context_query": context_query,
                        "timestamp": current_timestamp,
                        "user_id": user_id, # Added user_id
                    }
                ]
            )

            app.logger.info(
                f"Saved manual memory item (type: {memory_type}) for user {user_id} with timestamp {current_timestamp}"
            )
            return jsonify({"message": "Memory item saved successfully"}), 201

        except Exception as e:
            app.logger.error(
                f"Error inserting manual item into memory_bank: {str(e)}", exc_info=True
            )
            return jsonify(
                {"error": "Server error saving memory item", "details": str(e)}
            ), 500

    except Exception as e:  # Catch validation or other errors before table access
        app.logger.error(
            f"Error processing add_memory_manual request: {str(e)}", exc_info=True
        )
        return jsonify({"error": "Invalid request data", "details": str(e)}), 400


@app.route("/download_chat_history")
@login_required
@limiter.exempt
def download_chat_history():
    """Provides the entire chat history (from agents.tools) as a JSON file download."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /download_chat_history")
        return jsonify({"error": "Authentication error"}), 500

    app.logger.info(f"Request received for downloading chat history for user {user_id}.")
    try:
        workflow_table = pxt.get_table("agents.tools")

        # Fetch all columns for the specific user
        query = workflow_table.where(workflow_table.user_id == user_id).order_by(workflow_table.timestamp, asc=False).collect() # Added user_id filter
        # Removed specific select:
        # .select(
        #     timestamp=workflow_table.timestamp,
        #     prompt=workflow_table.prompt,
        #     answer=workflow_table.answer
        # )

        # Explicitly collect the entire result set
        history_df = query.to_pandas()

        app.logger.info(
            f"Collected {len(history_df)} entries for chat history download for user {user_id}."
        )

        if history_df.empty:  # Use pandas method to check if DataFrame is empty
            app.logger.warning("Attempted to download empty chat history.")
            return jsonify([])

        # Convert the DataFrame containing all columns to JSON string
        # Use orient='records' for a list of JSON objects, date_format for consistency
        json_data_string = history_df.to_json(orient="records", date_format="iso")

        # Create a Flask response for file download
        response = Response(
            json_data_string,
            mimetype="application/json",
            headers={
                "Content-Disposition": "attachment;filename=chat_history_full.json"
            },
        )
        app.logger.info("Successfully prepared full chat history JSON for download.")
        return response

    except Exception as e:
        app.logger.error(f"Error preparing chat history download: {str(e)}")
        app.logger.error(traceback.format_exc())
        # Return a JSON error response instead of crashing
        return jsonify(
            {"error": "Failed to generate chat history download", "details": str(e)}
        ), 500


@app.route("/download_memory")
@login_required
@limiter.exempt
def download_memory():
    """Fetch all memory bank items and return as a JSON file."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /download_memory")
        return jsonify({"error": "Authentication error"}), 500

    app.logger.info(f"Request received to download memory bank for user {user_id}.")
    try:
        memory_table = pxt.get_table("agents.memory_bank")

        # Fetch all relevant data for the user, ordered by timestamp
        query = memory_table.where(memory_table.user_id == user_id).select( # Added user_id filter
            content=memory_table.content,
            type=memory_table.type,
            language=memory_table.language,
            context_query=memory_table.context_query,
            timestamp=memory_table.timestamp,
        ).order_by(memory_table.timestamp, asc=True)

        # Explicitly collect the entire result set
        memory_df = query.collect().to_pandas()

        app.logger.info(f"Collected {len(memory_df)} entries for memory bank download for user {user_id}.")

        if memory_df.empty:
            app.logger.warning("Memory bank is empty, returning empty JSON.")
            memory_data = []
        else:
            # Format timestamp for readability in JSON
            if "timestamp" in memory_df.columns:
                memory_df["timestamp"] = memory_df["timestamp"].dt.strftime(
                    "%Y-%m-%d %H:%M:%S.%f"
                )
            memory_data = memory_df.to_dict("records")

        # Prepare JSON data for download
        json_data = json.dumps(memory_data, indent=2).encode("utf-8")
        buffer = io.BytesIO(json_data)
        buffer.seek(0)

        app.logger.info(
            f"Prepared memory_bank.json for download ({len(memory_data)} entries) for user {user_id}."
        )

        return send_file(
            buffer,
            mimetype="application/json",
            as_attachment=True,
            download_name="memory_bank.json",
        )

    except Exception as e:
        app.logger.error(f"Error generating memory bank download: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify(
            {"error": "Server error generating memory download", "details": str(e)}
        ), 500


@app.route("/generate_image", methods=["POST"])
@login_required
@limiter.limit("5 per minute")
def generate_image():
    """Handle image generation requests."""
    # Get user_id from request context
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /generate_image")
        return jsonify({"error": "Authentication error"}), 500

    prompt_text = request.form.get("prompt")
    if not prompt_text:
        return jsonify({"error": "Prompt text is required"}), 400

    current_timestamp = datetime.now()
    try:
        app.logger.info(
            f"Processing image generation prompt for user {user_id}: '{prompt_text[:50]}...' (ts: {current_timestamp})"
        )
        image_gen_table = pxt.get_table("agents.image_generation_tasks")

        # Insert the new prompt with a timestamp and user_id
        image_gen_table.insert(
            [{"prompt": prompt_text, "timestamp": current_timestamp, "user_id": user_id}] # Added user_id
        )
        app.logger.debug(
            f"Image generation task inserted for user {user_id} with timestamp: {current_timestamp}"
        )

        # Retrieve the computed image for this specific query, polling with a timeout
        max_wait_time = 60  # seconds
        start_time = time.time()
        result = None  # Initialize result to None
        while time.time() - start_time < max_wait_time:
            result_df = (
                image_gen_table.where((image_gen_table.timestamp == current_timestamp) & (image_gen_table.user_id == user_id)) # Added user_id filter
                .select(generated_image=image_gen_table.generated_image)
                .collect()
            )

            # Check if results were returned and the image is not None
            if len(result_df) > 0 and result_df["generated_image"][0] is not None:
                result = result_df["generated_image"][0]  # Assign the PIL image
                app.logger.info(f"Image found for timestamp {current_timestamp}")
                break
            else:
                app.logger.debug(
                    f"Polling for image... Time elapsed: {time.time() - start_time:.2f}s"
                )

            time.sleep(1)

        # Conversion to Base64
        app.logger.info(
            f"Polling complete for {current_timestamp}. Attempting image conversion."
        )
        if result is None:
            # If loop finished without finding a result or if generation failed in Pixeltable
            app.logger.error(
                f"Image generation timed out or failed for timestamp {current_timestamp}."
            )
            # Attempt to fetch a specific error message if available
            error_msg = "Image generation timed out or failed."
            try:
                if "error_message" in image_gen_table.schema:
                    error_df = (
                        image_gen_table.where(
                            image_gen_table.timestamp == current_timestamp
                        )
                        .select(error=image_gen_table.error_message)
                        .collect()
                    )
                    if len(error_df) > 0 and error_df["error"][0]:
                        error_msg = f"Image generation failed: {error_df['error'][0]}"
            except Exception as e:
                app.logger.warning(
                    f"Could not retrieve specific error message after generation failure: {e}"
                )
            return jsonify({"error": error_msg}), 500

        try:
            # Proceed with conversion only if result is a PIL Image
            if not isinstance(result, Image.Image):
                raise TypeError(f"Expected PIL Image, but got {type(result)}")

            buffer = io.BytesIO()
            result.save(buffer, format="PNG")
            img_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
            app.logger.info(
                f"Image generated and converted successfully for prompt: '{prompt_text[:50]}...' (ts: {current_timestamp})"
            )

            # Return success response
            return jsonify(
                {
                    "generated_image_base64": img_base64,
                    "timestamp": current_timestamp.isoformat(),
                    "prompt": prompt_text,
                }
            )

        except Exception as conversion_err:
            # Catch errors during conversion (save, encode)
            app.logger.error(
                f"Image conversion failed for timestamp {current_timestamp}: {conversion_err}",
                exc_info=True,
            )
            return jsonify(
                {"error": "Image conversion failed.", "details": str(conversion_err)}
            ), 500

    except Exception as e:
        # Catch errors during initial table interaction or polling setup
        app.logger.error(
            f"Error during image generation request processing (ts: {current_timestamp}): {str(e)}",
            exc_info=True,
        )
        return jsonify(
            {"error": "Server error during image generation", "details": str(e)}
        ), 500


@app.route("/image_history")
@login_required
@limiter.limit("60 per minute")
def get_image_history():
    """Fetch the history of generated images."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /image_history")
        return jsonify({"error": "Authentication error"}), 500

    app.logger.debug(f"Fetching image history for user {user_id}...")
    try:
        # Connect to table
        try:
            image_gen_table = pxt.get_table("agents.image_generation_tasks")
        except Exception as pxt_err:
            app.logger.error(
                f"Pixeltable error connecting to agents.image_generation_tasks: {pxt_err}",
                exc_info=True,
            )
            return jsonify(
                {
                    "error": "Server error connecting to image data",
                    "details": str(pxt_err),
                }
            ), 500

        # Fetch latest 50 for the user, ordered by timestamp
        query = (
            image_gen_table.where(image_gen_table.user_id == user_id) # Added user_id filter
            .select(
                prompt=image_gen_table.prompt,
                timestamp=image_gen_table.timestamp,
                generated_image=image_gen_table.generated_image,
            )
            .order_by(image_gen_table.timestamp, asc=False)
            .limit(50)
        )

        app.logger.debug("Executing image history query...")
        results_df = query.collect()
        app.logger.debug(f"Query collected. Rows: {len(results_df)}")

        # Iterate and process
        image_history = []
        if results_df:
            for i, entry in enumerate(results_df):
                img_data = entry.get("generated_image")
                timestamp = entry.get("timestamp")
                # app.logger.debug(f"Processing entry {i}: Timestamp={timestamp}, Image Type={type(img_data)}") # Can be too verbose

                if not isinstance(img_data, Image.Image):
                    app.logger.warning(
                        f"Skipping history entry {i}: generated_image is not a PIL Image for timestamp {timestamp}"
                    )
                    continue

                thumbnail_b64 = create_thumbnail_base64(img_data, THUMB_SIZE)
                full_image_b64 = encode_image_base64(img_data)

                if thumbnail_b64 and full_image_b64:
                    item = {
                        "prompt": entry.get("prompt"),
                        "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S.%f")
                        if timestamp
                        else None,
                        "thumbnail_image": thumbnail_b64,
                        "full_image": full_image_b64,
                    }
                    image_history.append(item)
                else:
                    app.logger.warning(
                        f"Skipping history entry {i} due to encoding failure for timestamp {timestamp}"
                    )

        app.logger.debug(
            f"Successfully processed {len(image_history)} image history entries."
        )
        return jsonify(image_history)

    except Exception as e:
        app.logger.error(f"Error fetching image history: {str(e)}", exc_info=True)
        return jsonify(
            {"error": "Server error fetching image history", "details": str(e)}
        ), 500


@app.route("/delete_generated_image/<timestamp_str>", methods=["DELETE"])
@login_required
@limiter.limit("60 per minute")
def delete_generated_image(timestamp_str):
    """Delete a specific generated image based on its timestamp."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /delete_generated_image")
        return jsonify({"error": "Authentication error"}), 500

    app.logger.info(
        f"Attempting to delete generated image with timestamp: {timestamp_str} for user {user_id}"
    )
    try:
        # Parse timestamp (expecting microseconds)
        try:
            target_timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
        except ValueError:
            app.logger.error(f"Could not parse image timestamp string: {timestamp_str}")
            return jsonify(
                {
                    "error": "Invalid timestamp format. Expected YYYY-MM-DD HH:MM:SS.ffffff"
                }
            ), 400

        image_gen_table = pxt.get_table("agents.image_generation_tasks")
        status = image_gen_table.delete(
            where=(image_gen_table.timestamp == target_timestamp) & (image_gen_table.user_id == user_id) # Added user_id filter
        )
        num_deleted = status.num_rows

        if num_deleted > 0:
            app.logger.info(
                f"Successfully deleted {num_deleted} generated image for timestamp: {timestamp_str} for user {user_id}"
            )
            return jsonify(
                {
                    "message": "Image deleted successfully",
                    "num_deleted": num_deleted,
                }
            ), 200
        else:
            app.logger.warning(
                f"No generated image found matching timestamp: {timestamp_str} for user {user_id}"
            )
            return jsonify(
                {"message": "No image found with that timestamp for this user", "num_deleted": 0}
            ), 404

    except Exception as e:
        app.logger.error(f"Error deleting generated image {timestamp_str}: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": "Server error deleting image", "details": str(e)}), 500


@app.route("/delete_file/<uuid>/<file_type>", methods=["DELETE"])
@login_required
@limiter.limit("60 per minute")
def delete_file_by_uuid(uuid, file_type):
    """Delete a file from the filesystem and its entry from the corresponding table based on UUID."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        app.logger.error("User ID not found in request context for /delete_file")
        return jsonify({"error": "Authentication error"}), 500

    app.logger.info(f"Attempting to delete {file_type} file with UUID: {uuid} for user {user_id}")
    file_path_to_delete = None
    db_deleted = False
    file_deleted = False
    error_msg = None

    try:
        if file_type not in TABLE_MAP:
            valid_types = ", ".join(TABLE_MAP.keys())
            app.logger.warning(f"Invalid file type provided for deletion: {file_type}")
            return jsonify(
                {
                    "error": f"Invalid file type: {file_type}. Supported types: {valid_types}"
                }
            ), 400

        # Get table using helper
        table = get_pxt_table(file_type)

        # Determine the data column based on file_type
        data_col_map = {
            "document": "document",
            "image": "image",
            "video": "video",
            "audio": "audio",
        }
        data_col = data_col_map.get(file_type)
        if not data_col:
            # Should not happen if file_type is in TABLE_MAP, but good practice
            raise ValueError(
                f"Internal error: Could not map file_type '{file_type}' to data column."
            )

        # 1. Retrieve the file path *before* deleting the DB entry
        try:
            # Use getattr to dynamically access the column
            record = (
                table.where((table.uuid == uuid) & (table.user_id == user_id)) # Added user_id filter
                .select(file_source=getattr(table, data_col))
                .collect()
            )
            if len(record) > 0:
                file_source = record[0].get("file_source")
                # Check if it's a string and not a URL (heuristic)
                if isinstance(file_source, str) and not file_source.startswith(
                    ("http://", "https://")
                ):
                    # Assume it's a local path relative to the app's root or upload folder
                    # Make the path absolute for reliable deletion
                    # IMPORTANT: This assumes files are stored in UPLOAD_FOLDER
                    possible_path = os.path.abspath(
                        os.path.join(
                            app.config["UPLOAD_FOLDER"], os.path.basename(file_source)
                        )
                    )
                    if os.path.exists(possible_path):
                        file_path_to_delete = possible_path
                    else:
                        # Try absolute path if not in upload folder (less likely)
                        if os.path.isabs(file_source) and os.path.exists(file_source):
                            file_path_to_delete = file_source
                        else:
                            app.logger.warning(
                                f"File source for {uuid} ({file_source}) is a string but not found locally."
                            )
                elif not isinstance(file_source, str):
                    app.logger.info(
                        f"File source for {uuid} is not a string ({type(file_source)}), skipping filesystem delete."
                    )
                else:  # It's a URL
                    app.logger.info(
                        f"File source for {uuid} is a URL, skipping filesystem delete."
                    )
            else:
                app.logger.warning(
                    f"No record found for {file_type} with UUID {uuid} for user {user_id} to retrieve file path."
                )
        except Exception as get_path_err:
            app.logger.error(
                f"Error retrieving file path for {file_type} {uuid}: {get_path_err}"
            )
            # Continue to try DB deletion, but log this error

        # 2. Perform the database delete operation
        status = table.delete(where=(table.uuid == uuid) & (table.user_id == user_id)) # Added user_id filter
        num_deleted = status.num_rows
        db_deleted = num_deleted > 0

        if db_deleted:
            app.logger.info(
                f"Successfully deleted {num_deleted} {file_type} entry from DB for UUID: {uuid} for user {user_id}"
            )
            # 3. Attempt to delete the file from filesystem if path was found
            if file_path_to_delete:
                try:
                    os.remove(file_path_to_delete)
                    file_deleted = True
                    app.logger.info(
                        f"Successfully deleted file from filesystem: {file_path_to_delete}"
                    )
                except FileNotFoundError:
                    error_msg = f"File not found at {file_path_to_delete}, but DB entry deleted."
                    app.logger.warning(error_msg)
                except PermissionError:
                    error_msg = f"Permission denied deleting file {file_path_to_delete}, but DB entry deleted."
                    app.logger.error(error_msg)
                except Exception as file_del_err:
                    error_msg = f"Error deleting file {file_path_to_delete}: {file_del_err}, but DB entry deleted."
                    app.logger.error(error_msg)
            else:
                app.logger.info(
                    f"No local file path found or applicable for UUID {uuid}, only DB entry deleted."
                )

            # Construct success message
            message = f"{file_type.capitalize()} DB entry deleted successfully."
            if file_deleted:
                message += " Corresponding file also deleted from disk."
            elif file_path_to_delete and not file_deleted:
                message += f" Could not delete file from disk: {error_msg}"
            elif not file_path_to_delete:
                message += " No corresponding local file found to delete."

            return jsonify(
                {
                    "message": message,
                    "db_deleted": True,
                    "file_deleted": file_deleted,
                    "uuid": uuid,
                }
            ), 200
        else:
            app.logger.warning(
                f"No {file_type} entry found matching UUID: {uuid} for user {user_id} in DB."
            )
            return jsonify(
                {
                    "message": f"No {file_type} found with that UUID for this user",
                    "db_deleted": False,
                    "file_deleted": False,
                    "uuid": uuid,
                }
            ), 404

    except pxt.Error as pxt_err:
        app.logger.error(
            f"Pixeltable error during deletion of {file_type} {uuid}: {str(pxt_err)}"
        )
        return jsonify(
            {
                "error": f"Server error accessing table for {file_type}",
                "details": str(pxt_err),
            }
        ), 500
    except Exception as e:
        app.logger.error(
            f"Unexpected error deleting {file_type} {uuid}: {str(e)}", exc_info=True
        )
        return jsonify(
            {"error": f"Server error deleting {file_type}", "details": str(e)}
        ), 500


@app.errorhandler(404)
def not_found_error(error):
    """Custom handler for 404 Not Found errors."""
    app.logger.info(f"404 Not Found: {request.path}")
    return jsonify({"error": "Resource not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    """Custom handler for 500 Internal Server errors."""
    app.logger.error(f"Server Error 500: {str(error)}", exc_info=True)
    return jsonify({"error": "Internal server error"}), 500


# --- User Persona Endpoints --- #

@app.route("/user_personas", methods=["GET"])
@login_required
@limiter.limit("60 per minute")
def get_user_personas():
    """Fetch all personas saved by the currently logged-in user."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "Authentication error"}), 500

    app.logger.info(f"Fetching personas for user {user_id}")
    try:
        personas_table = pxt.get_table("agents.user_personas")
        personas_df = (
            personas_table.where(personas_table.user_id == user_id)
            .select(
                persona_name=personas_table.persona_name,
                initial_prompt=personas_table.initial_prompt,
                final_prompt=personas_table.final_prompt,
                llm_params=personas_table.llm_params,
                timestamp=personas_table.timestamp,
            )
            .order_by(personas_table.persona_name, asc=True)
            .collect()
        )

        if len(personas_df) == 0:
            app.logger.debug(f"No personas found for user {user_id}")
            return jsonify([])

        results_pd = personas_df.to_pandas()
        # Format timestamp for JSON
        if "timestamp" in results_pd.columns:
            results_pd["timestamp"] = results_pd["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S.%f")

        persona_data = results_pd.to_dict("records")
        app.logger.debug(f"Successfully retrieved {len(persona_data)} personas for user {user_id}")
        return jsonify(persona_data)

    except pxt.Error as pxt_err:
        app.logger.error(f"Pixeltable error fetching personas for user {user_id}: {pxt_err}", exc_info=True)
        return jsonify({"error": "Server error fetching personas"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching personas for user {user_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

@app.route("/save_persona", methods=["POST"])
@login_required
@limiter.limit("30 per minute")
def save_user_persona():
    """Save (create) a new persona for the currently logged-in user.""" # Modified docstring
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "Authentication error"}), 500

    try:
        data = request.get_json()
        if not data or not all(k in data for k in ["persona_name", "initial_prompt", "final_prompt", "llm_params"]):
            return jsonify({"error": "Missing required persona fields"}), 400

        persona_name = data["persona_name"].strip()
        initial_prompt = data["initial_prompt"]
        final_prompt = data["final_prompt"]
        llm_params = data["llm_params"]
        current_timestamp = datetime.now()

        if not persona_name:
             return jsonify({"error": "Persona name cannot be empty"}), 400
        # TODO: Add more robust validation for llm_params structure/values if needed

        app.logger.info(f"Attempting to insert new persona '{persona_name}' for user {user_id}")

        personas_table = pxt.get_table("agents.user_personas")
        # --- MODIFIED: Use insert instead of update --- #
        try:
            status = personas_table.insert(
                [
                    {
                        "user_id": user_id,
                        "persona_name": persona_name,
                        "initial_prompt": initial_prompt,
                        "final_prompt": final_prompt,
                        "llm_params": llm_params,
                        "timestamp": current_timestamp,
                    }
                ]
            )
            num_inserted = status.num_rows # insert returns num_rows inserted

            if num_inserted > 0:
                 app.logger.info(f"Persona '{persona_name}' created successfully for user {user_id}.")
                 return jsonify({"message": f"Persona '{persona_name}' created successfully."}), 201 # Use 201 Created status
            else:
                # Should not happen if insert didn't raise error, but handle defensively
                app.logger.warning(f"Persona '{persona_name}' insert operation reported 0 inserts for user {user_id}.")
                return jsonify({"error": "Persona creation failed unexpectedly."}), 500

        except Exception as insert_err:
            # Catch potential errors, especially primary key violations
            err_str = str(insert_err).lower()
            if "unique constraint" in err_str or "primary key constraint" in err_str:
                 app.logger.warning(f"Failed to insert persona '{persona_name}' for user {user_id}: Name already exists.")
                 return jsonify({"error": f"Persona name '{persona_name}' already exists. Please choose a different name."}), 409 # 409 Conflict
            else:
                # Re-raise other unexpected insertion errors
                raise insert_err
        # --- END MODIFIED --- #

    except pxt.Error as pxt_err:
        # Catch errors getting the table
        app.logger.error(f"Pixeltable error preparing to save persona '{data.get('persona_name', 'UNKNOWN')}' for user {user_id}: {pxt_err}", exc_info=True)
        return jsonify({"error": "Server error accessing persona data"}), 500
    except Exception as e:
        # Catch validation errors or other unexpected errors
        app.logger.error(f"Unexpected error saving persona '{data.get('persona_name', 'UNKNOWN')}' for user {user_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

@app.route("/delete_persona/<path:persona_name>", methods=["DELETE"])
@login_required
@limiter.limit("30 per minute")
def delete_user_persona(persona_name):
    """Delete a specific persona by name for the currently logged-in user."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "Authentication error"}), 500

    if not persona_name:
        return jsonify({"error": "Persona name is required"}), 400

    app.logger.info(f"Attempting to delete persona '{persona_name}' for user {user_id}")
    try:
        personas_table = pxt.get_table("agents.user_personas")
        status = personas_table.delete(
            where=(personas_table.user_id == user_id) & (personas_table.persona_name == persona_name)
        )

        num_deleted = status.num_rows
        if num_deleted > 0:
            app.logger.info(f"Successfully deleted persona '{persona_name}' for user {user_id}")
            return jsonify({"message": f"Persona '{persona_name}' deleted successfully.", "num_deleted": num_deleted}), 200
        else:
            app.logger.warning(f"No persona named '{persona_name}' found for user {user_id} to delete.")
            return jsonify({"message": "Persona not found for this user", "num_deleted": 0}), 404

    except pxt.Error as pxt_err:
        app.logger.error(f"Pixeltable error deleting persona '{persona_name}' for user {user_id}: {pxt_err}", exc_info=True)
        return jsonify({"error": "Server error deleting persona"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error deleting persona '{persona_name}' for user {user_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

# --- End User Persona Endpoints --- #


# --- NEW: Update Persona Endpoint --- #
@app.route("/update_persona/<path:persona_name>", methods=["PUT"])
@login_required
@limiter.limit("30 per minute")
def update_user_persona(persona_name):
    """Update an existing persona for the currently logged-in user."""
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "Authentication error"}), 500

    if not persona_name:
        return jsonify({"error": "Original persona name is required in URL"}), 400

    try:
        data = request.get_json()
        # Ensure all necessary fields are present for update
        if not data or not all(k in data for k in ["initial_prompt", "final_prompt", "llm_params"]):
             # We don't strictly need persona_name in the body if it's in the URL and we prevent renaming
            return jsonify({"error": "Missing required persona fields in request body"}), 400

        # Extract data (we won't use persona_name from body to prevent accidental renaming here)
        initial_prompt = data["initial_prompt"]
        final_prompt = data["final_prompt"]
        llm_params = data["llm_params"]
        current_timestamp = datetime.now() # Update timestamp on modification

        app.logger.info(f"Attempting to update persona '{persona_name}' for user {user_id}")

        personas_table = pxt.get_table("agents.user_personas")

        # Prepare the update specification
        value_spec = {
            "initial_prompt": initial_prompt,
            "final_prompt": final_prompt,
            "llm_params": llm_params,
            "timestamp": current_timestamp # Update the timestamp
        }

        # Define the where clause
        where_clause = (personas_table.user_id == user_id) & (personas_table.persona_name == persona_name)

        # Perform the update
        status = personas_table.update(value_spec, where=where_clause)
        num_updated = status.num_rows # update returns num_rows updated

        if num_updated > 0:
            app.logger.info(f"Persona '{persona_name}' updated successfully for user {user_id}.")
            return jsonify({"message": f"Persona '{persona_name}' updated successfully.", "num_updated": num_updated}), 200
        else:
            # This means the where clause didn't match any rows
            app.logger.warning(f"No persona named '{persona_name}' found for user {user_id} to update.")
            return jsonify({"error": "Persona not found for this user"}), 404

    except pxt.Error as pxt_err:
        # Catch Pixeltable errors (e.g., table access)
        app.logger.error(f"Pixeltable error updating persona '{persona_name}' for user {user_id}: {pxt_err}", exc_info=True)
        return jsonify({"error": "Server error updating persona data"}), 500
    except Exception as e:
        # Catch JSON parsing errors or other unexpected errors
        app.logger.error(f"Unexpected error updating persona '{persona_name}' for user {user_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
# --- End Update Persona Endpoint --- #


if __name__ == "__main__":
    # Always use INFO level logging for production
    log_level = logging.INFO
    app.logger.setLevel(log_level)
    file_handler.setLevel(log_level)

    # Run using Waitress, a production-quality WSGI server
    app.logger.info(
        "Starting Waitress production server on http://0.0.0.0:5000/..." # Corrected port
    )
    serve(app, host="0.0.0.0", port=5000, threads=4) # Corrected port
