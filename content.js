console.log('🔌 AirNavX Bridge Extension: Content script loaded');

const MESSAGE_PREFIX = 'AIRNAVX_BRIDGE_';

// Cache for AirNavX detection (valid for 30 seconds)
let airnavxCache = null;
let airnavxCacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30 seconds

// Setup message bridge
function setupMessageBridge() {
    console.log('🔧 Setting up message bridge...');
    
    // Listen for messages from the page
    window.addEventListener('message', async (event) => {
        // Only accept messages from same origin
        if (event.source !== window) return;
        
        const { type, method, params, requestId } = event.data;
        
        // CRITICAL: Only handle REQUEST messages
        if (type !== MESSAGE_PREFIX + 'REQUEST') return;
        
        // Validate that method exists
        if (!method) {
            console.error('❌ No method provided in request');
            return;
        }
        
        console.log('📨 Received REQUEST from page:', { method, params, requestId });
        
        try {
            let result;
            
            switch (method) {
                case 'detect':
                    result = await detectAirNavX(params?.detailed || false);
                    break;
                    
                case 'search':
                    result = await searchTasks(params?.query, params?.page);
                    break;
                    
                case 'fetchContent':
                    result = await fetchContent(params?.dataModuleId);
                    break;
                    
                default:
                    throw new Error(`Unknown method: ${method}`);
            }
            
            console.log('✅ Sending RESPONSE to page:', { requestId, success: true });
            
            // Send response back to page
            window.postMessage({
                type: MESSAGE_PREFIX + 'RESPONSE',
                requestId,
                result
            }, '*');
            
        } catch (error) {
            console.error('❌ Bridge error:', error);

            // Provide detailed error message
            let errorMessage = error.message;
            if (error.stack) {
                console.error('Stack trace:', error.stack);
            }

            window.postMessage({
                type: MESSAGE_PREFIX + 'RESPONSE',
                requestId,
                error: errorMessage,
                errorDetails: {
                    method,
                    params,
                    timestamp: new Date().toISOString()
                }
            }, '*');
        }
    });
    
    console.log('✅ Message bridge setup complete');
}

// Detect AirNavX installation
async function detectAirNavX(detailed = false) {
    console.log('🔍 Detecting AirNavX...');

    // Check cache first
    const now = Date.now();
    if (airnavxCache && (now - airnavxCacheTimestamp) < CACHE_DURATION) {
        console.log('✅ Using cached AirNavX detection result');
        return airnavxCache;
    }

    const candidatePorts = [59720, 51798, 54320, 52000, 51800, 50000, 53000];
    const hostsToTest = ['127.0.0.1', 'localhost'];

    for (const host of hostsToTest) {
        for (const port of candidatePorts) {
            try {
                const testUrl = `http://${host}:${port}/airnavx/api/viewer/search?q=test&page=1`;

                // Add timeout to prevent hanging
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout per port

                const response = await fetch(testUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    console.log(`✅ AirNavX found at ${host}:${port}`);
                    const result = {
                        success: true,
                        host,
                        port,
                        message: `AirNavX detected at ${host}:${port}`
                    };
                    // Cache the successful result
                    airnavxCache = result;
                    airnavxCacheTimestamp = Date.now();
                    return result;
                }
            } catch (error) {
                // Silently continue to next port (timeout or connection refused is expected)
                continue;
            }
        }
    }

    console.log('❌ AirNavX not found on any port');
    const result = {
        success: false,
        message: 'AirNavX not detected on any port'
    };
    // Cache the failure result (shorter duration)
    airnavxCache = result;
    airnavxCacheTimestamp = Date.now();
    return result;
}

