// WebSocket connection and chat functionality
let socket = null;
let sessionId = getSessionId();
let isConnected = false;

// DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const connectionStatus = document.getElementById('connection-status');

// Track if we're currently processing
let isProcessing = false;

// Get session ID - either from URL parameter, injected session name, or generate new one
function getSessionId() {
    // Check if session name was injected by server (for /session/:name routes)
    if (window.GOOSE_SESSION_NAME) {
        return window.GOOSE_SESSION_NAME;
    }
    
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session') || urlParams.get('name');
    if (sessionParam) {
        return sessionParam;
    }
    
    // Generate new session ID using CLI format
    return generateSessionId();
}

// Generate a session ID using timestamp format (yyyymmdd_hhmmss) like CLI
function generateSessionId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}_${hour}${minute}${second}`;
}

// Format timestamp
function formatTimestamp(date) {
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// Create message element
function createMessageElement(content, role, timestamp) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    // Create content div
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = formatMessageContent(content);
    messageDiv.appendChild(contentDiv);
    
    // Add timestamp
    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'timestamp';
    timestampDiv.textContent = formatTimestamp(new Date(timestamp || Date.now()));
    messageDiv.appendChild(timestampDiv);
    
    return messageDiv;
}

// Format message content (handle markdown-like formatting)
function formatMessageContent(content) {
    // Escape HTML
    let formatted = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Handle code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'plaintext'}">${code.trim()}</code></pre>`;
    });
    
    // Handle inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Handle line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

