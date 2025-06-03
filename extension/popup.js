document.addEventListener('DOMContentLoaded', function() {
  const urlInput = document.getElementById('urlInput');
  const scanBtn = document.getElementById('scanBtn');
  const result = document.getElementById('result');
  
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
      
      if (data.error) {
        showResult(`Error: ${data.error}`, 'error');
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