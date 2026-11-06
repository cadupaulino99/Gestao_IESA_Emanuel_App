#!/usr/bin/env python3
import base64
from pathlib import Path
b64 = Path("scripts/ui_chunks/b64a.txt").read_text().strip() + Path("scripts/ui_chunks/b64b.txt").read_text().strip()
p = Path("src/components/admin/CommunionMonthlyAdmin.tsx")
p.parent.mkdir(parents=True, exist_ok=True)
p.write_bytes(base64.b64decode(b64))
print("wrote", p, p.stat().st_size)
