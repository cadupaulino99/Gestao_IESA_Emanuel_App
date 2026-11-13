#!/usr/bin/env python3
from pathlib import Path

for rel in [
    'src/components/board/EventFeedPost.tsx',
    'src/components/portal/MemberBoard.tsx',
    'src/components/admin/EventsAdmin.tsx',
]:
    p = Path(rel)
    if not p.exists():
        continue
    t = p.read_text()
    t2 = t.replace("${className || '''}", "${className || ''}")
    t2 = t2.replace('${className || \'\'\'}', "${className || ''}")
    # other broken variants
    t2 = t2.replace("className || '''", "className || ''")
    if t2 != t:
        p.write_text(t2)
        print(rel, 'fixed')
    else:
        print(rel, 'ok')
print('DONE')
