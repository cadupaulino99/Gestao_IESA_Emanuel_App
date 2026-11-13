#!/usr/bin/env python3
from pathlib import Path
import re
p = Path('package.json')
t = p.read_text()
t2 = re.sub(r'"version":\s*"[^"]+"', '"version": "1.21.28"', t, count=1)
p.write_text(t2)
print('-> 1.21.28')
