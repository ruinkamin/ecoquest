"""Точка входа для хостинга: python run.py (порт из PORT, по умолчанию 8080)."""
import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
