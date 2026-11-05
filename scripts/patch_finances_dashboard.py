#!/usr/bin/env python3
from pathlib import Path
p = Path("src/pages/Finances.tsx")
t = p.read_text()
if "Total de Entradas" in t and "Nova Receita" in t and "financeTab" in t:
    print("already modernized")
    raise SystemExit(0)

if "useNavigate" not in t:
    t = t.replace(
        "import React, { useEffect, useState } from 'react';",
        "import React, { useEffect, useState } from 'react';\nimport { useNavigate } from 'react-router-dom';",
        1,
    )
if "ArrowDownLeft" not in t:
    t = t.replace(
        "Wallet } from 'lucide-react';",
        "Wallet, ArrowDownLeft, ArrowUpRight, Scale, BarChart3, FolderOpen, ChevronRight, Minus } from 'lucide-react';",
        1,
    )

needle = "  const { user, isAdmin, userRole } = useAuth();\n"
if "const navigate = useNavigate()" not in t:
    t = t.replace(
        needle,
        needle + "  const navigate = useNavigate();\n  const [financeTab, setFinanceTab] = useState('estatisticas');\n",
        1,
    )

totals = """
  const totalEntradas = tithes.reduce((a, b) => a + (Number(b.amount) || 0), 0)
    + offerings.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const totalDespesas = expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const saldoAtual = totalEntradas - totalDespesas;

  const openNovaReceita = () => {
    if (isClosed) { toast.error('Mês/ano encerrado. Apenas administradores podem registar.'); return; }
    setFinanceTab('dizimos');
    resetTD();
    setEditingTithe(null);
    setIsTOpen(true);
  };
  const openNovaDespesa = () => {
    if (isClosed) { toast.error('Mês/ano encerrado. Apenas administradores podem registar.'); return; }
    setFinanceTab('saidas');
    setEditingExpense(null);
    setIsEOpen(true);
  };
  const openCategorias = () => {
    setFinanceTab('saidas');
    toast.message('Categorias de despesas', { description: 'Use a aba Saídas para filtrar e registar por categoria.' });
  };

"""

marker = "  return (\n    <div className=\"mx-auto w-full max-w-6xl space-y-5 pb-6\">"
if marker not in t:
    raise SystemExit("return marker not found")
if "const totalEntradas" not in t:
    t = t.replace(marker, totals + marker, 1)

start = t.index(marker)
end = t.index("          </TabsList>", start) + len("          </TabsList>")
header_txt = Path("scripts/_finances_header_snippet.txt").read_text()
t = t[:start] + header_txt + t[end:]
assert "handleAddTithe" in t and "Total de Entradas" in t
p.write_text(t)
print("ok", len(t))
