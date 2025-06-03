document.addEventListener('DOMContentLoaded', function() {
  const quickScanBtn = document.getElementById('quickScan');
  const deepScanBtn = document.getElementById('deepScan');
  const urlInput = document.getElementById('urlInput');
  const statusDiv = document.getElementById('status');
  const rateLimitDiv = document.getElementById('rateLimitInfo');
  
  console.log("Popup loaded");

  // Rate Limit Info beim Start laden
  loadRateLimitInfo();

  function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${isError ? 'error' : 'success'}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  function updateRateLimitDisplay(rateLimitInfo) {
    if (!rateLimitDiv || !rateLimitInfo) return;
    
    const minuteUsage = rateLimitInfo.current_minute_requests || 0;
    const minuteMax = rateLimitInfo.max_per_minute || 4;
    const dailyUsage = rateLimitInfo.daily_used || 0;
    const dailyMax = rateLimitInfo.daily_quota || 500;
    const monthlyUsage = rateLimitInfo.monthly_used || 0;
    const monthlyMax = rateLimitInfo.monthly_quota || 15500;
    
    // Farben basierend auf Nutzung
    const minuteColor = minuteUsage >= minuteMax ? '#f44336' : minuteUsage >= minuteMax * 0.8 ? '#ff9800' : '#4caf50';
    const dailyColor = dailyUsage >= dailyMax ? '#f44336' : dailyUsage >= dailyMax * 0.8 ? '#ff9800' : '#4caf50';
    const monthlyColor = monthlyUsage >= monthlyMax ? '#f44336' : monthlyUsage >= monthlyMax * 0.8 ? '#ff9800' : '#4caf50';
    
    // Prozentuale Nutzung
    const dailyPercent = Math.round((dailyUsage / dailyMax) * 100);
    const monthlyPercent = Math.round((monthlyUsage / monthlyMax) * 100);
    
    rateLimitDiv.innerHTML = `
      <div style="font-size: 11px; color: #666; background: #f9f9f9; padding: 8px; border-radius: 4px; margin: 10px 0;">
        <div style="font-weight: bold; margin-bottom: 5px; color: #333;">API Usage Status</div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 6px;">
          <div>
            <div style="color: ${minuteColor}; font-weight: bold;">Minute: ${minuteUsage}/${minuteMax}</div>
            <div style="background: #e0e0e0; height: 4px; border-radius: 2px; overflow: hidden;">
              <div style="background: ${minuteColor}; height: 100%; width: ${(minuteUsage/minuteMax)*100}%; transition: width 0.3s;"></div>
            </div>
          </div>
          
          <div>
            <div style="color: ${dailyColor}; font-weight: bold;">Daily: ${dailyPercent}%</div>
            <div style="background: #e0e0e0; height: 4px; border-radius: 2px; overflow: hidden;">
              <div style="background: ${dailyColor}; height: 100%; width: ${dailyPercent}%; transition: width 0.3s;"></div>
            </div>
          </div>
        </div>
        
        <div style="color: ${monthlyColor}; font-size: 10px;">
          Monthly: ${monthlyUsage.toLocaleString()}/${monthlyMax.toLocaleString()} (${monthlyPercent}%)
        </div>
        
        ${minuteUsage >= minuteMax ? `
          <div style="color: #f44336; font-size: 10px; margin-top: 4px; font-weight: bold;">
            Minute limit reached - wait 60 seconds
          </div>
        ` : ''}
        
        ${dailyUsage >= dailyMax ? `
          <div style="color: #f44336; font-size: 10px; margin-top: 4px; font-weight: bold;">
            Daily quota exhausted
          </div>
        ` : ''}
      </div>
    `;
  }

  async function loadRateLimitInfo() {
    try {
      const response = await fetch('http://localhost:8000/rate-limits');
      if (response.ok) {
        const data = await response.json();
        updateRateLimitDisplay(data.current_status);
      }
    } catch (error) {
      console.warn("Could not load rate limit info:", error);
      if (rateLimitDiv) {
        rateLimitDiv.innerHTML = `
          <div style="font-size: 11px; color: #f44336; background: #ffebee; padding: 8px; border-radius: 4px; margin: 10px 0;">
            Cannot connect to API server
          </div>
        `;
      }
    }
  }

  async function performManualScan(enhanced = false) {
    const url = urlInput.value.trim();
    
    if (!url) {
      showStatus('Please enter a URL to scan', true);
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      showStatus('URL must start with http:// or https://', true);
      return;
    }

    try {
      console.log(`Starting ${enhanced ? 'deep' : 'quick'} manual scan for:`, url);
      
      showStatus(`${enhanced ? 'Deep' : 'Quick'} scan started...`);
      
      // Buttons deaktivieren während Scan
      quickScanBtn.disabled = true;
      deepScanBtn.disabled = true;
      
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Ensure content script
      try {
        await chrome.tabs.sendMessage(tab.id, { action: "ping" });
      } catch (error) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Show progress in content script
      await chrome.tabs.sendMessage(tab.id, {
        action: "showProgress",
        url: url,
        enhanced: enhanced
      });
      
      // Perform scan
      const endpoint = enhanced ? '/enhanced-scan' : '/scan';
      const apiUrl = `http://localhost:8000${endpoint}?url=${encodeURIComponent(url)}`;
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log("Manual scan result:", result);
      
      // Rate Limit Info aktualisieren falls verfügbar
      if (result.rate_limit_info) {
        updateRateLimitDisplay(result.rate_limit_info);
      }
      
      // Show result in content script
      await chrome.tabs.sendMessage(tab.id, {
        action: "showResult",
        url: url,
        result: result,
        enhanced: enhanced
      });
      
      showStatus(`${enhanced ? 'Deep' : 'Quick'} scan completed!`);
      
      // Clear input
      urlInput.value = '';
      
      // Rate Limit Info neu laden nach erfolgreichem Scan
      setTimeout(() => {
        loadRateLimitInfo();
      }, 1000);
      
    } catch (error) {
      console.error("Manual scan failed:", error);
      showStatus(`Error: ${error.message}`, true);
      
      // Try to show error in content script
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, {
          action: "showError",
          error: error.message
        });
      } catch (contentError) {
        console.warn("Could not show error in content script");
      }
      
      // Rate Limit Info auch bei Fehlern aktualisieren
      setTimeout(() => {
        loadRateLimitInfo();
      }, 500);
      
    } finally {
      // Buttons wieder aktivieren
      quickScanBtn.disabled = false;
      deepScanBtn.disabled = false;
    }
  }

  // Event listeners
  quickScanBtn.addEventListener('click', () => performManualScan(false));
  deepScanBtn.addEventListener('click', () => performManualScan(true));
  
  // Enter key support
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performManualScan(false);
    }
  });
  
  // Ctrl+Enter für Deep Scan
  urlInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      performManualScan(true);
    }
  });
  
  // Rate Limit Info alle 30 Sekunden aktualisieren
  setInterval(loadRateLimitInfo, 30000);
  
  // Auto-focus input
  urlInput.focus();
});