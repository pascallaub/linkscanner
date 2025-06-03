from fastapi import FastAPI, Query, HTTPException
from starlette.responses import JSONResponse
import requests
import os
import time
import base64
from datetime import datetime, timedelta
from collections import defaultdict
import json
from dotenv import load_dotenv
import pathlib

load_dotenv()
API_KEY = os.getenv("VT_API_KEY")
VT_URL = "https://www.virustotal.com/api/v3/urls"

app = FastAPI()

# Rate Limiting Konfiguration
RATE_LIMITS = {
    "requests_per_minute": 4,
    "daily_quota": 500,
    "monthly_quota": 15500
}

# In-Memory Rate Limit Storage (für Produktion: Redis verwenden)
rate_limit_data = {
    "minute_requests": [],
    "daily_count": 0,
    "monthly_count": 0,
    "last_reset_day": datetime.now().date(),
    "last_reset_month": datetime.now().replace(day=1).date()
}

# Plattformunabhängigen Dateipfad erstellen
DATA_DIR = pathlib.Path("/app/data")
RATE_LIMIT_FILE = DATA_DIR / "rate_limits.json"

# Data-Verzeichnis erstellen falls es nicht existiert
DATA_DIR.mkdir(exist_ok=True)

def load_rate_limit_data():
    """Rate Limit Daten aus Datei laden (persistiert über Container-Neustarts)"""
    try:
        with open(RATE_LIMIT_FILE, 'r') as f:
            data = json.load(f)
            # Datum-Strings zurück zu datetime konvertieren
            data["last_reset_day"] = datetime.strptime(data["last_reset_day"], "%Y-%m-%d").date()
            data["last_reset_month"] = datetime.strptime(data["last_reset_month"], "%Y-%m-%d").date()
            # Minute requests als datetime objects
            data["minute_requests"] = [datetime.fromisoformat(dt) for dt in data["minute_requests"]]
            return data
    except (FileNotFoundError, json.JSONDecodeError):
        return rate_limit_data

def save_rate_limit_data():
    """Rate Limit Daten in Datei speichern"""
    data_to_save = rate_limit_data.copy()
    # Datetime objects zu strings für JSON-Serialisierung
    data_to_save["last_reset_day"] = data_to_save["last_reset_day"].strftime("%Y-%m-%d")
    data_to_save["last_reset_month"] = data_to_save["last_reset_month"].strftime("%Y-%m-%d")
    data_to_save["minute_requests"] = [dt.isoformat() for dt in data_to_save["minute_requests"]]
    
    with open(RATE_LIMIT_FILE, 'w') as f:
        json.dump(data_to_save, f)

# Rate Limit Daten beim Start laden
rate_limit_data.update(load_rate_limit_data())

def reset_daily_quota():
    """Tägliche Quote zurücksetzen"""
    today = datetime.now().date()
    if rate_limit_data["last_reset_day"] < today:
        rate_limit_data["daily_count"] = 0
        rate_limit_data["last_reset_day"] = today
        save_rate_limit_data()

def reset_monthly_quota():
    """Monatliche Quote zurücksetzen"""
    this_month = datetime.now().replace(day=1).date()
    if rate_limit_data["last_reset_month"] < this_month:
        rate_limit_data["monthly_count"] = 0
        rate_limit_data["last_reset_month"] = this_month
        save_rate_limit_data()

def check_rate_limits():
    """Rate Limits prüfen"""
    reset_daily_quota()
    reset_monthly_quota()
    
    now = datetime.now()
    
    # Minute-Rate-Limit prüfen (4 Requests/Minute)
    one_minute_ago = now - timedelta(minutes=1)
    rate_limit_data["minute_requests"] = [
        req_time for req_time in rate_limit_data["minute_requests"] 
        if req_time > one_minute_ago
    ]
    
    if len(rate_limit_data["minute_requests"]) >= RATE_LIMITS["requests_per_minute"]:
        oldest_request = min(rate_limit_data["minute_requests"])
        wait_seconds = 60 - (now - oldest_request).total_seconds()
        return {
            "allowed": False,
            "reason": "minute_limit",
            "wait_seconds": max(1, int(wait_seconds)),
            "message": f"Rate limit exceeded. Wait {int(wait_seconds)} seconds."
        }
    
    # Tägliche Quote prüfen
    if rate_limit_data["daily_count"] >= RATE_LIMITS["daily_quota"]:
        return {
            "allowed": False,
            "reason": "daily_limit",
            "message": f"Daily quota of {RATE_LIMITS['daily_quota']} requests exceeded."
        }
    
    # Monatliche Quote prüfen
    if rate_limit_data["monthly_count"] >= RATE_LIMITS["monthly_quota"]:
        return {
            "allowed": False,
            "reason": "monthly_limit",
            "message": f"Monthly quota of {RATE_LIMITS['monthly_quota']} requests exceeded."
        }
    
    return {"allowed": True}

def record_api_request():
    """API Request aufzeichnen"""
    now = datetime.now()
    rate_limit_data["minute_requests"].append(now)
    rate_limit_data["daily_count"] += 1
    rate_limit_data["monthly_count"] += 1
    save_rate_limit_data()

