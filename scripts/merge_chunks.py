#!/usr/bin/env python3
"""
Merge all JSON chunk files in a directory into a single JSONL file.

Usage:
    python scripts/merge_chunks.py
    python scripts/merge_chunks.py --input-dir "C:/Users/PC/Downloads/JSON" --output merged.jsonl

Each JSON file should be an array of chunk objects with a "chunk_id" or "id" field.
"""

import json
import glob
import argparse
from pathlib import Path

# ── CONFIG ────────────────────────────────────────────────────────────────────
DEFAULT_INPUT_DIR = "C:/Users/PC/Downloads/JSON"
DEFAULT_OUTPUT    = "rag_chunks_merged.jsonl"

# ── CLI ───────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Merge JSON chunk files into a single JSONL")
parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, help="Directory containing *.json files")
parser.add_argument("--output",    default=DEFAULT_OUTPUT,    help="Output JSONL file path")
args = parser.parse_args()

input_dir   = Path(args.input_dir)
output_path = Path(args.output)
input_files = sorted(input_dir.glob("*.json"))

if not input_files:
    print(f"❌ No .json files found in: {input_dir}")
    raise SystemExit(1)

# ── MERGE + DEDUP + WRITE ─────────────────────────────────────────────────────
seen_ids  = set()
total_in  = 0
total_out = 0

with open(output_path, "w", encoding="utf-8") as out:
    for filepath in input_files:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Support both array and {"chunks": [...]} structure
        chunks = data if isinstance(data, list) else data.get("chunks", [])
        total_in += len(chunks)

        for chunk in chunks:
            cid = chunk.get("chunk_id") or chunk.get("id", "")
            if cid not in seen_ids:
                seen_ids.add(cid)
                out.write(json.dumps(chunk, ensure_ascii=False) + "\n")
                total_out += 1

        print(f"✅ {filepath.name} → {len(chunks)} chunks loaded")

print(f"\nTotal chunks in:    {total_in}")
print(f"Duplicates removed: {total_in - total_out}")
print(f"Final chunks out:   {total_out}")
print(f"Saved to:           {output_path}")
