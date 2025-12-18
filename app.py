from pathlib import Path
import os
import sys

import uvicorn


def main():
    project_root = Path(__file__).resolve().parent
    backend_dir = project_root / "backend"
    if not backend_dir.exists():
        raise FileNotFoundError("backend directory not found next to app.py")

    # Run from backend so imports and .env are resolved correctly.
    os.chdir(backend_dir)
    sys.path.insert(0, str(backend_dir))

    host = os.environ.get("APP_HOST", "0.0.0.0")
    port = int(os.environ.get("APP_PORT", "8000"))
    reload = os.environ.get("APP_RELOAD", "true").lower() in {"1", "true", "yes", "on"}

    uvicorn.run("app.main:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    main()
