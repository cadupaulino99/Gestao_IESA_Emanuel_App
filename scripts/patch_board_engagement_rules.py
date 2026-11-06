#!/usr/bin/env python3
from pathlib import Path
p = Path("firestore.rules")
t = p.read_text()
if "match /events/{eventId}/likes" in t:
    print("rules already")
else:
    block = """
    // Engajamento do mural (likes + comentários) — autenticados
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
    }
"""
    anchor = """    match /events/{eventId} {
      allow read, list: if isAuthenticated();
      allow create: if canPublishBoard() && isValidEventDoc(incoming());
      allow update: if canPublishBoard() && isValidEventDoc(incoming());
      allow delete: if canPublishBoard();
    }"""
    if anchor not in t:
        raise SystemExit("events anchor missing")
    p.write_text(t.replace(anchor, anchor + "\n" + block, 1))
    print("rules ok")
