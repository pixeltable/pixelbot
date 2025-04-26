/**
 * Sends a query to the backend (Chat Mode).
 * Handles request abortion, timeout, and calls UI functions for updates.
 * @param {URLSearchParams} formData - The form data including query and optional persona_id.
 */
async function sendQuery(formData) {
    // Abort any previous request if a new one is started
    if (window.currentRequest) {
        window.currentRequest.abort();
        console.log("Aborted previous request.");
    }

    const queryForDisplay = formData.get('query');

    const controller = new AbortController();
    window.currentRequest = controller;

    try {
        const timeoutId = setTimeout(() => {
            controller.abort();
            console.warn("Request timed out after 90 seconds.");
        }, 90000); // 90 seconds timeout

        const response = await fetch('/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (typeof hideLoadingState === 'function') hideLoadingState();
        if (typeof displayResult === 'function') displayResult(queryForDisplay, data);
        if (typeof checkInput === 'function') checkInput();
        if (typeof setLoading === 'function') setLoading(false, 'chat');

    } catch (error) {
        console.error('Fetch Error (Query):', error);
        handleFetchError(error, controller, queryForDisplay, 'chat', displayResult);
    } finally {
         if (window.currentRequest === controller) {
             window.currentRequest = null;
         }
    }
}

/**
 * Sends an image generation request to the backend.
 * Handles request abortion, timeout, and calls UI functions for updates.
 * @param {string} prompt - The user's prompt text.
 */
async function sendImageGenerationRequest(prompt) {
    if (window.currentRequest) {
        window.currentRequest.abort();
        console.log("Aborted previous request (Image Gen).");
    }

    const formData = new URLSearchParams();
    formData.append('prompt', prompt);
    const controller = new AbortController();
    window.currentRequest = controller;

    try {
        const timeoutId = setTimeout(() => {
            controller.abort();
            console.warn("Image generation request timed out after 90 seconds.");
        }, 90000);

        const response = await fetch('/generate_image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json().catch(() => {
            return { error: `Image Generation Failed. Status: ${response.status}`, details: 'Could not parse server response.' };
        });

        if (!response.ok) {
             throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        if (typeof hideLoadingState === 'function') hideLoadingState();
        if (typeof displayImageResult === 'function') displayImageResult(prompt, data);
        if (typeof checkInput === 'function') checkInput();
        if (typeof setLoading === 'function') setLoading(false, 'image');

        // --- ADDED: Refresh image history data --- //
        if (typeof loadImageHistory === 'function') {
            console.log("Refreshing image history after successful generation...");
            await loadImageHistory();
        }
        // --- END ADDED --- //

    } catch (error) {
        console.error('Image Generation Fetch Error:', error);
        handleFetchError(error, controller, prompt, 'image', displayImageResult);
    } finally {
        if (window.currentRequest === controller) {
            window.currentRequest = null;
        }
    }
}

/**
 * Fetches initial application context (tools, files, prompts, history, params) from the backend.
 * Calls UI functions to populate the interface.
 */
async function loadContextInfo() {
    console.log('loadContextInfo called');
    if (typeof showLoadingIndicator === 'function') showLoadingIndicator(true);
    if (typeof hideError === 'function') hideError();

    try {
        const response = await fetch('/context_info');
        console.log(`Fetch finished loading context: GET "${response.url}". Status: ${response.status}`);

        if (!response.ok) {
            let errorData = { error: `HTTP error ${response.status}` };
            try {
                 errorData = await response.json();
            } catch (jsonError) {
                 console.warn("Could not parse error response as JSON.");
            }
            throw new Error(errorData.error || `Failed to fetch context info. Status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Context data received:', data);

        if (typeof updateSidebarLists === 'function') updateSidebarLists(data);
        if (typeof updateToolsDropdown === 'function') updateToolsDropdown(data.tools);

        if (typeof initializeChatHistoryPagination === 'function') {
            initializeChatHistoryPagination(data.workflow_data || []);
        }

        if (typeof loadImageHistory === 'function') {
             await loadImageHistory();
        }
         if (typeof loadMemoryDisplay === 'function') {
            await loadMemoryDisplay();
        }

    } catch (error) {
        console.error('Error loading context info:', error);
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            console.error("'Failed to fetch' likely means the backend server isn't running or is unreachable.");
        } else {
            console.error("Error details:", error.message, error.stack);
        }

        if (typeof showError === 'function') showError(`Error loading application context: ${error.message}`);
    } finally {
        if (typeof showLoadingIndicator === 'function') showLoadingIndicator(false);
    }
}

/**
 * Fetches image history from the backend.
 * Calls UI functions to display the history.
 */
async function loadImageHistory() {
    if (typeof showImageHistoryLoading === 'function') showImageHistoryLoading(true);
    if (typeof showImageHistoryError === 'function') showImageHistoryError(false);
    if (typeof clearImageHistoryContent === 'function') clearImageHistoryContent();

    try {
        const response = await fetch('/image_history');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
            throw new Error(errorData.error || `Failed to fetch image history`);
        }
        const fetchedImageHistoryData = await response.json();

        if (typeof initializeImageHistory === 'function') {
            initializeImageHistory(fetchedImageHistoryData);
        }

    } catch (error) {
        console.error('Error loading image history:', error);
        if (typeof showImageHistoryError === 'function') showImageHistoryError(true, `Error: ${error.message}`);
    } finally {
        if (typeof showImageHistoryLoading === 'function') showImageHistoryLoading(false);
    }
}

/**
 * Deletes a generated image from the backend using its timestamp.
 * @param {string} timestampToDelete - The precise timestamp of the image to delete.
 * @returns {Promise<boolean>} - True if deletion was successful, false otherwise.
 */
async function deleteGeneratedImageAPI(timestampToDelete) {
    try {
        const encodedTimestamp = encodeURIComponent(timestampToDelete);
        const response = await fetch(`/delete_generated_image/${encodedTimestamp}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Failed to delete image (Status: ${response.status})`);
        }
        console.log(`Image ${timestampToDelete} deleted successfully via API.`);
        return true;

    } catch (error) {
        console.error('Error deleting image via API:', error);
        if (typeof showErrorMessage === 'function') showErrorMessage(`Error deleting image: ${error.message}`);
        return false;
    }
}


/**
 * Fetches memory items from the backend, optionally filtering by search query.
 * @param {string} [searchQuery] - Optional search term.
 * @returns {Promise<Array>} - A promise that resolves to an array of memory items or empty array on error.
 */
async function fetchMemoryItems(searchQuery = '') {
    let url = '/get_memory';
    if (searchQuery) {
        url += `?search=${encodeURIComponent(searchQuery)}`;
        console.log(`Searching memory bank with query: ${searchQuery}`);
    } else {
        console.log("Fetching all memory items");
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to fetch memory: Status ${response.status}`);
        }
        const memoryData = await response.json();
        console.log(`Successfully fetched ${memoryData.length} memory items.`);
        return memoryData;
    } catch (error) {
        console.error('Error fetching memory items:', error);
        if (typeof showErrorMessage === 'function') showErrorMessage(`Error fetching memories: ${error.message}`);
        return [];
    }
}


/**
 * Deletes a specific memory item from the backend by its timestamp.
 * @param {string} timestamp - The precise timestamp of the memory item to delete.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function deleteMemoryAPI(timestamp) {
    console.log(`Attempting to delete memory item via API with timestamp: ${timestamp}`);
    try {
        const encodedTimestamp = encodeURIComponent(timestamp);
        const response = await fetch(`/delete_memory/${encodedTimestamp}`, {
            method: 'DELETE',
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Failed to delete memory item (Status ${response.status})`);
        }

        console.log(`Successfully deleted memory item for timestamp: ${timestamp}`);
        return true;
    } catch (error) {
        console.error(`Error deleting memory item ${timestamp}:`, error);
        if (typeof showErrorMessage === 'function') showErrorMessage(`Error deleting memory: ${error.message}`);
        return false;
    }
}


/**
 * Deletes a specific chat history entry from the backend by its timestamp.
 * @param {string} timestamp - The precise timestamp of the history entry to delete.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function deleteHistoryEntryAPI(timestamp) {
    console.log(`Attempting to delete history entry via API with timestamp: ${timestamp}`);
    try {
        const encodedTimestamp = encodeURIComponent(timestamp);
        const response = await fetch(`/delete_history_entry/${encodedTimestamp}`, {
            method: 'DELETE',
        });
        const data = await response.json();

        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`No history entry found matching timestamp: ${timestamp}`);
                if (typeof showInfoMessage === 'function') showInfoMessage('History entry not found.');
                return false;
            }
            throw new Error(data.error || `Failed to delete history entry (Status ${response.status})`);
        }

        console.log(`Successfully deleted history entry for timestamp: ${timestamp}`);
        return true;
    } catch (error) {
        console.error(`Error deleting history entry ${timestamp}:`, error);
        if (typeof showErrorMessage === 'function') showErrorMessage(`Error deleting history: ${error.message}`);
        return false;
    }
}

/**
 * Saves a memory item (from inline selection or manual entry) to the backend.
 * @param {object} memoryData - Object containing { content, type, language?, context_query? }
 * @param {boolean} isManual - Flag indicating if it's from the manual add form.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function saveMemoryAPI(memoryData, isManual = false) {
    const endpoint = isManual ? '/add_memory_manual' : '/save_memory';
    const action = isManual ? 'manual memory item' : 'memory snippet';
    console.log(`Attempting to save ${action} via API:`, memoryData);

    if (!memoryData || !memoryData.content || !memoryData.type) {
        console.error("Missing required fields for saving memory:", memoryData);
        if (typeof showErrorMessage === 'function') showErrorMessage('Cannot save memory: Missing content or type.');
        return false;
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(memoryData),
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `Failed to save ${action} (Status ${response.status})`);
        }

        console.log(`Successfully saved ${action}.`);
        return true;
    } catch (error) {
        console.error(`Error saving ${action}:`, error);
        if (typeof showErrorMessage === 'function') showErrorMessage(`Error saving memory: ${error.message}`);
        return false;
    }
}

/**
 * Uploads a file to the backend using XMLHttpRequest for progress tracking.
 * @param {File} file - The file object to upload.
 * @param {number | null} [currentFileNum=null] - The 1-based index of the current file in a batch.
 * @param {number | null} [totalFiles=null] - The total number of files in the batch.
 * @returns {Promise<boolean>} - True if upload was successful, false otherwise.
 */
async function uploadFileAPI(file, currentFileNum = null, totalFiles = null) {
    return new Promise((resolve) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();

        const progressBarContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        const percentageSpan = document.getElementById('upload-percentage');
        const successIcon = document.getElementById('upload-complete-icon');
        const errorIcon = document.getElementById('upload-error-icon');
        const errorMessageP = document.getElementById('upload-error-message');

        const resetProgressUI = () => {
            if (progressBarContainer) progressBarContainer.classList.add('hidden');
            if (progressBar) progressBar.value = 0;
            if (percentageSpan) percentageSpan.classList.add('hidden');
            if (successIcon) successIcon.classList.add('hidden');
            if (errorIcon) errorIcon.classList.add('hidden');
            if (errorMessageP) errorMessageP.textContent = '';
        };

        xhr.open('POST', '/upload', true);

        xhr.upload.onprogress = (event) => {
            // Progress no longer shown granularly
        };

        xhr.onload = () => {
            try {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    console.log('Upload Success:', response);
                    if (typeof updateUploadProgress === 'function') {
                        updateUploadProgress(file.name, true, false, null, currentFileNum, totalFiles);
                    }
                    resolve({ success: true, message: response.message });
                } else {
                    let errorMsg = `Upload failed (HTTP ${xhr.status})`;
                    try {
                        const errorResponse = JSON.parse(xhr.responseText);
                        errorMsg = errorResponse.error || errorMsg;
                    } catch (e) { /* Ignore */ }
                    console.error('Upload Error:', errorMsg, xhr.statusText);
                    if (typeof updateUploadProgress === 'function') {
                        updateUploadProgress(file.name, true, true, errorMsg, currentFileNum, totalFiles);
                    }
                    resolve({ success: false, message: errorMsg });
                }
            } catch (error) {
                console.error('Error processing upload response:', error);
                if (typeof updateUploadProgress === 'function') {
                    updateUploadProgress(file.name, true, true, 'Error processing server response.', currentFileNum, totalFiles);
                }
                resolve({ success: false, message: 'Error processing server response.' });
            }
        };

        xhr.onerror = () => {
            console.error('Upload Network Error');
            if (typeof updateUploadProgress === 'function') {
                 updateUploadProgress(file.name, true, true, 'Network error during upload.', currentFileNum, totalFiles);
             }
            resolve({ success: false, message: 'Network error during upload.' });
        };

        xhr.onabort = () => {
            console.log('Upload aborted');
             if (typeof updateUploadProgress === 'function') {
                 updateUploadProgress(file.name, true, true, 'Upload aborted.', currentFileNum, totalFiles);
             }
            resolve({ success: false, message: 'Upload aborted.' });
        };

         xhr.ontimeout = () => {
            console.error('Upload timed out');
             if (typeof updateUploadProgress === 'function') {
                 updateUploadProgress(file.name, true, true, 'Upload timed out.', currentFileNum, totalFiles);
             }
            resolve({ success: false, message: 'Upload timed out.' });
        };
        xhr.timeout = 120000;

        if (typeof updateUploadProgress === 'function') {
            updateUploadProgress(file.name, false, false, null, currentFileNum, totalFiles);
        }
        xhr.send(formData);
    });
}

