(function() {
    'use strict';
    
    console.log('🔌 AirNavX Bridge API: Initializing...');
    
    const MESSAGE_PREFIX = 'AIRNAVX_BRIDGE_';
    let requestCounter = 0;
    const pendingRequests = new Map();
    
    // Listen for responses from content script
    window.addEventListener('message', (event) => {
        // Only accept messages from same window
        if (event.source !== window) return;
        
        const { type, requestId, result, error } = event.data;
        
        // CRITICAL: Only handle RESPONSE messages
        if (type !== MESSAGE_PREFIX + 'RESPONSE') return;
        
        console.log('📨 Received RESPONSE:', { requestId, hasResult: !!result, hasError: !!error });
        
        const pending = pendingRequests.get(requestId);
        if (pending) {
            if (error) {
                console.error('❌ Request failed:', error);
                pending.reject(new Error(error));
            } else {
                console.log('✅ Request succeeded');
                pending.resolve(result);
            }
            pendingRequests.delete(requestId);
        } else {
            console.warn('⚠️ Received response for unknown request:', requestId);
        }
    });
    
    // Create the API - These methods ONLY send messages, they don't fetch!
    window.AirNavXBridge = {
        detect: function(detailed = false) {
            console.log('🔍 API: detect() called');
            return sendMessage('detect', { detailed });
        },
        
        search: function(query, page = 1) {
            console.log('🔍 API: search() called with query:', query);
            return sendMessage('search', { query, page });
        },
        
        fetchContent: function(dataModuleId) {
            console.log('📄 API: fetchContent() called for:', dataModuleId);
            return sendMessage('fetchContent', { dataModuleId });
        }
    };
    
    // CRITICAL: This function ONLY sends postMessage, does NOT fetch!
    function sendMessage(method, params) {
        return new Promise((resolve, reject) => {
            const requestId = ++requestCounter;
            
            console.log('📤 Sending REQUEST to content script:', { requestId, method, params });
            
            pendingRequests.set(requestId, { resolve, reject });
            
            // Send message to content script (which will do the actual fetch)
            window.postMessage({
                type: MESSAGE_PREFIX + 'REQUEST',
                method,
                params,
                requestId
            }, '*');
            
            // Timeout after 30 seconds
            setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    console.error('⏱️ Request timeout:', { requestId, method });
                    pendingRequests.delete(requestId);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }
    
    console.log('✅ AirNavX Bridge API ready');
    console.log('📋 Available methods: detect(), search(), fetchContent()');
    
    // Dispatch custom event to notify page that API is ready
    window.dispatchEvent(new CustomEvent('AirNavXBridgeReady'));
})();