def get_rate_limit_status():
    """Aktuellen Rate Limit Status zurückgeben"""
    reset_daily_quota()
    reset_monthly_quota()
    
    now = datetime.now()
    one_minute_ago = now - timedelta(minutes=1)
    current_minute_requests = len([
        req_time for req_time in rate_limit_data["minute_requests"] 
        if req_time > one_minute_ago
    ])
    
    return {
        "current_minute_requests": current_minute_requests,
        "max_per_minute": RATE_LIMITS["requests_per_minute"],
        "daily_used": rate_limit_data["daily_count"],
        "daily_quota": RATE_LIMITS["daily_quota"],
        "monthly_used": rate_limit_data["monthly_count"],
        "monthly_quota": RATE_LIMITS["monthly_quota"],
        "next_minute_reset": (now + timedelta(minutes=1)).replace(second=0, microsecond=0).isoformat(),
        "next_daily_reset": (datetime.now() + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat(),
        "next_monthly_reset": (datetime.now().replace(day=1) + timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    }

def scan_with_virustotal(url):
    if not API_KEY:
        return {"error": "API key not found. Please set VT_API_KEY in .env file"}
    
    # Rate Limits prüfen
    rate_check = check_rate_limits()
    if not rate_check["allowed"]:
        return {
            "error": "Rate limit exceeded",
            "details": rate_check["message"],
            "rate_limit_info": get_rate_limit_status()
        }
    
    headers = {
        "x-apikey": API_KEY
    }
    
    # Zuerst versuchen, eine bestehende Analyse zu finden (kostet keine API-Calls)
    url_id = base64.urlsafe_b64encode(url.encode()).decode().strip("=")
    get_url = f"https://www.virustotal.com/api/v3/urls/{url_id}"
    
    # API Request aufzeichnen BEVOR wir die Anfrage machen
    record_api_request()
    
    # Versuche zuerst eine bestehende Analyse abzurufen
    existing_response = requests.get(get_url, headers=headers)
    
    if existing_response.status_code == 200:
        # Bestehende Analyse gefunden
        analysis_data = existing_response.json()
        if "last_analysis_stats" in analysis_data["data"]["attributes"]:
            stats = analysis_data["data"]["attributes"]["last_analysis_stats"]
            return {
                "url": url, 
                "stats": stats, 
                "source": "existing",
                "rate_limit_info": get_rate_limit_status()
            }
    
    # Rate Limits nochmal prüfen bevor wir eine neue Analyse starten
    rate_check = check_rate_limits()
    if not rate_check["allowed"]:
        return {
            "error": "Rate limit exceeded for new scan",
            "details": rate_check["message"],
            "rate_limit_info": get_rate_limit_status()
        }
    
    # Neue Analyse starten (kostet zusätzlichen API-Call)
    record_api_request()
    response = requests.post(VT_URL, headers=headers, data={"url": url})
    
    if response.status_code != 200:
        return {
            "error": "Failed to scan URL with VirusTotal", 
            "status_code": response.status_code, 
            "details": response.text,
            "rate_limit_info": get_rate_limit_status()
        }
    
    # Analyse-ID aus der Antwort extrahieren
    analysis_id = response.json()["data"]["id"]
    analysis_url = f"https://www.virustotal.com/api/v3/analyses/{analysis_id}"
    
    # Warten auf die Analyse (max 60 Sekunden)
    max_attempts = 20
    for attempt in range(max_attempts):
        time.sleep(3)
        
        # Rate Limits vor jedem Polling-Request prüfen
        rate_check = check_rate_limits()
        if not rate_check["allowed"]:
            return {
                "error": "Rate limit exceeded during analysis polling",
                "details": rate_check["message"],
                "rate_limit_info": get_rate_limit_status()
            }
        
        record_api_request()
        analysis_response = requests.get(analysis_url, headers=headers)
        
        if analysis_response.status_code != 200:
            return {
                "error": "Failed to retrieve analysis", 
                "status_code": analysis_response.status_code,
                "rate_limit_info": get_rate_limit_status()
            }
        
        analysis_data = analysis_response.json()
        
        # Prüfen ob die Analyse abgeschlossen ist
        if analysis_data["data"]["attributes"]["status"] == "completed":
            # Jetzt die URL-Analyse abrufen
            rate_check = check_rate_limits()
            if not rate_check["allowed"]:
                return {
                    "error": "Rate limit exceeded for final result",
                    "details": rate_check["message"],
                    "rate_limit_info": get_rate_limit_status()
                }
            
            record_api_request()
            final_response = requests.get(get_url, headers=headers)
            if final_response.status_code == 200:
                final_data = final_response.json()
                if "last_analysis_stats" in final_data["data"]["attributes"]:
                    stats = final_data["data"]["attributes"]["last_analysis_stats"]
                    return {
                        "url": url, 
                        "stats": stats, 
                        "source": "new",
                        "rate_limit_info": get_rate_limit_status()
                    }
        
        print(f"Attempt {attempt + 1}: Status = {analysis_data['data']['attributes']['status']}")
    
    return {
        "error": "Analysis timeout - please try again later",
        "rate_limit_info": get_rate_limit_status()
    }

@app.get("/scan")
def scan(url: str = Query(...)):
    try:
        result = scan_with_virustotal(url)
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "error": str(e),
            "rate_limit_info": get_rate_limit_status()
        })

@app.get("/")
def root():
    return {
        "message": "VirusTotal URL Scanner API", 
        "usage": "/scan?url=https://example.com",
        "rate_limits": RATE_LIMITS,
        "current_status": get_rate_limit_status()
    }

@app.get("/rate-limits")
def rate_limits():
    """Rate Limit Status abrufen"""
    return {
        "rate_limits": RATE_LIMITS,
        "current_status": get_rate_limit_status()
    }