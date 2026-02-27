#!/bin/bash

# Kill any existing processes on our ports
kill $(lsof -t -i:8000) 2>/dev/null
kill $(lsof -t -i:3000) 2>/dev/null

# Start Django backend
cd /workspaces/domapp/backend
source venv/bin/activate
python manage.py runserver 0.0.0.0:8000 &

# Start Next.js frontend
cd /workspaces/domapp/frontend
npm run dev -- -p 3000 &

wait
