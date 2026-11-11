#!/usr/bin/env python3
from pathlib import Path
import re
rt = Path('firestore.rules').read_text()
new_own = """    function isOwnMemberDoc() {
      return isAuthenticated() && (
        (resource.data.keys().hasAll(['memberEmail'])
          && resource.data.memberEmail is string
          && resource.data.memberEmail == request.auth.token.email)
        || (resource.data.keys().hasAll(['email'])
          && resource.data.email is string
          && resource.data.email == request.auth.token.email)
        // v1.21.26: docs só com memberId — dono = email em members/{id}
        || (resource.data.keys().hasAll(['memberId'])
          && resource.data.memberId is string
          && exists(/databases/$(database)/documents/members/$(resource.data.memberId))
          && get(/databases/$(database)/documents/members/$(resource.data.memberId)).data.email is string
          && get(/databases/$(database)/documents/members/$(resource.data.memberId)).data.email == request.auth.token.email)
      );
    }
"""
m = re.search(r'    function isOwnMemberDoc\(\) \{[\s\S]*?\n    \}\n', rt)
if not m:
    raise SystemExit('isOwnMemberDoc not found')
if 'v1.21.26' not in m.group(0):
    rt = rt[:m.start()] + new_own + rt[m.end():]
    print('isOwnMemberDoc replaced')
else:
    print('isOwnMemberDoc already')
rt = rt.replace(
    'function isOwnOrLeader() {\n      return hasFinancialWriteAccess() || isOwnMemberDoc();\n    }',
    'function isOwnOrLeader() {\n      return isStaff() || isOwnMemberDoc();\n    }',
)
rt = re.sub(
    r'function canReadMemberDoc\(\) \{\s*return hasFinancialWriteAccess\(\) \|\| isOwnMemberDoc\(\)',
    'function canReadMemberDoc() {\n      return isStaff() || isOwnMemberDoc()',
    rt,
    count=1,
)
Path('firestore.rules').write_text(rt)
print('OK', 'v1.21.26' in rt, 'return isStaff() || isOwnMemberDoc()' in rt)