// Search for tasks
async function searchTasks(query, page = 1) {
    console.log(`🔍 Searching for: "${query}"`);
    
    // First detect AirNavX
    const detection = await detectAirNavX();
    if (!detection.success) {
        throw new Error('AirNavX not available');
    }
    
    const { host, port } = detection;
    const searchUrl = `http://${host}:${port}/airnavx/api/viewer/search`;
    const params = new URLSearchParams({
        q: query,
        page: page.toString(),
        aggregationList: ['ata2', 'actype', 'customization', 'doctypebc'],
        queryWithAggregation: 'false'
    });
    
    console.log(`📡 Fetching: ${searchUrl}?${params}`);
    
    const response = await fetch(`${searchUrl}?${params}`, {
        method: 'GET',
        headers: { 
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`✅ Search found ${data.results?.length || 0} results`);
    
    return {
        success: true,
        data: data
    };
}

// Fetch content for a task - CRITICAL: This runs in content script context (no CORS!)
async function fetchContent(dataModuleId) {
    console.log(`📄 Fetching content for: ${dataModuleId}`);

    if (!dataModuleId) {
        throw new Error('dataModuleId is required');
    }

    // First detect AirNavX
    const detection = await detectAirNavX();
    if (!detection.success) {
        throw new Error('AirNavX not available');
    }

    const { host, port } = detection;

    // Try multiple endpoints and methods - prioritize GET requests first (POST was giving 405)
    const attempts = [
        // Try GET with different query parameter variations
        {
            name: 'GET with dataModuleId param',
            url: `http://${host}:${port}/airnavx/api/dataModule/content?dataModuleId=${encodeURIComponent(dataModuleId)}`,
            method: 'GET'
        },
        {
            name: 'GET with all params',
            url: `http://${host}:${port}/airnavx/api/dataModule/content?dataModuleId=${encodeURIComponent(dataModuleId)}&forHatch=false&forPrint=false`,
            method: 'GET'
        },
        {
            name: 'GET with dmCode param',
            url: `http://${host}:${port}/airnavx/api/dataModule/content?dmCode=${encodeURIComponent(dataModuleId)}`,
            method: 'GET'
        },
        {
            name: 'GET with id param',
            url: `http://${host}:${port}/airnavx/api/dataModule/content?id=${encodeURIComponent(dataModuleId)}`,
            method: 'GET'
        },
        {
            name: 'GET alternative endpoint',
            url: `http://${host}:${port}/airnavx/api/content/${encodeURIComponent(dataModuleId)}`,
            method: 'GET'
        },
        {
            name: 'GET viewer endpoint',
            url: `http://${host}:${port}/airnavx/api/viewer/content?dataModuleId=${encodeURIComponent(dataModuleId)}`,
            method: 'GET'
        },
        // Try POST as last resort
        {
            name: 'POST with JSON body',
            url: `http://${host}:${port}/airnavx/api/dataModule/content`,
            method: 'POST',
            body: { dataModuleId, forHatch: false, forPrint: false }
        }
    ];

    const errors = [];

    for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        try {
            console.log(`📡 Attempt ${i + 1}/${attempts.length}: ${attempt.name}`);
            console.log(`   ${attempt.method} ${attempt.url}`);

            // Create abort controller for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const fetchOptions = {
                method: attempt.method,
                headers: {
                    'Accept': 'application/json'
                },
                signal: controller.signal
            };

            // Add body for POST requests
            if (attempt.method === 'POST' && attempt.body) {
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(attempt.body);
            }

            const response = await fetch(attempt.url, fetchOptions);
            clearTimeout(timeoutId);

            console.log(`📊 Response: ${response.status} ${response.statusText}`);

            if (response.ok) {
                // Try to parse as JSON
                const contentType = response.headers.get('content-type');
                console.log(`📦 Content-Type: ${contentType}`);

                let data;
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    // If not JSON, try to parse as text
                    const text = await response.text();
                    console.log(`📄 Received text response: ${text.substring(0, 100)}...`);
                    data = text;
                }

                const dataSize = typeof data === 'string' ? data.length : JSON.stringify(data).length;
                console.log(`✅ Content fetched successfully: ${dataSize} chars`);

                return {
                    success: true,
                    data: data,
                    method: attempt.name
                };
            }

            // Log non-OK responses
            const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            console.warn(`⚠️ ${errorMsg}`);
            errors.push(`${attempt.name}: ${errorMsg}`);

        } catch (error) {
            const errorMsg = error.name === 'AbortError' ? 'Request timeout (10s)' : error.message;
            console.warn(`⚠️ ${attempt.name} failed: ${errorMsg}`);
            errors.push(`${attempt.name}: ${errorMsg}`);
            continue;
        }
    }

    // All attempts failed - provide detailed error
    console.error('❌ All content fetch attempts failed');
    console.error('Errors:', errors);

    const detailedError = new Error(`Failed to fetch content after ${attempts.length} attempts:\n${errors.join('\n')}`);
    throw detailedError;
}

// Initialize the bridge
setupMessageBridge();

// Inject the separate script file (CSP-compliant)
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = function() {
    console.log('✅ Injected script loaded successfully');
    this.remove();
};
script.onerror = function() {
    console.error('❌ Failed to load injected script');
};

(document.head || document.documentElement).appendChild(script);
console.log('📦 Injected script added to page');