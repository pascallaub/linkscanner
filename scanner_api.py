import os
import time
import base64
import json
import requests
import pickle
from datetime import datetime, timedelta
from urllib.parse import urlparse
from collections import defaultdict
from pathlib import Path

from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging

# Logging konfigurieren
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# VirusTotal API Key
API_KEY = os.getenv("VT_API_KEY")
if not API_KEY:
    logger.error("VT_API_KEY environment variable not set")
    raise ValueError("VirusTotal API key is required")

logger.info(f"API Key loaded: {API_KEY[:8]}...")

# Rate Limiting
RATE_LIMITS = {
    "requests_per_minute": 4,
    "daily_quota": 500,
    "monthly_quota": 15500
}

# Persistent Data Directory
DATA_DIR = Path("/app/data")
DATA_DIR.mkdir(exist_ok=True)
RATE_LIMIT_FILE = DATA_DIR / "rate_limits.pkl"

# Request tracking - Persistent
request_times = []
daily_requests = defaultdict(int)
monthly_requests = defaultdict(int)

def save_rate_limit_data():
    """Save rate limit data to disk"""
    try:
        data = {
            "request_times": request_times,
            "daily_requests": dict(daily_requests),
            "monthly_requests": dict(monthly_requests),
            "last_saved": time.time()
        }
        with open(RATE_LIMIT_FILE, "wb") as f:
            pickle.dump(data, f)
        logger.debug("Rate limit data saved")
    except Exception as e:
        logger.error(f"Failed to save rate limit data: {e}")

def load_rate_limit_data():
    """Load rate limit data from disk"""
    global request_times, daily_requests, monthly_requests
    
    try:
        if RATE_LIMIT_FILE.exists():
            with open(RATE_LIMIT_FILE, "rb") as f:
                data = pickle.load(f)
            
            # Load data
            request_times = data.get("request_times", [])
            daily_requests = defaultdict(int, data.get("daily_requests", {}))
            monthly_requests = defaultdict(int, data.get("monthly_requests", {}))
            
            # Clean old minute requests (older than 60 seconds)
            current_time = time.time()
            cutoff_time = current_time - 60
            request_times = [t for t in request_times if t > cutoff_time]
            
            # Clean old daily data (older than 7 days)
            seven_days_ago = datetime.now() - timedelta(days=7)
            cutoff_date = seven_days_ago.strftime("%Y-%m-%d")
            daily_requests = defaultdict(int, {
                date: count for date, count in daily_requests.items() 
                if date >= cutoff_date
            })
            
            # Clean old monthly data (older than 12 months)
            twelve_months_ago = datetime.now() - timedelta(days=365)
            cutoff_month = twelve_months_ago.strftime("%Y-%m")
            monthly_requests = defaultdict(int, {
                month: count for month, count in monthly_requests.items() 
                if month >= cutoff_month
            })
            
            logger.info(f"Rate limit data loaded - Current minute requests: {len(request_times)}")
        else:
            logger.info("No existing rate limit data found, starting fresh")
    except Exception as e:
        logger.error(f"Failed to load rate limit data: {e}")
        # Reset to empty state on error
        request_times = []
        daily_requests = defaultdict(int)
        monthly_requests = defaultdict(int)

def record_api_request():
    """Record an API request for rate limiting"""
    global request_times
    
    current_time = time.time()
    request_times.append(current_time)
    
    # Cleanup old requests (older than 1 minute)
    cutoff_time = current_time - 60
    request_times = [t for t in request_times if t > cutoff_time]
    
    # Track daily and monthly usage
    today = datetime.now().strftime("%Y-%m-%d")
    current_month = datetime.now().strftime("%Y-%m")
    daily_requests[today] += 1
    monthly_requests[current_month] += 1
    
    # Save data after each request
    save_rate_limit_data()

def check_rate_limits():
    """Check if we're within rate limits"""
    # Auto-cleanup old minute requests
    current_time = time.time()
    cutoff_time = current_time - 60
    global request_times
    request_times = [t for t in request_times if t > cutoff_time]
    
    current_minute_requests = len(request_times)
    today = datetime.now().strftime("%Y-%m-%d")
    current_month = datetime.now().strftime("%Y-%m")
    
    if current_minute_requests >= RATE_LIMITS["requests_per_minute"]:
        # Calculate seconds until next request allowed
        oldest_request = min(request_times) if request_times else current_time
        seconds_until_reset = int(60 - (current_time - oldest_request))
        return {
            "allowed": False, 
            "message": f"Rate limit exceeded: too many requests per minute. Try again in {seconds_until_reset} seconds."
        }
    
    if daily_requests[today] >= RATE_LIMITS["daily_quota"]:
        return {"allowed": False, "message": "Daily quota exceeded"}
    
    if monthly_requests[current_month] >= RATE_LIMITS["monthly_quota"]:
        return {"allowed": False, "message": "Monthly quota exceeded"}
    
    return {"allowed": True}

