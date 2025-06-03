from fastapi import FastAPI, Query
from starlette.responses import JSONResponse
import requests
import os
import time
import base64
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("VT_API_KEY")
VT_URL = "https://www.virustotal.com/api/v3/urls"

app = FastAPI()

def scan_with_virustotal(url):
    if not API_KEY:
        return {"error": "API key not found. Please set VT_API_KEY in .env file"}
    
    headers = {
        "x-apikey": API_KEY
    }
    
    # Zuerst versuchen, eine bestehende Analyse zu finden
    url_id = base64.urlsafe_b64encode(url.encode()).decode().strip("=")
    get_url = f"https://www.virustotal.com/api/v3/urls/{url_id}"
    
    # Versuche zuerst eine bestehende Analyse abzurufen
    existing_response = requests.get(get_url, headers=headers)
    
    if existing_response.status_code == 200:
        # Bestehende Analyse gefunden
        analysis_data = existing_response.json()
        if "last_analysis_stats" in analysis_data["data"]["attributes"]:
            stats = analysis_data["data"]["attributes"]["last_analysis_stats"]
            return {"url": url, "stats": stats, "source": "existing"}
    
    # Wenn keine bestehende Analyse vorhanden ist, neue Analyse starten
    response = requests.post(VT_URL, headers=headers, data={"url": url})
    
    if response.status_code != 200:
        return {"error": "Failed to scan URL with VirusTotal", "status_code": response.status_code, "details": response.text}
    
    # Analyse-ID aus der Antwort extrahieren
    analysis_id = response.json()["data"]["id"]
    analysis_url = f"https://www.virustotal.com/api/v3/analyses/{analysis_id}"
    
    # Warten auf die Analyse (max 60 Sekunden)
    max_attempts = 20
    for attempt in range(max_attempts):
        time.sleep(3)
        analysis_response = requests.get(analysis_url, headers=headers)
        
        if analysis_response.status_code != 200:
            return {"error": "Failed to retrieve analysis", "status_code": analysis_response.status_code}
        
        analysis_data = analysis_response.json()
        
        # Prüfen ob die Analyse abgeschlossen ist
        if analysis_data["data"]["attributes"]["status"] == "completed":
            # Jetzt die URL-Analyse abrufen
            final_response = requests.get(get_url, headers=headers)
            if final_response.status_code == 200:
                final_data = final_response.json()
                if "last_analysis_stats" in final_data["data"]["attributes"]:
                    stats = final_data["data"]["attributes"]["last_analysis_stats"]
                    return {"url": url, "stats": stats, "source": "new"}
        
        print(f"Attempt {attempt + 1}: Status = {analysis_data['data']['attributes']['status']}")
    
    return {"error": "Analysis timeout - please try again later"}

@app.get("/scan")
def scan(url: str = Query(...)):
    try:
        result = scan_with_virustotal(url)
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/")
def root():
    return {"message": "VirusTotal URL Scanner API", "usage": "/scan?url=https://example.com"}