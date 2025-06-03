#!/bin/bash
echo "Starting LinkScanner API..."
cd "$(dirname "$0")"
docker-compose up -d
echo ""
echo "LinkScanner API is running on http://localhost:8000"
echo "Press Enter to view logs..."
read
docker-compose logs -f