def get_rate_limit_status():
    """Get current rate limit status"""
    # Auto-cleanup old minute requests
    current_time = time.time()
    cutoff_time = current_time - 60
    global request_times
    request_times = [t for t in request_times if t > cutoff_time]
    
    today = datetime.now().strftime("%Y-%m-%d")
    current_month = datetime.now().strftime("%Y-%m")
    
    # Calculate time until minute limit resets
    time_until_minute_reset = 0
    if request_times:
        oldest_request = min(request_times)
        time_until_minute_reset = max(0, int(60 - (current_time - oldest_request)))
    
    return {
        "current_minute_requests": len(request_times),
        "max_per_minute": RATE_LIMITS["requests_per_minute"],
        "minute_reset_in_seconds": time_until_minute_reset,
        "daily_used": daily_requests[today],
        "daily_quota": RATE_LIMITS["daily_quota"],
        "monthly_used": monthly_requests[current_month],
        "monthly_quota": RATE_LIMITS["monthly_quota"]
    }

# VTGraphManager Klasse (ohne Intelligence Search)
class VTGraphManager:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://www.virustotal.com/api/v3"
        self.headers = {"x-apikey": self.api_key}
    
    def check_api_permissions(self) -> dict:
        """Prüfe API-Berechtigungen"""
        try:
            test_results = {}
            
            # Test: Graph-Liste abrufen
            response = requests.get(f"{self.base_url}/graphs", headers=self.headers, timeout=5)
            test_results["graphs_list"] = {
                "status": response.status_code,
                "accessible": response.status_code in [200, 404]
            }
            
            return test_results
        except Exception as e:
            return {"error": str(e)}
    
    def search_existing_graphs(self, domain: str, limit: int = 10) -> dict:
        """Suche nach existierenden Graphen für Domain"""
        try:
            # Verschiedene Suchstrategien für existierende Graphen
            search_queries = [
                f'"{domain}"',
                domain,
                f'domain:{domain}',
                f'*{domain}*'
            ]
            
            for query in search_queries:
                try:
                    params = {"filter": query, "limit": limit}
                    response = requests.get(f"{self.base_url}/graphs", headers=self.headers, params=params, timeout=10)
                    logger.info(f"Graph search for '{query}': {response.status_code}")
                    
                    if response.status_code == 200:
                        result = response.json()
                        graphs = result.get("data", [])
                        if graphs:
                            logger.info(f"Found {len(graphs)} existing graphs with query: {query}")
                            return {
                                "search_query": query,
                                "graphs_found": len(graphs),
                                "graphs": graphs
                            }
                except Exception as e:
                    logger.warning(f"Graph search query '{query}' failed: {e}")
                    continue
            
            return {"graphs_found": 0, "graphs": []}
        except Exception as e:
            logger.error(f"Graph search error: {e}")
            return {"graphs_found": 0, "graphs": [], "error": str(e)}
    
    def get_graph_details(self, graph_id: str) -> dict:
        """Graph-Details abrufen"""
        try:
            response = requests.get(f"{self.base_url}/graphs/{graph_id}", headers=self.headers, timeout=10)
            logger.info(f"Graph details for {graph_id}: {response.status_code}")
            
            if response.status_code == 200:
                return response.json()
            else:
                return {"error": f"Graph not accessible: {response.status_code}"}
        except Exception as e:
            logger.error(f"Get graph details error: {e}")
            return {"error": str(e)}
    
    def get_graph_relationships(self, graph_id: str, limit: int = 20) -> dict:
        """Verwandte Objekte zu einem Graph finden"""
        try:
            params = {"limit": limit}
            response = requests.get(f"{self.base_url}/graphs/{graph_id}/relationships", headers=self.headers, params=params, timeout=10)
            logger.info(f"Graph relationships for {graph_id}: {response.status_code}")
            
            if response.status_code == 200:
                return response.json()
            else:
                return {"data": [], "error": f"Relationships not accessible: {response.status_code}"}
        except Exception as e:
            logger.error(f"Graph relationships error: {e}")
            return {"data": [], "error": str(e)}
    
    def get_domain_info(self, domain: str) -> dict:
        """Domain-Informationen direkt abrufen"""
        try:
            domain_id = base64.urlsafe_b64encode(domain.encode()).decode().strip("=")
            response = requests.get(f"{self.base_url}/domains/{domain_id}", headers=self.headers, timeout=10)
            logger.info(f"Domain info for {domain}: {response.status_code}")
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.info(f"Domain info not available: {response.status_code}")
                return {}
        except Exception as e:
            logger.error(f"Domain info error: {e}")
            return {}