/**
 * Submits a URL to be added by the backend.
 * @param {string} url - The URL to add.
 * @returns {Promise<object|null>} - The server response on success, or null on error.
 */
async function addUrlAPI(url) {
    try {
        const response = await fetch('/add_url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Adding URL failed (Status: ${response.status})`);
        }

        console.log(`URL ${url} added successfully:`, data);
        return data;
    } catch (error) {
        return null;
    }
}

/**
 * Sends a request to delete all files of a specific type.
 * @param {string} fileType - The type of file to delete ('document', 'image', 'video', 'audio').
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function deleteAllFilesAPI(fileType) {
    console.log(`Attempting to delete all ${fileType}s via API`);
    try {
        const response = await fetch('/delete_all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: fileType }),
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Failed to delete all ${fileType}s (Status ${response.status})`);
        }

        console.log(`Successfully deleted all ${fileType}s:`, data.message);
        return true;
    } catch (error) {
        console.error(`Error deleting all ${fileType}s:`, error);
        if (typeof showErrorMessage === 'function') showErrorMessage(`Delete Error: ${error.message}`);
        return false;
    }
}

/**
 * Sends a request to delete a specific file by its UUID and type.
 * @param {string} uuid - The UUID of the file to delete.
 * @param {string} fileType - The type of the file ('document', 'image', 'video', 'audio').
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function deleteFileByUuidAPI(uuid, fileType) {
    console.log(`Attempting to delete ${fileType} file with UUID ${uuid} via API`);
    try {
        const response = await fetch(`/delete_file/${encodeURIComponent(uuid)}/${encodeURIComponent(fileType)}`, {
            method: 'DELETE',
        });
        const data = await response.json();

        if (!response.ok) {
             if (response.status === 404) {
                console.warn(`File not found for deletion: ${fileType} UUID ${uuid}`);
                if (typeof showInfoMessage === 'function') showInfoMessage('File not found.');
                return false;
             }
            throw new Error(data.error || `Failed to delete ${fileType} file (Status ${response.status})`);
        }

        console.log(`${fileType.charAt(0).toUpperCase() + fileType.slice(1)} deleted successfully (UUID: ${uuid})`);
        return true;
    } catch (error) {
        console.error(`Error deleting ${fileType} ${uuid}:`, error);
        if (typeof showErrorMessage === 'function') showErrorMessage(`Delete Error: ${error.message}`);
        return false;
    }
}

/**
 * Fetches details for a specific workflow entry from the backend.
 * @param {string} timestampStr - The precise timestamp string.
 * @returns {Promise<object|null>} - The details object or null on error.
 */
