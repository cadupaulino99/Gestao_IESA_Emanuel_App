#!/usr/bin/env python3
import json
from pathlib import Path
p = Path("firestore.indexes.json")
data = json.loads(p.read_text())
indexes = data.get("indexes", [])
exists = any(
    i.get("collectionGroup") == "communions"
    and [f.get("fieldPath") for f in i.get("fields", [])] == ["year", "month"]
    for i in indexes
)
if not exists:
    indexes.append({
        "collectionGroup": "communions",
        "queryScope": "COLLECTION",
        "fields": [
            {"fieldPath": "year", "order": "ASCENDING"},
            {"fieldPath": "month", "order": "ASCENDING"},
        ],
    })
    data["indexes"] = indexes
    p.write_text(json.dumps(data, indent=2) + "\n")
    print("index added")
else:
    print("index exists")
