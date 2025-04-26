// static/js/ui.js

// --- Globals --- //
// DOM element references (ensure these are defined after DOM is loaded)
let queryForm, queryInput, submitButton, buttonLoading, resultsDiv, emptyStateDiv, uploadForm, fileInput, uploadStatusDiv, fileNameSpan, uploadProgressDiv, urlInput, urlSubmitButton, urlStatusDiv, toolsListDiv, documentsListDiv, imagesListDiv, videosListDiv, audiosListDiv, initialPromptInput, finalPromptInput, promptsForm, savePromptsButton, promptStatusSpan, workflowTableContainer, suggestionCardsContainer, loadingStateArea, loadingStateText, modeToggle, chatLabel, imageLabel, toolsDropdownButton, toolsDropdownContent, initialPromptLoadingDiv, finalPromptLoadingDiv, memoryContentInput, memoryTypeRadios, memoryLanguageContainer, memoryLanguageInput, addMemoryForm, addMemoryButton, addMemoryStatus, memoryDisplayArea, memorySearchInput, historySearchInput, imageHistorySearchInput, imageHistoryContainer, imageHistoryLoading, imageHistoryError, sidebarSearchInput, scrollToTopBtn, historyModal, historyModalContent, historyModalLoading, historyModalData, historyModalError, historyModalCloseBtn, historyModalTimestamp, historyModalQuery, historyModalResponse, historyModalMetadataSection, historyModalMetadata, imageDetailModal, imageDetailCloseBtn, imageDetailImage, imageDetailPrompt, imageDetailDownload, imageDetailDeleteBtn;

// State variables
let currentMode = 'chat'; // 'chat' or 'image'
let isFirstResult = true;
let requestInProgress = false; // Tracks if a query/image request is active
let currentSelectionTextForSave = null;
let currentContextQueryForSave = null;
let currentOpenImageTimestamp = null; // For image deletion modal
let currentPersonaId = null; // NEW: Track selected persona
// NEW: Store default settings fetched from backend
let jsDefaultInitialPrompt = 'Loading...';
let jsDefaultFinalPrompt = 'Loading...';
let jsDefaultParams = {};
// END NEW
let personaModal, managePersonasBtn, personaModalCloseBtn, createPersonaForm, saveNewPersonaBtn, customPersonasDiv, createPersonaStatus; // NEW: Modal elements

// Global data stores (filled by API calls)
let allWorkflowData = [];
let allImageHistoryData = [];
let filteredImageHistoryData = []; // For search filtering
let allMemoryData = [];
let filteredMemoryData = []; // For search filtering
let allUserPersonas = []; // NEW: Store fetched user personas

// Pagination variables
let currentWorkflowPage = 1;
const entriesPerPage = 10;
let currentImageHistoryPage = 1;
const imageEntriesPerPage = 12;
let currentMemoryPage = 1; // Assuming pagination for memory too
const memoryEntriesPerPage = 5; // Example

// Constants
const MAX_FILENAME_LENGTH = 25; // For sidebar display

// Loading messages - REVISED
const loadingMessages = [
    "Pixeltable: Orchestrating workflow with computed columns...",
    "Analyzing query for optimal tool selection (LLM call)...",
    "Pixeltable: Applying UDFs for custom data processing...",
    "Querying Pixeltable embedding indexes for semantic context...",
    "Pixeltable Views: Transforming data on-the-fly for context...",
    "Fetching relevant document chunks using Pixeltable iterators...",
    "Accessing Pixeltable tables for chat history context...",
    "Retrieving saved items from Pixeltable memory bank...",
    "Pixeltable: Calling external APIs via declarative functions...",
    "Extracting frames/audio with Pixeltable computed columns...",
    "Compiling context from multiple Pixeltable data sources...",
    "Pixeltable: Managing execution dependencies declaratively...",
    "Generating final response using LLM and Pixeltable context...",
    "Pixeltable stores multimodal data references efficiently...",
    "Caching intermediate results with Pixeltable for speed...",
    "Pixeltable: Ensuring data consistency during operations..."
];
let currentMessageIndex = 0;
let loadingIntervalId = null;

// Image Gen Loading messages - REVISED
const imageGenLoadingMessages = [
    "Pixeltable: Preparing image generation task...",
    "Triggering image generation API via computed column...",
    "Pixeltable: Waiting for DALL-E 3 API response...",
    "Storing generated image reference in Pixeltable table...",
    "Linking generated image to prompt in Pixeltable history...",
    "Pixeltable: Managing API calls declaratively..."
];
let currentImageGenMessageIndex = 0;
let imageGenLoadingIntervalId = null;

let personaSelectorButton, personaSelectorDropdown, selectedPersonaNameSpan, personaOptionsList; // NEW: Custom dropdown elements

