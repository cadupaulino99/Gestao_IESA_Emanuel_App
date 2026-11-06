#!/usr/bin/env python3
from pathlib import Path
parts = sorted(Path('scripts/ui_chunks').glob('part_*.txt'))
out = Path('scripts/patch_board_engagement_ui.py')
data = ''.join(p.read_text() for p in parts)
out.write_text(data)
print('stitched', out, 'bytes', len(data))
