"""Bygger src/data/exerciseDb.json ur free-exercise-db (public domain, Unlicense).

Källa: https://github.com/yuhonas/free-exercise-db, låst till en commit så bilder och
data inte glider isär. Bilderna hämtas i körtid från jsDelivr under samma commit, se
src/lib/exerciseDb.ts. Namn och instruktioner byts mot den svenska översättningen i
scripts/exerciseDbSv.json (översatt 2026-09-15); originalnamnet följer med som nameEn
så sökningen hittar båda. Kör: uv run --no-project python scripts/generate-exercise-db.py
"""
import json
import urllib.request
from pathlib import Path

COMMIT = "a859101d633a01c4a1a920d6a8ce41dabba0705f"
URL = f"https://raw.githubusercontent.com/yuhonas/free-exercise-db/{COMMIT}/dist/exercises.json"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "exerciseDb.json"
SV = json.loads((ROOT / "scripts" / "exerciseDbSv.json").read_text(encoding="utf-8"))
KEEP = ("id", "primaryMuscles", "secondaryMuscles", "equipment", "level", "category")

with urllib.request.urlopen(URL, timeout=60) as resp:
    raw = json.load(resp)

slim = []
# Tre poster saknar de två bildrutorna, de går inte att animera och lämnas utanför.
for e in (e for e in raw if len(e["images"]) == 2):
    sv = SV.get(e["id"])
    if sv is None or len(sv["instructions"]) != len(e["instructions"]) or not sv["name"].strip():
        raise SystemExit(f"Översättningen saknas eller har fel antal steg: {e['id']}")
    # Två poster i källan har ett tomt steg, det blir en tom punkt i listan
    steps = [s for s in sv["instructions"] if s.strip()]
    slim.append({"id": e["id"], "name": sv["name"], "nameEn": e["name"], **{k: e[k] for k in KEEP}, "instructions": steps})

# Svensk bokstavsordning: å, ä, ö efter z och i den ordningen (kodpunkterna ger ä före å)
slim.sort(key=lambda e: e["name"].lower().translate(str.maketrans("åäö", "{|}")))

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"{len(slim)} övningar ({len(raw) - len(slim)} utan bilder hoppade), {OUT.stat().st_size // 1024} KB -> {OUT}")