// --- NEW: Icon and Color Pools for Personas --- //
const personaIcons = [
    'fas fa-user-tie', 'fas fa-comments', 'fas fa-microchip', 'fas fa-paint-brush',
    'fas fa-chart-pie', 'fas fa-book', 'fas fa-briefcase', 'fas fa-search',
    'fas fa-calculator', 'fas fa-flask'
];
const personaColorThemes = [
    { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', hoverBg: 'hover:bg-indigo-100' },
    { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', hoverBg: 'hover:bg-green-100' },
    { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', hoverBg: 'hover:bg-amber-100' },
    { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', hoverBg: 'hover:bg-sky-100' },
    { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', hoverBg: 'hover:bg-pink-100' },
    { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', hoverBg: 'hover:bg-purple-100' },
    { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', hoverBg: 'hover:bg-rose-100' },
];

// Simple hash function for assignment
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

function getIconForPersona(name) {
    if (!name) return 'fas fa-sliders-h'; // Default icon
    const hash = simpleHash(name);
    return personaIcons[hash % personaIcons.length];
}

function getColorClassesForPersona(name) {
    if (!name) return null; // No custom theme for default
    const hash = simpleHash(name);
    return personaColorThemes[hash % personaColorThemes.length];
}
// --- END NEW Pools & Helpers --- //

// --- Initialization --- //
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Initializing UI.");

    // --- ADDED: Load saved persona ID from sessionStorage --- //
    const savedPersonaId = sessionStorage.getItem('selectedPersonaId');
    if (savedPersonaId !== null) { // Check for null, empty string means default was saved
       currentPersonaId = savedPersonaId === '' ? null : savedPersonaId; // Convert empty string back to null
       console.log('Restored selectedPersonaId from sessionStorage:', currentPersonaId);
    } else {
        console.log('No selectedPersonaId found in sessionStorage, using default.');
        currentPersonaId = null; // Ensure it's null if nothing is saved
    }
    // --- END ADDED --- //

    assignDOMElements();
    initializeUI();
    if (typeof loadContextInfo === 'function') {
        loadContextInfo().then(() => {
            console.log("Context info loaded. Fetching personas...");
            fetchAndDisplayUserPersonas();
            console.log("Default settings should now be stored in JS variables.");
        });
    } else {
        console.error("loadContextInfo function not found in api.js");
        fetchAndDisplayUserPersonas();
        jsDefaultInitialPrompt = "Error loading defaults.";
        jsDefaultFinalPrompt = "Error loading defaults.";
        jsDefaultParams = {};
    }
});

// --- DOM Element Assignment --- //
function assignDOMElements() {
    queryForm = document.getElementById('query-form');
    queryInput = document.getElementById('query');
    submitButton = document.getElementById('submit-button');
    buttonLoading = document.getElementById('button-loading');
    resultsDiv = document.getElementById('results');
    emptyStateDiv = document.getElementById('empty-state'); // Might not exist anymore
    uploadForm = document.getElementById('upload-form');
    fileInput = document.getElementById('file-input');
    uploadStatusDiv = document.getElementById('upload-status');
    fileNameSpan = document.getElementById('file-name');
    uploadProgressDiv = document.getElementById('upload-progress');
    urlInput = document.getElementById('url-input');
    urlSubmitButton = document.getElementById('url-submit-button');
    urlStatusDiv = document.getElementById('url-status');
    // toolsListDiv = document.getElementById('tools-list'); // Replaced by dropdown
    documentsListDiv = document.getElementById('documents-list');
    imagesListDiv = document.getElementById('images-list');
    videosListDiv = document.getElementById('videos-list');
    audiosListDiv = document.getElementById('audios-list');
    initialPromptInput = document.getElementById('initial-prompt-input');
    finalPromptInput = document.getElementById('final-prompt-input');
    promptsForm = document.getElementById('prompts-form');
    savePromptsButton = document.getElementById('save-prompts-button');
    promptStatusSpan = document.getElementById('prompt-status');
    workflowTableContainer = document.getElementById('workflow-table-container');
    suggestionCardsContainer = document.getElementById('suggestion-cards-container');
    loadingStateArea = document.getElementById('loading-state-area');
    loadingStateText = document.getElementById('loading-state-text');
    modeToggle = document.getElementById('mode-toggle');
    chatLabel = document.getElementById('chat-mode-label');
    imageLabel = document.getElementById('image-mode-label');
    toolsDropdownButton = document.getElementById('tools-dropdown-button');
    toolsDropdownContent = document.getElementById('tools-dropdown-content');
    initialPromptLoadingDiv = document.getElementById('initial-prompt-loading');
    finalPromptLoadingDiv = document.getElementById('final-prompt-loading');
    memoryContentInput = document.getElementById('memory-content-input');
    memoryTypeRadios = document.querySelectorAll('input[name="memory-type"]');
    memoryLanguageContainer = document.getElementById('memory-language-container');
    memoryLanguageInput = document.getElementById('memory-language-input');
    addMemoryForm = document.getElementById('add-memory-form');
    addMemoryButton = document.getElementById('add-memory-button');
    addMemoryStatus = document.getElementById('add-memory-status');
    memoryDisplayArea = document.getElementById('memory-display-area');
    memorySearchInput = document.getElementById('memory-search-input');
    historySearchInput = document.getElementById('history-search');
    imageHistorySearchInput = document.getElementById('image-history-search');
    imageHistoryContainer = document.getElementById('image-history-content');
    imageHistoryLoading = document.getElementById('image-history-loading');
    imageHistoryError = document.getElementById('image-history-error');
    sidebarSearchInput = document.getElementById('sidebar-search');
    scrollToTopBtn = document.getElementById('scroll-to-top-btn');

    // Modals
    historyModal = document.getElementById('history-detail-modal');
    historyModalContent = document.getElementById('modal-content-area'); // The scrolling part
    historyModalLoading = document.getElementById('modal-loading-state');
    historyModalData = document.getElementById('modal-data-content');
    historyModalError = document.getElementById('modal-error-state');
    historyModalCloseBtn = document.getElementById('modal-close-button');
    historyModalTimestamp = document.getElementById('modal-timestamp');
    historyModalQuery = document.getElementById('modal-query');
    historyModalResponse = document.getElementById('modal-response');
    historyModalMetadataSection = document.getElementById('modal-metadata-section');
    historyModalMetadata = document.getElementById('modal-metadata');

    imageDetailModal = document.getElementById('image-detail-modal');
    imageDetailCloseBtn = document.getElementById('modal-image-close-button');
    imageDetailImage = document.getElementById('modal-image');
    imageDetailPrompt = document.getElementById('modal-prompt');
    imageDetailDownload = document.getElementById('modal-download');
    imageDetailDeleteBtn = document.getElementById('modal-delete-button');
    personaSelectorButton = document.getElementById('persona-selector-button');
    personaSelectorDropdown = document.getElementById('persona-selector-dropdown');
    selectedPersonaNameSpan = document.getElementById('selected-persona-name');
    personaOptionsList = personaSelectorDropdown?.querySelector('.persona-options-list');

    // --- ADD BACK MISSING ASSIGNMENT --- //
    managePersonasBtn = document.getElementById('manage-personas-btn');
    // --- END ADD BACK --- //

    // --- NEW: User Menu --- //
    userMenuButton = document.getElementById('user-menu-button');
    userMenuDropdown = document.getElementById('user-menu-dropdown');
    // ---------------------- //

    // --- Persona Modal Elements (Ensure these are assigned) ---
    personaModal = document.getElementById('persona-modal');
    personaModalCloseBtn = document.getElementById('persona-modal-close-btn');
    createPersonaForm = document.getElementById('create-persona-form');
    saveNewPersonaBtn = document.getElementById('save-new-persona-btn');
    customPersonasDiv = document.getElementById('custom-personas-list');
    createPersonaStatus = document.getElementById('create-persona-status');
}

// --- UI Initialization --- //
function initializeUI() {
    console.log("Initializing UI components and event listeners.");
    if (!document.body) {
        console.error("initializeUI called before body exists!");
        return;
    }
    // Read auth state from body attribute
    const isAuthenticated = document.body.getAttribute('data-is-authenticated') === 'true';
    updateUIForAuthState(isAuthenticated); // Call the new function

    setupEventListeners();
    initializeTabs();
    setupHistoryModal();
    setupImageModal();
}

// NEW function to enable/disable elements based on auth state
function updateUIForAuthState(isAuthenticated) {
    console.log(`Updating UI for auth state: ${isAuthenticated}`);

    // Define elements that require immediate redirect on interaction attempt
    const redirectElements = [
        queryInput,
        submitButton
    ];

    // Define elements that should be visually disabled but not redirect
    const visuallyDisableElements = [
        fileInput?.labels[0], // Target the label for the upload area
        urlSubmitButton,
        addMemoryButton,
        // Add other buttons/controls here that shouldn't cause an immediate redirect
        // but should be visibly inactive when logged out.
        toolsDropdownButton // Also disable the tools dropdown button
    ];

    // Define the handler function for gated elements that should redirect
    const redirectToLoginHandler = (event) => {
        // Check again in case state changed dynamically (less likely with full page reload)
        if (document.body.getAttribute('data-is-authenticated') !== 'true') {
            event.preventDefault(); // Prevent default action
        event.stopPropagation(); // Prevent event bubbling
        console.log("User interaction blocked, redirecting to login.");
        window.location.href = '/login'; // Redirect to the backend login route
        }
    };

    // --- Apply Redirect Logic ---
    redirectElements.forEach(el => {
        if (el) {
            // Remove any previously attached listener first (use 'focus' for input, 'click' for button)
            const eventType = (el === queryInput) ? 'focus' : 'click';
            el.removeEventListener(eventType, redirectToLoginHandler, true); // Use capture phase

            if (!isAuthenticated) {
                // Add the redirect listener if not logged in
                el.addEventListener(eventType, redirectToLoginHandler, true); // Use capture phase
                // Keep elements visually enabled initially, block happens on interaction
                el.disabled = false;
                el.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                // Ensure elements are fully enabled if logged in
                el.disabled = false; // Make sure submit button is re-enabled subject to other logic
                el.classList.remove('opacity-50', 'cursor-not-allowed');
                // Explicitly remove listener if authenticated (belt and suspenders)
                el.removeEventListener(eventType, redirectToLoginHandler, true);
            }
        }
    });

    // --- Apply Visual Disable Logic ---
    visuallyDisableElements.forEach(el => {
        if (el) {
            if (!isAuthenticated) {
                // Make visibly disabled
                el.disabled = true; // Use disabled attribute for semantics
                el.classList.add('opacity-50', 'cursor-not-allowed');
                 // Remove potential redirect listener if it was ever added previously
                el.removeEventListener('click', redirectToLoginHandler, true);
            } else {
                // Ensure elements are enabled and styles removed if logged in
                el.disabled = false;
                el.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
    });


    // Special handling for query textarea placeholder
    if (queryInput) {
        if (!isAuthenticated) {
            queryInput.placeholder = "Login or Sign Up to start chatting..."; // Updated placeholder
        } else {
            queryInput.placeholder = "Ask a question about the uploaded files or any topic you need insights on...";
        }
    }

    // Special handling for file upload label title
    const uploadLabel = fileInput?.labels[0];
    if (uploadLabel) {
         uploadLabel.title = isAuthenticated ? "" : "Login required to upload files.";
    }

    // --- Sidebar Delete Buttons --- (Keep them disabled/styled when logged out)
    document.querySelectorAll('.sidebar-delete-all-btn, .sidebar-file-delete-btn').forEach(btn => {
        btn.disabled = !isAuthenticated;
         if (!isAuthenticated) {
             btn.classList.add('opacity-50', 'cursor-not-allowed');
         } else {
             btn.classList.remove('opacity-50', 'cursor-not-allowed');
         }
    });

     // Update checkInput state if queryInput exists
     if (queryInput && typeof checkInput === 'function') {
        checkInput();
    }
}

// --- Utility Functions --- //

/**
 * Escapes HTML special characters in a string.
 * @param {string} unsafe - The potentially unsafe string.
 * @returns {string} - The escaped string.
 */
function escapeHtml(unsafe) {
    if (unsafe === null || typeof unsafe === 'undefined') return '';
    // Basic check if it's already likely HTML (contains tags)
    // This is imperfect but prevents double-escaping markdown output
    if (typeof unsafe === 'string' && /<[a-z][\s\S]*>/i.test(unsafe)) {
        return unsafe; // Assume it's already HTML (like from marked.parse)
    }
    // Otherwise, escape potential HTML characters
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

/**
 * Creates a debounced version of a function.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The debounce delay in milliseconds.
 * @returns {Function} - The debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Filters an array of objects based on a search term and specified columns.
 * @param {Array<object>} data - The array of objects to filter.
 * @param {string} searchTerm - The search term.
 * @param {Array<string>} columnsToSearch - The keys of the columns to search within.
 * @returns {Array<object>} - The filtered array.
 */
function filterData(data, searchTerm, columnsToSearch) {
    if (!data) return [];
    const lowerCaseSearchTerm = searchTerm.toLowerCase().trim();
    if (!lowerCaseSearchTerm) {
        return [...data]; // Return a copy when no search term
    }
    const validColumns = Array.isArray(columnsToSearch) ? columnsToSearch : [];
    if (validColumns.length === 0) {
        console.warn("filterData called with no valid columns to search.");
        return [...data];
    }
    return data.filter(entry => {
        return validColumns.some(columnName => {
            const value = entry[columnName];
            return value && typeof value === 'string' && value.toLowerCase().includes(lowerCaseSearchTerm);
        });
    });
}

// --- UI Update Functions --- //

/**
 * Updates the submit button state and loading indicators.
 * @param {boolean} isLoading - Whether the application is loading.
 * @param {string} [mode='chat'] - The current mode ('chat' or 'image').
 */
function setLoading(isLoading, mode = 'chat') {
    console.log("setLoading called with:", isLoading, "Mode:", mode); // DEBUG
    requestInProgress = isLoading;

    if (!submitButton || !buttonLoading || !loadingStateArea || !loadingStateText) {
        console.warn("Required loading elements not found.");
        // Still update requestInProgress and checkInput if queryInput exists
        if (queryInput) checkInput();
        return;
    }

    const buttonIconSpan = document.getElementById('button-text'); // Get inside function scope

    // Determine which messages to use based on mode
    const messages = (mode === 'image') ? imageGenLoadingMessages : loadingMessages;
    let messageIndex = (mode === 'image') ? currentImageGenMessageIndex : currentMessageIndex;
    let intervalIdRef = (mode === 'image') ? 'imageGenLoadingIntervalId' : 'loadingIntervalId'; // Use string ref

    // Clear any existing interval before starting a new one
    if (window[intervalIdRef]) { // Access global interval ID via window object
        clearInterval(window[intervalIdRef]);
        window[intervalIdRef] = null;
    }

    if (isLoading) {
        submitButton.disabled = true;
        submitButton.classList.add('opacity-50', 'cursor-not-allowed');
        if (buttonIconSpan) buttonIconSpan.classList.add('hidden');
        buttonLoading.classList.remove('hidden');
        loadingStateArea.classList.remove('hidden');

        // Start cycling through the appropriate loading messages
        if (messages.length > 0) {
            messageIndex = Math.floor(Math.random() * messages.length); // Start random
            loadingStateText.textContent = messages[messageIndex];
            window[intervalIdRef] = setInterval(() => {
                messageIndex = (messageIndex + 1) % messages.length; // Cycle sequentially after random start
                loadingStateText.textContent = messages[messageIndex];
                // Update the correct global index tracker
                if (mode === 'image') {
                    currentImageGenMessageIndex = messageIndex;
                } else {
                    currentMessageIndex = messageIndex;
                }
            }, 3000); // Change interval to 3 seconds
            console.log(`Started loading message interval for ${mode} mode.`);
        } else {
            loadingStateText.textContent = "Processing..."; // Fallback message
        }

    } else {
        if (buttonIconSpan) buttonIconSpan.classList.remove('hidden');
        buttonLoading.classList.add('hidden');
        loadingStateArea.classList.add('hidden');
        // Interval cleared above
        console.log(`Stopped loading message interval for ${mode} mode.`);
        // Re-check input state after loading finishes
        checkInput();
    }
}

/** Clears the main query input textarea. */
function clearQueryInput() {
    if (queryInput) {
        queryInput.value = '';
        autoResizeTextarea({ target: queryInput }); // Reset size
    }
}

/** Hides the main loading state area. */
function hideLoadingState() {
    if (loadingStateArea) {
        loadingStateArea.classList.add('hidden');
    }
     // Also clear any potentially running interval
     if (loadingIntervalId) {
        clearInterval(loadingIntervalId);
        loadingIntervalId = null;
    }
    if (imageGenLoadingIntervalId) {
        clearInterval(imageGenLoadingIntervalId);
        imageGenLoadingIntervalId = null;
    }
}

/**
 * Updates the UI elements based on the current mode ('chat' or 'image').
 */
function updateUIMode() {
    if (!modeToggle || !queryInput || !submitButton || !toolsDropdownButton || !chatLabel || !imageLabel) {
        console.error("Required UI elements for mode update not found.");
        return;
    }
    const buttonIconSpan = document.getElementById('button-text'); // Get here
    if (!buttonIconSpan) return;

    currentMode = modeToggle.checked ? 'image' : 'chat';
    console.log("Updating UI for mode:", currentMode);

    if (currentMode === 'image') {
        queryInput.placeholder = "Enter a prompt to generate an image...";
        buttonIconSpan.innerHTML = '<i class="fas fa-image fa-sm"></i>';
        // submitButton.title = "Generate Image"; // Tooltip handled by span now
        toolsDropdownButton.parentElement.style.display = 'none'; // Hide parent span
        chatLabel.classList.replace('text-gray-700', 'text-gray-500');
        imageLabel.classList.replace('text-gray-500', 'text-gray-700');
    } else {
        queryInput.placeholder = "Ask a question about the uploaded files or any topic...";
        buttonIconSpan.innerHTML = '<i class="fas fa-paper-plane fa-sm"></i>';
        // submitButton.title = "Send Query"; // Tooltip handled by span now
        toolsDropdownButton.parentElement.style.display = 'block'; // Show parent span
        chatLabel.classList.replace('text-gray-500', 'text-gray-700');
        imageLabel.classList.replace('text-gray-700', 'text-gray-500');
    }
    checkInput(); // Update submit button state
}

/**
 * Toggles the visibility of a result card's content.
 * @param {HTMLElement} button - The header button element that was clicked.
 */
function toggleResultCard(button) {
    const targetId = button.getAttribute('data-result-toggle-target');
    if (!targetId) return;
    const targetContent = document.querySelector(targetId);
    const icon = button.querySelector('svg'); // Assumes only one SVG for chevron

    if (targetContent && icon) {
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', !isExpanded);
        targetContent.style.display = isExpanded ? 'none' : 'block';
        icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
    }
}

/**
 * Toggles the visibility of an accordion section (used in How It Works).
 * @param {HTMLElement} button - The header button element clicked.
 */
function toggleAccordion(button) {
    const targetId = button.dataset.accordionTarget;
    const contentElement = document.querySelector(targetId);
    const icon = button.querySelector('.hiw-chevron'); // Assuming chevron has this class

    if (contentElement) {
        const isHidden = contentElement.classList.toggle('hidden');
        button.setAttribute('aria-expanded', !isHidden);
        if (icon) {
            icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
        }
        // Apply highlighting *after* the element is shown
        if (!isHidden && typeof applySyntaxHighlighting === 'function') {
            applySyntaxHighlighting(contentElement);
        }
    }
}

/**
 * Displays a chat query result in the results area.
 * @param {string} query - The original query text.
 * @param {object} data - The result data from the API (contains answer, metadata, etc.).
 */
function displayResult(query, data) {
    if (isFirstResult) {
        if (suggestionCardsContainer) suggestionCardsContainer.classList.add('hidden');
        isFirstResult = false;
    }

    const resultCard = document.createElement('div');
    const cardId = `result-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    resultCard.id = cardId;
    resultCard.className = 'result-card bg-white rounded-lg shadow-md animate-fade-in w-full border border-gray-200 mb-6'; // Added mb-6
    resultCard.dataset.originalQuery = query;

    // --- Collapse existing results --- //
    collapseExistingResults();

    const timestamp = new Date().toLocaleTimeString();
    const isError = !!data.error;

    // --- Card Header --- //
    const headerHtml = `
        <div class="result-header" onclick="toggleResultCard(this)" data-result-toggle-target="#${cardId}-content" aria-expanded="true">
            <div class="result-header-content">
                <i class="fas ${isError ? 'fa-exclamation-circle text-red-500' : 'fa-question-circle text-gray-500'}"></i>
                <span class="font-medium text-gray-600 mr-2">Question</span>
                <span class="result-query-truncated ml-1">${escapeHtml(query)}</span>
            </div>
            <div class="flex items-center gap-3">
                <button onclick="copyAnswerText('${cardId}')" class="action-btn" title="Copy Answer Text">
                    <i class="far fa-copy"></i>
                </button>
                <span class="result-timestamp">${timestamp}</span>
                <svg class="w-4 h-4 transform transition-transform duration-200 text-gray-400" style="transform: rotate(180deg);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </div>
        </div>`;

    // --- Card Content --- //
    let contentHtml = '';
    if (isError) {
        contentHtml = createErrorContent(query, data);
        resultCard.classList.add('border-red-300');
    } else {
        contentHtml = createSuccessContent(query, data, cardId);
    }

    resultCard.innerHTML = headerHtml + `<div id="${cardId}-content" class="result-card-content" style="display: block;">${contentHtml}</div>`;

    resultsDiv.prepend(resultCard);

    // Post-render processing
    if (!isError) {
        applySyntaxHighlighting(resultCard);
        setupFollowUpSuggestions(resultCard, data.follow_up_text);
        // Initialize Mermaid diagrams if any are present in the answer
        if (data.answer && data.answer.includes('class="mermaid"')) {
            try {
                mermaid.run({ nodes: resultCard.querySelectorAll('.mermaid') });
            } catch (e) {
                console.error("Mermaid rendering error:", e);
            }
        }
    }
}

/**
 * Displays an image generation result.
 * @param {string} prompt - The original prompt text.
 * @param {object} data - Result data (contains generated_image_base64 or error).
 */
function displayImageResult(prompt, data) {
    if (isFirstResult) {
        if (suggestionCardsContainer) suggestionCardsContainer.classList.add('hidden');
        if (loadingStateArea) loadingStateArea.classList.add('hidden');
        isFirstResult = false;
    }

    const resultCard = document.createElement('div');
    const cardId = `image-result-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    resultCard.id = cardId;
    resultCard.className = 'result-card bg-white rounded-lg shadow-md animate-fade-in w-full border border-gray-100 mb-6'; // Added mb-6

    collapseExistingResults();

    const timestamp = new Date().toLocaleTimeString();
    const isError = !!data.error;
    const contentId = `${cardId}-content`;

    // --- Header --- //
    const headerHtml = `
        <div class="result-header" onclick="toggleResultCard(this)" data-result-toggle-target="#${contentId}" aria-expanded="true">
            <div class="result-header-content">
                <i class="fas ${isError ? 'fa-exclamation-circle text-red-500' : 'fa-image text-purple-500'}"></i>
                <span class="font-medium text-gray-600 mr-2">Image Prompt</span>
                <span class="result-query-truncated ml-1">${escapeHtml(prompt)}</span>
            </div>
            <div class="flex items-center gap-3">
                <span class="result-timestamp">${timestamp}</span>
                <svg class="w-4 h-4 transform transition-transform duration-200 text-gray-400" style="transform: rotate(180deg);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </div>
        </div>`;

    // --- Content --- //
    let contentHtml = '';
    if (isError) {
        contentHtml = `
            <div class="result-content p-4">
                <div class="bg-red-50 p-4 rounded border border-red-200">
                    <h3 class="text-red-800 font-medium mb-2">Image Generation Error</h3>
                    <p class="text-red-700 text-sm mb-1">Prompt: ${escapeHtml(prompt)}</p>
                    <p class="text-red-700 text-sm">Error: ${escapeHtml(data.error)}</p>
                    ${data.details ? `<p class="text-red-600 mt-2 text-xs italic">${escapeHtml(data.details)}</p>` : ''}
                </div>
            </div>`;
        resultCard.classList.add('border-red-300');
    } else if (data.generated_image_base64) {
        contentHtml = `
            <div class="result-content p-4">
                <p class="text-sm text-gray-600 mb-3 italic">${escapeHtml(prompt)}</p>
                <div class="flex justify-center items-center bg-gray-100 p-2 rounded border border-gray-200">
                    <img src="data:image/png;base64,${data.generated_image_base64}"
                         alt="Generated image for prompt: ${escapeHtml(prompt)}"
                         class="max-w-full max-h-[60vh] object-contain rounded shadow-sm">
                </div>
                <div class="text-center mt-4">
                    <a href="data:image/png;base64,${data.generated_image_base64}"
                       download="generated_image_${cardId}.png"
                       class="action-btn inline-flex items-center px-3 py-1.5 bg-white">
                        <i class="fas fa-download mr-1.5 text-xs"></i>
                        <span class="text-xs">Download</span>
                    </a>
                </div>
            </div>`;
        resultCard.classList.add('border-purple-300');
    } else {
        contentHtml = `<div class="result-content p-4"><p class="text-gray-500 italic">Unexpected result format received.</p></div>`;
    }

    resultCard.innerHTML = headerHtml + `<div id="${contentId}" class="result-card-content" style="display: block;">${contentHtml}</div>`;

    resultsDiv.prepend(resultCard);
}

/** Collapses all existing result cards in the resultsDiv. */
function collapseExistingResults() {
    const existingResultCards = resultsDiv.querySelectorAll('.result-card');
    existingResultCards.forEach(card => {
        const headerButton = card.querySelector('.result-header[onclick^="toggleResultCard"]');
        if (headerButton && headerButton.getAttribute('aria-expanded') === 'true') {
            toggleResultCard(headerButton); // Use the toggle function
        }
    });
}

/** Helper to create HTML for error content within a result card. */
function createErrorContent(query, data) {
    return `
        <div class="result-content p-4">
            <div class="bg-red-50 p-4 rounded border border-red-200">
                <h3 class="text-red-800 font-medium mb-2">Error Processing Query</h3>
                <p class="text-red-700 text-sm mb-1">Query: ${escapeHtml(query)}</p>
                <p class="text-red-700 text-sm">Error: ${escapeHtml(data.error)}</p>
                ${data.details ? `<p class="text-red-600 mt-2 text-xs italic">${escapeHtml(data.details)}</p>` : ''}
                ${data.suggestion ? `<p class="text-orange-700 mt-2 text-xs italic">Suggestion: ${escapeHtml(data.suggestion)}</p>` : ''}
            </div>
        </div>`;
}

/** Helper to create HTML for successful result content. */
function createSuccessContent(query, data, cardId) {
    const TRUNCATE_THRESHOLD = 200; // Characters before truncating query
    const isLongQuery = query.length > TRUNCATE_THRESHOLD;
    const escapedQuery = escapeHtml(query);

    let fullQuerySectionHtml = '';
    if (isLongQuery) {
        // Calculate truncated text (e.g., first 3 lines or ~200 chars)
        // Simple character truncation for now, can be refined
        const truncatedQuery = escapeHtml(query.substring(0, TRUNCATE_THRESHOLD)) + '...';

        // Store full and truncated in data attributes
        fullQuerySectionHtml = `
            <div class="expandable-content-container mb-4"
                 data-full-text="${escapedQuery}"
                 data-truncated-text="${truncatedQuery}">
                <p class="expandable-text text-sm text-gray-700 whitespace-pre-wrap">${truncatedQuery}</p>
                <button onclick="toggleShowMoreLess(this)" class="suggestion-link text-xs mt-1">Show More</button>
        </div>`;
    } else {
        // Simpler structure if query is short
        fullQuerySectionHtml = `
            <div class="mb-4">
                <p class="text-sm text-gray-700 whitespace-pre-wrap">${escapedQuery}</p>
            </div>`;
    }

    const answerSectionHtml = `
        <div class="result-subsection-header cursor-default">
            <div><i class="fas fa-comment-dots text-gray-500"></i><h4>Answer</h4></div>
        </div>
        <div class="result-answer prose prose-sm max-w-none text-gray-800">
            ${marked.parse(data.answer || '')} ${generateAnswerActionButtons(cardId)}
        </div>`;

    const followUpSectionHtml = `
        <div class="follow-up-suggestions-container pt-3 mt-4 border-t border-gray-200" style="display: none;">
            <h4 class="text-sm font-semibold text-gray-600 mb-2">Suggested follow-up questions:</h4>
            <div class="suggestions-list space-y-1"></div>
        </div>`;

    const imagesSectionHtml = createRelevantMediaSection(data.image_context, cardId, 'images');
    const framesSectionHtml = createRelevantMediaSection(data.video_frame_context, cardId, 'frames');
    const contextSectionHtml = createContextDetailsSection(data.metadata);

    return `
        <div class="result-content p-4">
            ${fullQuerySectionHtml}
            ${answerSectionHtml}
            ${followUpSectionHtml}
            ${imagesSectionHtml}
            ${framesSectionHtml}
            ${contextSectionHtml}
        </div>`;
}

/** Helper to create HTML for relevant images or video frames sections. */
function createRelevantMediaSection(mediaContext, cardId, type) {
    if (!mediaContext || mediaContext.length === 0) return '';

    const gridId = `${cardId}-${type}-grid`;
    const title = type === 'images' ? 'Relevant Images' : 'Relevant Video Frames';
    const iconClass = type === 'images' ? 'fa-images' : 'fa-film';

    const itemsHtml = mediaContext.map(item => {
        const imgSrc = `data:image/png;base64,${type === 'images' ? item.encoded_image : item.encoded_frame}`;
        const altText = type === 'images' ? 'Relevant Image' : 'Relevant Video Frame';
        const similarityText = item.sim ? `<p class="text-xs text-gray-500">Sim: ${parseFloat(item.sim).toFixed(3)}</p>` : '';
        const aspectRatioClass = type === 'images' ? 'aspect-square' : 'aspect-video';

        return `
            <div class="text-center">
                <div class="${aspectRatioClass} overflow-hidden rounded border border-gray-200 mb-1 bg-gray-100">
                    <img src="${imgSrc}" alt="${altText}" class="object-contain w-full h-full" loading="lazy">
                </div>
                ${similarityText}
            </div>`;
    }).join('');

    return `
        <div class="mt-4 pt-4 border-t border-gray-200">
            <div class="result-subsection-header" onclick="toggleAccordion(this)" data-accordion-target="#${gridId}" aria-expanded="false">
                <div><i class="fas ${iconClass} text-gray-500"></i><h4>${title} (${mediaContext.length})</h4></div>
                <i class="fas fa-chevron-down transform transition-transform duration-200 hiw-chevron text-gray-400"></i>
            </div>
            <div id="${gridId}" class="mt-2 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 hidden">
                ${itemsHtml}
            </div>
        </div>`;
}

/** Helper to create HTML for the context/details section. */
function createContextDetailsSection(metadata) {
    if (!metadata) return '';

    const contextTypes = [
        metadata.has_doc_context && 'Document',
        metadata.has_image_context && 'Image',
        (metadata.has_video_audio_context || metadata.has_audio_context) && 'Audio/Video',
        metadata.has_tool_output && 'Tool',
        metadata.has_history_context && 'Chat History',
        metadata.has_memory_context && 'Memory Bank',
        metadata.has_chat_memory_context && 'Searched History'
    ].filter(Boolean);

    let typesHtml = '';
    if (contextTypes.length > 0) {
        typesHtml = `
            <div class="flex items-start mb-1.5">
                <span class="w-20 flex-shrink-0 text-gray-500 mt-0.5">Sources:</span>
                <div class="flex flex-wrap gap-1.5">
                    ${contextTypes.map(type =>
                        `<span class="inline-block bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full">${escapeHtml(type)}</span>`
                    ).join('')}
                </div>
            </div>`;
    }

    const queryTimestamp = metadata.timestamp ? new Date(metadata.timestamp).toLocaleString() : 'N/A';
    const timeHtml = `
        <div class="flex items-center">
            <span class="w-20 flex-shrink-0 text-gray-500">Processed:</span>
            <span class="text-gray-600">${queryTimestamp}</span>
        </div>`;

    if (!typesHtml && !timeHtml) return ''; // Return nothing if no details

    return `
        <div class="mt-4 pt-4 border-t border-gray-200 text-sm">
            <h5 class="font-semibold text-gray-700 mb-2 flex items-center"><i class="fas fa-info-circle mr-2 text-gray-500"></i>Details</h5>
            ${typesHtml}
            ${timeHtml}
        </div>`;
}

/** Generates HTML for answer action buttons (Copy, Save). */
function generateAnswerActionButtons(cardId) {
    // Removed Copy button from here
    return `
        <div class="answer-actions inline-flex gap-2 ml-2">

         </div>
    `;
}

/** Applies syntax highlighting to code blocks within a container. */
function applySyntaxHighlighting(containerElement) {
    containerElement.querySelectorAll('pre').forEach((preElement) => {
        const codeElement = preElement.querySelector('code');
        if (!codeElement) return;

        // Remove existing wrapper if re-highlighting
        const existingWrapper = preElement.closest('.code-block-wrapper');
        if (existingWrapper) {
            existingWrapper.parentNode.insertBefore(preElement, existingWrapper);
            existingWrapper.remove();
        }

        hljs.highlightElement(codeElement);

        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper group relative'; // Added relative
        preElement.parentNode.insertBefore(wrapper, preElement);
        wrapper.appendChild(preElement);

        const languageMatch = codeElement.className.match(/language-([^\s]+)/);
        const language = languageMatch ? languageMatch[1] : 'text';

        // Copy Button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-code-btn absolute top-3 right-3 text-xs px-2 py-1 bg-gray-600 hover:bg-gray-700 text-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity';
        copyBtn.title = 'Copy code';
        copyBtn.innerHTML = '<i class="fas fa-copy mr-1"></i> Copy';
        copyBtn.onclick = handleCopyCodeClick; // Use named handler
        wrapper.appendChild(copyBtn);

        // Save Button
        const saveBtn = document.createElement('button');
        // Position left of copy button
        saveBtn.className = 'save-snippet-btn absolute top-3 right-[4.5rem] text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity';
        saveBtn.title = 'Save Snippet to Memory Bank';
        saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Save';
        saveBtn.dataset.language = language;
        saveBtn.onclick = handleSaveSnippetClick; // Use named handler
        wrapper.appendChild(saveBtn);
    });
}

/** Sets up follow-up suggestions UI. */
function setupFollowUpSuggestions(resultCard, followUpText) {
    const suggestionsContainer = resultCard.querySelector('.follow-up-suggestions-container');
    const suggestionsList = suggestionsContainer?.querySelector('.suggestions-list');

    if (!suggestionsContainer || !suggestionsList || typeof followUpText !== 'string' || !followUpText.trim()) {
        if (suggestionsContainer) suggestionsContainer.style.display = 'none';
        return;
    }

    suggestionsList.innerHTML = ''; // Clear previous
    const suggestions = followUpText.split('\n').filter(line => line.trim() !== '');
    let suggestionsAdded = 0;

    suggestions.forEach(suggestionText => {
        const cleanedText = suggestionText.replace(/^\d+\.?\s*/, '').replace(/^-+\s*/, '').trim();
        if (cleanedText) {
            const suggestionButton = document.createElement('button');
            suggestionButton.className = 'suggestion-link';
            suggestionButton.textContent = cleanedText;
            suggestionButton.onclick = () => submitFollowUp(cleanedText);
            suggestionsList.appendChild(suggestionButton);
            suggestionsAdded++;
        }
    });

    suggestionsContainer.style.display = suggestionsAdded > 0 ? 'block' : 'none';
    if (suggestionsAdded > 0) {
        if (suggestionCardsContainer && !suggestionCardsContainer.classList.contains('hidden')) {
            suggestionCardsContainer.classList.add('hidden');
        }
    }
}

/**
 * Populates the sidebar lists (Documents, Images, Videos, Audios).
 * @param {object} contextData - The context data object from the API.
 */
function updateSidebarLists(contextData) {
    const fileTypes = ['documents', 'images', 'videos', 'audios'];

    // Helper function to show loading state
    const showLoadingState = (listElement, fileType) => {
        if (listElement) {
            // Determine class based on grid or list
            const isGrid = fileType === 'images' || fileType === 'videos';
            const gridClass = isGrid ? "col-span-full" : "";
            const loadingClass = `text-xs text-gray-400 italic px-2 py-1 text-center ${gridClass}`.trim();
            listElement.innerHTML = `<p class="${loadingClass}">Loading ${fileType}...</p>`;
        }
    };

    // Show loading state for all lists initially
    fileTypes.forEach(fileType => {
        const listElement = document.getElementById(`${fileType}-list`);
        showLoadingState(listElement, fileType);
    });

    // Use setTimeout to allow the loading state to render before processing
    setTimeout(() => {
    fileTypes.forEach(fileType => {
        const listElement = document.getElementById(`${fileType}-list`);
        const countElement = document.getElementById(`${fileType}-count`);
        const files = contextData[fileType] || [];

        if (listElement) {
                listElement.innerHTML = ''; // Clear loading state/previous items
            if (files.length > 0) {
                const isGrid = fileType === 'images' || fileType === 'videos';
                files.forEach(file => {
                    listElement.appendChild(createFileItemElement(file, fileType, isGrid));
                });
            } else {
                const isGrid = fileType === 'images' || fileType === 'videos';
                    // --- MODIFIED: Add Icon and Centering for Empty State --- //
                    let iconClass = 'fa-file-alt'; // Default
                    if (fileType === 'images') iconClass = 'fa-image';
                    else if (fileType === 'videos') iconClass = 'fa-video';
                    else if (fileType === 'audios') iconClass = 'fa-volume-up';

                    const gridClass = isGrid ? "col-span-full" : ""; // Keep grid span if needed
                    const emptyStateHtml = `
                        <div class="sidebar-empty-state ${gridClass}">
                            <i class="fas ${iconClass} sidebar-empty-icon"></i>
                            <p class="sidebar-empty-text">No ${fileType} added.</p>
                        </div>
                    `;
                    listElement.innerHTML = emptyStateHtml;
                    // --- END MODIFIED --- //
            }
        }
        if (countElement) {
            countElement.textContent = `(${files.length})`; // Wrap count in parentheses
        }
    });
    // Apply search filter after updating lists
    filterSidebarFiles();
    }, 0); // Timeout 0 ms ensures it runs after current execution stack
}

/**
 * Creates a DOM element for a single file item in the sidebar.
 * @param {object} file - File object containing name, uuid, thumbnail (optional).
 * @param {string} fileType - Type of file ('documents', 'images', etc.).
 * @param {boolean} isGrid - Whether to display as a grid item.
 * @returns {HTMLElement} - The created list item or grid div element.
 */
function createFileItemElement(file, fileType, isGrid) {
    const fileUuid = file.uuid || `missing-uuid-${Math.random()}`;
    const fileName = file.name || 'Unnamed File';
    const displayFileName = fileName.length > MAX_FILENAME_LENGTH
        ? fileName.substring(0, MAX_FILENAME_LENGTH) + '...'
        : fileName;

    const element = document.createElement(isGrid ? 'div' : 'li');
    element.dataset.fileUuid = fileUuid;
    element.dataset.filename = fileName.toLowerCase(); // Store full lowercase name for searching

    // Delete button HTML - relies on CSS for positioning now
    const deleteBtnHtml = `
        <button
            class="sidebar-file-delete-btn"
            data-uuid="${fileUuid}"
            data-filetype="${fileType}"
            data-filename="${escapeHtml(fileName)}"
            title="Delete ${escapeHtml(fileName)}">
            <i class="fas fa-times-circle"></i>
        </button>`;

    if (isGrid) {
        element.className = 'sidebar-grid-item group'; // Ensure position:relative is handled by CSS if needed
        const thumbnailUrl = file.thumbnail || '/static/image/placeholder.png';
        element.innerHTML = `
            <img src="${thumbnailUrl}" alt="${escapeHtml(fileName)}" class="object-cover w-full h-full" loading="lazy">
            <div class="filename-overlay group-hover:opacity-100" title="${escapeHtml(fileName)}">${escapeHtml(displayFileName)}</div>
            ${deleteBtnHtml} <!-- Delete button inside grid item -->
        `;
    } else {
        // Removed justify-between from class list
        element.className = 'sidebar-text-item group'; // Assumes CSS added position:relative
        const iconClass = fileType === 'documents' ? 'fa-file-alt' : 'fa-volume-up';
        // Removed mr-2 from tooltip container span
        element.innerHTML = `
            <span class="tooltip-container relative flex-grow min-w-0">
                <span class="flex items-center overflow-hidden">
                 <i class="fas ${iconClass} text-gray-400 w-4 text-center mr-2 flex-shrink-0"></i>
                    <span class="truncate text-sm">${escapeHtml(displayFileName)}</span>
             </span>
                <span class="custom-tooltip">${escapeHtml(fileName)}</span>
             </span>
            ${deleteBtnHtml} <!-- Delete button inside list item -->
        `;
    }
    return element;
}

/**
 * Updates the prompt textareas in the Agent Settings tab.
 * @param {string} initialPrompt - The initial system prompt text.
 * @param {string} finalPrompt - The final system prompt text.
 */
function updatePromptsUI(initialPrompt, finalPrompt) {
    // Remove previous debugging logs

    if (initialPromptInput) {
        initialPromptInput.value = initialPrompt || '';
        // Trigger input event after setting value
        initialPromptInput.dispatchEvent(new Event('input'));
        if (initialPromptLoadingDiv) initialPromptLoadingDiv.classList.add('hidden');
    } else {
        console.warn("Initial prompt input element not found.");
    }
    if (finalPromptInput) {
        finalPromptInput.value = finalPrompt || '';
        // Trigger input event after setting value
        finalPromptInput.dispatchEvent(new Event('input'));
        if (finalPromptLoadingDiv) finalPromptLoadingDiv.classList.add('hidden');
    } else {
        console.warn("Final prompt input element not found.");
    }
}

/**
 * Updates the LLM parameter input fields.
 * @param {object} params - Object containing parameter values.
 */
function updateParameterInputs(params) {
    if (!params) {
        console.warn("No parameters provided to updateParameterInputs");
        return;
    }
    // Use helper function to safely access potentially missing elements
    const setInputValue = (id, value) => {
        const input = document.getElementById(id);
        if (input) input.value = value ?? ''; // Use nullish coalescing for null/undefined
        else console.warn(`Input element with ID '${id}' not found.`);
    };

    setInputValue('param-max_tokens', params.max_tokens);
    setInputValue('param-temperature', params.temperature);
    setInputValue('param-top_k', params.top_k);
    setInputValue('param-top_p', params.top_p);
    // Join array back into comma-separated string
    setInputValue('param-stop_sequences', (params.stop_sequences || []).join(', '));
}

/**
 * Populates the tools dropdown menu.
 * @param {Array<object>} tools - Array of tool objects { name, description }.
 */
function updateToolsDropdown(tools) {
    if (!toolsDropdownContent) {
        console.warn("Tools dropdown content element not found.");
        return;
    }
    toolsDropdownContent.innerHTML = ''; // Clear existing

    // Ensure the container has scroll capability and max height
    toolsDropdownContent.classList.add('max-h-72', 'overflow-y-auto'); // Adjust max-h if needed

    if (tools && tools.length > 0) {
        // Add a header with the tool count
        const header = document.createElement('div');
        header.className = 'px-3 pt-3 pb-2 border-b border-gray-200'; // Added pt-3, pb-2
        header.innerHTML = `<h5 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Available Tools (${tools.length})</h5>`;
        toolsDropdownContent.appendChild(header);

        tools.forEach((tool, index) => {
            // Basic icon mapping (can be extended)
            let iconClass = 'fa-cogs'; // Default icon
            if (tool.name.includes('news') || tool.name.includes('search')) iconClass = 'fa-search'; // Combined search/news
            if (tool.name.includes('financial')) iconClass = 'fa-chart-line';
            // Add more specific icons if needed

            const toolItem = document.createElement('div');
            // Enhanced styling: padding, hover effect, layout
            toolItem.className = 'tool-item px-3 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors duration-150 ease-in-out';
            // Add top border to all items except the first one (which is below the header)
            if (index > 0) {
                toolItem.classList.add('border-t', 'border-gray-100');
            }

            // Icon container
            const iconContainer = document.createElement('div');
            // Removed pt-0.5 to rely on flexbox alignment
            iconContainer.className = 'flex-shrink-0 w-5';
            // Add relative positioning and nudge icon up slightly
            iconContainer.innerHTML = `<i class="fas ${iconClass} text-gray-400 text-sm relative top-[-1px]"></i>`;

            // Text content container
            const textContainer = document.createElement('div');
            textContainer.className = 'flex-grow';
            textContainer.innerHTML = `
                <div class="tool-name font-medium text-sm text-gray-800 mb-0.5">${escapeHtml(tool.name)}</div>
                <p class="tool-description text-xs text-gray-600 leading-snug">${escapeHtml(tool.description || 'No description available.')}</p>
            `;

            toolItem.appendChild(iconContainer);
            toolItem.appendChild(textContainer);
            toolsDropdownContent.appendChild(toolItem);
        });
    } else {
        // Keep the empty state message, but maybe add padding
        toolsDropdownContent.innerHTML = '<div class="p-4 text-center text-xs text-gray-500 italic">No tools available.</div>';
    }
}

/** Shows a generic loading indicator (e.g., for context info). */
function showLoadingIndicator(isLoading) {
    // Implement logic to show/hide a general loading indicator if needed
    console.log("Show Loading Indicator:", isLoading);
    // Example: document.getElementById('global-spinner').style.display = isLoading ? 'block' : 'none';
}

/** Shows an error message in a designated area. */
function showError(message) {
    console.error("UI Error:", message); // Log the error regardless
    if (domElements.errorDisplay) {
        domElements.errorDisplay.textContent = message;
        domElements.errorDisplay.classList.remove('hidden');
    } else {
        console.error("Error display element not found. Message:", message);
        // Optionally, use a fallback like alert()
        // alert(`Error: ${message}`);
    }
}

/** Hides the error message area. */
function hideError() {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.classList.add('hidden');
    }
}

/** Shows an informational message (e.g., using a toast or simple alert). */
function showInfoMessage(message) {
    // Simple alert for now, could be replaced with a toast notification library
    // alert(message);
    console.log('Info:', message); // Log to console instead of alert
}

/** Shows a general error message (e.g., using alert). */
function showErrorMessage(message) {
    alert(message); // Simple alert for now
}

/** Checks query input and updates submit button state. */
function checkInput() {
    if (!queryInput || !submitButton) return;
    const isEmpty = queryInput.value.trim() === '';
    submitButton.disabled = isEmpty || requestInProgress;
    if (submitButton.disabled) {
        submitButton.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        submitButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

/** Auto-resizes the query textarea based on content. */
function autoResizeTextarea(event) {
    const textarea = event.target;
    textarea.style.height = 'auto';
    // Set min-height based on initial rows (approx calculation)
    const minHeight = (textarea.rows || 2) * 24; // Assuming ~24px per row
    textarea.style.height = `${Math.max(minHeight, textarea.scrollHeight)}px`;
}

/** Toggles the visibility of a sidebar section. */
function toggleSection(contentId) {
    const contentElement = document.getElementById(contentId);
    const iconElement = document.getElementById(`${contentId}-icon`);
    if (contentElement) {
        const isHidden = contentElement.classList.toggle('hidden');
        if (iconElement) {
            iconElement.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    }
}

// --- Event Listener Setup --- //
function setupEventListeners() {
    console.log("Setting up event listeners.");

    // Query Form Submission
    if (queryForm) {
        queryForm.addEventListener('submit', handleQuerySubmit);
    }

    // Query Input Handling (Enable/Disable Button, Resize, Enter Key)
    if (queryInput) {
        queryInput.addEventListener('input', checkInput);
        queryInput.addEventListener('input', autoResizeTextarea);
        queryInput.addEventListener('keydown', handleQueryInputKeydown);
        checkInput(); // Initial check
        autoResizeTextarea({ target: queryInput }); // Initial resize
    }

    // Mode Toggle Switch
    if (modeToggle) {
        modeToggle.addEventListener('change', updateUIMode);
    }

    // Sidebar Section Toggles (delegated)
    const sidebar = document.querySelector('aside.sidebar');
    if (sidebar) {
        sidebar.addEventListener('click', (event) => {
            // Look for the toggle button using the new class
            const toggleButton = event.target.closest('.sidebar-toggle-button');
            if (toggleButton) {
                const contentId = toggleButton.dataset.targetId; // Get ID from data attribute
                if (contentId) {
                    // Check if the click was on the delete-all button within the header
                    const deleteAllBtn = event.target.closest('button[onclick^="handleDeleteAllFiles"]');
                    if (!deleteAllBtn) { // Only toggle if not clicking the delete-all button
                        toggleSection(contentId);
                    }
                }
            }

            // Handle sidebar delete-all buttons (NEW: Delegation)
            const deleteAllBtn = event.target.closest('.sidebar-delete-all-btn');
            if (deleteAllBtn) {
                event.stopPropagation(); // Prevent section toggle
                const fileType = deleteAllBtn.dataset.filetype;
                if (fileType) {
                    if (typeof handleDeleteAllFiles === 'function') {
                        handleDeleteAllFiles(fileType);
                    } else {
                        console.error('handleDeleteAllFiles function not found.');
                    }
                } else {
                     console.error('Could not extract fileType from deleteAllFiles button.');
                }
            }

            // Handle individual file delete buttons (delegation)
            const deleteFileBtn = event.target.closest('.sidebar-file-delete-btn');
            if (deleteFileBtn) {
                 event.stopPropagation(); // Prevent section toggle or other actions
                 const uuid = deleteFileBtn.dataset.uuid;
                 const fileType = deleteFileBtn.dataset.filetype;
                 const fileName = deleteFileBtn.dataset.filename || 'this file'; // Get filename for confirmation
                 if (uuid && fileType) {
                    // Call the confirmation and deletion function (ensure it's defined)
                     if (typeof confirmAndDeleteFile === 'function') {
                        confirmAndDeleteFile(uuid, fileType, fileName);
                     } else {
                        console.error('confirmAndDeleteFile function not found.');
                     }
                 } else {
                    console.error('Missing data-uuid or data-filetype on delete button.');
                 }
            }
        });
    }

    // NEW: Custom Persona Dropdown Listeners
    if (personaSelectorButton && personaSelectorDropdown) {
        // Toggle dropdown visibility
        personaSelectorButton.addEventListener('click', (event) => {
            event.stopPropagation();
            const isHidden = personaSelectorDropdown.classList.toggle('hidden');
            personaSelectorButton.setAttribute('aria-expanded', !isHidden);
        });

        // Handle clicks inside the dropdown menu
        personaSelectorDropdown.addEventListener('click', (event) => {
            const targetItem = event.target.closest('a[role="menuitem"]');
            if (targetItem) {
                const selectedName = targetItem.dataset.personaName || ''; // Get name from data attribute
                handlePersonaSelection(selectedName);
                personaSelectorDropdown.classList.add('hidden'); // Close dropdown
                personaSelectorButton.setAttribute('aria-expanded', 'false');
            }
        });

        // Close dropdown if clicking outside
        document.addEventListener('click', (event) => {
            if (!personaSelectorButton.contains(event.target) && !personaSelectorDropdown.contains(event.target)) {
                personaSelectorDropdown.classList.add('hidden');
                personaSelectorButton.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Suggestion Cards
    if (suggestionCardsContainer) {
        suggestionCardsContainer.addEventListener('click', handleSuggestionCardClick);
    }

    // Tools Dropdown Toggle
    if (toolsDropdownButton) {
        toolsDropdownButton.addEventListener('click', toggleToolsDropdown);
        // Close dropdown if clicking outside
        document.addEventListener('click', handleClickOutsideToolsDropdown);
    }

    // --- NEW: User Menu Dropdown --- //
    if (userMenuButton && userMenuDropdown) {
        userMenuButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent the document click listener from closing it immediately
            userMenuDropdown.classList.toggle('hidden');
            // Optional: Add ARIA attribute toggle
            const isExpanded = userMenuButton.getAttribute('aria-expanded') === 'true';
            userMenuButton.setAttribute('aria-expanded', !isExpanded);
        });

        // Close dropdown if clicking outside
        document.addEventListener('click', (event) => {
            if (!userMenuButton.contains(event.target) && !userMenuDropdown.contains(event.target)) {
                userMenuDropdown.classList.add('hidden');
                userMenuButton.setAttribute('aria-expanded', 'false');
            }
        });
    }
    // ------------------------------- //

    // --- File Upload --- //
    const uploadBox = uploadForm?.querySelector('div[class*="border-dashed"]');
    if (uploadBox && fileInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadBox.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false); // Prevent browser default drag/drop
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            uploadBox.addEventListener(eventName, () => uploadBox.classList.add('border-gray-500', 'bg-gray-50'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            uploadBox.addEventListener(eventName, () => uploadBox.classList.remove('border-gray-500', 'bg-gray-50'), false);
        });
        uploadBox.addEventListener('drop', handleFileDrop, false);
        fileInput.addEventListener('change', handleFileSelect);
    }
    if (urlSubmitButton) {
        urlSubmitButton.addEventListener('click', handleUrlSubmit);
    }

    // --- Sidebar Search --- //
    if (sidebarSearchInput) {
        sidebarSearchInput.addEventListener('input', debounce(filterSidebarFiles, 250));
    }

    // --- History Search & Pagination --- //
    if (historySearchInput) {
        // Initialization happens in initializeChatHistoryPagination
    }

    // --- Image History Search & Pagination --- //
    if (imageHistorySearchInput) {
        imageHistorySearchInput.addEventListener('input', debounce(handleImageHistorySearch, 300));
    }

    // --- Memory Bank --- //
    if (addMemoryForm) {
        addMemoryForm.addEventListener('submit', handleAddMemorySubmit);
        memoryTypeRadios.forEach(radio => radio.addEventListener('change', toggleMemoryLanguageInput));
        toggleMemoryLanguageInput(); // Initial check
    }
    if (memorySearchInput) {
        memorySearchInput.addEventListener('input', debounce(handleMemorySearch, 300));
    }
    // Event delegation for memory item deletion
    if (memoryDisplayArea) {
        memoryDisplayArea.addEventListener('click', handleMemoryAreaClick);
    }

    // --- Results Area Event Delegation (Copy, Save, Inline Save) --- //
    if (resultsDiv) {
        resultsDiv.addEventListener('click', handleResultsAreaClick);
        // Add listeners for inline saving mouse events
        resultsDiv.addEventListener('mouseup', handleInlineSaveMouseup);
        resultsDiv.addEventListener('mousedown', handleInlineSaveMousedown);
    }

    // --- Scroll to Top Button --- //
    if (scrollToTopBtn) {
        window.addEventListener('scroll', handleScroll);
        scrollToTopBtn.addEventListener('click', scrollToTop);
    }

    // --- MODIFIED: Persona Modal Listener Logging --- //
    if (managePersonasBtn) {
        console.log("Attaching click listener to Cog button (#manage-personas-btn)");
        managePersonasBtn.addEventListener('click', () => {
            console.log("Cog button (#manage-personas-btn) clicked!");
            openPersonaModal();
        });
    } else {
        console.log("Cog button (#manage-personas-btn) not found.");
    }
    // --- END MODIFIED --- //

    if (personaModalCloseBtn) {
        personaModalCloseBtn.addEventListener('click', closePersonaModal);
    }

    // NEW: Delegated listener for delete buttons in the modal list
    if (customPersonasDiv) {
        customPersonasDiv.addEventListener('click', handleDeletePersonaClick);
    }

    // NEW: Save New Persona Button
    if (saveNewPersonaBtn) {
        saveNewPersonaBtn.addEventListener('click', handleSaveNewPersona);
    }

    // Make sure the persona modal listeners are still set up correctly
    if (managePersonasBtn) {
        // --- ADDED LOG --- //
        console.log("DEBUG: Attaching click listener to managePersonasBtn");
        managePersonasBtn.addEventListener('click', openPersonaModal);
    } else {
        console.warn("Manage personas button not found, listener not attached.");
    }

    // --- Persona Modal Listeners --- //
    if (managePersonasBtn) {
        console.log("DEBUG: Attaching click listener to managePersonasBtn");
        managePersonasBtn.addEventListener('click', openPersonaModal);
    }
    if (personaModalCloseBtn) {
        personaModalCloseBtn.addEventListener('click', closePersonaModal);
    }
    // Add listener for clicking outside the modal content
    if (personaModal) {
        personaModal.addEventListener('click', (event) => {
            // Check if the click target is the overlay itself
            if (event.target === personaModal) {
                closePersonaModal();
            }
        });
    }
    if (customPersonasDiv) {
        customPersonasDiv.addEventListener('click', handleDeletePersonaClick);
    }
    if (createPersonaForm) {
        createPersonaForm.addEventListener('submit', handleSaveNewPersona);
    }

    // --- ADDED: Global Listener for Escape Key --- //
    document.addEventListener('keydown', (event) => {
        // Check if the persona modal is visible and Escape key is pressed
        if (personaModal && !personaModal.classList.contains('hidden') && event.key === 'Escape') {
            closePersonaModal();
        }
        // Add similar checks for other modals if needed
        if (historyModal && !historyModal.classList.contains('hidden') && event.key === 'Escape') {
            closeHistoryModal();
        }
        if (imageDetailModal && !imageDetailModal.classList.contains('hidden') && event.key === 'Escape') {
            closeImageModal();
        }
    });
}

// --- Event Handlers --- //

function handleQuerySubmit(event) {
    event.preventDefault();
    const query = queryInput.value.trim();
    if (!query || requestInProgress || submitButton.disabled) {
        return;
    }

    // --- ADDED: Clear input immediately on submit --- //
    if (typeof clearQueryInput === 'function') {
        clearQueryInput();
    }
    // --- END ADDED --- //

    setLoading(true, currentMode);

    // --- MODIFIED: Get selected persona ID from global variable --- //
    const selectedPersonaId = currentPersonaId; // Use the global variable
    // --- END MODIFIED --- //

    // Hide suggestions
    if (suggestionCardsContainer) suggestionCardsContainer.classList.add('hidden');

    // Prepare form data including persona_id
    const formData = new URLSearchParams();
    formData.append('query', query);
    if (selectedPersonaId) { // Only append if a persona is selected
        formData.append('persona_id', selectedPersonaId);
        console.log("Submitting query with Persona ID:", selectedPersonaId); // Log selected ID
    } else {
        console.log("Submitting query with Default settings (no persona ID).");
    }

    // Call API function based on mode
    if (currentMode === 'image') {
        if (typeof sendImageGenerationRequest === 'function') sendImageGenerationRequest(query);
        else console.error("sendImageGenerationRequest not found");
    } else {
        // Pass formData directly (contains query and optional persona_id)
        if (typeof sendQuery === 'function') sendQuery(formData);
        else console.error("sendQuery not found");
    }
}

function handleQueryInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!submitButton.disabled) {
            queryForm.requestSubmit();
        }
    }
}

function handleSuggestionCardClick(event) {
    const card = event.target.closest('.suggestion-card');
    if (!card) return;
    const query = card.dataset.query;
    if (queryInput && query) {
        queryInput.value = query;
        checkInput(); // Update button state
        autoResizeTextarea({ target: queryInput }); // Resize
        queryInput.focus();
        // Optional: automatically submit
        if (!submitButton.disabled) queryForm.requestSubmit(); // Uncomment this line
    }
}

function toggleToolsDropdown(event) {
    event.stopPropagation(); // Prevent click from closing immediately
    if (toolsDropdownContent) {
        toolsDropdownContent.classList.toggle('hidden');
    }
}

function handleClickOutsideToolsDropdown(event) {
    if (toolsDropdownButton && toolsDropdownContent &&
        !toolsDropdownButton.contains(event.target) &&
        !toolsDropdownContent.contains(event.target)) {
        toolsDropdownContent.classList.add('hidden');
    }
}

// --- File Handling Event Handlers --- //
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleFileDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    handleFiles(e.target.files);
}

/**
 * Handles file selection via input or drop.
 * @param {FileList} files - The list of files to upload.
 */
async function handleFiles(files) {
    const statusDiv = document.getElementById('upload-status');
    const nameSpan = document.getElementById('file-name');
    const errorMsgP = document.getElementById('upload-error-message');
    const urlStatusDiv = document.getElementById('url-status'); // Get URL status div
    // Get other relevant elements needed for initial state setting
    const spinnerIcon = document.getElementById('upload-progress-spinner');
    const completeIcon = document.getElementById('upload-complete-icon');
    const errorIcon = document.getElementById('upload-error-icon');

    if (!files || files.length === 0) {
        return;
    }

    // --- MODIFIED: Always show initial status --- //
    // Clear previous status/errors
    if (statusDiv) statusDiv.classList.remove('hidden'); // Make visible
    if (errorMsgP) errorMsgP.textContent = '';
    if (urlStatusDiv) urlStatusDiv.textContent = ''; // Also clear URL status

    // Set initial display state (before loop)
    if (nameSpan && spinnerIcon && completeIcon && errorIcon) {
        if (files.length === 1) {
            // Show first filename truncated immediately
            const fileName = files[0].name;
            const TRUNCATE_LENGTH = 20;
            const truncatedName = fileName.length > TRUNCATE_LENGTH
                ? fileName.substring(0, TRUNCATE_LENGTH - 3) + '...' + fileName.substring(fileName.lastIndexOf('.') || fileName.length)
                : fileName;
            nameSpan.textContent = `Preparing: ${truncatedName}`; // Initial state text
            nameSpan.title = fileName;
        } else {
            nameSpan.textContent = `Preparing ${files.length} files...`;
            nameSpan.title = '';
        }
        // Ensure icons/spinner are hidden initially before uploadFileAPI takes over
        spinnerIcon.classList.add('hidden');
        completeIcon.classList.add('hidden');
        errorIcon.classList.add('hidden');
    } else {
        console.error("Could not set initial upload status UI elements.")
    }
    // --- END MODIFIED SECTION --- //

    // --- ADDED: File Size Limit --- //
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
    let hasOversizedFile = false;
    // --- END ADDED --- //

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // --- ADDED: Check file size --- //
        if (file.size > MAX_FILE_SIZE) {
            console.warn(`File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max size: ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB.`);
            if (typeof updateUploadProgress === 'function') {
                // Show error specifically for this oversized file
                updateUploadProgress(
                    file.name,
                    false, // not processing
                    true,  // is error
                    `Exceeds size limit (${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB).`, // Use 100 MB in message
                    i + 1,
                    files.length
                );
            }
            hasOversizedFile = true;
            continue; // Skip to the next file
        }
        // --- END ADDED --- //

        try {
            // Pass index (1-based) and total count to API
            const result = await uploadFileAPI(file, i + 1, files.length);
            if (result && result.success) {
                // Context refresh is now handled after the loop
            } else {
                // Error handled within uploadFileAPI
                // Optionally break loop on first error:
                // break;
            }
        } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
            // Error UI update is handled by uploadFileAPI
            // Optionally break loop on first error:
            // break;
        }
         // Small delay only if processing multiple files to allow UI updates between them
         if (files.length > 1 && i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
         }
    }
    // Consider hiding the status bar after all files complete/fail
    // (Needs careful logic if errors occurred)
    // setTimeout(() => {
    //     if (statusDiv && !errorMsgP.textContent) { // Hide only if no persistent error
    //          statusDiv.classList.add('hidden');
    //     }
    // }, 5000); // Example: Hide after 5 seconds

    // --- ADDED: Refresh context ONCE after loop and hide status --- //
    console.log("Finished processing all selected files. Refreshing context...");
    if (typeof loadContextInfo === 'function') {
        // Use await to ensure refresh completes before potentially hiding status
        try {
            await loadContextInfo();
            console.log("Context refresh complete after file processing.");
            // Hide status only if no persistent error message is shown
            // AND no file was skipped due to size limit (leave message visible in that case)
            if (statusDiv && errorMsgP && !errorMsgP.textContent && !hasOversizedFile) {
                 // Add a slight delay before hiding to allow user to see final state briefly
                 setTimeout(() => {
                    if (!errorMsgP.textContent && !hasOversizedFile) { // Double check error/oversize didn't appear
                        statusDiv.classList.add('hidden');
                    }
                 }, 1500); // Hide after 1.5s
            }
        } catch (refreshError) {
            console.error("Error during final context refresh:", refreshError);
            // Optionally leave the status visible, or show a specific refresh error
            if (errorMsgP) errorMsgP.textContent = "Error refreshing file list after uploads.";
            if (statusDiv) statusDiv.classList.remove('hidden'); // Ensure it's visible if error occurs
        }
    } else {
        console.error("loadContextInfo function not found for final refresh.");
        // Hide status anyway after a delay if refresh function missing
        setTimeout(() => {
            if (statusDiv) statusDiv.classList.add('hidden');
        }, 2000);
    }
    // --- END ADDED SECTION --- //
}

async function handleUrlSubmit() {
    if (!urlInput || !urlStatusDiv || !urlSubmitButton) return;
    const url = urlInput.value.trim();
    if (!url) {
        urlStatusDiv.textContent = 'Please enter a URL.';
        urlStatusDiv.className = 'mt-2 text-sm text-red-600';
        return;
    }

    urlStatusDiv.textContent = 'Adding URL...';
    urlStatusDiv.className = 'mt-2 text-sm text-gray-500 italic';
    urlSubmitButton.disabled = true;

    if (typeof addUrlAPI === 'function') {
        const result = await addUrlAPI(url);
        if (result) {
            urlStatusDiv.textContent = `Success: ${result.message}`; // Use message from API
            urlStatusDiv.className = 'mt-2 text-sm text-green-600';
            urlInput.value = ''; // Clear input
            if (typeof loadContextInfo === 'function') loadContextInfo(); // Refresh sidebar
        } else {
            // If addUrlAPI returns null, do nothing in the UI here.
            // Errors are logged to console by addUrlAPI if they persist.
        }
    }

    urlSubmitButton.disabled = false;
    // Clear status message after a few seconds
    setTimeout(() => { urlStatusDiv.textContent = ''; }, 4000);
}

// --- Sidebar Search --- //
function filterSidebarFiles() {
    if (!sidebarSearchInput) return;
    const searchTerm = sidebarSearchInput.value.toLowerCase().trim();
    const fileSections = ['documents', 'images', 'videos', 'audios'];

    fileSections.forEach(fileType => {
        const listElement = document.getElementById(`${fileType}-list`);
        if (!listElement) return;
        const items = listElement.querySelectorAll(fileType === 'images' || fileType === 'videos' ? '.sidebar-grid-item' : 'li.sidebar-text-item');
        let visibleCount = 0;
        items.forEach(item => {
            const filename = item.dataset.filename || '';
            const matches = filename.includes(searchTerm);
            item.style.display = matches ? '' : 'none';
            if (matches) visibleCount++;
        });
        // Optional: Show a message if no files match the filter in a section
        const noMatchMsgId = `${fileType}-no-match`;
        let noMatchMsg = listElement.querySelector(`#${noMatchMsgId}`);
        if (visibleCount === 0 && items.length > 0) {
            if (!noMatchMsg) {
                noMatchMsg = document.createElement('p');
                noMatchMsg.id = noMatchMsgId;
                noMatchMsg.className = 'text-xs text-gray-400 italic px-2 py-1';
                listElement.appendChild(noMatchMsg);
            }
            noMatchMsg.textContent = `No ${fileType} match "${escapeHtml(searchTerm)}".`;
            noMatchMsg.style.display = '';
        } else if (noMatchMsg) {
            noMatchMsg.style.display = 'none';
        }
    });
}

// --- Chat History Pagination & Search --- //

/**
 * Initializes the chat history table with data and sets up search.
 * @param {Array<object>} historyData - The initial workflow history data.
 */
function initializeChatHistoryPagination(historyData) {
    allWorkflowData = Array.isArray(historyData) ? historyData : [];
    rebuiltCurrentPage = 1; // Reset page
    console.log(`Initialized chat history pagination with ${allWorkflowData.length} entries.`);

    // Perform the initial table render using the loaded data (defaults to page 1)
    rebuiltUpdateTable(1);

    // Setup search listener (if not already done in main init)
    if (historySearchInput && !historySearchInput.hasAttribute('data-listener-set')) {
        historySearchInput.addEventListener('input', debounce(() => {
            console.log("History search triggered, updating table...");
            rebuiltUpdateTable(1); // Search always resets to page 1 and triggers update
        }, 300));
        historySearchInput.setAttribute('data-listener-set', 'true');
    }
}

/**
 * Handles page changes for the chat history table.
 * @param {number} newPage - The target page number.
 */
function rebuiltHandlePageChange(newPage) {
    // Just calls the update function with the new target page
    rebuiltUpdateTable(newPage);
}

// Main function to update the chat history table display
function rebuiltUpdateTable(page) {
    console.log(`--- rebuiltUpdateTable Start (Requesting Page: ${page}) ---`);
    const searchTermValue = historySearchInput ? historySearchInput.value.toLowerCase().trim() : '';
    console.log(`  Filtering with term: '${searchTermValue}'`);

    const filteredData = filterData(allWorkflowData, searchTermValue, ['prompt', 'answer']);
    console.log(`  Filtered data count: ${filteredData.length}`);

    const totalEntries = filteredData.length;
    const totalPages = Math.ceil(totalEntries / entriesPerPage) || 1;
    rebuiltCurrentPage = Math.max(1, Math.min(parseInt(page, 10) || 1, totalPages));
    const startIndex = (rebuiltCurrentPage - 1) * entriesPerPage;
    const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);
    const pageData = filteredData.slice(startIndex, endIndex);

    // Update UI Elements (Table, Info, Buttons, Page Numbers)
    updateHistoryTableDOM(pageData);
    updateHistoryPaginationInfo(startIndex, endIndex, totalEntries);
    updateHistoryPaginationControls(rebuiltCurrentPage, totalPages);
}

// Helper to update the history table's HTML
function updateHistoryTableDOM(pageData) {
    if (!workflowTableContainer) return;
    if (pageData.length > 0) {
        let tableHtml = '<table class="min-w-full divide-y divide-gray-200">';
        tableHtml += `
            <thead class="bg-gray-50">
                <tr>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prompt</th>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Answer</th>
                    <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
        `;
        pageData.forEach(entry => {
            // IMPORTANT: Use the precise timestamp string for actions
            const entryTimestamp = entry.timestamp; // Assume this is the precise string 'YYYY-MM-DD HH:MM:SS.ffffff'

            // --- MODIFIED: Shorten timestamp display --- //
            let displayTimestamp = 'N/A';
            if (entryTimestamp) {
                try {
                    const dateObj = new Date(entryTimestamp);
                    // Format as MM/DD/YYYY, HH:MM AM/PM
                    displayTimestamp = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' }) + ', ' +
                                       dateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                } catch (e) {
                    console.warn(`Could not format timestamp: ${entryTimestamp}`, e);
                    displayTimestamp = entryTimestamp; // Fallback to raw string if formatting fails
                }
            }
            // --- END MODIFIED --- //

            tableHtml += `
                <tr class="hover:bg-gray-50 cursor-pointer" onclick="openHistoryModal('${entryTimestamp}')">
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${displayTimestamp}</td>
                    <td class="px-4 py-3 text-sm text-gray-900"><div class="line-clamp-3">${escapeHtml(entry.prompt || '')}</div></td>
                    <td class="px-4 py-3 text-sm text-gray-900"><div class="line-clamp-3">${escapeHtml(entry.answer || '')}</div></td>
                    <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <button
                            onclick="event.stopPropagation(); handleDeleteHistoryEntry('${entryTimestamp}')"
                            class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 transition ease-in-out duration-150 history-delete-btn"
                            title="Delete this entry">
                            <i class="fas fa-trash-alt w-4 h-4"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tableHtml += '</tbody></table>';
        workflowTableContainer.innerHTML = tableHtml;
    } else {
        workflowTableContainer.innerHTML = '<p class="text-gray-500 text-sm italic p-4">No matching history data found</p>';
    }
}

// Helper to update pagination info text
function updateHistoryPaginationInfo(startIndex, endIndex, totalEntries) {
    const paginationInfo = document.getElementById('pagination-info');
    if (paginationInfo) {
        paginationInfo.innerHTML = `Showing ${totalEntries > 0 ? startIndex + 1 : 0}-${endIndex} of ${totalEntries} entries`;
    }
}

// Helper to update pagination controls (prev/next buttons, page numbers)
function updateHistoryPaginationControls(currentPage, totalPages) {
    const pageNumbersContainer = document.getElementById('page-numbers');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');

    if (!pageNumbersContainer || !prevButton || !nextButton) return;

    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => rebuiltHandlePageChange(currentPage - 1);
    nextButton.disabled = currentPage === totalPages || totalPages === 0;
    nextButton.onclick = () => rebuiltHandlePageChange(currentPage + 1);

    let pageNumbersHtml = '';
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4 && totalPages > 0) {
        startPage = Math.max(1, endPage - 4);
    }
    if (startPage > 1) {
        pageNumbersHtml += `<button type="button" class="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50" onclick="rebuiltHandlePageChange(1)">1</button>`;
        if (startPage > 2) pageNumbersHtml += `<span class="text-gray-500 px-2">...</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        if (i > 0) {
             pageNumbersHtml += `
                <button type="button" class="px-3 py-1 border border-gray-300 rounded-md text-sm ${i === currentPage ? 'bg-gray-100 border-gray-400 text-gray-800 font-semibold' : 'hover:bg-gray-50'}"
                        onclick="rebuiltHandlePageChange(${i})">${i}</button>
            `;
        }
    }
    if (endPage < totalPages) {
         if (endPage < totalPages - 1) pageNumbersHtml += `<span class="text-gray-500 px-2">...</span>`;
         pageNumbersHtml += `<button type="button" class="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50" onclick="rebuiltHandlePageChange(${totalPages})">${totalPages}</button>`;
    }
    pageNumbersContainer.innerHTML = pageNumbersHtml;
}

// --- Image History Pagination & Search --- //

/**
 * Initializes the image history grid and pagination.
 * @param {Array<object>} imageData - The initial image history data.
 */
function initializeImageHistory(imageData) {
    allImageHistoryData = Array.isArray(imageData) ? imageData : [];
    filteredImageHistoryData = [...allImageHistoryData]; // Start with all data filtered
    currentImageHistoryPage = 1;
    console.log(`Initialized image history with ${allImageHistoryData.length} entries.`);
    updateImageHistoryDisplay(); // Initial display
}

// Handles search input for image history
function handleImageHistorySearch() {
    if (!imageHistorySearchInput) return;
    const searchTerm = imageHistorySearchInput.value;
    filterImageHistory(searchTerm);
}

// Filters the global image history data based on prompt text
function filterImageHistory(searchTerm) {
    const lowerCaseSearchTerm = searchTerm.toLowerCase().trim();
    if (!lowerCaseSearchTerm) {
        filteredImageHistoryData = [...allImageHistoryData];
    } else {
        filteredImageHistoryData = allImageHistoryData.filter(entry => {
            const prompt = (entry.prompt || '').toLowerCase();
            return prompt.includes(lowerCaseSearchTerm);
        });
    }
    currentImageHistoryPage = 1; // Reset to page 1 after filtering
    updateImageHistoryDisplay();
}

// Updates the image history grid and pagination controls
function updateImageHistoryDisplay() {
    if (!imageHistoryContainer) return;

    const totalEntries = filteredImageHistoryData.length;
    const totalPages = Math.ceil(totalEntries / imageEntriesPerPage) || 1;
    // Clamp current page based on filtered results
    currentImageHistoryPage = Math.max(1, Math.min(currentImageHistoryPage, totalPages));

    const start = (currentImageHistoryPage - 1) * imageEntriesPerPage;
    const end = Math.min(start + imageEntriesPerPage, totalEntries);
    const pageData = filteredImageHistoryData.slice(start, end);

    // Update Grid
    updateImageHistoryGridDOM(pageData);

    // Update Pagination Controls
    const paginationContainerId = 'image-history-pagination-controls';
    const paginationHtml = createPaginationControls(currentImageHistoryPage, totalPages, 'handleImageHistoryPageChange', paginationContainerId);
    // Append or replace pagination controls within the container
    let paginationControlsElement = imageHistoryContainer.querySelector(`#${paginationContainerId}`);
    if (!paginationControlsElement) {
        paginationControlsElement = document.createElement('div');
        paginationControlsElement.id = paginationContainerId;
        imageHistoryContainer.appendChild(paginationControlsElement);
    }
    paginationControlsElement.innerHTML = paginationHtml;
}

// Helper to update the image history grid HTML
function updateImageHistoryGridDOM(pageData) {
    let gridElement = imageHistoryContainer.querySelector('.grid'); // Find existing grid
    if (!gridElement) {
        // If grid doesn't exist, create it and prepend (or append) to container
        gridElement = document.createElement('div');
        gridElement.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-4'; // Added mb-4
        imageHistoryContainer.prepend(gridElement); // Prepend grid before pagination
    }

    if (pageData.length > 0) {
        gridElement.innerHTML = pageData.map(entry => {
            if (!entry || !entry.timestamp || !entry.thumbnail_image || !entry.full_image) {
                console.warn('Skipping invalid image history entry:', entry);
                return '';
            }
            const originalTimestamp = entry.timestamp;
            // More robust timestamp formatting for display
            let displayTimestampStr = 'Invalid Date';
            try {
                displayTimestampStr = new Date(originalTimestamp).toLocaleString();
            } catch(e) { console.warn(`Could not format timestamp: ${originalTimestamp}`); }

            const encodedPrompt = escapeHtml(entry.prompt || '');
            // Pass necessary data to openImageModal
            const onclickHandler = `openImageModal('${entry.full_image}', '${entry.thumbnail_image}', '${encodedPrompt}', '${escapeHtml(displayTimestampStr)}', '${originalTimestamp}')`;

            return `
                <div class="image-history-item group relative overflow-hidden rounded-lg shadow-sm border border-gray-200 aspect-square cursor-pointer bg-gray-50" onclick="${onclickHandler}">
                    <img src="${entry.thumbnail_image}"
                         alt="${encodedPrompt}"
                         class="thumbnail-image object-cover w-full h-full transition-transform duration-300 group-hover:scale-110" loading="lazy">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-2 flex flex-col justify-end">
                        <p class="thumbnail-prompt text-xs font-medium text-white truncate leading-tight" title="${encodedPrompt}">${encodedPrompt}</p>
                        <p class="thumbnail-timestamp text-[10px] text-gray-300 mt-0.5">${escapeHtml(displayTimestampStr)}</p>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        gridElement.innerHTML = '<p class="text-gray-500 text-sm italic p-4 text-center col-span-full">No matching generated images found.</p>';
    }
}

// Handler for image history page changes (called by pagination buttons)
function handleImageHistoryPageChange(newPage) {
    currentImageHistoryPage = newPage;
    updateImageHistoryDisplay(); // Update display with the new page
}
// Make it global for inline onclick handlers
window.handleImageHistoryPageChange = handleImageHistoryPageChange;


// --- Image History Loading/Error State Management --- //
function showImageHistoryLoading(isLoading) {
    if (imageHistoryLoading) {
        imageHistoryLoading.classList.toggle('hidden', !isLoading);
    }
}

function showImageHistoryError(isError, message = '') {
    if (imageHistoryError) {
        imageHistoryError.textContent = message;
        imageHistoryError.classList.toggle('hidden', !isError);
    }
}

function clearImageHistoryContent() {
    if (imageHistoryContainer) {
        imageHistoryContainer.innerHTML = ''; // Clear grid and pagination
    }
}

// --- General Pagination Helper --- //
function createPaginationControls(currentPage, totalPages, handlerFunctionName, containerId) {
    if (totalPages <= 1) return '';

    let html = `<nav id="${containerId}" class="flex items-center justify-between border-t border-gray-200 px-4 sm:px-0 mt-6 pt-4" aria-label="Pagination">
                    <div class="flex-1 flex justify-between sm:justify-end">`;
    // Previous Button
    html += `<button type="button"
                    onclick="${handlerFunctionName}(${currentPage - 1})"
                    class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}"
                    ${currentPage === 1 ? 'disabled' : ''}>
                Previous
            </button>`;
    // Next Button
    html += `<button type="button"
                    onclick="${handlerFunctionName}(${currentPage + 1})"
                    class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}"
                    ${currentPage === totalPages ? 'disabled' : ''}>
                Next
            </button>`;
    html += `</div></nav>`;
    return html;
}


// --- Memory Bank UI --- //

// Load and display memory items
async function loadMemoryDisplay(searchTerm = '') {
    if (!memoryDisplayArea) return;

    // Show loading state
    memoryDisplayArea.innerHTML = `<div class="text-center py-6">
                                     <i class="fas fa-spinner fa-spin text-gray-400 text-xl"></i>
                                     <p class="text-sm text-gray-500 mt-2">Loading memories...</p>
                                   </div>`;

    if (typeof fetchMemoryItems === 'function') {
        const memoryData = await fetchMemoryItems(searchTerm);
        allMemoryData = memoryData; // Store potentially filtered data (or all if no term)
        updateMemoryDisplay(allMemoryData);
    } else {
         memoryDisplayArea.innerHTML = '<p class="text-red-500 italic p-4">Error: API function not loaded.</p>';
    }
}

// Update the DOM with memory items
function updateMemoryDisplay(memoryItems) {
    if (!memoryDisplayArea) return;
    memoryDisplayArea.innerHTML = ''; // Clear previous

    if (!memoryItems || memoryItems.length === 0) {
        memoryDisplayArea.innerHTML = '<p class="text-gray-500 text-sm italic p-4">Memory Bank is empty or no matches found.</p>';
        return;
    }

    memoryItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'memory-item mb-4 p-4 border border-gray-200 rounded-lg bg-white shadow-sm';
        const itemTimestamp = item.timestamp; // Assume this is the precise string
        const displayTimestamp = itemTimestamp ? new Date(itemTimestamp).toLocaleString() : 'N/A';

        // --- MODIFIED: Add Show More/Less for Context --- //
        const contextText = item.context_query || 'N/A';
        const CONTEXT_TRUNCATE_THRESHOLD = 150; // Adjust threshold as needed
        const isLongContext = contextText.length > CONTEXT_TRUNCATE_THRESHOLD;
        let contextDisplayHtml = ''; // Renamed variable
        const escapedContext = escapeHtml(contextText);

        if (isLongContext) {
            const truncatedContext = escapeHtml(contextText.substring(0, CONTEXT_TRUNCATE_THRESHOLD)) + '...';
            // Keep label outside, apply container to the text part only
            contextDisplayHtml = `
                <p class="text-xs text-gray-500 mb-1">Source/Context:</p>
                <div class="expandable-content-container text-xs text-gray-600"
                     data-full-text="${escapedContext}"
                     data-truncated-text="${truncatedContext}">
                    <p class="expandable-text">${truncatedContext}</p>
                    <button onclick="toggleShowMoreLess(this)" class="suggestion-link text-xs ml-1">Show More</button>
                </div>`;
        } else {
            contextDisplayHtml = `<p class="text-xs text-gray-500">Source/Context: ${escapedContext}</p>`;
        }
        // --- END MODIFIED --- //

        let contentHtml;
        if (item.type === 'code' && item.content) {
            const language = item.language || 'text';
            // Wrap in pre/code for highlighting and add wrapper for buttons
            contentHtml = `
                <div class="code-block-wrapper group relative mt-2">
                     <pre><code class="language-${escapeHtml(language)}">${escapeHtml(item.content)}</code></pre>
                     <button
                         class="copy-code-btn absolute top-3 right-3 text-xs px-2 py-1 bg-gray-600 hover:bg-gray-700 text-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                         title="Copy code" data-memory-item="true" data-action="copy">
                         <i class="fas fa-copy mr-1"></i> Copy
                     </button>
                     </div>`;
        } else if (item.content) {
            // Use marked for text content, assuming it might contain markdown
            contentHtml = `<div class="prose prose-sm max-w-none text-gray-800 mt-2">${marked.parse(item.content)}</div>`;
        } else {
             contentHtml = '<p class="text-gray-500 italic mt-2">(Empty content)</p>';
        }

        itemDiv.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    ${contextDisplayHtml}
                    <p class="text-xs text-gray-400 mt-1">Added: ${displayTimestamp}</p>
                 </div>
                <button class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-100 focus:outline-none focus:ring-1 focus:ring-red-400 memory-delete-btn"
                        title="Delete this memory item" data-timestamp="${itemTimestamp}">
                     <i class="fas fa-trash-alt w-4 h-4"></i>
                 </button>
             </div>
            ${contentHtml}
        `;
        memoryDisplayArea.appendChild(itemDiv);

        // Apply highlighting AFTER appending
        if (item.type === 'code') {
            const codeElement = itemDiv.querySelector('code');
            if (codeElement) {
                hljs.highlightElement(codeElement);
            }
        }
    });
}

// Toggle language input based on memory type selection
function toggleMemoryLanguageInput() {
    const selectedType = document.querySelector('input[name="memory-type"]:checked')?.value;
    if (memoryLanguageContainer) {
        memoryLanguageContainer.style.display = selectedType === 'code' ? 'block' : 'none';
    }
}

// Handle submission of the manual memory add form
async function handleAddMemorySubmit(event) {
    event.preventDefault();
    if (!addMemoryButton || !addMemoryStatus || !memoryContentInput) return;

    const content = memoryContentInput.value.trim();
    const type = document.querySelector('input[name="memory-type"]:checked')?.value;
    const language = (type === 'code') ? memoryLanguageInput?.value.trim() : null;
    const contextQuery = document.getElementById('memory-context-input')?.value.trim() || 'Manual Entry';

    if (!content || !type) {
        addMemoryStatus.textContent = 'Content and Type are required.';
        addMemoryStatus.className = 'text-sm italic text-red-600';
        return;
    }

    addMemoryButton.disabled = true;
    addMemoryButton.textContent = 'Saving...';
    addMemoryStatus.textContent = '';
    addMemoryStatus.className = 'text-sm italic text-gray-500';

    const memoryData = { content, type, language, context_query: contextQuery };

    if (typeof saveMemoryAPI === 'function') {
        const success = await saveMemoryAPI(memoryData);
        if (success) {
            addMemoryStatus.textContent = 'Memory saved!';
            addMemoryStatus.className = 'text-sm italic text-green-600';
            addMemoryForm.reset(); // Clear the form
            toggleMemoryLanguageInput(); // Reset language field visibility
            loadMemoryDisplay(); // Refresh the display
            setTimeout(() => { addMemoryStatus.textContent = ''; }, 3000);
        } else {
            // Error message handled by saveMemoryAPI calling showErrorMessage
            addMemoryStatus.textContent = 'Error saving. See alert/console.';
            addMemoryStatus.className = 'text-sm italic text-red-600';
        }
    }

    addMemoryButton.disabled = false;
    addMemoryButton.textContent = 'Save to Memory Bank';
}

// Handle search input for memory bank
function handleMemorySearch() {
    if (!memorySearchInput) return;
    const searchTerm = memorySearchInput.value;
    // Call loadMemoryDisplay, which now handles calling the API with the search term
    loadMemoryDisplay(searchTerm);
}

// Handle clicks within the memory display area (for delete/copy buttons)
async function handleMemoryAreaClick(event) {
    const deleteButton = event.target.closest('.memory-delete-btn');
    const copyButton = event.target.closest('.copy-code-btn[data-memory-item="true"]');

    if (deleteButton) {
        const timestamp = deleteButton.dataset.timestamp;
        if (timestamp) {
            await handleDeleteMemory(timestamp);
        }
    }
     else if (copyButton) {
         handleCopyCodeClick(event); // Reuse existing copy logic
     }
}

// Confirm and delete a memory item
async function handleDeleteMemory(timestamp) {
    if (!timestamp) return;
    // REMOVED: Confirmation check
    console.log(`Attempting to delete memory item: ${timestamp}`);

    if (typeof deleteMemoryAPI === 'function') {
        const success = await deleteMemoryAPI(timestamp);
        if (success) {
            showInfoMessage('Memory item deleted.');
            loadMemoryDisplay(memorySearchInput?.value || ''); // Refresh display with current search term
        } else {
            // Error message handled by deleteMemoryAPI calling showErrorMessage
            console.error(`Failed to delete memory item: ${timestamp}`);
        }
    } else {
        console.error("deleteMemoryAPI function not found.");
        showErrorMessage("Could not perform delete memory action.");
    }
}

// --- Result Area Event Handling --- //

function handleResultsAreaClick(event) {
    const copyBtn = event.target.closest('.copy-code-btn');
    const saveBtn = event.target.closest('.save-snippet-btn');
    const copyAnswerBtn = event.target.closest('button[onclick^="copyAnswerText"]');
    const saveAnswerBtn = event.target.closest('button[onclick^="handleInlineSaveClick"]');

    if (copyBtn && !copyBtn.hasAttribute('data-memory-item')) {
        handleCopyCodeClick(event);
    } else if (saveBtn) {
        handleSaveSnippetClick(event);
    } else if (copyAnswerBtn) {
         copyAnswerText(copyAnswerBtn);
     } else if (saveAnswerBtn) {
         // This click is handled by mouseup now to get selection
         // We might need mousedown to store context? Let's see.
         console.log('Save answer button clicked (handled by mouseup).');
     }
}

// Copy code from a code block
function handleCopyCodeClick(event) {
    const button = event.target.closest('button');
    const wrapper = button.closest('.code-block-wrapper');
    const preElement = wrapper?.querySelector('pre');
    const codeElement = preElement?.querySelector('code');

    if (codeElement) {
        navigator.clipboard.writeText(codeElement.innerText).then(() => {
            const originalHtml = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check mr-1"></i> Copied!';
            button.disabled = true;
            setTimeout(() => {
                button.innerHTML = originalHtml;
                button.disabled = false;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy code:', err);
            showErrorMessage('Failed to copy code to clipboard.');
        });
    }
}

// Save a code snippet to the memory bank
async function handleSaveSnippetClick(event) {
    const button = event.target.closest('button');
    const wrapper = button.closest('.code-block-wrapper');
    const preElement = wrapper?.querySelector('pre');
    const codeElement = preElement?.querySelector('code');
    const resultCard = button.closest('.result-card');
    const originalQuery = resultCard?.dataset.originalQuery || 'Code Snippet';

    if (codeElement) {
        const content = codeElement.innerText;
        const language = button.dataset.language || 'text';
        const memoryData = {
            content: content,
            type: 'code',
            language: language,
            context_query: `Code snippet from query: "${originalQuery}"`
        };

        button.disabled = true;
        const originalHtml = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';

        if (typeof saveMemoryAPI === 'function') {
            const success = await saveMemoryAPI(memoryData);
            if (success) {
                button.innerHTML = '<i class="fas fa-check mr-1"></i> Saved!';
                 // Optionally refresh memory bank display if visible
                const memoryTab = document.getElementById('memory-tab');
                if (memoryTab && memoryTab.getAttribute('aria-selected') === 'true') {
                    // --- MODIFIED: Pass current search term --- //
                    loadMemoryDisplay(memorySearchInput?.value || '');
                    // --- END MODIFIED --- //
                }
            } else {
                button.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Error';
            }
        } else {
             button.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Error';
             setTimeout(() => {
                 button.innerHTML = originalHtml;
                 button.disabled = false;
             }, 2000);
        }

        setTimeout(() => {
            button.innerHTML = originalHtml;
            button.disabled = false;
        }, 3000);
    }
}

// Copy the text content of the answer block
function copyAnswerText(cardId) { // Modify to accept cardId
    const resultCard = document.getElementById(cardId);
    const answerDiv = resultCard?.querySelector('.result-answer'); // Find answer div within the card

    if (answerDiv) {
        // Find the button within the header to update its state
        const button = resultCard?.querySelector(`.result-header button[onclick="copyAnswerText('${cardId}')"]`);

        // Clone the node to avoid modifying the original DOM during cleanup
        const answerClone = answerDiv.cloneNode(true);
        // Remove the action buttons div if it exists within the clone
        answerClone.querySelector('.answer-actions')?.remove();
        const answerText = answerClone.innerText || answerClone.textContent;

        navigator.clipboard.writeText(answerText.trim()).then(() => {
            if (button) { // Check if button exists
            const originalHtml = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i>'; // Just check icon
            button.disabled = true;
            setTimeout(() => {
                    if (button) { // Check again inside timeout
                button.innerHTML = originalHtml;
                button.disabled = false;
                    }
            }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy answer text:', err);
            showErrorMessage('Failed to copy answer text.');
        });
    }
}

// --- Inline Text Selection Saving --- //

// Store selection and context on mouse down within results
function handleInlineSaveMousedown(event) {
    // Only care if the mousedown is within a result-answer area
    const answerDiv = event.target.closest('.result-answer');
    if (answerDiv) {
        const resultCard = answerDiv.closest('.result-card');
        currentContextQueryForSave = resultCard?.dataset.originalQuery || 'Selected Text';
        // Clear previous selection text immediately on mousedown
        currentSelectionTextForSave = null;
        removeExistingSaveSelectionButton(); // Remove button if starting new selection
    } else {
        // If mousedown outside answer area, clear context
        currentContextQueryForSave = null;
    }
}

// Handle mouse up to capture selection and show save button
function handleInlineSaveMouseup(event) {
    // Only proceed if we have context (mousedown was in an answer)
    if (!currentContextQueryForSave) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // Remove any existing button *before* potentially adding a new one
    removeExistingSaveSelectionButton();

    if (selectedText && selectedText.length > 10) { // Only show for reasonably long selections
        currentSelectionTextForSave = selectedText;

        // Ensure the selection ends within the results div (more robust check)
        const resultsDiv = document.getElementById('results');
        if (selection.rangeCount > 0 && resultsDiv && resultsDiv.contains(selection.getRangeAt(0).endContainer)) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            createSaveSelectionButton(rect.bottom + window.scrollY + 5, rect.left + window.scrollX);
        }
    } else {
        currentSelectionTextForSave = null; // Clear if selection is too short or empty
    }
}

// Removes any existing inline save button
function removeExistingSaveSelectionButton() {
    const existingButton = document.getElementById('inline-save-selection-btn');
    existingButton?.remove();
}

// Creates and positions the inline save button
function createSaveSelectionButton(top, left) {
    removeExistingSaveSelectionButton(); // Ensure only one button exists

    const button = document.createElement('button');
    button.id = 'inline-save-selection-btn';
    button.className = 'inline-save-selection-btn absolute z-40'; // Use class from CSS
    button.innerHTML = '<i class="fas fa-save"></i> Save Selection';
    button.style.position = 'absolute';
    button.style.top = `${top}px`;
    button.style.left = `${left}px`;
    button.onclick = handleInlineSaveClick;

    document.body.appendChild(button);
}

// Handles the click on the inline save button
async function handleInlineSaveClick(eventOrButton) {
    let button;
    // Check if called from event listener or directly
    if (eventOrButton.target) {
        button = eventOrButton.target.closest('button');
    } else {
        button = eventOrButton; // Assume button element was passed directly
    }

    if (!button || !currentSelectionTextForSave) {
        console.warn("Save button clicked but no selection text found.");
        removeExistingSaveSelectionButton();
        return;
    }

    const memoryData = {
        content: currentSelectionTextForSave,
        type: 'text', // Always text for inline selection
        language: null,
        context_query: `Selected text from query: "${currentContextQueryForSave}"`
    };

    button.disabled = true;
    const originalHtml = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';

    if (typeof saveMemoryAPI === 'function') {
        const success = await saveMemoryAPI(memoryData);
        if (success) {
            button.innerHTML = '<i class="fas fa-check mr-1"></i> Saved!';
             // Optionally refresh memory bank display if visible
            const memoryTab = document.getElementById('memory-tab');
            if (memoryTab && memoryTab.getAttribute('aria-selected') === 'true') {
                // --- MODIFIED: Pass current search term --- //
                loadMemoryDisplay(memorySearchInput?.value || '');
                // --- END MODIFIED --- //
            }
            setTimeout(() => removeExistingSaveSelectionButton(), 1500);
        } else {
            button.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Error';
            setTimeout(() => {
                 button.innerHTML = originalHtml;
                 button.disabled = false;
             }, 2000);
        }
    } else {
         button.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Error';
         setTimeout(() => {
             button.innerHTML = originalHtml;
             button.disabled = false;
         }, 2000);
    }

    // Clear selection state after attempting save
    currentSelectionTextForSave = null;
    currentContextQueryForSave = null;
}

// --- Tabs --- //
function initializeTabs() {
    const tabButtons = document.querySelectorAll('[data-tabs-target]');
    const tabPanels = document.querySelectorAll('[role="tabpanel"]');

    if (!tabButtons.length) return;

    // Select the first tab by default
    const firstTabButton = tabButtons[0];
    const firstTabPanelId = firstTabButton.getAttribute('data-tabs-target');
    const firstTabPanel = document.querySelector(firstTabPanelId);

    if (firstTabButton && firstTabPanel) {
        firstTabButton.classList.add('active');
        firstTabButton.setAttribute('aria-selected', 'true');
        firstTabPanel.classList.remove('hidden');
        firstTabPanel.removeAttribute('aria-hidden');
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetPanelId = button.getAttribute('data-tabs-target');
            const targetPanel = document.querySelector(targetPanelId);

            // Deactivate all other buttons and hide panels
            tabButtons.forEach(btn => {
                if (btn !== button) {
                    btn.classList.remove('active');
                    btn.setAttribute('aria-selected', 'false');
                    const panelId = btn.getAttribute('data-tabs-target');
                    const panel = document.querySelector(panelId);
                    if (panel) {
                        panel.classList.add('hidden');
                        panel.setAttribute('aria-hidden', 'true');
                    }
                }
            });

            // Activate the clicked button and show its panel
            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');
            if (targetPanel) {
                targetPanel.classList.remove('hidden');
                targetPanel.removeAttribute('aria-hidden');
            }

            // --- UPDATED: Refresh specific data on Tab Click ---
            const buttonId = button.id;
            if (buttonId === 'chat-history-tab') {
                console.log("Chat History tab clicked, refreshing history...");
                if (typeof fetchAndRefreshChatHistory === 'function') {
                    fetchAndRefreshChatHistory(); // Call specific history refresh
                } else {
                    console.error("fetchAndRefreshChatHistory function not found!");
                }
            } else if (buttonId === 'image-history-tab') {
                 console.log("Image History tab clicked, refreshing images...");
                 if (typeof loadImageHistory === 'function') {
                    loadImageHistory(); // Call existing image refresh
                 } else {
                    console.error("loadImageHistory function not found!");
                 }
            } else if (buttonId === 'memory-tab') {
                 console.log("Memory Bank tab clicked, refreshing memory...");
                 if (typeof loadMemoryDisplay === 'function') {
                    // Directly get the input element by ID
                    const memorySearchInputEl = document.getElementById('memory-search-input');
                    const memorySearchTerm = memorySearchInputEl ? memorySearchInputEl.value : ''; // Get value safely
                    loadMemoryDisplay(memorySearchTerm);
                 } else {
                    console.error("loadMemoryDisplay function not found!");
                 }
            }
            // --- END UPDATED ---
        });
    });
}


// --- Modals (History Detail, Image Detail) --- //

// History Detail Modal
function setupHistoryModal() {
    if (!historyModal || !historyModalCloseBtn) return;

    historyModalCloseBtn.addEventListener('click', closeHistoryModal);
    // Close modal if clicking outside the content area
    historyModal.addEventListener('click', (event) => {
        if (event.target === historyModal) {
            closeHistoryModal();
        }
    });
}

async function openHistoryModal(timestamp) {
    if (!historyModal || !historyModalContent || !historyModalLoading || !historyModalData || !historyModalError || !historyModalTimestamp || !historyModalQuery || !historyModalResponse) {
        console.error("History modal elements not found.");
        return;
    }

    // Show modal and loading state
    historyModal.classList.remove('hidden');
    historyModalData.classList.add('hidden');
    historyModalError.classList.add('hidden');
    historyModalLoading.classList.remove('hidden');

    try {
        if (typeof fetchWorkflowDetailAPI !== 'function') {
            throw new Error("API function fetchWorkflowDetailAPI not found.");
        }
        const details = await fetchWorkflowDetailAPI(timestamp);

        if (!details) {
            throw new Error("No details received from API.");
        }

        // --- Populate modal content ---

        // Format Timestamp
        let displayTimestamp = 'N/A';
        if (details.timestamp) {
            try {
                displayTimestamp = new Date(details.timestamp).toLocaleString();
            } catch (e) {
                console.error("Error formatting timestamp:", details.timestamp, e);
                displayTimestamp = details.timestamp; // Fallback to raw string
            }
        }
        historyModalTimestamp.textContent = displayTimestamp;

        // Set Query (using Show More/Less with data attributes)
        if (historyModalQuery) {
            const queryText = details.prompt || '(No query text)';
            const TRUNCATE_THRESHOLD_MODAL = 300; // Adjust threshold for modal if needed
            const isLongQuery = queryText.length > TRUNCATE_THRESHOLD_MODAL;
            const escapedQuery = escapeHtml(queryText); // Escape once

            if (isLongQuery) {
                const truncatedQuery = escapeHtml(queryText.substring(0, TRUNCATE_THRESHOLD_MODAL)) + '...';
                historyModalQuery.innerHTML = `
                    <div class="expandable-content-container"
                         data-full-text="${escapedQuery}"
                         data-truncated-text="${truncatedQuery}">
                        <p class="expandable-text whitespace-pre-wrap">${truncatedQuery}</p>
                        <button onclick="toggleShowMoreLess(this)" class="suggestion-link text-xs mt-1">Show More</button>
                    </div>`;
            } else {
                // Add whitespace-pre-wrap here too for consistency
                historyModalQuery.innerHTML = `<div class="whitespace-pre-wrap">${escapedQuery}</div>`;
            }
        } else {
            console.error("Modal query element not found.");
        }

        // Handle response: Use marked.parse for markdown and apply Show More/Less
            if (historyModalResponse) {
            const answerText = details.answer || ''; // Raw markdown answer
            const answerHtml = marked.parse(answerText); // Parse full answer once
            const TRUNCATE_THRESHOLD_ANSWER = 500; // Adjust threshold for answer
            const isLongAnswer = answerText.length > TRUNCATE_THRESHOLD_ANSWER;

            if (isLongAnswer) {
                // Create truncated HTML (parse only the truncated raw text)
                const truncatedAnswerRaw = answerText.substring(0, TRUNCATE_THRESHOLD_ANSWER) + '...';
                const truncatedAnswerHtml = marked.parse(truncatedAnswerRaw);

                // Store full HTML and truncated HTML in data attributes
                historyModalResponse.innerHTML = `
                    <div class="expandable-content-container prose prose-sm max-w-none text-gray-800"
                         data-full-text='${answerHtml.replace(/'/g, "&#39;")}'
                         data-truncated-text='${truncatedAnswerHtml.replace(/'/g, "&#39;")}'>
                        <div class="expandable-text">${truncatedAnswerHtml}</div>
                        <button onclick="toggleShowMoreLess(this)" class="suggestion-link text-xs mt-1">Show More</button>
                    </div>`;
            } else {
                 historyModalResponse.innerHTML = `<div class="prose prose-sm max-w-none text-gray-800">${answerHtml}</div>`;
            }
            applySyntaxHighlighting(historyModalResponse); // Apply highlighting
                 // Initialize mermaid if needed
                 const mermaidGraphs = historyModalResponse.querySelectorAll('.mermaid');
                 if (mermaidGraphs.length > 0) {
                    try {
                         mermaid.run({ nodes: mermaidGraphs });
                    } catch (e) {
                         console.error("Mermaid rendering error in modal:", e);
                    }
                 }
            } else {
                console.error("Modal response element not found.");
        }

        // --- END Populate modal content ---

        // Show data, hide loading
        historyModalLoading.classList.add('hidden');
        historyModalData.classList.remove('hidden');

    } catch (error) {
        console.error("Error loading history detail:", error);
        // Show error state
        historyModalLoading.classList.add('hidden');
        historyModalData.classList.add('hidden');
        const modalErrorMessage = document.getElementById('modal-error-message');
        if (modalErrorMessage) modalErrorMessage.textContent = `Failed to load details: ${error.message}`;
        historyModalError.classList.remove('hidden');
    }
}

function closeHistoryModal() {
    if (historyModal) {
        historyModal.classList.add('hidden');
    }
}

// Image Detail Modal
function setupImageModal() {
    if (!imageDetailModal || !imageDetailCloseBtn || !imageDetailDeleteBtn) return;

    imageDetailCloseBtn.addEventListener('click', closeImageModal);
    imageDetailDeleteBtn.addEventListener('click', handleDeleteImageClick);
    // Close modal if clicking the background overlay
    imageDetailModal.addEventListener('click', (event) => {
        if (event.target === imageDetailModal) {
            closeImageModal();
        }
    });
}

// Opens the image modal with specific image details.
function openImageModal(fullImageBase64, thumbnailBase64, prompt, displayTimestamp, originalTimestamp) {
    if (!imageDetailModal || !imageDetailImage || !imageDetailPrompt || !imageDetailDownload || !imageDetailDeleteBtn) {
        console.error('Image detail modal elements not found.');
        return;
    }

    imageDetailImage.src = fullImageBase64; // Assumes base64 string includes data URI prefix
    imageDetailPrompt.textContent = prompt;
    // Optional: Display formatted timestamp if needed
    // document.getElementById('modal-image-timestamp').textContent = displayTimestamp;

    imageDetailDownload.href = fullImageBase64;
    imageDetailDownload.download = `generated_image_${originalTimestamp.replace(/[:\s.]/g, '_')}.png`;

    // Store the precise timestamp for the delete action
    currentOpenImageTimestamp = originalTimestamp;
    console.log("Set currentOpenImageTimestamp for deletion:", currentOpenImageTimestamp);
    imageDetailDeleteBtn.disabled = !currentOpenImageTimestamp;

    imageDetailModal.classList.remove('hidden');
}

// Function to close the image modal
function closeImageModal() {
    const modal = document.getElementById('image-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
        // Reset modal content if necessary
        document.getElementById('modal-image').src = '';
        document.getElementById('modal-prompt').textContent = '';
        document.getElementById('modal-download').href = '#';
        // Remove event listener from delete button to avoid stale closures
        const deleteButton = document.getElementById('modal-delete-button');
        if (deleteButton) { // Check if button exists before cloning
            const newDeleteButton = deleteButton.cloneNode(true); // Clone to remove listeners
            deleteButton.parentNode.replaceChild(newDeleteButton, deleteButton);
        }
    }
}

// Function to handle the delete image button click within the modal
async function handleDeleteImageClick() {
    // Get modal and button directly by ID
    const imageModal = document.getElementById('image-detail-modal'); // Corrected ID
    const deleteButton = document.getElementById('modal-delete-button'); // Using the likely ID

    if (!imageModal || !deleteButton) {
        console.error("Modal or delete button element not found.");
        return;
    }
    // MODIFIED: Read from the global variable instead of dataset
    const timestampToDelete = currentOpenImageTimestamp;

    // --- LOGGING ADDED --- //
    console.log("Attempting to delete image with timestamp:", timestampToDelete);
    // --- END LOGGING --- //

    if (!timestampToDelete) {
        console.error("Timestamp not found for deletion (currentOpenImageTimestamp is null/undefined).");
        showErrorMessage("Could not determine which image to delete."); // Show error to user
        return;
    }

    const confirmed = confirm(`Are you sure you want to delete the image generated at ${timestampToDelete}?`);
    if (!confirmed) {
        return;
    }

    // Disable button during API call
    deleteButton.disabled = true;
    // MODIFIED: Change icon instead of text
    deleteButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5 text-xs"></i><span class="text-xs">Deleting...</span>';

    const success = await deleteGeneratedImageAPI(timestampToDelete);

    if (success) {
        closeImageModal(); // Close the modal
        // Refresh the image history display in the main UI
        if (typeof loadImageHistory === 'function') {
            console.log("Refreshing image history after successful deletion...");
            await loadImageHistory();
        }
        showInfoMessage("Image deleted successfully.");
    } else {
        // Re-enable the button and restore original content if deletion failed
        deleteButton.disabled = false;
        deleteButton.innerHTML = '<i class="fas fa-trash-alt mr-1.5 text-xs"></i><span class="text-xs">Delete Image</span>';
        // Error message is shown by deleteGeneratedImageAPI
    }
}

// --- Scroll to Top --- //
function handleScroll() {
    if (scrollToTopBtn) {
        if (window.pageYOffset > 300) { // Show button after scrolling down 300px
            scrollToTopBtn.classList.remove('hidden');
            scrollToTopBtn.classList.add('opacity-100');
        } else {
            scrollToTopBtn.classList.remove('opacity-100');
            // Delay hiding slightly for fade out effect (needs CSS transition)
            setTimeout(() => {
                // Check again in case user scrolled back up quickly
                if (window.pageYOffset <= 300) {
                     scrollToTopBtn.classList.add('hidden');
                }
             }, 300); // Match transition duration if using CSS
        }
    }
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Optionally focus the query input
    queryInput?.focus();
}

// --- Submit Follow Up --- //
function submitFollowUp(text) {
    if (queryInput) {
        queryInput.value = text;
        checkInput();
        autoResizeTextarea({ target: queryInput });
        // Automatically submit the form
        if (queryForm && !submitButton.disabled) {
            queryForm.requestSubmit();
        }
    }
}

// --- File Deletion Handlers (Modified for Direct Deletion) ---

// Function to handle deleting a specific file (document, image, video, audio)
async function confirmAndDeleteFile(uuid, fileTypeFromDataset, fileName) {
    // Use the potentially plural type for user messages
    const prettyFileType = fileTypeFromDataset.charAt(0).toUpperCase() + fileTypeFromDataset.slice(1);
    console.log(`Attempting to delete ${prettyFileType}: ${fileName} (UUID: ${uuid})`);

    // Convert to singular for the API call
    let apiFileType = fileTypeFromDataset;
    if (apiFileType.endsWith('s')) {
        apiFileType = apiFileType.slice(0, -1);
    }
    // Add specific checks if needed, e.g., if 'audios' should become 'audio'
    if (!['document', 'image', 'video', 'audio'].includes(apiFileType)) {
         console.error(`Invalid derived API file type: ${apiFileType} from ${fileTypeFromDataset}`);
         showErrorMessage(`Internal error: Invalid file type for deletion.`);
         return;
    }

    if (typeof deleteFileByUuidAPI === 'function') {
        // Pass the *singular* type to the API
        const success = await deleteFileByUuidAPI(uuid, apiFileType);
        if (success) {
            // Use prettyFileType (potentially plural) for the success message
            showInfoMessage(`${prettyFileType} "${fileName}" deleted.`);
            const elementToRemove = document.querySelector(`[data-file-uuid="${uuid}"]`);
            if (elementToRemove) {
                elementToRemove.remove();
                // updateFileCount(fileTypeFromDataset, -1); // TODO: Re-implement or verify updateFileCount
            } else {
                console.warn('Could not find element to remove, refreshing context...');
                if (typeof loadContextInfo === 'function') await loadContextInfo();
            }
        } else {
            // Error is usually shown by API function, but log here too
            console.error(`Failed to delete ${prettyFileType}: ${fileName}`);
        }
    } else {
        console.error("deleteFileByUuidAPI function not found.");
        showErrorMessage("Could not perform delete action.");
    }
}

/**
 * Handles the click on a "Delete All" button for a file type.
 * @param {string} fileType - The type of the file to delete all of.
 */
async function handleDeleteAllFiles(fileType) {
    // fileType received here is the plural form from the button dataset (e.g., 'documents')
    const prettyFileType = fileType.charAt(0).toUpperCase() + fileType.slice(1);
    console.log(`Attempting to delete all ${prettyFileType} files...`);

    // Convert to singular for the API call (as the API likely expects singular)
    let apiFileType = fileType;
    if (apiFileType.endsWith('s')) {
        apiFileType = apiFileType.slice(0, -1);
    }
    // Validate derived singular type
    if (!['document', 'image', 'video', 'audio'].includes(apiFileType)) {
         console.error(`Invalid derived API file type for delete-all: ${apiFileType} from ${fileType}`);
         showErrorMessage(`Internal error: Invalid file type for mass deletion.`);
         return;
    }

    if (typeof deleteAllFilesAPI === 'function') {
        // Pass the *singular* type to the API
        const success = await deleteAllFilesAPI(apiFileType);
        if (success) {
            // Use prettyFileType (plural) for UI message
            showInfoMessage(`All ${prettyFileType} files deleted.`);
            if (typeof loadContextInfo === 'function') await loadContextInfo();
        } else {
            console.error(`Failed to delete all ${prettyFileType} files.`);
        }
    } else {
        console.error("deleteAllFilesAPI function not found.");
        showErrorMessage("Could not perform delete all action.");
    }
}

// --- Chat History Delete --- //

/**
 * Handles the click event for deleting a chat history entry.
 * Shows a confirmation modal before proceeding.
 * @param {string} timestamp - The precise timestamp of the entry to delete.
 */
async function handleDeleteHistoryEntry(timestamp) {
    console.log(`Delete requested for history entry: ${timestamp}`);
    // REMOVED Confirmation Modal
    // const confirmed = await showConfirmationModal(
    //     'Delete Chat History Entry?',
    //     `Are you sure you want to permanently delete the chat entry from "${timestamp}"? This action cannot be undone.`,
    //     'Delete Entry'
    // );

    // if (confirmed) { // REMOVED Condition
    console.log(`Attempting deletion for: ${timestamp}`);
    if (typeof deleteHistoryEntryAPI === 'function') {
        const success = await deleteHistoryEntryAPI(timestamp);
        if (success) {
            console.log("History entry deleted, refreshing view...");
            // Refresh the history table to reflect the deletion
            if (typeof fetchAndRefreshChatHistory === 'function') {
                fetchAndRefreshChatHistory();
            } else {
                 console.error("fetchAndRefreshChatHistory function not found after deletion!");
            }
        } else {
            console.error(`Failed to delete history entry ${timestamp} via API.`);
            // Error message is likely shown by deleteHistoryEntryAPI itself
        }
    } else {
        console.error("deleteHistoryEntryAPI function is not defined!");
        showErrorMessage("Error: Delete function not available.");
    }
    // } else { // REMOVED Condition
    //     console.log(`Deletion cancelled for: ${timestamp}`);
    // }
}

// --- Image History Grid & Pagination --- //

// --- ADDED: Function to update upload status UI --- //
/**
 * Updates the upload status display in the sidebar.
 * @param {string} filename - The name of the file being processed.
 * @param {boolean} isProcessing - True if the file is in the "Processing" state, false if "Uploading".
 * @param {boolean} isError - True if an error occurred.
 * @param {string | null} [errorMessage=null] - The error message text, if any.
 * @param {number | null} [currentFileNum=null] - The 1-based index of the current file in a batch.
 * @param {number | null} [totalFiles=null] - The total number of files in the batch.
 */
function updateUploadProgress(filename, isProcessing, isError, errorMessage = null, currentFileNum = null, totalFiles = null) {
    const nameSpan = document.getElementById('file-name');
    const spinnerIcon = document.getElementById('upload-progress-spinner');
    const completeIcon = document.getElementById('upload-complete-icon'); // This icon might need adjustment if we want a distinct success state per file
    const errorIcon = document.getElementById('upload-error-icon');
    const errorMsgP = document.getElementById('upload-error-message');
    const statusDiv = document.getElementById('upload-status'); // Get status div to ensure visibility

    if (!nameSpan || !spinnerIcon || !completeIcon || !errorIcon || !errorMsgP || !statusDiv) {
        console.error("Cannot update upload progress, required UI elements missing.");
        return;
    }

    // Ensure status area is visible when this is called
    statusDiv.classList.remove('hidden');

    let prefix = '';
    if (totalFiles && totalFiles > 1 && currentFileNum) {
        prefix = `(File ${currentFileNum}/${totalFiles}) `;
    }

    // Truncate filename for display
    const TRUNCATE_LENGTH = 20; // Keep consistent with initial preparing state
    const truncatedName = filename.length > TRUNCATE_LENGTH
        ? filename.substring(0, TRUNCATE_LENGTH - 3) + '...' + filename.substring(filename.lastIndexOf('.') || filename.length)
        : filename;

    errorMsgP.textContent = ''; // Clear previous error
    errorIcon.classList.add('hidden');
    completeIcon.classList.add('hidden'); // Hide complete icon (usually shown only at the very end or not at all per file)

    if (isError) {
        spinnerIcon.classList.add('hidden');
        errorIcon.classList.remove('hidden');
        nameSpan.textContent = `${prefix}Error: ${truncatedName}`;
        errorMsgP.textContent = errorMessage || 'An unknown error occurred.';
        errorMsgP.title = `Error uploading ${filename}: ${errorMessage}`; // Full details on hover
        nameSpan.title = filename; // Show full filename on hover too
    } else if (isProcessing) {
        spinnerIcon.classList.remove('hidden');
        nameSpan.textContent = `${prefix}Processing: ${truncatedName}`;
        nameSpan.title = `Processing ${filename}`;
    } else { // Initial "Uploading" state for this file
        spinnerIcon.classList.remove('hidden');
        nameSpan.textContent = `${prefix}Uploading: ${truncatedName}`;
        nameSpan.title = `Uploading ${filename}`;
    }
}
// --- END ADDED FUNCTION --- //

// NEW: Function to toggle Show More/Less
function toggleShowMoreLess(button) {
    // console.log("toggleShowMoreLess called", button);
    const container = button.closest('.expandable-content-container');
    // console.log("Container:", container);
    if (!container) return;

    // Get the target text element and data attributes
    const textElement = container.querySelector('.expandable-text');
    const fullText = container.dataset.fullText;
    const truncatedText = container.dataset.truncatedText;

    // console.log("Text Element:", textElement, "Full:", fullText, "Truncated:", truncatedText);

    if (textElement && fullText && truncatedText) {
        const isCollapsed = button.textContent === 'Show More'; // Check for exact text

        if (isCollapsed) { // Expand
            textElement.innerHTML = fullText; // Use innerHTML to render potential formatting from marked
            button.textContent = 'Show Less';
        } else { // Collapse (must have been 'Show Less')
            textElement.innerHTML = truncatedText; // Use innerHTML
            button.textContent = 'Show More'; // Set back to 'Show More'
        }
    } else {
        console.error("Could not find text element or data attributes for toggle.");
    }
}

// --- NEW: Function to fetch and display user personas --- //
async function fetchAndDisplayUserPersonas() {
    // Check for the NEW button element instead of the old select element
    if (!personaSelectorButton) {
        console.warn("Persona selector button element not found, cannot fetch/display personas.");
        return; // Only proceed if the new button exists
    }

    try { // Added try...catch block for robustness
        // Fetch personas using the new API function
        const personas = await fetchUserPersonasAPI();

        if (personas) {
            allUserPersonas = personas; // Store globally
            updatePersonaSelector(); // Populate the dropdown
        }
    } catch (error) {
        console.error("Error fetching user personas:", error);
        // Handle error appropriately
    }
}

// --- NEW: Function to update the persona selector dropdown --- //
function updatePersonaSelector() {
    if (!personaSelectorButton || !selectedPersonaNameSpan || !personaOptionsList) {
        console.warn("Persona selector button or options list not found.");
        return;
    }

    let currentSelectionText = 'Default Agent Settings';
    const currentPersonaObject = allUserPersonas.find(p => p.persona_name === currentPersonaId);
    if (currentPersonaObject) {
        currentSelectionText = currentPersonaObject.persona_name;
    } else {
        currentPersonaId = null;
    }
    selectedPersonaNameSpan.textContent = currentSelectionText;

    personaOptionsList.innerHTML = '';

    // 1. Add Default Option
    const defaultOption = document.createElement('a');
    defaultOption.href = "#";
    defaultOption.className = 'flex items-center block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900';
    defaultOption.setAttribute('role', 'menuitem');
    defaultOption.tabIndex = -1;
    defaultOption.dataset.personaName = "";
    defaultOption.innerHTML = `<i class="${getIconForPersona('')} w-5 mr-3 text-gray-400"></i> Default Agent Settings`;
    defaultOption.onclick = (e) => e.preventDefault();
    personaOptionsList.appendChild(defaultOption);

    if (allUserPersonas.length > 0) {
        const separator = document.createElement('div');
        separator.className = 'border-t border-gray-100 my-1';
        personaOptionsList.appendChild(separator);
    }

    // 3. Add User Personas
    allUserPersonas.forEach(persona => {
        const personaOption = document.createElement('a');
        personaOption.href = "#";
        personaOption.className = 'flex items-center block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900';
        personaOption.setAttribute('role', 'menuitem');
        personaOption.tabIndex = -1;
        personaOption.dataset.personaName = persona.persona_name;
        const iconClass = getIconForPersona(persona.persona_name);
        personaOption.innerHTML = `<i class="${iconClass} w-5 mr-3 text-gray-400"></i> ${escapeHtml(persona.persona_name)}`;
        personaOption.onclick = (e) => e.preventDefault();
        personaOptionsList.appendChild(personaOption);
    });

    if (allUserPersonas.length === 0) {
        const noPersonasMsg = document.createElement('div');
        noPersonasMsg.className = 'px-4 py-2 text-xs text-gray-500 italic';
        noPersonasMsg.textContent = 'No custom personas found.';
        personaOptionsList.appendChild(noPersonasMsg);
    }

    // Apply styles and button colors based on initial/current selection
    updatePersonaSelectorStyles();
    applyPersonaButtonStyle(currentPersonaId);
}

// --- NEW: Function to apply selected styles to the dropdown items --- //
function updatePersonaSelectorStyles() {
    if (!personaOptionsList) return;

    const items = personaOptionsList.querySelectorAll('a[role="menuitem"]');
    items.forEach(item => {
        const itemName = item.dataset.personaName;
        const isSelected = (currentPersonaId === null && itemName === "") || (currentPersonaId !== null && currentPersonaId === itemName);

        if (isSelected) {
            item.classList.add('bg-gray-100', 'font-medium');
        } else {
            item.classList.remove('bg-gray-100', 'font-medium');
        }
    });
}

// --- NEW: Function to apply button styling based on selection --- //
function applyPersonaButtonStyle(selectedName) {
    if (!personaSelectorButton) return;

    const defaultClasses = ['bg-white', 'text-gray-700', 'border-gray-300', 'hover:bg-gray-50'];
    const allColorClasses = personaColorThemes.flatMap(theme => [theme.bg, theme.border, theme.text, theme.hoverBg]);

    personaSelectorButton.classList.remove(...allColorClasses);
    personaSelectorButton.classList.add(...defaultClasses);

    const theme = getColorClassesForPersona(selectedName);
    if (theme) {
        personaSelectorButton.classList.remove('bg-white', 'text-gray-700', 'border-gray-300', 'hover:bg-gray-50');
        personaSelectorButton.classList.add(theme.bg, theme.border, theme.text, theme.hoverBg);
    }
}

// --- UPDATED: Function to populate the custom persona selector dropdown --- //
function updatePersonaSelector() {
    if (!personaSelectorButton || !selectedPersonaNameSpan || !personaOptionsList) {
        console.warn("Persona selector button or options list not found.");
        return;
    }

    let currentSelectionText = 'Default Agent Settings';
    const currentPersonaObject = allUserPersonas.find(p => p.persona_name === currentPersonaId);
    if (currentPersonaObject) {
        currentSelectionText = currentPersonaObject.persona_name;
    } else {
        currentPersonaId = null;
    }
    selectedPersonaNameSpan.textContent = currentSelectionText;

    personaOptionsList.innerHTML = '';

    // 1. Add Default Option
    const defaultOption = document.createElement('a');
    defaultOption.href = "#";
    defaultOption.className = 'flex items-center block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900';
    defaultOption.setAttribute('role', 'menuitem');
    defaultOption.tabIndex = -1;
    defaultOption.dataset.personaName = "";
    defaultOption.innerHTML = `<i class="${getIconForPersona('')} w-5 mr-3 text-gray-400"></i> Default Agent Settings`;
    defaultOption.onclick = (e) => e.preventDefault();
    personaOptionsList.appendChild(defaultOption);

    if (allUserPersonas.length > 0) {
        const separator = document.createElement('div');
        separator.className = 'border-t border-gray-100 my-1';
        personaOptionsList.appendChild(separator);
    }

    // 3. Add User Personas
    allUserPersonas.forEach(persona => {
        const personaOption = document.createElement('a');
        personaOption.href = "#";
        personaOption.className = 'flex items-center block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900';
        personaOption.setAttribute('role', 'menuitem');
        personaOption.tabIndex = -1;
        personaOption.dataset.personaName = persona.persona_name;
        const iconClass = getIconForPersona(persona.persona_name);
        personaOption.innerHTML = `<i class="${iconClass} w-5 mr-3 text-gray-400"></i> ${escapeHtml(persona.persona_name)}`;
        personaOption.onclick = (e) => e.preventDefault();
        personaOptionsList.appendChild(personaOption);
    });

    if (allUserPersonas.length === 0) {
        const noPersonasMsg = document.createElement('div');
        noPersonasMsg.className = 'px-4 py-2 text-xs text-gray-500 italic';
        noPersonasMsg.textContent = 'No custom personas found.';
        personaOptionsList.appendChild(noPersonasMsg);
    }

    // Apply styles and button colors based on initial/current selection
    updatePersonaSelectorStyles();
    applyPersonaButtonStyle(currentPersonaId);
}

// --- UPDATED: Handle selection from custom dropdown --- //
function handlePersonaSelection(selectedName) {
    currentPersonaId = selectedName || null; // Update global state
    console.log("Custom Persona selected:", currentPersonaId || "Default");

    // --- ADDED: Save selection to sessionStorage --- //
    try {
        // Save empty string for null (default), otherwise save the name
        sessionStorage.setItem('selectedPersonaId', currentPersonaId === null ? '' : currentPersonaId);
        console.log('Saved selectedPersonaId to sessionStorage:', currentPersonaId === null ? '(Default)' : currentPersonaId);
    } catch (e) {
        console.error("Failed to save persona selection to sessionStorage:", e);
    }
    // --- END ADDED --- //

    // Update button text
    if (selectedPersonaNameSpan) {
        selectedPersonaNameSpan.textContent = selectedName || 'Default Agent Settings';
    }
    updatePersonaSelectorStyles(); // Call the style function
    applyPersonaButtonStyle(selectedName); // Call the button style function
}

// --- NEW: Handle persona selection change --- //
function handlePersonaSelect(event) {
    const selectedValue = event.target.value;
    console.log("Persona selected:", selectedValue || "Default");
    currentPersonaId = selectedValue || null; // Update global state

    // Update Agent Settings display to reflect selection
    updateAgentSettingsDisplay();
}

// --- NEW: Function to update Agent Settings tab based on selected persona --- //
function updateAgentSettingsDisplay() {
    let personaData = null;
    // REMOVED: Hardcoded presets definition - Not needed anymore
    // const presets = { /* ... */ };

    if (!currentPersonaId) {
        // Use global defaults from config (need to fetch/store these initially if not already)
        // This requires fetching initial config state properly
        console.log("Updating Agent Settings to reflect global defaults.");
        // Ensure JS defaults are loaded (assuming loadContextInfo has run)
        if (typeof updatePromptsUI === 'function') {
            updatePromptsUI(jsDefaultInitialPrompt, jsDefaultFinalPrompt);
        }
        if (typeof updateParameterInputs === 'function') {
            updateParameterInputs(jsDefaultParams);
        }
        // Disable Save Button for global defaults
        if (savePromptsButton) {
            savePromptsButton.disabled = true;
            savePromptsButton.title = "Cannot modify default agent settings here.";
        }
    // REMOVED: Check against hardcoded presets
    // } else if (presets[currentPersonaId]) { ... }
    } else {
        // It's a custom persona (or a preset stored in the DB), find it in the stored list
        personaData = allUserPersonas.find(p => p.persona_name === currentPersonaId);
        console.log(`Updating Agent Settings to reflect persona: ${currentPersonaId}`);
        // Enable Save Button for user-specific personas (including presets from DB)
        // NOTE: Saving will UPDATE the persona in the DB. We might need separate create/update logic later.
        if (savePromptsButton) {
            savePromptsButton.disabled = false; // Allow editing of DB personas
            savePromptsButton.title = "Save changes to this persona"; // Might need update endpoint
        }
    }

    if (personaData) {
        if (typeof updatePromptsUI === 'function') {
            updatePromptsUI(personaData.initial_prompt || '', personaData.final_prompt || '');
        }
        if (typeof updateParameterInputs === 'function') {
            // Ensure llm_params exists and is an object
            const params = personaData.llm_params && typeof personaData.llm_params === 'object'
                           ? personaData.llm_params
                           : {}; // Default to empty if missing/invalid
            updateParameterInputs(params);
        }
    } else if (currentPersonaId) { // Persona selected but not found in fetched list (should be rare)
        console.warn(`Selected persona ${currentPersonaId} not found in local data for display.`);
        // Clear the settings fields or show a message
        if (typeof updatePromptsUI === 'function') updatePromptsUI('', '');
        if (typeof updateParameterInputs === 'function') updateParameterInputs({});
        // Disable save if data is missing
        if (savePromptsButton) {
            savePromptsButton.disabled = true;
            savePromptsButton.title = "Cannot save, persona data missing.";
        }
    }
    // If currentPersonaId is null (Default selected), handled by the first `if` block.
}

// --- NEW: Persona Modal Open/Close --- //
/**
 * Opens the persona management modal and populates the list.
 */
async function openPersonaModal() {
    const modal = document.getElementById('persona-modal');
    const listElement = document.getElementById('custom-personas-list');
    if (!modal || !listElement) {
        console.error("Persona modal or list element (#custom-personas-list) not found for opening.");
        return;
    }
    console.log("DEBUG: openPersonaModal function called.");
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    resetPersonaForm();
    listElement.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-gray-400"></i><p class="text-sm text-gray-500 mt-1">Loading personas...</p></div>';
    try {
        const personas = await window.fetchUserPersonasAPI();
        updatePersonaModalList(personas);
    } catch (error) {
        console.error("Failed to fetch personas for modal:", error);
        listElement.innerHTML = '<div class="text-center py-4 text-red-600"><i class="fas fa-exclamation-triangle mr-2"></i>Error loading personas.</div>';
    }
}

/**
 * Closes the persona management modal.
 */
function closePersonaModal() {
    const modal = document.getElementById('persona-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    document.body.classList.remove('overflow-hidden');
}

/**
 * Populates the persona list in the management modal.
 * @param {Array<object>} personas - Array of persona objects.
 */
function updatePersonaModalList(personas) {
    const listElement = document.getElementById('custom-personas-list');
    const form = document.getElementById('create-persona-form');
    if (!listElement || !form) {
        console.error('Persona modal list or form element not found');
        return;
    }
    listElement.innerHTML = ''; // Clear existing list
    if (!personas || personas.length === 0) {
        listElement.innerHTML = '<div class="text-sm text-gray-500 italic">No custom personas saved yet.</div>';
        return;
    }
    personas.forEach(persona => {
        const listItem = document.createElement('div');
        listItem.className = 'flex justify-between items-center p-2 border border-gray-200 rounded bg-white hover:bg-gray-50 cursor-pointer'; // Added cursor-pointer to item
        listItem.dataset.personaData = JSON.stringify(persona);

        // --- MOVED CLICK HANDLER TO LISTITEM --- //
        listItem.onclick = () => {
             console.log(`DEBUG: Clicked on persona list item: ${persona.persona_name}`); // Log item click
             try {
                 const personaData = JSON.parse(listItem.dataset.personaData);
                 console.log("DEBUG: Parsed persona data:", personaData);
                 populatePersonaFormForEdit(personaData);
            } catch (e) {
                console.error("Failed to parse persona data for editing:", e);
            }
        };

        const nameSpan = document.createElement('span');
        nameSpan.textContent = persona.persona_name;
        nameSpan.className = 'text-sm font-medium text-gray-700'; // Removed cursor/hover from span
        nameSpan.title = persona.persona_name; // Set title to name for info

        // --- REMOVED ONCLICK FROM NAME SPAN --- //
        // nameSpan.onclick = () => { ... };

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.innerHTML = '<i class="fas fa-trash-alt w-4 h-4"></i>';
        deleteButton.className = 'persona-delete-btn text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-100 focus:outline-none focus:ring-1 focus:ring-red-400';
        deleteButton.dataset.personaName = persona.persona_name;
        deleteButton.title = `Delete '${escapeHtml(persona.persona_name)}'`;
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            handleDeletePersonaClick(e);
        };
        listItem.appendChild(nameSpan);
        listItem.appendChild(deleteButton);
        listElement.appendChild(listItem);
    });
}

/**
 * Populates the persona form fields when editing.
 * @param {object} personaData - The data for the persona being edited.
 */
function populatePersonaFormForEdit(personaData) {
    const form = document.getElementById('create-persona-form');
    const nameInput = document.getElementById('persona-name-input'); // Get name input
    if (!form || !nameInput) return;

    // Populate standard fields
    nameInput.value = personaData.persona_name || '';
    document.getElementById('persona-initial-prompt').value = personaData.initial_prompt || '';
    document.getElementById('persona-final-prompt').value = personaData.final_prompt || '';

    // --- ADDED: Disable name input for editing --- //
    nameInput.readOnly = true;
    nameInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'focus:ring-0', 'focus:border-gray-300'); // Add disabled styles
    nameInput.title = "Persona name cannot be changed during update.";
    // --- END ADDED --- //

    // Populate LLM params
    const llmParams = personaData.llm_params || {};
    document.getElementById('persona-max_tokens').value = llmParams.max_tokens ?? '';
    document.getElementById('persona-temperature').value = llmParams.temperature ?? '';
    document.getElementById('persona-top_k').value = llmParams.top_k ?? '';
    document.getElementById('persona-top_p').value = llmParams.top_p ?? '';
    document.getElementById('persona-stop_sequences').value = (llmParams.stop_sequences || []).join(', ');
    document.getElementById('save-new-persona-btn').textContent = 'Update Persona';
    form.dataset.editingPersonaName = personaData.persona_name;
    currentEditingPersonaName = personaData.persona_name;
    const cancelBtn = document.getElementById('cancel-edit-persona-btn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    form.classList.add('editing-highlight');
    setTimeout(() => form.classList.remove('editing-highlight'), 1500);
}

/**
 * Handles saving a new persona or updating an existing one.
 */
async function handleSaveNewPersona(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }
    const form = document.getElementById('create-persona-form');
    const statusDiv = document.getElementById('create-persona-status');
    const saveButton = document.getElementById('save-new-persona-btn');
    const nameInput = document.getElementById('persona-name-input');
    if (!form || !statusDiv || !saveButton || !nameInput) {
        console.error("Save persona form elements missing"); return;
    }
    const formData = new FormData(form);
    const name = formData.get('persona_name')?.trim();
    const initialPrompt = formData.get('initial_prompt') || '';
    const finalPrompt = formData.get('final_prompt') || '';
    let params = {}; let hasParamError = false; let paramErrorMessage = '';
    if (!name) {
        showPersonaStatus('Persona Name is required.', 'error'); return;
    }
    try {
        const mtStr = formData.get('max_tokens')?.trim(); if (mtStr) { const mt = parseInt(mtStr); if (isNaN(mt) || mt <= 0) throw new Error('Invalid Max Tokens.'); params.max_tokens = mt; }
        const tStr = formData.get('temperature')?.trim(); if (tStr) { const t = parseFloat(tStr); if (isNaN(t) || t < 0 || t > 2) throw new Error('Invalid Temp (0-2).'); params.temperature = t; }
        const tkStr = formData.get('top_k')?.trim(); if (tkStr) { const tk = parseInt(tkStr); if (isNaN(tk) || tk <= 0) throw new Error('Invalid Top K.'); params.top_k = tk; }
        const tpStr = formData.get('top_p')?.trim(); if (tpStr) { const tp = parseFloat(tpStr); if (isNaN(tp) || tp < 0 || tp > 1) throw new Error('Invalid Top P (0-1).'); params.top_p = tp; }
        const ssStr = formData.get('stop_sequences')?.trim(); params.stop_sequences = ssStr ? ssStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    } catch (paramError) { paramErrorMessage = `Param Error: ${paramError.message}`; hasParamError = true; }
    if (hasParamError) { showPersonaStatus(paramErrorMessage, 'error'); return; }
    const personaData = { persona_name: name, initial_prompt: initialPrompt, final_prompt: finalPrompt, llm_params: params };
    const originalNameBeingEdited = form.dataset.editingPersonaName;
    saveButton.disabled = true;
    showPersonaStatus('Saving...', 'loading');
    try {
        let result;
        if (originalNameBeingEdited) {
            if (name !== originalNameBeingEdited) {
                showPersonaStatus('Renaming not supported here.', 'error');
                saveButton.disabled = false;
                nameInput.value = originalNameBeingEdited;
                return;
            }
            const { persona_name, ...updateData } = personaData;
            result = await window.updatePersonaAPI(originalNameBeingEdited, updateData);
            showPersonaStatus('Persona updated successfully!', 'success');
        } else {
            result = await window.savePersonaAPI(personaData);
            showPersonaStatus('Persona saved successfully!', 'success');
        }
        await refreshPersonaModalList();
        await fetchAndDisplayUserPersonas();
        resetPersonaForm();
    } catch (error) {
        console.error('Error saving/updating persona:', error);
        showPersonaStatus(`Error: ${error.message || 'Could not save.'}`, 'error');
    } finally {
        saveButton.disabled = false;
        if (form.dataset.editingPersonaName) {
             saveButton.textContent = 'Update Persona';
        } else {
             saveButton.textContent = 'Save New Persona';
        }
    }
}

/**
 * Handles deleting a persona after confirmation.
 */
async function handleDeletePersonaClick(event) {
    const deleteButton = event.target.closest('.persona-delete-btn');
    if (!deleteButton) return;
    const personaName = deleteButton.dataset.personaName;
    if (!personaName) return;
    const confirmed = confirm(`Are you sure you want to delete the persona "${personaName}"?`);
    if (!confirmed) return;
    console.log(`Attempting to delete persona: ${personaName}`);
    if (typeof window.deletePersonaAPI !== 'function') {
        console.error("deletePersonaAPI function not found.");
        showErrorMessage("Delete function not available.");
        return;
    }
    try {
        await window.deletePersonaAPI(personaName);
        showInfoMessage(`Persona '${personaName}' deleted.`);
        await fetchAndDisplayUserPersonas();
        await refreshPersonaModalList();
        if (currentPersonaId === personaName) {
            handlePersonaSelection(null);
        }
    } catch (error) {
         console.error(`Failed to delete persona '${personaName}':`, error);
         showErrorMessage(`Failed to delete: ${error.message}`);
    }
}

/**
 * Resets the persona form to its default state.
 */
function resetPersonaForm() {
    console.log("DEBUG: resetPersonaForm called."); // Log entry
    const form = document.getElementById('create-persona-form');
    const saveButton = document.getElementById('save-new-persona-btn');
    // const cancelButton = document.getElementById('cancel-edit-persona-btn'); // This ID likely doesn't exist
    const statusDiv = document.getElementById('create-persona-status');
    const nameInput = document.getElementById('persona-name-input');

    if (form) {
        console.log("DEBUG: Resetting form element.");
        form.reset(); // Still call reset for potentially other fields

        // --- ADDED: Explicitly clear fields --- //
        console.log("DEBUG: Explicitly clearing form fields.");
        if (nameInput) nameInput.value = ''; // Already have nameInput ref
        document.getElementById('persona-initial-prompt').value = '';
        document.getElementById('persona-final-prompt').value = '';
        document.getElementById('persona-max_tokens').value = '';
        document.getElementById('persona-temperature').value = '';
        document.getElementById('persona-top_k').value = '';
        document.getElementById('persona-top_p').value = '';
        document.getElementById('persona-stop_sequences').value = '';
        // --- END ADDED --- //

        console.log("DEBUG: Deleting editingPersonaName dataset attribute.");
        delete form.dataset.editingPersonaName; // Clear editing state attribute
    } else {
         console.error("DEBUG: Form element not found in resetPersonaForm.");
    }
    if (saveButton) {
         console.log("DEBUG: Resetting save button text.");
         saveButton.textContent = 'Save New Persona';
    } else {
         console.error("DEBUG: Save button not found in resetPersonaForm.");
    }
    // if (cancelButton) cancelButton.classList.add('hidden'); // Comment out - button doesn't exist
    if (statusDiv) {
         console.log("DEBUG: Clearing status div.");
         statusDiv.textContent = '';
    } else {
         console.error("DEBUG: Status div not found in resetPersonaForm.");
    }
    if (nameInput) {
        console.log("DEBUG: Re-enabling name input.");
        nameInput.readOnly = false;
        nameInput.classList.remove('bg-gray-100', 'cursor-not-allowed', 'focus:ring-0', 'focus:border-gray-300');
        nameInput.title = ""; // Clear tooltip
    } else {
         console.error("DEBUG: Name input not found in resetPersonaForm.");
    }
    console.log("DEBUG: Resetting currentEditingPersonaName variable.");
    currentEditingPersonaName = null; // Clear global tracking variable
}

/**
 * Displays status messages within the persona modal.
 */
function showPersonaStatus(message, type) {
    const statusDiv = document.getElementById('create-persona-status');
    if (!statusDiv) return;
    statusDiv.textContent = message;
    statusDiv.className = 'text-sm italic text-gray-500'; // Base classes
    if (type === 'success') statusDiv.classList.add('text-green-600');
    else if (type === 'error') statusDiv.classList.add('text-red-600');
    else if (type === 'loading') statusDiv.classList.add('text-blue-600'); // Or another loading color

    // Clear message after a delay for success/error
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            if (statusDiv.textContent === message) { // Only clear if message hasn't changed
                 statusDiv.textContent = '';
                 statusDiv.className = 'text-sm italic text-gray-500';
            }
        }, 3000);
    }
}

/**
 * Sets up the event listener for the cancel edit button.
 */
function setupCancelEditButton() {
   const cancelButton = document.getElementById('cancel-edit-persona-btn');
   if (cancelButton) {
       cancelButton.addEventListener('click', () => {
           resetPersonaForm();
       });
   }
}

/**
 * Refreshes the list in the modal (fetches and updates).
 */
async function refreshPersonaModalList() {
    const listElement = document.getElementById('custom-personas-list');
    if (!listElement) return;
    // Optionally show interim loading state in the list itself
    // listElement.innerHTML = '<div class="text-center py-2"><i class="fas fa-spinner fa-spin text-xs text-gray-400"></i></div>';
    try {
        const personas = await window.fetchUserPersonasAPI();
        updatePersonaModalList(personas);
    } catch (error) {
        console.error("Failed to refresh persona modal list:", error);
        listElement.innerHTML = '<div class="text-sm text-red-500 italic">Error reloading personas.</div>';
    }
}

/**
 * Sets up event listeners for the persona management modal itself.
 */
function setupPersonaManagementModal() {
    const modal = document.getElementById('persona-modal');
    const openBtn = document.getElementById('manage-personas-btn');
    const closeBtn = document.getElementById('persona-modal-close-btn');
    const form = document.getElementById('create-persona-form');
    const customList = document.getElementById('custom-personas-list');
    // REMOVED: const createNewModeBtn = document.getElementById('create-new-mode-btn'); // Get the button

    // REMOVED: Log button element
    // console.log("DEBUG: Attempting to find #create-new-mode-btn:", createNewModeBtn);

    // REMOVED: Check for new button in condition
    if (!modal || !openBtn || !closeBtn || !form || !customList) {
        console.error('Missing elements for persona management modal setup.');
        // REMOVED: if (!createNewModeBtn) console.error("#create-new-mode-btn was NOT found!");
        return;
    }
    openBtn.addEventListener('click', openPersonaModal);
    closeBtn.addEventListener('click', closePersonaModal);
    form.addEventListener('submit', handleSaveNewPersona);
    customList.addEventListener('click', handleDeletePersonaClick);

    // REMOVED: Listener for Create New Mode button
    /*
    createNewModeBtn.addEventListener('click', () => {
        console.log("DEBUG: Create New Mode button clicked! Re-opening modal to reset.");
        closePersonaModal();
        setTimeout(openPersonaModal, 50);
    });
    */
    // REMOVED: console.log("DEBUG: Event listener attached to #create-new-mode-btn.");

    // Close on overlay click
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closePersonaModal();
    });
    console.log("Persona management modal event listeners attached.");
}

// --- END Persona Management Feature Functions --- //