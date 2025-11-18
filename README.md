# AirNavX Bridge Extension

Chrome/Edge extension to connect web applications with local AirNavX installation.

## Features

- ✅ Auto-detects AirNavX on multiple ports
- ✅ No CORS issues
- ✅ Simple JavaScript API
- ✅ Secure (localhost only)
- ✅ Real-time status monitoring

## Installation

### For Users

1. Download the extension files
2. Open Chrome/Edge
3. Go to `chrome://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked"
6. Select the extension folder
7. Done! The extension will auto-detect AirNavX

### For Developers

Use the bridge in your web app:
```javascript
// Wait for bridge
window.addEventListener('airnavx-bridge-ready', async () => {
  // Search tasks
  const result = await window.AirNavXBridge.search('32-11-11-400-001-A');
  
  if (result.success) {
    console.log('Found:', result.data.results);
    
    // Fetch content
    const content = await window.AirNavXBridge.fetchContent(
      result.data.results[0].dataModuleId
    );
    
    // Send to your server for processing
    await fetch('https://your-server.com/api/process', {
      method: 'POST',
      body: JSON.stringify(content.data)
    });
  }
});
```

## API Reference

### `AirNavXBridge.detect(forceRefresh = false)`

Detect AirNavX installation.

**Returns:** `Promise<{success: boolean, host: string, port: number}>`

### `AirNavXBridge.search(query, page = 1)`

Search for tasks.

**Parameters:**
- `query` (string): Search term
- `page` (number): Page number (default: 1)

**Returns:** `Promise<{success: boolean, data: object}>`

### `AirNavXBridge.fetchContent(dataModuleId)`

Fetch task content by data module ID.

**Parameters:**
- `dataModuleId` (string): Data module identifier

**Returns:** `Promise<{success: boolean, data: object}>`

### `AirNavXBridge.customFetch(endpoint, options)`

Make custom AirNavX API call.

**Parameters:**
- `endpoint` (string): API endpoint (e.g., '/airnavx/api/viewer/search')
- `options` (object): { method, params, body }

**Returns:** `Promise<{success: boolean, data: object}>`

### `AirNavXBridge.getStatus()`

Get current connection status.

**Returns:** `Promise<{success: boolean, status: object}>`

## License

MIT License