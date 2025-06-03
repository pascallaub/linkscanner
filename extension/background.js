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

chrome.contextMenus.create({
  id: "scanLink",
  title: "Scan Link with VirusTotal",
  contexts: ["link"]
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "scanLink") {
    // Erst prüfen ob Content Script bereit ist
    chrome.tabs.sendMessage(tab.id, {action: "ping"}, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Content script not ready, injecting...");
        // Content Script manuell injizieren
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }, () => {
          // Nach Injektion nochmal versuchen
          setTimeout(() => {
            startScan(info.linkUrl, tab);
          }, 100);
        });
      } else {
        startScan(info.linkUrl, tab);
      }
    });
  }
});

function startScan(url, tab) {
  chrome.tabs.sendMessage(tab.id, {
    action: "showScanProgress",
    url: url
  });
  
  scanUrl(url, tab);
}

// Platform-Detection hinzufügen:
function detectPlatform() {
  return new Promise((resolve) => {
    chrome.runtime.getPlatformInfo((info) => {
      resolve(info.os); // "win", "mac", "linux"
    });
  });
}

// API URLs basierend auf Platform
async function getAPIUrl() {
  const platform = await detectPlatform();
  const baseUrls = [
    'http://localhost:8000',
    'http://127.0.0.1:8000'
  ];
  
  // Auf allen Plattformen beide URLs versuchen
  for (const url of baseUrls) {
    try {
      const response = await fetch(`${url}/`);
      if (response.ok) {
        return url;
      }
    } catch (error) {
      continue;
    }
  }
  
  throw new Error('API not available on any URL');
}

// In scan-Funktionen verwenden:
async function scanUrl(url, tab) {
  try {
    const apiUrl = await getAPIUrl();
    const response = await fetch(`${apiUrl}/scan?url=${encodeURIComponent(url)}`);
    const result = await response.json();
    
    chrome.tabs.sendMessage(tab.id, {
      action: "showScanResult",
      url: url,
      result: result
    });
  } catch (error) {
    console.error("Scan failed:", error);
    chrome.tabs.sendMessage(tab.id, {
      action: "showScanResult",
      url: url,
      result: { error: "Connection to scanner failed" }
    });
  }
}