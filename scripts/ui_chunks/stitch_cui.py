#!/usr/bin/env python3
import base64
from pathlib import Path
parts = sorted(Path("scripts/ui_chunks").glob("cui_part_*.txt"))
b64 = "".join(p.read_text() for p in parts)
out = Path("src/components/admin/CommunionMonthlyAdmin.tsx")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(base64.b64decode(b64))
print("wrote", out, out.stat().st_size)
