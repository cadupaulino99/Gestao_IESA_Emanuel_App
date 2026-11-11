#!/usr/bin/env python3
from pathlib import Path
import re
p = Path('firestore.rules')
rt = p.read_text()
new_sup = '''    match /support_messages/{msgId} {
      // v1.21.25: liderança (isStaff) lê/responde; membro só o próprio fio.
      allow read, list: if isStaff() ||
        (isAuthenticated() && resource.data.keys().hasAll(['memberEmail']) &&
         resource.data.memberEmail == request.auth.token.email);
      allow create: if isAuthenticated() &&
        incoming().senderId == request.auth.uid &&
        incoming().text is string && incoming().text.size() > 0 && incoming().text.size() <= 2000 &&
        (
          (isStaff() && incoming().senderRole == 'leader') ||
          (incoming().keys().hasAll(['memberEmail']) &&
           incoming().memberEmail == request.auth.token.email &&
           incoming().senderRole == 'member')
        );
      allow update, delete: if isFullAccess();
    }'''
m = re.search(r'    match /support_messages/\{msgId\} \{[\s\S]*?allow update, delete: if [^;]+;\s*\}', rt)
if not m:
    raise SystemExit('block not found')
rt = rt[:m.start()] + new_sup + rt[m.end():]
p.write_text(rt)
print('OK', 'isStaff()' in rt[rt.find('support_messages'):rt.find('support_messages')+200])
