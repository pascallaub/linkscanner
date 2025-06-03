# LinkScanner - VirusTotal Chrome Extension

Ein vollautomatischer LinkScanner mit Chrome Extension, der URLs über die VirusTotal API auf Malware überprüft. Das System läuft komplett lokal mit Docker und startet automatisch mit Windows.

## 📋 Inhaltsverzeichnis

- [Features](#features)
- [Voraussetzungen](#voraussetzungen)
- [Installation](#installation)
- [Konfiguration](#konfiguration)
- [Chrome Extension Setup](#chrome-extension-setup)
- [Automatischer Start](#automatischer-start)
- [Verwendung](#verwendung)
- [Troubleshooting](#troubleshooting)
- [Projektstruktur](#projektstruktur)

## ✨ Features

- **Automatische URL-Analyse** mit VirusTotal API
- **Chrome Extension** mit Kontextmenü und Popup
- **Docker-basiert** für einfache Installation
- **Automatischer Start** mit Windows
- **Live-Benachrichtigungen** auf Webseiten
- **Fortschrittsanzeige** während des Scannens
- **Health Check** für API-Verfügbarkeit

## 🔧 Voraussetzungen

### System-Anforderungen
- **Windows 10/11**
- **Docker Desktop** (neueste Version)
- **Google Chrome** Browser
- **VirusTotal API Key** (kostenlos)

### Software installieren

1. **Docker Desktop herunterladen und installieren:**
   - [Docker Desktop für Windows](https://www.docker.com/products/docker-desktop/)
   - Nach Installation Docker Desktop starten

2. **VirusTotal API Key besorgen:**
   - Registrierung auf [VirusTotal.com](https://www.virustotal.com/)
   - Gehen Sie zu [API Key Seite](https://www.virustotal.com/gui/my-apikey)
   - Kopieren Sie Ihren API Key

## 🚀 Installation

### 1. Projekt klonen/herunterladen

```bash
# Projekt-Ordner erstellen
mkdir c:\Users\nutri\WorkspacePrivate\linkscanner
cd c:\Users\nutri\WorkspacePrivate\linkscanner
```

### 2. Umgebungsvariablen konfigurieren

Erstellen Sie eine `.env` Datei im Projekt-Ordner:

```env
# .env Datei
VT_API_KEY=ihr_virustotal_api_key_hier
```

**⚠️ Wichtig:** Ersetzen Sie `ihr_virustotal_api_key_hier` durch Ihren echten VirusTotal API Key!

### 3. Docker Container erstellen

```bash
# Im linkscanner Verzeichnis
docker-compose up --build
```

**Erwartete Ausgabe:**
```
linkscanner-api-1  | INFO:     Uvicorn running on http://0.0.0.0:8000
linkscanner-api-1  | INFO:     Application startup complete.
```

### 4. API testen

Öffnen Sie Ihren Browser und gehen Sie zu:
- http://localhost:8000/ (sollte eine JSON-Antwort zeigen)
- http://localhost:8000/scan?url=https://google.com (sollte Scan-Ergebnisse zeigen)

## 🔧 Konfiguration

### Docker-Compose Einstellungen

Die `docker-compose.yml` ist bereits konfiguriert für:
- **Port 8000** für die API
- **Automatischen Neustart** (`restart: unless-stopped`)
- **Health Checks** alle 30 Sekunden
- **Logging** mit Rotation

### API-Endpunkte

- `GET /` - API Status
- `GET /scan?url=<URL>` - URL scannen

## 🌐 Chrome Extension Setup

### 1. Extension-Dateien vorbereiten

Stellen Sie sicher, dass alle Extension-Dateien im `extension/` Ordner vorhanden sind:

```
extension/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
└── icons/ (optional)
```

### 2. Extension in Chrome installieren

1. **Chrome öffnen** und zu `chrome://extensions/` navigieren
2. **"Entwicklermodus"** oben rechts aktivieren
3. **"Entpackte Erweiterung laden"** klicken
4. **Extension-Ordner auswählen:** `c:\Users\nutri\WorkspacePrivate\linkscanner\extension`
5. **"Ordner auswählen"** klicken

### 3. Extension-Berechtigungen

Die Extension benötigt folgende Berechtigungen:
- ✅ **Aktive Registerkarte lesen**
- ✅ **Kontextmenü erstellen**
- ✅ **Benachrichtigungen anzeigen**
- ✅ **Mit localhost:8000 kommunizieren**

### 4. Extension-Icon in Toolbar

1. **Puzzle-Symbol** (Extensions) in Chrome-Toolbar klicken
2. **Pin-Symbol** bei "Link Scanner" klicken
3. Extension-Icon erscheint dauerhaft in der Toolbar

## ⚡ Automatischer Start

### Docker Desktop Autostart

1. **Docker Desktop öffnen**
2. **Settings** (⚙️) → **General**
3. **"Start Docker Desktop when you log in"** ✅ aktivieren
4. **"Apply & Restart"** klicken

### Container automatisch starten

```bash
# Container im Hintergrund starten (einmalig)
docker-compose up -d
```

Der Container startet jetzt automatisch:
- ✅ Bei jedem Windows-Start
- ✅ Nach Docker Desktop Start
- ✅ Bei Container-Abstürzen

### Autostart testen

1. **Container stoppen:** `docker-compose down`
2. **Windows neustarten**
3. **Nach Boot prüfen:**
   ```bash
   docker-compose ps
   # Sollte "Up" Status zeigen
   ```

## 📱 Verwendung

### Methode 1: Kontextmenü (Rechtsklick)

1. **Beliebige Webseite** öffnen
2. **Rechtsklick** auf einen Link
3. **"Scan Link with VirusTotal"** auswählen
4. **Notification** erscheint oben rechts auf der Seite
5. **Ergebnis** wird nach wenigen Sekunden angezeigt

### Methode 2: Extension-Popup

1. **Extension-Icon** in Chrome-Toolbar klicken
2. **URL eingeben** in das Textfeld
3. **"Scan URL"** Button klicken
4. **Fortschrittsbalken** wird angezeigt
5. **Ergebnis** erscheint im Popup

### Ergebnis-Interpretation

**🟢 CLEAN:** Keine Bedrohungen gefunden
```
Status: CLEAN ✅
Malicious: 0, Suspicious: 0, Clean: 45
```

**🟡 SUSPICIOUS:** Verdächtige Aktivität erkannt
```
Status: SUSPICIOUS ⚠️
Malicious: 0, Suspicious: 2, Clean: 43
```

**🔴 MALICIOUS:** Malware erkannt
```
Status: MALICIOUS ⚠️
Malicious: 5, Suspicious: 1, Clean: 39
```

## 🛠️ Troubleshooting

### Problem: Extension-Fehler beim Laden

**Fehlermeldung:** "Could not load icon 'icons/icon16.png'"

**Lösung:** Icons aus manifest.json entfernen:
```json
{
  "manifest_version": 3,
  "name": "Link Scanner",
  // Icons-Sektion entfernen oder Icons hinzufügen
}
```

### Problem: API nicht erreichbar

**Symptom:** "Connection to scanner failed"

**Diagnose:**
```bash
# Container Status prüfen
docker-compose ps

# Logs anschauen
docker-compose logs

# API direkt testen
curl http://localhost:8000/
```

**Lösungen:**
1. Docker Desktop starten
2. Container neu starten: `docker-compose restart`
3. Port 8000 prüfen: `netstat -an | findstr 8000`

### Problem: VirusTotal API Fehler

**Fehlermeldung:** "API key not found"

**Lösung:**
1. `.env` Datei prüfen
2. API Key korrekt eingetragen?
3. Container neu starten: `docker-compose restart`

### Problem: Extension funktioniert nicht

**Diagnose:**
1. `chrome://extensions/` → Extension Details → **Fehler** prüfen
2. **Service Worker** → Developer Tools → Console-Fehler
3. F12 auf Webseite → Console → Extension-Nachrichten

**Lösung:**
1. Extension neu laden (🔄 Button)
2. Chrome neustarten
3. Extension neu installieren

### Problem: Langsame Scans

**Ursache:** VirusTotal Free API Limits (4 Requests/Minute)

**Lösungen:**
1. Zwischen Scans warten
2. Premium VirusTotal Account
3. Existierende Analyses werden schneller geladen

## 📁 Projektstruktur

```
linkscanner/
├── 📄 docker-compose.yml      # Docker-Konfiguration
├── 📄 Dockerfile             # Container-Build
├── 📄 requirements.txt       # Python-Dependencies
├── 📄 scanner_api.py          # FastAPI Backend
├── 📄 .env                    # Umgebungsvariablen (nicht committen!)
├── 📄 README.md              # Diese Dokumentation
└── 📁 extension/             # Chrome Extension
    ├── 📄 manifest.json       # Extension-Manifest
    ├── 📄 background.js       # Service Worker
    ├── 📄 content.js          # Content Script
    ├── 📄 popup.html          # Popup-Interface
    ├── 📄 popup.js            # Popup-Logik
    └── 📁 icons/             # Extension-Icons (optional)
```

## 🔒 Sicherheitshinweise

- **API Key geheim halten:** Niemals in Git committen
- **Lokaler Betrieb:** API läuft nur auf localhost:8000
- **HTTPS empfohlen:** Für Produktions-Setup
- **Rate Limits beachten:** VirusTotal API Beschränkungen

## 📊 Monitoring

### Container-Logs verfolgen
```bash
# Live-Logs anzeigen
docker-compose logs -f

# Nur API-Logs
docker-compose logs -f linkscanner-api
```

### System-Status prüfen
```bash
# Container-Status
docker-compose ps

# Resource-Verbrauch
docker stats

# Health-Check Status
docker inspect linkscanner-linkscanner-api-1 | grep Health -A 20
```

## 🎯 Erweiterte Konfiguration

### Custom Port verwenden

```yaml
# docker-compose.yml
services:
  linkscanner-api:
    ports:
      - "9000:8000"  # Externer Port 9000
```

**Dann Extension-URLs anpassen:**
```javascript
// background.js & popup.js
const API_URL = 'http://localhost:9000';
```

### Mehrere API Keys (Load Balancing)

```python
# scanner_api.py erweitern
API_KEYS = [
    os.getenv("VT_API_KEY_1"),
    os.getenv("VT_API_KEY_2"),
    # ...
]
```

## 🆘 Support

Bei Problemen:

1. **Logs prüfen:** `docker-compose logs`
2. **Extension Console:** Chrome DevTools
3. **GitHub Issues:** Für Bug-Reports
4. **VirusTotal Docs:** [API Dokumentation](https://developers.virustotal.com/reference/overview)

---

**🎉 Fertig!** Ihr LinkScanner läuft jetzt vollautomatisch und scannt URLs sicher über VirusTotal.

**Tipp:** Bookmarken Sie diese README für schnelle Referenz! 📚