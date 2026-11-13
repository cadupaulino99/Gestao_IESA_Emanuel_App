#!/usr/bin/env python3
from pathlib import Path

# ── Members.tsx ───────────────────────────────────────────────────────────
p = Path('src/pages/Members.tsx')
t = p.read_text()
if "useDebouncedValue" not in t:
    t = t.replace(
        "import React, { useState } from 'react';",
        "import React, { useState } from 'react';\nimport { useDebouncedValue } from '../hooks/useDebouncedValue';",
    )
    t = t.replace(
        "const [searchTerm, setSearchTerm] = useState('');",
        "const [searchTerm, setSearchTerm] = useState('');\n  const debouncedSearch = useDebouncedValue(searchTerm, 300);",
    )
    t = t.replace(
        "const q = searchTerm.toLowerCase();\n    const tBi = searchTerm.replace(/[^A-Za-z0-9]/g, '').toUpperCase();",
        "const q = debouncedSearch.toLowerCase();\n    const tBi = debouncedSearch.replace(/[^A-Za-z0-9]/g, '').toUpperCase();",
    )
    t = t.replace(
        "(m.phone || '').includes(searchTerm) ||",
        "(m.phone || '').includes(debouncedSearch) ||",
    )
    t = t.replace(
        "}, [members, searchTerm, statusFilter, areaFilter]);",
        "}, [members, debouncedSearch, statusFilter, areaFilter]);",
    )
    p.write_text(t)
    print('Members OK')
else:
    print('Members skip')

# ── Finances.tsx ──────────────────────────────────────────────────────────
p = Path('src/pages/Finances.tsx')
t = p.read_text()
if "useDebouncedValue" not in t:
    # add import after react import if present
    if "from 'react'" in t and "useDebouncedValue" not in t:
        # find first import line with react
        lines = t.splitlines(True)
        out = []
        inserted = False
        for line in lines:
            out.append(line)
            if not inserted and ("from 'react'" in line or 'from "react"' in line):
                out.append("import { useDebouncedValue } from '../hooks/useDebouncedValue';\n")
                inserted = True
        t = ''.join(out)
    t = t.replace(
        "const [searchTithes, setSearchTithes] = useState('');\n  const [searchOfferings, setSearchOfferings] = useState('');\n  const [searchExpenses, setSearchExpenses] = useState('');",
        "const [searchTithes, setSearchTithes] = useState('');\n  const [searchOfferings, setSearchOfferings] = useState('');\n  const [searchExpenses, setSearchExpenses] = useState('');\n  const debouncedSearchTithes = useDebouncedValue(searchTithes, 300);\n  const debouncedSearchOfferings = useDebouncedValue(searchOfferings, 300);\n  const debouncedSearchExpenses = useDebouncedValue(searchExpenses, 300);",
    )
    t = t.replace(
        "const search = searchTithes.toLowerCase();",
        "const search = debouncedSearchTithes.toLowerCase();",
    )
    t = t.replace(
        "o.description?.toLowerCase().includes(searchOfferings.toLowerCase()) || o.type?.toLowerCase().includes(searchOfferings.toLowerCase())",
        "o.description?.toLowerCase().includes(debouncedSearchOfferings.toLowerCase()) || o.type?.toLowerCase().includes(debouncedSearchOfferings.toLowerCase())",
    )
    t = t.replace(
        "e.description?.toLowerCase().includes(searchExpenses.toLowerCase()) || e.responsible?.toLowerCase().includes(searchExpenses.toLowerCase()) || e.category?.toLowerCase().includes(searchExpenses.toLowerCase())",
        "e.description?.toLowerCase().includes(debouncedSearchExpenses.toLowerCase()) || e.responsible?.toLowerCase().includes(debouncedSearchExpenses.toLowerCase()) || e.category?.toLowerCase().includes(debouncedSearchExpenses.toLowerCase())",
    )
    p.write_text(t)
    print('Finances OK')
else:
    print('Finances skip')

# ── Contributions.tsx ─────────────────────────────────────────────────────
p = Path('src/pages/Contributions.tsx')
t = p.read_text()
if "useDebouncedValue" not in t:
    if "from 'react'" in t:
        lines = t.splitlines(True)
        out = []
        inserted = False
        for line in lines:
            out.append(line)
            if not inserted and ("from 'react'" in line or 'from "react"' in line):
                out.append("import { useDebouncedValue } from '../hooks/useDebouncedValue';\n")
                inserted = True
        t = ''.join(out)
    t = t.replace(
        "const [search, setSearch] = useState('');",
        "const [search, setSearch] = useState('');\n  const debouncedSearch = useDebouncedValue(search, 300);",
        1,
    )
    # filter dependency uses search — replace carefully in the filter useMemo
    # common pattern: const t = search.trim()
    if "const t = search.trim().toLowerCase();" in t:
        t = t.replace(
            "const t = search.trim().toLowerCase();",
            "const t = debouncedSearch.trim().toLowerCase();",
            1,
        )
    if "}, [members, budgets, search, filter]);" in t:
        t = t.replace(
            "}, [members, budgets, search, filter]);",
            "}, [members, budgets, debouncedSearch, filter]);",
            1,
        )
    p.write_text(t)
    print('Contributions OK')
else:
    print('Contributions skip')

print('DONE')
