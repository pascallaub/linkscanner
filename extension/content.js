console.log("Link Scanner Content Script loaded");

// Nur einmal laden
if (window.linkScannerLoaded) {
  console.log("Already loaded, skipping...");
} else {
  window.linkScannerLoaded = true;
  
  // Message Listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content script received:", message);
    
    try {
      switch (message.action) {
        case "ping":
          sendResponse({ status: "ready" });
          break;
          
        case "showProgress":
          showScanProgress(message.url, message.enhanced);
          sendResponse({ status: "progress_shown" });
          break;
          
        case "showResult":
          showScanResult(message.url, message.result, message.enhanced);
          sendResponse({ status: "result_shown" });
          break;
          
        case "showError":
          showError(message.error);
          sendResponse({ status: "error_shown" });
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
      sendResponse({ status: "error", error: error.message });
    }
    
    return true;
  });
}

function createPopup() {
  const overlay = document.createElement('div');
  overlay.id = 'linkscanner-popup';
  overlay.className = 'linkscanner-overlay';
  
  const popup = document.createElement('div');
  popup.className = 'linkscanner-popup';
  
  overlay.appendChild(popup);
  
  return { overlay, popup };
}

function showScanProgress(url, enhanced) {
  console.log(`Showing ${enhanced ? 'deep' : 'quick'} scan progress for:`, url);
  
  removeExistingPopup();
  
  const { overlay, popup } = createPopup();
  const scanType = enhanced ? "Deep Scan with VT Graph" : "Quick Scan";
  
  popup.innerHTML = `
    <div class="linkscanner-header">
      <h2 class="linkscanner-title">${scanType}</h2>
    </div>
    
    <div class="linkscanner-url">
      <strong>URL:</strong> ${url}
    </div>
    
    <div class="linkscanner-progress">
      <div class="linkscanner-progress-text">
        ${enhanced ? 'Performing deep analysis with Graph & Domain data...' : 'Scanning with VirusTotal...'}
      </div>
      <div class="linkscanner-spinner"></div>
      <div style="margin-top: 16px; font-size: 13px; color: #666; font-weight: 500;">
        ${enhanced ? 'This may take 10-30 seconds for comprehensive analysis' : 'Usually takes 5-15 seconds'}
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
}

function showScanResult(url, result, enhanced) {
  console.log("Showing scan result:", result);
  
  removeExistingPopup();
  
  const { overlay, popup } = createPopup();
  
  let content = '';
  
  // Header mit Close Button
  const scanType = enhanced ? "Deep Scan Result" : "Quick Scan Result";
  content += `
    <div class="linkscanner-header">
      <h2 class="linkscanner-title">${scanType}</h2>
      <button class="linkscanner-close" id="close-popup">×</button>
    </div>
  `;
  
  // URL
  content += `
    <div class="linkscanner-url">
      <strong>URL:</strong> ${url}
    </div>
  `;
  
  // Error Handling
  if (result.error) {
    content += `
      <div class="linkscanner-error">
        <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">Scan Error</h4>
        <p style="margin: 0; font-size: 14px; font-weight: 500;">${result.error}</p>
        ${result.details ? `<p style="margin: 8px 0 0 0; font-size: 13px; opacity: 0.9;">${result.details}</p>` : ''}
      </div>
    `;
  }
  
  // Basic Scan Results mit verbesserter Lesbarkeit
  if (result.stats) {
    const stats = result.stats;
    const total = stats.malicious + stats.suspicious + stats.undetected + stats.harmless;
    const threatLevel = stats.malicious > 0 ? 'HIGH' : stats.suspicious > 0 ? 'MEDIUM' : 'LOW';
    const status = stats.malicious > 0 ? 'THREAT DETECTED' : stats.suspicious > 0 ? 'SUSPICIOUS' : 'CLEAN';
    
    content += `
      <div class="linkscanner-section">
        <div class="linkscanner-section-title">${status}</div>
        <div class="linkscanner-stats">
          <div class="linkscanner-stat malicious">
            <div class="linkscanner-stat-number">${stats.malicious}</div>
            <div class="linkscanner-stat-label">Malicious</div>
          </div>
          <div class="linkscanner-stat suspicious">
            <div class="linkscanner-stat-number">${stats.suspicious}</div>
            <div class="linkscanner-stat-label">Suspicious</div>
          </div>
          <div class="linkscanner-stat clean">
            <div class="linkscanner-stat-number">${stats.harmless}</div>
            <div class="linkscanner-stat-label">Clean</div>
          </div>
          <div class="linkscanner-stat undetected">
            <div class="linkscanner-stat-number">${stats.undetected}</div>
            <div class="linkscanner-stat-label">Undetected</div>
          </div>
        </div>
        <div class="linkscanner-section-content">
          <div class="linkscanner-info-row">
            <span class="linkscanner-info-label">Total Engines:</span>
            <span class="linkscanner-info-value">${total}</span>
          </div>
          <div class="linkscanner-info-row">
            <span class="linkscanner-info-label">Data Source:</span>
            <span class="linkscanner-info-value">${result.source || 'unknown'}</span>
          </div>
        </div>
      </div>
    `;
  }
  
  // Enhanced Analysis Features (nur bei Deep Scan)
  if (enhanced && result.scan_type === 'enhanced') {
    
    // Graph Analysis
    if (result.graph_analysis) {
      const graph = result.graph_analysis;
      
      if (graph.graphs_found > 0) {
        content += `
          <div class="linkscanner-section">
            <div class="linkscanner-section-title">🕸️ VT Graph Analysis</div>
            <div class="linkscanner-section-content">
              <div class="linkscanner-info-row">
                <span class="linkscanner-info-label">Graphs Found:</span>
                <span class="linkscanner-info-value">${graph.graphs_found}</span>
              </div>
              <div class="linkscanner-info-row">
                <span class="linkscanner-info-label">Search Query:</span>
                <span class="linkscanner-info-value">${graph.search_query}</span>
              </div>
              
              ${graph.graph_summaries && graph.graph_summaries.length > 0 ? `
                <details style="margin-top: 12px;">
                  <summary style="cursor: pointer; font-weight: 600; color: #1976d2; font-size: 14px; padding: 8px 0;">
                    Graph Details (${graph.graph_summaries.length})
                  </summary>
                  <div style="margin-top: 8px;">
                    ${graph.graph_summaries.map((summary, index) => `
                      <div class="linkscanner-graph-item">
                        <div class="linkscanner-graph-name">${index + 1}. ${summary.name}</div>
                        <div class="linkscanner-graph-meta">
                          <div><strong>Created:</strong> ${summary.creation_date || 'Unknown'}</div>
                          <div><strong>Creator:</strong> ${summary.creator}</div>
                          ${summary.total_nodes ? `<div><strong>Structure:</strong> ${summary.total_nodes} nodes, ${summary.total_links} links</div>` : ''}
                          ${summary.node_types ? `<div><strong>Types:</strong> ${summary.node_types.join(', ')}</div>` : ''}
                          ${summary.related_objects ? `<div><strong>Related Objects:</strong> ${summary.related_objects}</div>` : ''}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </details>
              ` : ''}
            </div>
          </div>
        `;
      } else {
        content += `
          <div class="linkscanner-warning">
            <strong>🔍 Graph Search:</strong> ${graph.message || 'No existing graphs found for this domain'}
          </div>
        `;
      }
    }
    
    // Domain Analysis
    if (result.domain_analysis && result.domain_analysis.available) {
      const domain = result.domain_analysis;
      const rep = domain.reputation || 0;
      const repStatus = rep > 0 ? 'Good' : rep < -10 ? 'Poor' : 'Neutral';
      
      content += `
        <div class="linkscanner-section">
          <div class="linkscanner-section-title">Domain Analysis</div>
          <div class="linkscanner-section-content">
            <div class="linkscanner-info-row">
              <span class="linkscanner-info-label">Reputation:</span>
              <span class="linkscanner-info-value">${repStatus} (${rep})</span>
            </div>
            <div class="linkscanner-info-row">
              <span class="linkscanner-info-label">Categories:</span>
              <span class="linkscanner-info-value">${Object.keys(domain.categories || {}).length} found</span>
            </div>
            ${domain.last_analysis_stats ? `
              <div class="linkscanner-info-row">
                <span class="linkscanner-info-label">Domain Stats:</span>
                <span class="linkscanner-info-value">
                  M:${domain.last_analysis_stats.malicious || 0} 
                  S:${domain.last_analysis_stats.suspicious || 0} 
                  C:${domain.last_analysis_stats.harmless || 0}
                </span>
              </div>
            ` : ''}
            ${domain.registrar ? `
              <div class="linkscanner-info-row">
                <span class="linkscanner-info-label">Registrar:</span>
                <span class="linkscanner-info-value">${domain.registrar}</span>
              </div>
            ` : ''}
            ${domain.country ? `
              <div class="linkscanner-info-row">
                <span class="linkscanner-info-label">Country:</span>
                <span class="linkscanner-info-value">${domain.country}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }
    
    // Enhanced Analysis Summary
    if (result.enhanced_analysis) {
      const enhanced_info = result.enhanced_analysis;
      
      content += `
        <div class="linkscanner-section">
          <div class="linkscanner-section-title">Analysis Summary</div>
          <div class="linkscanner-section-content">
            <div class="linkscanner-info-row">
              <span class="linkscanner-info-label">Analysis Type:</span>
              <span class="linkscanner-info-value">${enhanced_info.analysis_type || 'enhanced'}</span>
            </div>
            <div class="linkscanner-info-row">
              <span class="linkscanner-info-label">Depth:</span>
              <span class="linkscanner-info-value">${enhanced_info.analysis_depth || 'comprehensive'}</span>
            </div>
            <div class="linkscanner-info-row">
              <span class="linkscanner-info-label">Graph Search:</span>
              <span class="linkscanner-info-value">${enhanced_info.graph_search_performed ? 'Performed' : 'Skipped'}</span>
            </div>
            <div class="linkscanner-info-row">
              <span class="linkscanner-info-label">Features Used:</span>
              <span class="linkscanner-info-value">${enhanced_info.features_used ? enhanced_info.features_used.length : 'Basic scan'}</span>
            </div>
          </div>
        </div>
      `;
    }
  }
  
  // Rate Limit Info
  if (result.rate_limit_info) {
    const rate = result.rate_limit_info;
    const minutePercent = Math.round((rate.current_minute_requests / rate.max_per_minute) * 100);
    const dailyPercent = Math.round((rate.daily_used / rate.daily_quota) * 100);
    const monthlyPercent = Math.round((rate.monthly_used / rate.monthly_quota) * 100);
    
    content += `
      <div class="linkscanner-api-usage">
        <div class="linkscanner-api-title">API Usage</div>
        <div class="linkscanner-api-stats">
          <div class="linkscanner-api-stat">
            <div class="linkscanner-api-number">${rate.current_minute_requests}/${rate.max_per_minute}</div>
            <div class="linkscanner-api-label">Minute (${minutePercent}%)</div>
          </div>
          <div class="linkscanner-api-stat">
            <div class="linkscanner-api-number">${rate.daily_used}/${rate.daily_quota}</div>
            <div class="linkscanner-api-label">Daily (${dailyPercent}%)</div>
          </div>
          <div class="linkscanner-api-stat">
            <div class="linkscanner-api-number">${rate.monthly_used}/${rate.monthly_quota}</div>
            <div class="linkscanner-api-label">Monthly (${monthlyPercent}%)</div>
          </div>
          ${rate.minute_reset_in_seconds ? `
            <div class="linkscanner-api-stat">
              <div class="linkscanner-api-number">${rate.minute_reset_in_seconds}s</div>
              <div class="linkscanner-api-label">Reset</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  // Timestamp
  const timestamp = result.analysis_timestamp || new Date().toISOString();
  content += `
    <div class="linkscanner-timestamp">
      Analysis completed: ${new Date(timestamp).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })}
    </div>
  `;
  
  popup.innerHTML = content;
  document.body.appendChild(overlay);
  
  // Close button event
  const closeBtn = popup.querySelector('#close-popup');
  if (closeBtn) {
    closeBtn.onclick = () => removeExistingPopup();
  }
  
  // Close on overlay click
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      removeExistingPopup();
    }
  };
  
  // Auto-close nach 45 Sekunden für Deep Scan, 30 für Quick Scan
  setTimeout(() => {
    removeExistingPopup();
  }, enhanced ? 45000 : 30000);
}

