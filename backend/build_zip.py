"""Собирает архив для загрузки на discloud: python build_zip.py -> ../ecoquest-api.zip.
В архив идут код, конфиг discloud, requirements и .env (с секретами — архив не коммитить, *.zip в .gitignore).
Не идут: .venv, uploads, тесты, кэши, локальные базы."""
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "ecoquest-api.zip"
FILES = ["discloud.config", "requirements.txt", "run.py", "seed.py", ".env"]
SKIP_DIRS = {"__pycache__"}


def main():
    missing = [f for f in FILES if not (ROOT / f).is_file()]
    if missing:
        sys.exit(f"Нет файлов: {missing}")
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for f in FILES:
            z.write(ROOT / f, f)
        for path in sorted((ROOT / "app").rglob("*")):
            if path.is_file() and not SKIP_DIRS & set(path.parts) and path.suffix != ".pyc":
                z.write(path, path.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(OUT) as z:
        names = z.namelist()
    print(f"{OUT} — {len(names)} файлов, {OUT.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    main()
