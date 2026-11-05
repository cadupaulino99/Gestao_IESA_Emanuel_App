#!/usr/bin/env python3
from pathlib import Path
p = Path("src/pages/Finances.tsx")
t = p.read_text()
if "const totalDespesas" in t and "const openNovaReceita" in t and "const saldoAtual" in t:
    print("already fixed")
    raise SystemExit(0)
old = """  const totalEntradas = tithes.reduce((a, b) => a + b.amount, 0) + offerings.reduce((a, b) => a + b.amount, 0);
  const totalSaidas = expenses.reduce((a, b) => a + b.amount, 0);"""
new = """  const totalEntradas = tithes.reduce((a, b) => a + (Number(b.amount) || 0), 0) + offerings.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const totalSaidas = expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const totalDespesas = totalSaidas;
  const saldoAtual = totalEntradas - totalSaidas;"""
if old in t:
    t = t.replace(old, new, 1)
elif "const totalDespesas" not in t:
    if "  const totalSaidas = expenses.reduce((a, b) => a + b.amount, 0);" in t:
        t = t.replace(
            "  const totalSaidas = expenses.reduce((a, b) => a + b.amount, 0);",
            "  const totalSaidas = expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);\n  const totalDespesas = totalSaidas;\n  const saldoAtual = totalEntradas - totalSaidas;",
            1,
        )
    elif "  const totalSaidas = expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);" in t:
        t = t.replace(
            "  const totalSaidas = expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);",
            "  const totalSaidas = expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);\n  const totalDespesas = totalSaidas;\n  const saldoAtual = totalEntradas - totalSaidas;",
            1,
        )
    else:
        raise SystemExit("totals block not found")

if "const openNovaReceita" not in t:
    insert = """
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
    marker = "  return (\n    <div className=\"mx-auto w-full max-w-6xl space-y-3 pb-6 sm:space-y-4\">"
    if marker not in t:
        raise SystemExit("return marker not found")
    t = t.replace(marker, insert + marker, 1)

assert "const totalDespesas" in t and "const saldoAtual" in t and "const openNovaReceita" in t
assert "handleAddTithe" in t
p.write_text(t)
print("ok", len(t))