async function fetchWorkflowDetailAPI(timestampStr) {
    console.log(`Fetching workflow detail for timestamp: ${timestampStr}`);
    try {
        const response = await fetch(`/workflow_detail/${encodeURIComponent(timestampStr)}`);
        const data = await response.json();

        if (!response.ok) {
             if (response.status === 404) {
                console.warn(`Workflow entry not found for timestamp: ${timestampStr}`);
                throw new Error('Query details not found.');
             }
            throw new Error(data.error || `Failed to fetch details (Status ${response.status})`);
        }
        console.log(`Successfully retrieved details for timestamp: ${timestampStr}`);
        return data;
    } catch (error) {
        console.error(`Error fetching workflow detail for ${timestampStr}:`, error);
        throw error;
    }
}

/**
 * Fetches only chat history data (by calling /context_info) and updates the UI.
 */
async function fetchAndRefreshChatHistory() {
    console.log("Fetching and refreshing chat history...");
    try {
        const response = await fetch('/context_info');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
            throw new Error(errorData.error || `Failed to fetch context for history`);
        }
        const data = await response.json();

        if (typeof initializeChatHistoryPagination === 'function') {
            initializeChatHistoryPagination(data.workflow_data || []);
        } else {
            console.error("initializeChatHistoryPagination function not found!");
        }

    } catch (error) {
        console.error('Error fetching/refreshing chat history:', error);
        if (typeof showError === 'function') showError(`Error refreshing chat history: ${error.message}`);
    }
}

