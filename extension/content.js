console.log("Content script loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received:", message);
  
  if (message.action === "ping") {
    sendResponse({status: "ready"});
    return true;
  }
  
  if (message.action === "showScanResult") {
    showScanResult(message.url, message.result);
  } else if (message.action === "showScanProgress") {
    showScanProgress(message.url);
  }
  
  return true; // Wichtig für asynchrone Antworten
});

function showScanProgress(url) {
  console.log("Showing progress for:", url);
  
  // Remove existing notifications
  const existing = document.getElementById('linkscanner-notification');
  if (existing) {
    existing.remove();
  }

  // Create progress notification
  const notification = document.createElement('div');
  notification.id = 'linkscanner-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #e3f2fd;
    border: 2px solid #1976d2;
    border-radius: 8px;
    padding: 15px;
    max-width: 400px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: Arial, sans-serif;
    color: #1976d2;
  `;

  notification.innerHTML = `
    <h3>🔍 Scanning Link...</h3>
    <p><strong>URL:</strong> ${url}</p>
    <div style="width: 100%; height: 6px; background: #f0f0f0; border-radius: 3px; margin: 10px 0;">
      <div style="height: 100%; background: #4CAF50; border-radius: 3px; animation: pulse 1.5s ease-in-out infinite; width: 100%;"></div>
    </div>
    <p><small>Please wait, this may take up to 60 seconds...</small></p>
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }
    </style>
  `;
  
  document.body.appendChild(notification);
}

function showScanResult(url, result) {
  console.log("Showing result for:", url, result);
  
  // Remove existing notifications
  const existing = document.getElementById('linkscanner-notification');
  if (existing) {
    existing.remove();
  }

  // Create result notification
  const notification = document.createElement('div');
  notification.id = 'linkscanner-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 2px solid #333;
    border-radius: 8px;
    padding: 15px;
    max-width: 400px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: Arial, sans-serif;
  `;

  let content = `<h3>Link Scan Result</h3><p><strong>URL:</strong> ${url}</p>`;
  
  if (result.error) {
    content += `<p style="color: red;"><strong>Error:</strong> ${result.error}</p>`;
  } else if (result.stats) {
    const stats = result.stats;
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const clean = stats.harmless || 0;
    
    const color = malicious > 0 ? 'red' : suspicious > 0 ? 'orange' : 'green';
    
    content += `
      <div style="color: ${color};">
        <p><strong>Status:</strong> ${malicious > 0 ? 'MALICIOUS ⚠️' : suspicious > 0 ? 'SUSPICIOUS ⚠️' : 'CLEAN ✅'}</p>
        <p>Malicious: ${malicious}, Suspicious: ${suspicious}, Clean: ${clean}</p>
        <p>Source: ${result.source || 'new scan'}</p>
      </div>
    `;
  }
  
  content += '<button id="close-notification" style="margin-top: 10px; padding: 5px 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>';
  
  notification.innerHTML = content;
  document.body.appendChild(notification);
  
  // Auto-close after 15 seconds
  setTimeout(() => {
    if (document.getElementById('linkscanner-notification')) {
      notification.remove();
    }
  }, 15000);
  
  // Close button
  const closeBtn = document.getElementById('close-notification');
  if (closeBtn) {
    closeBtn.onclick = () => {
      notification.remove();
    };
  }
}