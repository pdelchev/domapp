#!/bin/bash

# Kill any existing processes on our ports (use fuser to catch all child processes)
fuser -k 3000/tcp 2>/dev/null
fuser -k 8000/tcp 2>/dev/null
sleep 1

# Start Django backend
cd /workspaces/domapp/backend
source venv/bin/activate
python manage.py runserver 0.0.0.0:8000 &

# Start Next.js frontend
cd /workspaces/domapp/frontend
npm run dev -- -p 3000 &

wait
