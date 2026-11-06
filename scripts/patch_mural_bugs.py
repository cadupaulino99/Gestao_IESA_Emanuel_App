#!/usr/bin/env python3
from pathlib import Path
p = Path("firestore.rules")
t = p.read_text()
old = """    // Engajamento do mural (likes + comentários) — autenticados
    match /events/{eventId}/likes/{userId} {
      allow read, list: if isAuthenticated();
      allow create: if isAuthenticated() && request.auth.uid == userId
                    && incoming().keys().hasOnly(['uid', 'createdAt'])
                    && incoming().uid == request.auth.uid
                    && incoming().createdAt is number;
      allow delete: if isAuthenticated() && request.auth.uid == userId;
      allow update: if false;
    }
    match /events/{eventId}/comments/{commentId} {
      allow read, list: if isAuthenticated();
      allow create: if isAuthenticated()
                    && incoming().keys().hasOnly(['authorUid', 'authorName', 'text', 'createdAt'])
                    && incoming().authorUid == request.auth.uid
                    && incoming().authorName is string && incoming().authorName.size() > 0 && incoming().authorName.size() <= 80
                    && incoming().text is string && incoming().text.size() > 0 && incoming().text.size() <= 500
                    && incoming().createdAt is number;
      allow update: if false;
      allow delete: if isAuthenticated() && (
        resource.data.authorUid == request.auth.uid || isAdmin() || isPastor()
      );
    }
    match /announcements/{annId}/likes/{userId} {
      allow read, list: if isAuthenticated();
      allow create: if isAuthenticated() && request.auth.uid == userId
                    && incoming().keys().hasOnly(['uid', 'createdAt'])
                    && incoming().uid == request.auth.uid
                    && incoming().createdAt is number;
      allow delete: if isAuthenticated() && request.auth.uid == userId;
      allow update: if false;
    }
    match /announcements/{annId}/comments/{commentId} {
      allow read, list: if isAuthenticated();
      allow create: if isAuthenticated()
                    && incoming().keys().hasOnly(['authorUid', 'authorName', 'text', 'createdAt'])
                    && incoming().authorUid == request.auth.uid
                    && incoming().authorName is string && incoming().authorName.size() > 0 && incoming().authorName.size() <= 80
                    && incoming().text is string && incoming().text.size() > 0 && incoming().text.size() <= 500
                    && incoming().createdAt is number;
      allow update: if false;
      allow delete: if isAuthenticated() && (
        resource.data.authorUid == request.auth.uid || isAdmin() || isPastor()
      );
    }"""
new = """    // Engajamento do mural (likes + comentários) — autenticados
    // v1.21.19: regras mais simples (evitar permission-denied por hasOnly).
    match /events/{eventId}/likes/{userId} {
      allow read, list: if isAuthenticated();
      allow create, delete: if isAuthenticated() && request.auth.uid == userId;
      allow update: if false;
    }
    match /events/{eventId}/comments/{commentId} {
      allow read, list: if isAuthenticated();
      allow create: if isAuthenticated()
                    && request.resource.data.authorUid == request.auth.uid
                    && request.resource.data.text is string
                    && request.resource.data.text.size() > 0
                    && request.resource.data.text.size() <= 500;
      allow update: if false;
      allow delete: if isAuthenticated() && (
        resource.data.authorUid == request.auth.uid || isAdmin() || isPastor()
      );
    }
    match /announcements/{annId}/likes/{userId} {
      allow read, list: if isAuthenticated();
      allow create, delete: if isAuthenticated() && request.auth.uid == userId;
      allow update: if false;
    }
    match /announcements/{annId}/comments/{commentId} {
      allow read, list: if isAuthenticated();
      allow create: if isAuthenticated()
                    && request.resource.data.authorUid == request.auth.uid
                    && request.resource.data.text is string
                    && request.resource.data.text.size() > 0
                    && request.resource.data.text.size() <= 500;
      allow update: if false;
      allow delete: if isAuthenticated() && (
        resource.data.authorUid == request.auth.uid || isAdmin() || isPastor()
      );
    }"""
if "v1.21.19: regras mais simples" in t:
    print("rules already simplified")
elif old not in t:
    raise SystemExit("old engagement block missing")
else:
    p.write_text(t.replace(old, new, 1))
    print("rules patched")

pp = Path("src/lib/posters.ts")
pt = pp.read_text()
if "Sempre JPEG no Storage" in pt:
    print("posters already")
else:
    a = """  const big = await compressImageFile(file, { max: 1600, quality: 0.8 });
  const thumb = await compressImageFile(file, { max: 400, quality: 0.7 });
  const ext = POSTER_TYPES[big.mimeType] || POSTER_TYPES[file.type] || 'jpg';

  const posterPath = `posters/${id}.${ext}`;
  const posterThumbPath = `posters/thumbs/${id}.${ext}`;
  await uploadBytes(ref(storage, posterPath), dataUrlToBlob(`data:${big.mimeType};base64,${big.base64}`), {
    contentType: big.mimeType,
  });
  await uploadBytes(ref(storage, posterThumbPath), dataUrlToBlob(`data:${thumb.mimeType};base64,${thumb.base64}`), {
    contentType: thumb.mimeType,
  });
"""
    b = """  const big = await compressImageFile(file, { max: 1600, quality: 0.8 });
  const thumb = await compressImageFile(file, { max: 400, quality: 0.7 });
  // Sempre JPEG no Storage (compressão canvas → image/jpeg)
  const mime = 'image/jpeg';
  const ext = 'jpg';

  const posterPath = `posters/${id}.${ext}`;
  const posterThumbPath = `posters/thumbs/${id}.${ext}`;
  const bigBlob = dataUrlToBlob(`data:${mime};base64,${big.base64}`);
  const thumbBlob = dataUrlToBlob(`data:${mime};base64,${thumb.base64}`);
  await uploadBytes(ref(storage, posterPath), bigBlob, { contentType: mime });
  await uploadBytes(ref(storage, posterThumbPath), thumbBlob, { contentType: mime });
"""
    if a not in pt:
        raise SystemExit("posters block missing")
    pp.write_text(pt.replace(a, b, 1))
    print("posters patched")

ea = Path("src/components/admin/EventsAdmin.tsx")
et = ea.read_text()
if "Libertar o botão antes das notificações" in et:
    print("eventsadmin already")
else:
    old = "      // notificações (só do que está publicado)\n      if (publishStatus === 'publicado') {"
    new = "      // Libertar o botão antes das notificações (podem demorar com muitos membros)\n      setSaving(false);\n\n      // notificações (só do que está publicado)\n      if (publishStatus === 'publicado') {"
    if old not in et:
        raise SystemExit("eventsadmin marker missing")
    ea.write_text(et.replace(old, new, 1))
    print("eventsadmin patched")

bar = Path("src/components/board/BoardEngagementBar.tsx")
if bar.exists():
    bt = bar.read_text()
    if "Deploy Firebase" not in bt:
        bt = bt.replace(
            "toast.error('Falha ao registar gosto.');",
            "toast.error('Sem permissão para gostar. Publique as regras Firestore (Deploy Firebase).');",
        )
        bt = bt.replace(
            "toast.error(e instanceof Error ? e.message : 'Falha ao comentar.');",
            "toast.error(e instanceof Error && /permission|insufficient/i.test(e.message) ? 'Sem permissão para comentar. Publique as regras Firestore (Deploy Firebase).' : (e instanceof Error ? e.message : 'Falha ao comentar.'));",
        )
        bar.write_text(bt)
        print("bar patched")
    else:
        print("bar already")
print("done")
