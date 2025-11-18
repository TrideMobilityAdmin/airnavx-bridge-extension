/**
 * AirNavX Bridge - Background Service Worker
 * Handles communication between web apps and local AirNavX
 */

// Configuration
const AIRNAVX_CANDIDATE_PORTS = [59720, 51798, 54320, 52000, 50000, 53000];
const AIRNAVX_HOSTS = ['127.0.0.1', 'localhost'];
const DETECTION_TIMEOUT = 2000; // ms per port
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// State
let detectedAirNavX = null;
let lastDetectionTime = null;

/**
 * Detect AirNavX installation
 */
async function detectAirNavX(forceRefresh = false) {
  // Return cached result if recent
  if (!forceRefresh && detectedAirNavX && lastDetectionTime && 
      (Date.now() - lastDetectionTime < CACHE_DURATION)) {
    return detectedAirNavX;
  }

  console.log('🔍 Starting AirNavX detection...');
  
  for (const host of AIRNAVX_HOSTS) {
    for (const port of AIRNAVX_CANDIDATE_PORTS) {
      try {
        const testUrl = `http://${host}:${port}/airnavx/api/viewer/search?q=test&page=1`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DETECTION_TIMEOUT);
        
        const response = await fetch(testUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          detectedAirNavX = { host, port };
          lastDetectionTime = Date.now();
          
          console.log(`✅ AirNavX detected at ${host}:${port}`);
          
          // Save to storage
          await chrome.storage.local.set({
            airnavx_host: host,
            airnavx_port: port,
            last_detection: Date.now()
          });
          
          // Update badge
          chrome.action.setBadgeText({ text: '✓' });
          chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
          
          return detectedAirNavX;
        }
        
      } catch (error) {
        // Port not responding, continue to next
        continue;
      }
    }
  }
  
  console.log('❌ AirNavX not detected');
  detectedAirNavX = null;
  lastDetectionTime = Date.now();
  
  // Update badge
  chrome.action.setBadgeText({ text: '✗' });
  chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
  
  return null;
}

/**
 * Fetch from AirNavX
 */
async function fetchFromAirNavX(endpoint, options = {}) {
  const airnavx = await detectAirNavX();
  
  if (!airnavx) {
    throw new Error('AirNavX not detected. Please ensure AirNavX is running.');
  }
  
  const { host, port } = airnavx;
  const { method = 'GET', params = {}, body = null, timeout = 30000 } = options;
  
  // Build URL
  let url = `http://${host}:${port}${endpoint}`;
  
  if (Object.keys(params).length > 0) {
    const queryString = new URLSearchParams(params).toString();
    url += `?${queryString}`;
  }
  
  console.log(`📡 Fetching: ${method} ${url}`);
  
  // Prepare fetch options
  const fetchOptions = {
    method: method,
    headers: {
      'Accept': 'application/json'
    }
  };
  
  if (body) {
    if (method === 'POST' || method === 'PUT') {
      // For POST requests to AirNavX content endpoint, send empty body
      fetchOptions.body = JSON.stringify(body);
    }
  }
  
  // Add timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  fetchOptions.signal = controller.signal;
  
  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Fetch successful`);
    
    return {
      success: true,
      data: data,
      host: host,
      port: port
    };
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`❌ Fetch failed:`, error);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - AirNavX not responding');
    }
    
    throw error;
  }
}

/**
 * Message handler
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle different action types
  switch (request.action) {
    case 'detect':
      handleDetect(request, sendResponse);
      return true; // Keep channel open
      
    case 'search':
      handleSearch(request, sendResponse);
      return true;
      
    case 'fetchContent':
      handleFetchContent(request, sendResponse);
      return true;
      
    case 'customFetch':
      handleCustomFetch(request, sendResponse);
      return true;
      
    case 'getStatus':
      handleGetStatus(request, sendResponse);
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});

/**
 * Action Handlers
 */
async function handleDetect(request, sendResponse) {
  try {
    const result = await detectAirNavX(request.forceRefresh || false);
    
    if (result) {
      sendResponse({
        success: true,
        host: result.host,
        port: result.port,
        message: `AirNavX detected at ${result.host}:${result.port}`
      });
    } else {
      sendResponse({
        success: false,
        error: 'AirNavX not found. Please ensure it is running.',
        searched_ports: AIRNAVX_CANDIDATE_PORTS
      });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSearch(request, sendResponse) {
  try {
    const { query, page = 1 } = request;
    
    if (!query) {
      sendResponse({ success: false, error: 'Query parameter required' });
      return;
    }
    
    const result = await fetchFromAirNavX('/airnavx/api/viewer/search', {
      method: 'GET',
      params: {
        q: query,
        page: page,
        aggregationList: ['ata2', 'actype', 'customization', 'doctypebc'],
        queryWithAggregation: 'false'
      }
    });
    
    sendResponse(result);
    
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleFetchContent(request, sendResponse) {
  try {
    const { dataModuleId } = request;
    
    if (!dataModuleId) {
      sendResponse({ success: false, error: 'dataModuleId required' });
      return;
    }
    
    const result = await fetchFromAirNavX('/airnavx/api/dataModule/content', {
      method: 'POST',
      params: {
        dataModuleId: dataModuleId,
        forHatch: 'false',
        forPrint: 'false'
      },
      body: {},
      timeout: 30000
    });
    
    sendResponse(result);
    
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCustomFetch(request, sendResponse) {
  try {
    const { endpoint, method, params, body } = request;
    
    if (!endpoint) {
      sendResponse({ success: false, error: 'endpoint required' });
      return;
    }
    
    const result = await fetchFromAirNavX(endpoint, {
      method: method || 'GET',
      params: params || {},
      body: body || null
    });
    
    sendResponse(result);
    
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetStatus(request, sendResponse) {
  const status = {
    detected: detectedAirNavX !== null,
    host: detectedAirNavX?.host || null,
    port: detectedAirNavX?.port || null,
    lastCheck: lastDetectionTime,
    cacheExpiry: lastDetectionTime ? lastDetectionTime + CACHE_DURATION : null
  };
  
  sendResponse({ success: true, status: status });
}

/**
 * On install/startup
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('🚀 AirNavX Bridge installed');
  
  // Try to detect AirNavX on install
  await detectAirNavX(true);
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 AirNavX Bridge started');
  await detectAirNavX(true);
});

// Periodic detection refresh (every 5 minutes)
setInterval(async () => {
  await detectAirNavX(true);
}, 5 * 60 * 1000);