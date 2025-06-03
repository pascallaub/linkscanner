// Health Check beim Extension-Start
chrome.runtime.onStartup.addListener(checkAPIHealth);
chrome.runtime.onInstalled.addListener(checkAPIHealth);

async function checkAPIHealth() {
  try {
    const response = await fetch('http://localhost:8000/');
    if (!response.ok) {
      showAPIWarning();
    }
  } catch (error) {
    showAPIWarning();
  }
}

function showAPIWarning() {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    title: 'LinkScanner API nicht verfügbar',
    message: 'Bitte starten Sie Docker und führen Sie "docker-compose up" aus.'
  });
}

console.log("Link Scanner Background loaded");

let scanInProgress = false;

// Context Menu erstellen
chrome.runtime.onInstalled.addListener(() => {
  // Parent Menu
  chrome.contextMenus.create({
    id: "linkScannerParent",
    title: "Link Scanner",
    contexts: ["link", "page"]
  });

  // Quick Scan
  chrome.contextMenus.create({
    id: "quickScan",
    parentId: "linkScannerParent",
    title: "Quick Scan",
    contexts: ["link", "page"]
  });

  // Deep Scan
  chrome.contextMenus.create({
    id: "deepScan",
    parentId: "linkScannerParent", 
    title: "Deep Scan (VT Graph)",
    contexts: ["link", "page"]
  });

  console.log("Context menus created");
});

// Context Menu Click Handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("Context menu clicked:", info.menuItemId, info);
  
  if (scanInProgress) {
    console.log("Scan already in progress, ignoring");
    return;
  }

  try {
    scanInProgress = true;
    
    // URL bestimmen
    let url = info.linkUrl || info.pageUrl || tab.url;
    console.log("Scanning URL:", url);
    
    const enhanced = info.menuItemId === "deepScan";
    
    // Content Script injizieren falls nötig
    await ensureContentScript(tab.id);
    
    // Scan starten
    await performScan(tab, url, enhanced);
    
  } catch (error) {
    console.error("Context menu scan failed:", error);
    
    // Fehler anzeigen
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "showError",
        error: error.message
      });
    } catch (msgError) {
      console.error("Could not show error:", msgError);
    }
  } finally {
    scanInProgress = false;
  }
});

async function ensureContentScript(tabId) {
  try {
    // Test ob Content Script bereits läuft
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
    console.log("Content script already active");
  } catch (error) {
    console.log("Injecting content script...");
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    // Warten auf Initialisierung
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

async function performScan(tab, url, enhanced) {
  console.log(`Starting ${enhanced ? 'deep' : 'quick'} scan for:`, url);
  
  try {
    // Progress anzeigen
    await chrome.tabs.sendMessage(tab.id, {
      action: "showProgress",
      url: url,
      enhanced: enhanced
    });
    
    // API Call
    const endpoint = enhanced ? '/enhanced-scan' : '/scan';
    const apiUrl = `http://localhost:8000${endpoint}?url=${encodeURIComponent(url)}`;
    
    console.log("API URL:", apiUrl);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log("Scan result:", result);
    
    // Ergebnis anzeigen mit Rate Limit Info
    await chrome.tabs.sendMessage(tab.id, {
      action: "showResult",
      url: url,
      result: result,
      enhanced: enhanced
    });
    
    // Rate Limit Info an alle offenen Popups senden
    try {
      chrome.runtime.sendMessage({
        action: "updateRateLimit",
        rateLimitInfo: result.rate_limit_info
      });
    } catch (error) {
      console.log("No popup open to update rate limit info");
    }
    
  } catch (error) {
    console.error("Scan failed:", error);
    throw error;
  }
}

// Message Handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);
  
  if (message.action === "ping") {
    sendResponse({ status: "background_ready" });
  } else if (message.action === "getRateLimit") {
    // Rate Limit Info direkt vom Server abrufen
    fetch('http://localhost:8000/rate-limits')
      .then(response => response.json())
      .then(data => {
        sendResponse({ rateLimitInfo: data.current_status });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true; // Asynchrone Antwort
  }
  
  return true;
});