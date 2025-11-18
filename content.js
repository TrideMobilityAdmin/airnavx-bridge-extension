console.log('🔌 AirNavX Bridge Extension: Content script loaded');

const MESSAGE_PREFIX = 'AIRNAVX_BRIDGE_';

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
            window.postMessage({
                type: MESSAGE_PREFIX + 'RESPONSE',
                requestId,
                error: error.message
            }, '*');
        }
    });
    
    console.log('✅ Message bridge setup complete');
}

// Detect AirNavX installation
async function detectAirNavX(detailed = false) {
    console.log('🔍 Detecting AirNavX...');
    
    const candidatePorts = [59720, 51798, 54320, 52000, 51800, 50000, 53000];
    const hostsToTest = ['127.0.0.1', 'localhost'];
    
    for (const host of hostsToTest) {
        for (const port of candidatePorts) {
            try {
                const testUrl = `http://${host}:${port}/airnavx/api/viewer/search?q=test&page=1`;
                
                const response = await fetch(testUrl, {
                    method: 'GET',
                    headers: { 
                        'Accept': 'application/json'
                    }
                });
                
                if (response.ok) {
                    console.log(`✅ AirNavX found at ${host}:${port}`);
                    return {
                        success: true,
                        host,
                        port,
                        message: `AirNavX detected at ${host}:${port}`
                    };
                }
            } catch (error) {
                // Continue to next port
                continue;
            }
        }
    }
    
    console.log('❌ AirNavX not found on any port');
    return {
        success: false,
        message: 'AirNavX not detected on any port'
    };
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
    
    // Try multiple endpoints and methods
    const attempts = [
        {
            url: `http://${host}:${port}/airnavx/api/dataModule/content`,
            method: 'POST',
            body: { dataModuleId, forHatch: false, forPrint: false }
        },
        {
            url: `http://${host}:${port}/airnavx/api/dataModule/content?dataModuleId=${encodeURIComponent(dataModuleId)}&forHatch=false&forPrint=false`,
            method: 'POST',
            body: {}
        },
        {
            url: `http://${host}:${port}/airnavx/api/dataModule/content?dataModuleId=${encodeURIComponent(dataModuleId)}`,
            method: 'GET',
            body: null
        }
    ];
    
    let lastError = null;
    
    for (const attempt of attempts) {
        try {
            console.log(`📡 Trying: ${attempt.method} ${attempt.url}`);
            
            const fetchOptions = {
                method: attempt.method,
                headers: {
                    'Accept': 'application/json'
                }
            };
            
            if (attempt.method === 'POST' && attempt.body && Object.keys(attempt.body).length > 0) {
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(attempt.body);
            }
            
            const response = await fetch(attempt.url, fetchOptions);
            
            console.log(`📊 Response status: ${response.status}`);
            
            if (response.ok) {
                const data = await response.json();
                const dataSize = JSON.stringify(data).length;
                console.log(`✅ Content fetched successfully: ${dataSize} chars`);
                
                return {
                    success: true,
                    data: data
                };
            }
            
            lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
            
        } catch (error) {
            console.warn(`⚠️ Attempt failed:`, error.message);
            lastError = error;
            continue;
        }
    }
    
    // All attempts failed
    console.error('❌ All content fetch attempts failed');
    throw lastError || new Error('Failed to fetch content');
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