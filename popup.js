/**
 * AirNavX Bridge - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const detectBtn = document.getElementById('detectBtn');
  const testBtn = document.getElementById('testBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const connectionInfo = document.getElementById('connectionInfo');
  const hostValue = document.getElementById('hostValue');
  const portValue = document.getElementById('portValue');
  const testResults = document.getElementById('testResults');
  const testOutput = document.getElementById('testOutput');
  
  // Check status on load
  await checkStatus();
  
  // Detect button
  detectBtn.addEventListener('click', async () => {
    detectBtn.disabled = true;
    detectBtn.innerHTML = '<div class="loading"></div> Detecting...';
    
    try {
      const result = await sendMessage({ action: 'detect', forceRefresh: true });
      await checkStatus();
    } catch (error) {
      console.error('Detection error:', error);
    } finally {
      detectBtn.disabled = false;
      detectBtn.innerHTML = '🔍 Detect AirNavX';
    }
  });
  
  // Test button
  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testBtn.innerHTML = '<div class="loading"></div> Testing...';
    
    try {
      // Test search
      const searchResult = await sendMessage({
        action: 'search',
        query: 'test',
        page: 1
      });
      
      testResults.style.display = 'block';
      
      if (searchResult.success) {
        const resultsCount = searchResult.data?.results?.length || 0;
        testOutput.textContent = `✅ Connection successful!\n\nSearch test returned ${resultsCount} results.\n\nHost: ${searchResult.host}\nPort: ${searchResult.port}`;
      } else {
        testOutput.textContent = `❌ Test failed:\n${searchResult.error}`;
      }
    } catch (error) {
      testOutput.textContent = `❌ Test error:\n${error.message}`;
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = '🧪 Test Connection';
    }
  });
  
  /**
   * Check current status
   */
  async function checkStatus() {
    try {
      const result = await sendMessage({ action: 'getStatus' });
      
      if (result.success && result.status.detected) {
        // Online
        statusDot.className = 'status-dot online';
        statusText.textContent = 'Connected';
        statusText.style.color = '#10B981';
        
        hostValue.textContent = result.status.host;
        portValue.textContent = result.status.port;
        
        connectionInfo.style.display = 'block';
        testBtn.disabled = false;
      } else {
        // Offline
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Not Connected';
        statusText.style.color = '#DC2626';
        
        connectionInfo.style.display = 'none';
        testBtn.disabled = true;
      }
    } catch (error) {
      console.error('Status check error:', error);
      statusDot.className = 'status-dot offline';
      statusText.textContent = 'Error';
      statusText.style.color = '#DC2626';
    }
  }
  
  /**
   * Send message to background script
   */
  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }
});