// Make API functions globally available (simple approach)
window.sendQuery = sendQuery;
window.sendImageGenerationRequest = sendImageGenerationRequest;
window.loadContextInfo = loadContextInfo;
window.loadImageHistory = loadImageHistory;
window.deleteGeneratedImageAPI = deleteGeneratedImageAPI;
window.fetchMemoryItems = fetchMemoryItems;
window.deleteMemoryAPI = deleteMemoryAPI;
window.deleteHistoryEntryAPI = deleteHistoryEntryAPI;
window.saveMemoryAPI = saveMemoryAPI;
window.uploadFileAPI = uploadFileAPI;
window.addUrlAPI = addUrlAPI;
window.deleteAllFilesAPI = deleteAllFilesAPI;
window.deleteFileByUuidAPI = deleteFileByUuidAPI;
window.fetchWorkflowDetailAPI = fetchWorkflowDetailAPI;
window.fetchAndRefreshChatHistory = fetchAndRefreshChatHistory;

console.log("--- api.js finished executing and functions attached to window --- ");

// --- User Persona Management API Calls ---

/**
 * Fetches the list of personas saved by the current user.
 * @returns {Promise<Array<object>>} - Promise resolving with an array of persona objects.
 */
async function fetchUserPersonasAPI() {
    try {
        const response = await fetch('/user_personas', {
            method: 'GET',
            headers: {},
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Error fetching user personas:', data.error, data.details);
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        console.log('Fetched user personas:', data);
        return data;
    } catch (error) {
        console.error('Failed to fetch user personas:', error);
        throw error;
    }
}

/**
 * Saves a new user persona to the backend.
 * @param {object} personaData - The persona data { persona_name, initial_prompt, final_prompt, llm_params }.
 * @returns {Promise<object>} - Promise resolving with the success/error message.
 */
async function savePersonaAPI(personaData) {
    try {
        const response = await fetch('/save_persona', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(personaData),
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Error saving persona:', data.error, data.details);
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        console.log('Save persona response:', data);
        return data;
    } catch (error) {
        console.error('Failed to save persona:', error);
        throw new Error(error.message || 'Failed to save persona due to a network or server issue.');
    }
}

/**
 * Deletes a specific user persona by name.
 * @param {string} personaName - The name of the persona to delete.
 * @returns {Promise<object>} - Promise resolving with the deletion status.
 */
async function deletePersonaAPI(personaName) {
    try {
        const response = await fetch(`/delete_persona/${encodeURIComponent(personaName)}`, {
            method: 'DELETE',
            headers: {},
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Error deleting persona:', data.error, data.details);
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        console.log('Delete persona response:', data);
        return data;
    } catch (error) {
        console.error('Failed to delete persona:', error);
        throw error;
    }
}

/**
 * Updates an existing user persona on the backend.
 * @param {string} originalPersonaName - The original name of the persona to update (used in URL).
 * @param {object} updatedData - The updated persona data { initial_prompt, final_prompt, llm_params }.
 * @returns {Promise<object>} - Promise resolving with the success/error message.
 */
async function updatePersonaAPI(originalPersonaName, updatedData) {
    try {
        // We don't include persona_name in the body, as renaming isn't supported via this endpoint
        const { initial_prompt, final_prompt, llm_params } = updatedData;
        const bodyPayload = { initial_prompt, final_prompt, llm_params };

        const response = await fetch(`/update_persona/${encodeURIComponent(originalPersonaName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Error updating persona:', data.error, data.details);
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        console.log('Update persona response:', data);
        return data;
    } catch (error) {
        console.error('Failed to update persona:', error);
        throw new Error(error.message || 'Failed to update persona due to a network or server issue.');
    }
}

// --- Make Persona API functions globally available --- //
window.fetchUserPersonasAPI = fetchUserPersonasAPI;
window.savePersonaAPI = savePersonaAPI;
window.deletePersonaAPI = deletePersonaAPI;
window.updatePersonaAPI = updatePersonaAPI;