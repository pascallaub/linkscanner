document.addEventListener('DOMContentLoaded', function() {
  const urlInput = document.getElementById('urlInput');
  const scanBtn = document.getElementById('scanBtn');
  const result = document.getElementById('result');
  const rateLimitInfo = document.getElementById('rateLimitInfo');
  
  // Rate Limit Status beim Öffnen laden
  loadRateLimitStatus();
  
  scanBtn.addEventListener('click', async function() {
    const url = urlInput.value.trim();
    
    if (!url) {
      showResult('Please enter a URL', 'error');
      return;
    }
    
    // Sofort den Scanning-Status anzeigen
    showScanningProgress();
    scanBtn.textContent = 'Scanning...';
    scanBtn.disabled = true;
    
    try {
      const response = await fetch(`http://localhost:8000/scan?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      
      // Rate Limit Info aktualisieren
      if (data.rate_limit_info) {
        updateRateLimitDisplay(data.rate_limit_info);
      }
      
      if (data.error) {
        if (data.error.includes("Rate limit exceeded")) {
          showResult(`⚠️ ${data.error}<br><small>${data.details}</small>`, 'warning');
        } else {
          showResult(`Error: ${data.error}`, 'error');
        }
      } else if (data.stats) {
        const stats = data.stats;
        const malicious = stats.malicious || 0;
        const suspicious = stats.suspicious || 0;
        const clean = stats.harmless || 0;
        
        const status = malicious > 0 ? 'MALICIOUS' : suspicious > 0 ? 'SUSPICIOUS' : 'CLEAN';
        const className = malicious > 0 ? 'error' : suspicious > 0 ? 'warning' : 'success';
        
        showResult(`
          <strong>Status:</strong> ${status}<br>
          <strong>Malicious:</strong> ${malicious}<br>
          <strong>Suspicious:</strong> ${suspicious}<br>
          <strong>Clean:</strong> ${clean}<br>
          <strong>Source:</strong> ${data.source || 'new scan'}
        `, className);
      }
    } catch (error) {
      showResult('Connection to scanner failed', 'error');
    }
    
    scanBtn.textContent = 'Scan URL';
    scanBtn.disabled = false;
  });
  
  async function loadRateLimitStatus() {
    try {
      const response = await fetch('http://localhost:8000/rate-limits');
      const data = await response.json();
      updateRateLimitDisplay(data.current_status);
    } catch (error) {
      console.log('Could not load rate limit status:', error);
    }
  }
  
  function updateRateLimitDisplay(rateLimitInfo) {
    const minuteProgress = (rateLimitInfo.current_minute_requests / rateLimitInfo.max_per_minute) * 100;
    const dailyProgress = (rateLimitInfo.daily_used / rateLimitInfo.daily_quota) * 100;
    const monthlyProgress = (rateLimitInfo.monthly_used / rateLimitInfo.monthly_quota) * 100;
    
    rateLimitInfo.innerHTML = `
      <h3>API Usage</h3>
      <div class="rate-limit-item">
        <span>Per Minute: ${rateLimitInfo.current_minute_requests}/${rateLimitInfo.max_per_minute}</span>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${minuteProgress}%"></div>
        </div>
      </div>
      <div class="rate-limit-item">
        <span>Daily: ${rateLimitInfo.daily_used}/${rateLimitInfo.daily_quota}</span>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${dailyProgress}%"></div>
        </div>
      </div>
      <div class="rate-limit-item">
        <span>Monthly: ${rateLimitInfo.monthly_used}/${rateLimitInfo.monthly_quota}</span>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${monthlyProgress}%"></div>
        </div>
      </div>
    `;
  }
  
  function showScanningProgress() {
    result.innerHTML = `
      <div class="scanning">
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
        </div>
        <p>🔍 Scanning URL with VirusTotal...</p>
        <p><small>This may take up to 60 seconds</small></p>
      </div>
    `;
    result.className = 'scanning';
    result.style.display = 'block';
  }
  
  function showResult(message, type) {
    result.innerHTML = message;
    result.className = type;
    result.style.display = 'block';
  }
});