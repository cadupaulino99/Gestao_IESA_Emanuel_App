#!/usr/bin/env python3
import base64
from pathlib import Path
parts = sorted(Path("scripts/mp_b64").glob("part*.txt"), key=lambda p: int(p.stem.replace("part","")))
b64 = "".join(p.read_text().strip() for p in parts)
Path("src/pages/MemberPortal.tsx").write_bytes(base64.b64decode(b64))
print("ok", Path("src/pages/MemberPortal.tsx").stat().st_size)
