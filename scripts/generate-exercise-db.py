"""Bygger src/data/exerciseDb.json ur free-exercise-db (public domain, Unlicense).

Källa: https://github.com/yuhonas/free-exercise-db, låst till en commit så bilder och
data inte glider isär. Bilderna hämtas i körtid från jsDelivr under samma commit, se
src/lib/exerciseDb.ts. Kör: python scripts/generate-exercise-db.py
"""
import json
import urllib.request
from pathlib import Path

COMMIT = "a859101d633a01c4a1a920d6a8ce41dabba0705f"
URL = f"https://raw.githubusercontent.com/yuhonas/free-exercise-db/{COMMIT}/dist/exercises.json"
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "exerciseDb.json"
KEEP = ("id", "name", "primaryMuscles", "secondaryMuscles", "equipment", "level", "category", "instructions")

with urllib.request.urlopen(URL, timeout=60) as resp:
    raw = json.load(resp)

# Tre poster saknar de två bildrutorna, de går inte att animera och lämnas utanför.
slim = [{k: e[k] for k in KEEP} for e in raw if len(e["images"]) == 2]
slim.sort(key=lambda e: e["name"].lower())

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"{len(slim)} övningar ({len(raw) - len(slim)} utan bilder hoppade), {OUT.stat().st_size // 1024} KB -> {OUT}")