function showError(error) {
  console.log("Showing error:", error);
  
  removeExistingPopup();
  
  const { overlay, popup } = createPopup();
  
  popup.innerHTML = `
    <div class="linkscanner-header">
      <h2 class="linkscanner-title">Scan Error</h2>
      <button class="linkscanner-close" id="close-popup">×</button>
    </div>
    
    <div class="linkscanner-error">
      <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Error Details:</div>
      <div style="font-size: 14px; line-height: 1.4;">${error}</div>
    </div>
    
    <div class="linkscanner-section">
      <div class="linkscanner-section-title">Possible Solutions</div>
      <div class="linkscanner-section-content">
        <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
          <li>Check if API server is running at <code>http://localhost:8000</code></li>
          <li>Verify network connection</li>
          <li>Check if rate limits are exceeded</li>
          <li>Ensure URL format is valid</li>
          <li>Try again in a few seconds</li>
        </ul>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const closeBtn = popup.querySelector('#close-popup');
  if (closeBtn) {
    closeBtn.onclick = () => removeExistingPopup();
  }
  
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      removeExistingPopup();
    }
  };
  
  setTimeout(() => removeExistingPopup(), 20000);
}

function removeExistingPopup() {
  const existing = document.getElementById('linkscanner-popup');
  if (existing) {
    // Fade out animation
    existing.style.opacity = '0';
    existing.style.transform = 'scale(0.95)';
    setTimeout(() => existing.remove(), 200);
  }
}

// Verbesserte Styles für bessere Lesbarkeit:

const styles = `
  .linkscanner-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }

  .linkscanner-popup {
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    position: relative;
    color: #333;
    font-weight: 400;
  }

  .linkscanner-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 2px solid #f0f0f0;
  }

  .linkscanner-title {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0;
    letter-spacing: -0.2px;
  }

  .linkscanner-close {
    background: #f44336;
    color: white;
    border: none;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .linkscanner-close:hover {
    background: #d32f2f;
  }

  .linkscanner-url {
    background: #f8f9fa;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    border-left: 4px solid #2196f3;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
    font-size: 13px;
    word-break: break-all;
    color: #2c3e50;
    font-weight: 500;
  }

  .linkscanner-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 16px;
    margin: 20px 0;
  }

  .linkscanner-stat {
    text-align: center;
    padding: 16px 12px;
    border-radius: 10px;
    border: 2px solid transparent;
    font-weight: 600;
  }

  .linkscanner-stat.clean {
    background: #e8f5e8;
    border-color: #4caf50;
    color: #2e7d32;
  }

  .linkscanner-stat.malicious {
    background: #ffebee;
    border-color: #f44336;
    color: #c62828;
  }

  .linkscanner-stat.suspicious {
    background: #fff3e0;
    border-color: #ff9800;
    color: #ef6c00;
  }

  .linkscanner-stat.undetected {
    background: #f3e5f5;
    border-color: #9c27b0;
    color: #7b1fa2;
  }

  .linkscanner-stat-number {
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 4px;
  }

  .linkscanner-stat-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.8;
  }

  .linkscanner-section {
    margin: 24px 0;
    padding: 20px;
    background: #fafafa;
    border-radius: 10px;
    border: 1px solid #e0e0e0;
  }

  .linkscanner-section-title {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0 0 12px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .linkscanner-section-content {
    font-size: 14px;
    line-height: 1.6;
    color: #444;
  }

  .linkscanner-info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
    font-size: 14px;
  }

  .linkscanner-info-row:last-child {
    border-bottom: none;
  }

  .linkscanner-info-label {
    font-weight: 600;
    color: #555;
    min-width: 120px;
  }

  .linkscanner-info-value {
    color: #333;
    font-weight: 500;
    text-align: right;
    flex: 1;
  }

  .linkscanner-graph-item {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 16px;
    margin: 12px 0;
  }

  .linkscanner-graph-name {
    font-size: 15px;
    font-weight: 600;
    color: #1976d2;
    margin-bottom: 8px;
  }

  .linkscanner-graph-meta {
    font-size: 13px;
    color: #666;
    line-height: 1.4;
  }

  .linkscanner-api-usage {
    background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
    border: 1px solid #bbdefb;
    border-radius: 10px;
    padding: 16px;
    margin: 20px 0;
  }

  .linkscanner-api-title {
    font-size: 14px;
    font-weight: 600;
    color: #1976d2;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .linkscanner-api-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 12px;
    font-size: 13px;
  }

  .linkscanner-api-stat {
    text-align: center;
    font-weight: 600;
  }

  .linkscanner-api-number {
    font-size: 16px;
    font-weight: 700;
    color: #1976d2;
  }

  .linkscanner-api-label {
    font-size: 11px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .linkscanner-progress {
    text-align: center;
    padding: 40px 20px;
  }

  .linkscanner-progress-text {
    font-size: 16px;
    font-weight: 500;
    color: #1976d2;
    margin-bottom: 16px;
  }

  .linkscanner-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e3f2fd;
    border-top: 4px solid #1976d2;
    border-radius: 50%;
    animation: linkscanner-spin 1s linear infinite;
    margin: 0 auto;
  }

  @keyframes linkscanner-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .linkscanner-timestamp {
    text-align: center;
    font-size: 12px;
    color: #888;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #eee;
    font-weight: 500;
  }

  .linkscanner-warning {
    background: #fff3cd;
    border: 1px solid #ffeaa7;
    border-left: 4px solid #fdcb6e;
    color: #856404;
    padding: 12px 16px;
    border-radius: 6px;
    margin: 12px 0;
    font-size: 14px;
    font-weight: 500;
  }

  .linkscanner-success {
    background: #d4edda;
    border: 1px solid #c3e6cb;
    border-left: 4px solid #28a745;
    color: #155724;
    padding: 12px 16px;
    border-radius: 6px;
    margin: 12px 0;
    font-size: 14px;
    font-weight: 500;
  }

  .linkscanner-error {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-left: 4px solid #dc3545;
    color: #721c24;
    padding: 12px 16px;
    border-radius: 6px;
    margin: 12px 0;
    font-size: 14px;
    font-weight: 600;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .linkscanner-popup {
      margin: 20px;
      padding: 20px;
      max-height: calc(100vh - 40px);
    }

    .linkscanner-title {
      font-size: 18px;
    }

    .linkscanner-stats {
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .linkscanner-stat-number {
      font-size: 24px;
    }

    .linkscanner-url {
      font-size: 12px;
    }
  }

  /* Dark Mode Support */
  @media (prefers-color-scheme: dark) {
    .linkscanner-popup {
      background: #2d3748;
      color: #e2e8f0;
    }

    .linkscanner-title {
      color: #f7fafc;
    }

    .linkscanner-url {
      background: #4a5568;
      color: #e2e8f0;
    }

    .linkscanner-section {
      background: #4a5568;
      border-color: #718096;
    }

    .linkscanner-section-title {
      color: #f7fafc;
    }

    .linkscanner-info-row {
      border-color: #718096;
    }

    .linkscanner-info-label {
      color: #cbd5e0;
    }

    .linkscanner-info-value {
      color: #e2e8f0;
    }
  }
`;

// Styles in das Dokument einfügen
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

// Erweiterte Styles am Ende der content.js hinzufügen:
const additionalStyles = `
  .linkscanner-overlay {
    transition: opacity 0.3s ease, visibility 0.3s ease;
  }
  
  .linkscanner-popup {
    transition: transform 0.3s ease, opacity 0.3s ease;
    transform: scale(1);
  }
  
  /* Bessere Code-Darstellung */
  code {
    background: #f1f3f4;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
    font-size: 12px;
    color: #d73a49;
    font-weight: 600;
  }
  
  /* Verbesserte Listen */
  ul li {
    margin: 6px 0;
    font-size: 14px;
    font-weight: 500;
  }
  
  /* Details/Summary Styling */
  details summary {
    outline: none;
    user-select: none;
  }
  
  details[open] summary {
    margin-bottom: 8px;
  }
  
  /* Scrollbar Styling */
  .linkscanner-popup::-webkit-scrollbar {
    width: 8px;
  }
  
  .linkscanner-popup::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }
  
  .linkscanner-popup::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
  }
  
  .linkscanner-popup::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
`;

// Zusätzliche Styles hinzufügen
const additionalStyleSheet = document.createElement("style");
additionalStyleSheet.type = "text/css";
additionalStyleSheet.innerText = additionalStyles;
document.head.appendChild(additionalStyleSheet);