def scan_with_virustotal(url: str):
    """Basis-Scan einer URL mit VirusTotal"""
    if not API_KEY:
        return {"error": "API key not found"}
    
    # Rate Limits prüfen
    rate_check = check_rate_limits()
    if not rate_check["allowed"]:
        return {"error": "Rate limit exceeded", "details": rate_check["message"]}
    
    try:
        # API Request aufzeichnen
        record_api_request()
        
        # URL zu Base64 ID kodieren
        url_id = base64.urlsafe_b64encode(url.encode()).decode().strip("=")
        
        # VirusTotal API Request
        response = requests.get(
            f"https://www.virustotal.com/api/v3/urls/{url_id}",
            headers={"x-apikey": API_KEY},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            stats = data["data"]["attributes"]["last_analysis_stats"]
            
            result = {
                "url": url,
                "stats": stats,
                "source": "existing",
                "scan_id": data["data"]["id"],
                "permalink": f"https://www.virustotal.com/gui/url/{url_id}",
                "scan_date": data["data"]["attributes"].get("last_analysis_date")
            }
            
            logger.info(f"URL scan completed for: {url}")
            return result
            
        elif response.status_code == 404:
            # URL nicht in VirusTotal-Datenbank, neue Analyse anfordern
            record_api_request()
            scan_response = requests.post(
                "https://www.virustotal.com/api/v3/urls",
                headers={"x-apikey": API_KEY},
                data={"url": url},
                timeout=30
            )
            
            if scan_response.status_code == 200:
                scan_data = scan_response.json()
                return {
                    "url": url,
                    "message": "Scan submitted, results will be available shortly",
                    "scan_id": scan_data["data"]["id"],
                    "source": "new_scan",
                    "stats": {"malicious": 0, "suspicious": 0, "undetected": 0, "harmless": 0}
                }
            else:
                return {"error": f"Failed to submit URL for scanning: {scan_response.status_code}"}
        else:
            return {"error": f"API request failed: {response.status_code}"}
            
    except Exception as e:
        logger.error(f"Scan failed for {url}: {str(e)}")
        return {"error": str(e)}

def enhanced_scan_with_graph(url: str):
    """Erweiterte URL-Analyse mit VT Graph-Suche (ohne Intelligence)"""
    if not API_KEY:
        return {"error": "API key not found"}
    
    # Rate Limits prüfen
    rate_check = check_rate_limits()
    if not rate_check["allowed"]:
        return {
            "error": "Rate limit exceeded",
            "details": rate_check["message"],
            "rate_limit_info": get_rate_limit_status()
        }
    
    logger.info(f"Starting enhanced scan for: {url}")
    
    # Basis-Scan durchführen
    basic_result = scan_with_virustotal(url)
    
    # Enhanced Analysis mit Graph-Suche (ohne Intelligence)
    try:
        graph_manager = VTGraphManager(API_KEY)
        domain = urlparse(url).netloc
        
        # 1. API-Berechtigungen prüfen
        record_api_request()
        api_permissions = graph_manager.check_api_permissions()
        logger.info(f"API permissions check: {api_permissions}")
        
        # 2. Nach existierenden Graphen suchen
        if api_permissions.get("graphs_list", {}).get("accessible", False):
            logger.info(f"Searching for existing graphs for domain: {domain}")
            record_api_request()
            
            graph_search = graph_manager.search_existing_graphs(domain)
            
            if graph_search.get("graphs_found", 0) > 0:
                graphs = graph_search["graphs"]
                
                # Analysiere die gefundenen Graphen
                graph_analysis = {
                    "graphs_found": graph_search["graphs_found"],
                    "search_query": graph_search.get("search_query", "unknown"),
                    "graph_summaries": []
                }
                
                # Details zu den ersten 3 Graphen abrufen
                for i, graph in enumerate(graphs[:3]):
                    graph_id = graph.get("id")
                    graph_attrs = graph.get("attributes", {})
                    
                    graph_summary = {
                        "graph_id": graph_id,
                        "name": graph_attrs.get("name", "Unknown"),
                        "creation_date": graph_attrs.get("creation_date"),
                        "creator": graph_attrs.get("creator", "Unknown"),
                        "votes": graph_attrs.get("votes", {}),
                        "nodes_preview": []
                    }
                    
                    # Versuche Graph-Details abzurufen
                    if i < 2:  # Nur für erste 2 Graphen Details abrufen (Rate Limiting)
                        record_api_request()
                        graph_details = graph_manager.get_graph_details(graph_id)
                        
                        if graph_details and not graph_details.get("error"):
                            graph_data = graph_details.get("data", {}).get("attributes", {}).get("graph", {})
                            nodes = graph_data.get("nodes", [])
                            links = graph_data.get("links", [])
                            
                            graph_summary.update({
                                "total_nodes": len(nodes),
                                "total_links": len(links),
                                "node_types": list(set([node.get("node_type", "unknown") for node in nodes])),
                                "nodes_preview": [
                                    {
                                        "type": node.get("node_type"),
                                        "label": node.get("label", "")[:50]
                                    } for node in nodes[:5]
                                ]
                            })
                        
                        # Versuche auch Relationships abzurufen
                        record_api_request()
                        relationships = graph_manager.get_graph_relationships(graph_id, limit=10)
                        
                        if relationships and not relationships.get("error"):
                            related_objects = relationships.get("data", [])
                            graph_summary["related_objects"] = len(related_objects)
                            graph_summary["related_types"] = list(set([obj.get("type", "unknown") for obj in related_objects]))
                    
                    graph_analysis["graph_summaries"].append(graph_summary)
                
                basic_result["graph_analysis"] = graph_analysis
                logger.info(f"Graph analysis completed - found {graph_search['graphs_found']} graphs")
            else:
                basic_result["graph_analysis"] = {
                    "graphs_found": 0,
                    "message": "No existing graphs found for this domain",
                    "search_attempted": True
                }
        else:
            basic_result["graph_error"] = "Graph API not accessible with current API key"
        
        # 3. Domain-Informationen
        record_api_request()
        domain_info = graph_manager.get_domain_info(domain)
        if domain_info and domain_info.get("data"):
            domain_attrs = domain_info["data"]["attributes"]
            basic_result["domain_analysis"] = {
                "available": True,
                "reputation": domain_attrs.get("reputation", 0),
                "categories": domain_attrs.get("categories", {}),
                "last_analysis_stats": domain_attrs.get("last_analysis_stats", {}),
                "creation_date": domain_attrs.get("creation_date"),
                "registrar": domain_attrs.get("registrar"),
                "country": domain_attrs.get("country")
            }
            logger.info(f"Domain analysis completed - reputation: {domain_attrs.get('reputation', 0)}")
        
        # 4. Enhanced Analysis Summary
        analysis_features = ["Basic URL scan"]
        if basic_result.get("domain_analysis"):
            analysis_features.append("Domain reputation analysis")
        if basic_result.get("graph_analysis"):
            analysis_features.append("Existing graph discovery")
        
        basic_result["enhanced_analysis"] = {
            "analysis_type": "deep_scan_with_graph_search",
            "data_sources": ["url_scan", "domain_info", "graph_search"],
            "features_used": analysis_features,
            "graph_creation_attempted": False,
            "graph_search_performed": True,
            "analysis_depth": "comprehensive_readonly",
            "intelligence_search": "disabled"
        }
        
        # API-Berechtigungen in Antwort einschließen
        basic_result["api_capabilities"] = api_permissions
                    
    except Exception as e:
        logger.error(f"Enhanced analysis failed for {url}: {str(e)}")
        basic_result["enhanced_error"] = f"Enhanced analysis failed: {str(e)}"
    
    # Erweiterte Metadaten
    basic_result["scan_type"] = "enhanced"
    basic_result["analysis_timestamp"] = datetime.now().isoformat()
    basic_result["rate_limit_info"] = get_rate_limit_status()
    
    logger.info(f"Enhanced scan completed for: {url}")
    return basic_result

# Load persistent data on startup
load_rate_limit_data()

# API Endpoints
@app.get("/")
def root():
    return {
        "message": "VirusTotal URL Scanner API", 
        "usage": "/scan?url=https://example.com",
        "rate_limits": RATE_LIMITS,
        "current_status": get_rate_limit_status()
    }

@app.get("/scan")
def scan_url(url: str = Query(...)):
    """Basis URL-Scan"""
    logger.info(f"Scan requested for: {url}")
    result = scan_with_virustotal(url)
    result["rate_limit_info"] = get_rate_limit_status()
    logger.info(f"Scan completed for: {url}")
    return result

@app.get("/rate-limits")
def rate_limits():
    """Rate Limit Status abrufen"""
    return {
        "rate_limits": RATE_LIMITS,
        "current_status": get_rate_limit_status()
    }

@app.get("/enhanced-scan")
def enhanced_scan_endpoint(url: str = Query(...)):
    """Enhanced URL-Analyse mit VT Graph (ohne Intelligence)"""
    logger.info(f"Enhanced scan requested for: {url}")
    
    try:
        result = enhanced_scan_with_graph(url)
        logger.info(f"Enhanced scan completed successfully for: {url}")
        return result
    except Exception as e:
        logger.error(f"Enhanced scan failed for {url}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "error": "Enhanced scan failed",
                "details": str(e),
                "rate_limit_info": get_rate_limit_status()
            }
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)