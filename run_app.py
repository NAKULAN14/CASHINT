"""
Unified Startup Script: Predictive Cash-Out Intelligence
--------------------------------------------------------
Launches both the FastAPI backend (port 8000) and the React frontend (port 5173).
Usage:
    python run_app.py
"""

import os
import sys
import subprocess
import time
import signal

def main():
    print("=" * 70)
    print("  PREDICTIVE CASH-OUT INTELLIGENCE - LOCAL APPLICATION LAUNCHER")
    print("=" * 70)

    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")

    # 1. Start FastAPI Backend
    print("[1/2] Starting FastAPI Backend on http://localhost:8000...")
    backend_cmd = [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
    backend_proc = subprocess.Popen(backend_cmd, cwd=root_dir)

    time.sleep(2)

    # 2. Start Vite Frontend
    print("[2/2] Starting React Vite Frontend on http://localhost:5173...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend_cmd = [npm_cmd, "run", "dev"]
    frontend_proc = subprocess.Popen(frontend_cmd, cwd=frontend_dir)

    print("\n" + "=" * 70)
    print("  SYSTEM READY:")
    print("  - Backend API:  http://localhost:8000")
    print("  - API Docs:     http://localhost:8000/docs")
    print("  - Frontend App: http://localhost:5173")
    print("  Press Ctrl+C to terminate both servers.")
    print("=" * 70 + "\n")

    def signal_handler(sig, frame):
        print("\nShutting down servers...")
        backend_proc.terminate()
        frontend_proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        signal_handler(None, None)

if __name__ == "__main__":
    main()