// Add message to chat
function addMessage(content, role, timestamp) {
    // Remove welcome message if it exists
    const welcomeMessage = messagesContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
    
    const messageElement = createMessageElement(content, role, timestamp);
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add thinking indicator
function addThinkingIndicator() {
    removeThinkingIndicator(); // Remove any existing one first
    
    const thinkingDiv = document.createElement('div');
    thinkingDiv.id = 'thinking-indicator';
    thinkingDiv.className = 'message thinking-message';
    thinkingDiv.innerHTML = `
        <div class="thinking-dots">
            <span></span>
            <span></span>
            <span></span>
        </div>
        <span class="thinking-text">goose is thinking...</span>
    `;
    messagesContainer.appendChild(thinkingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Remove thinking indicator
function removeThinkingIndicator() {
    const thinking = document.getElementById('thinking-indicator');
    if (thinking) {
        thinking.remove();
    }
}

// Connect to WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = window.GOOSE_WS_TOKEN || '';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log('WebSocket connected');
        isConnected = true;
        connectionStatus.textContent = 'Connected';
        connectionStatus.className = 'status connected';
        sendButton.disabled = false;
        
        // Check if this session exists and load history if it does
        loadSessionIfExists();
    };
    
    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    };
    
    socket.onclose = () => {
        console.log('WebSocket disconnected');
        isConnected = false;
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.className = 'status disconnected';
        sendButton.disabled = true;
        
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Handle messages from server
function handleServerMessage(data) {
    switch (data.type) {
        case 'response':
            // For streaming responses, we need to handle partial messages
            handleStreamingResponse(data);
            break;
        case 'tool_request':
            handleToolRequest(data);
            break;
        case 'tool_response':
            handleToolResponse(data);
            break;
        case 'tool_confirmation':
            handleToolConfirmation(data);
            break;
        case 'thinking':
            handleThinking(data);
            break;
        case 'context_exceeded':
            handleContextExceeded(data);
            break;
        case 'cancelled':
            handleCancelled(data);
            break;
        case 'complete':
            handleComplete(data);
            break;
        case 'error':
            removeThinkingIndicator();
            resetSendButton();
            addMessage(`Error: ${data.message}`, 'assistant', Date.now());
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

// Track current streaming message
let currentStreamingMessage = null;

// Handle streaming responses
function handleStreamingResponse(data) {
    removeThinkingIndicator();
    
    // If this is the first chunk of a new message, or we don't have a current streaming message
    if (!currentStreamingMessage) {
        // Create a new message element
        const messageElement = createMessageElement(data.content, data.role || 'assistant', data.timestamp);
        messageElement.setAttribute('data-streaming', 'true');
        messagesContainer.appendChild(messageElement);
        
        currentStreamingMessage = {
            element: messageElement,
            content: data.content,
            role: data.role || 'assistant',
            timestamp: data.timestamp
        };
    } else {
        // Append to existing streaming message
        currentStreamingMessage.content += data.content;
        
        // Update the message content using the proper content div
        const contentDiv = currentStreamingMessage.element.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.innerHTML = formatMessageContent(currentStreamingMessage.content);
        }
    }
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle tool requests
function handleToolRequest(data) {
    removeThinkingIndicator(); // Remove thinking when tool starts
    
    // Reset streaming message so tool doesn't interfere with message flow
    currentStreamingMessage = null;
    
    const toolDiv = document.createElement('div');
    toolDiv.className = 'message assistant tool-message';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'tool-header';
    headerDiv.textContent = '🔧 ';
    const toolStrong = document.createElement('strong');
    toolStrong.textContent = data.tool_name;
    headerDiv.appendChild(toolStrong);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'tool-content';

    // Helper to create a pre>code block safely (no innerHTML)
    function createPreCode(text) {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = text;
        pre.appendChild(code);
        return pre;
    }

    // Helper to create a tool-param div safely (no innerHTML)
    function createToolParamDiv(label, value) {
        const paramDiv = document.createElement('div');
        paramDiv.className = 'tool-param';
        const strong = document.createElement('strong');
        strong.textContent = label;
        paramDiv.appendChild(strong);
        paramDiv.appendChild(document.createTextNode(' ' + value));
        return paramDiv;
    }

    // Format the arguments using DOM APIs to prevent XSS
    if (data.tool_name === 'developer__shell' && data.arguments.command) {
        contentDiv.appendChild(createPreCode(data.arguments.command));
    } else if (data.tool_name === 'developer__text_editor') {
        const action = data.arguments.command || 'unknown';
        const filePath = data.arguments.path || 'unknown';
        contentDiv.appendChild(createToolParamDiv('action:', action));
        contentDiv.appendChild(createToolParamDiv('path:', filePath));
        if (data.arguments.file_text) {
            const contentParam = document.createElement('div');
            contentParam.className = 'tool-param';
            const contentStrong = document.createElement('strong');
            contentStrong.textContent = 'content:';
            contentParam.appendChild(contentStrong);
            contentParam.appendChild(document.createTextNode(' '));
            const truncated = data.arguments.file_text.substring(0, 200) + (data.arguments.file_text.length > 200 ? '...' : '');
            contentParam.appendChild(createPreCode(truncated));
            contentDiv.appendChild(contentParam);
        }
    } else {
        contentDiv.appendChild(createPreCode(JSON.stringify(data.arguments, null, 2)));
    }
    
    toolDiv.appendChild(headerDiv);
    toolDiv.appendChild(contentDiv);
    
    // Add a "running" indicator
    const runningDiv = document.createElement('div');
    runningDiv.className = 'tool-running';
    runningDiv.innerHTML = '⏳ Running...';
    toolDiv.appendChild(runningDiv);
    
    messagesContainer.appendChild(toolDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle tool responses
function handleToolResponse(data) {
    // Remove the "running" indicator from the last tool message
    const toolMessages = messagesContainer.querySelectorAll('.tool-message');
    if (toolMessages.length > 0) {
        const lastToolMessage = toolMessages[toolMessages.length - 1];
        const runningIndicator = lastToolMessage.querySelector('.tool-running');
        if (runningIndicator) {
            runningIndicator.remove();
        }
    }
    
    if (data.is_error) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message tool-error';
        errorDiv.innerHTML = `<strong>Tool Error:</strong> ${escapeHtml(data.result.error || 'Unknown error')}`;
        messagesContainer.appendChild(errorDiv);
    } else {
        // Handle successful tool response
        if (Array.isArray(data.result)) {
            data.result.forEach(content => {
                if (content.type === 'text' && content.text) {
                    const responseDiv = document.createElement('div');
                    responseDiv.className = 'message tool-result';
                    responseDiv.innerHTML = `<pre>${escapeHtml(content.text)}</pre>`;
                    messagesContainer.appendChild(responseDiv);
                }
            });
        }
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Reset streaming message so next assistant response creates a new message
    currentStreamingMessage = null;
    
    // Show thinking indicator because assistant will likely follow up with explanation
    // Only show if we're still processing (cancel button is active)
    if (isProcessing) {
        addThinkingIndicator();
    }
}

// Handle tool confirmations
function handleToolConfirmation(data) {
    const confirmDiv = document.createElement('div');
    confirmDiv.className = 'message tool-confirmation';
    const confirmHeader = document.createElement('div');
    confirmHeader.className = 'tool-confirm-header';
    confirmHeader.textContent = '⚠️ Tool Confirmation Required';
    confirmDiv.appendChild(confirmHeader);

    const confirmContent = document.createElement('div');
    confirmContent.className = 'tool-confirm-content';
    const confirmToolName = document.createElement('strong');
    confirmToolName.textContent = data.tool_name;
    confirmContent.appendChild(confirmToolName);
    confirmContent.appendChild(document.createTextNode(' wants to execute with:'));
    const confirmPre = document.createElement('pre');
    const confirmCode = document.createElement('code');
    confirmCode.textContent = JSON.stringify(data.arguments, null, 2);
    confirmPre.appendChild(confirmCode);
    confirmContent.appendChild(confirmPre);
    confirmDiv.appendChild(confirmContent);

    const confirmNote = document.createElement('div');
    confirmNote.className = 'tool-confirm-note';
    confirmNote.textContent = 'Auto-approved in web mode (UI coming soon)';
    confirmDiv.appendChild(confirmNote);
    messagesContainer.appendChild(confirmDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle thinking messages
function handleThinking(data) {
    // For now, just log thinking messages
    console.log('Thinking:', data.message);
}

// Handle context exceeded
function handleContextExceeded(data) {
    const contextDiv = document.createElement('div');
    contextDiv.className = 'message context-warning';
    contextDiv.innerHTML = `
        <div class="context-header">⚠️ Context Length Exceeded</div>
        <div class="context-content">${escapeHtml(data.message)}</div>
        <div class="context-note">Auto-summarizing conversation...</div>
    `;
    messagesContainer.appendChild(contextDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle cancelled operation
function handleCancelled(data) {
    removeThinkingIndicator();
    resetSendButton();
    
    const cancelDiv = document.createElement('div');
    cancelDiv.className = 'message system-message cancelled';
    cancelDiv.innerHTML = `<em>${escapeHtml(data.message)}</em>`;
    messagesContainer.appendChild(cancelDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle completion of response
function handleComplete(data) {
    removeThinkingIndicator();
    resetSendButton();
    // Finalize any streaming message
    if (currentStreamingMessage) {
        currentStreamingMessage = null;
    }
}

// Reset send button to normal state
function resetSendButton() {
    isProcessing = false;
    sendButton.textContent = 'Send';
    sendButton.classList.remove('cancel-mode');
}

// Escape HTML to prevent XSS (string-based to ensure static analysis can verify safety)
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Send message or cancel
function sendMessage() {
    if (isProcessing) {
        // Cancel the current operation
        socket.send(JSON.stringify({
            type: 'cancel',
            session_id: sessionId
        }));
        return;
    }
    
    const message = messageInput.value.trim();
    if (!message || !isConnected) return;
    
    // Add user message to chat
    addMessage(message, 'user', Date.now());
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // Add thinking indicator
    addThinkingIndicator();
    
    // Update button to show cancel
    isProcessing = true;
    sendButton.textContent = 'Cancel';
    sendButton.classList.add('cancel-mode');
    
    // Send message through WebSocket
    socket.send(JSON.stringify({
        type: 'message',
        content: message,
        session_id: sessionId,
        timestamp: Date.now()
    }));
}

// Handle suggestion pill clicks
function sendSuggestion(text) {
    if (!isConnected || isProcessing) return;
    
    messageInput.value = text;
    sendMessage();
}

// Load session history if the session exists (like --resume in CLI)
async function loadSessionIfExists() {
    try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (response.ok) {
            const sessionData = await response.json();
            if (sessionData.messages && sessionData.messages.length > 0) {
                // Remove welcome message since we're resuming
                const welcomeMessage = messagesContainer.querySelector('.welcome-message');
                if (welcomeMessage) {
                    welcomeMessage.remove();
                }
                
                // Display session resumed message
                const resumeDiv = document.createElement('div');
                resumeDiv.className = 'message system-message';
                resumeDiv.innerHTML = `<em>Session resumed: ${sessionData.messages.length} messages loaded</em>`;
                messagesContainer.appendChild(resumeDiv);
                                
                // Update page title with session description if available
                if (sessionData.metadata && sessionData.metadata.description) {
                    document.title = `goose chat - ${sessionData.metadata.description}`;
                }
                
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }
    } catch (error) {
        console.log('No existing session found or error loading:', error);
        // This is fine - just means it's a new session
    }
}


// Event listeners
sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-resize textarea
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
});

// Initialize WebSocket connection
connectWebSocket();

// Read 'q' parameter from URL and set it to the message input
function getQueryParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const queryParam = urlParams.get('q');
    if (queryParam) {
        messageInput.value = queryParam;
        urlParams.delete('q');
        
        let newUrl = window.location.pathname;
        if (urlParams.toString()) {
            newUrl = `${window.location.pathname}?${urlParams.toString()}`;
        }
        window.history.replaceState({}, '', newUrl);
    }
}

getQueryParam();

// Focus on input
messageInput.focus();

// Update session title
function updateSessionTitle() {
    const titleElement = document.getElementById('session-title');
    // Just show "goose chat" - no need to show session ID
    titleElement.textContent = 'goose chat';
}

// Update title on load
updateSessionTitle();
