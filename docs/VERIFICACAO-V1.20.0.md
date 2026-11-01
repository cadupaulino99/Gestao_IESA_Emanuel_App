# ✅ Verificação v1.20.0 — Rádio em segundo plano

Guião de teste no telemóvel (APK v1.20.0). Cada passo tem o resultado esperado.

| # | Passo | Esperado |
|---|-------|----------|
| 1 | Instalar a v1.20.0 (banner de atualização na app ou Release `v1.20.0` no GitHub) | A app abre e mostra v1.20.0 em Suporte → Diagnóstico |
| 2 | Rádio → botão ▶ (ligar emissão) | Toca; surge notificação «Rádio Maranata 91.9 FM · No ar» |
| 3 | Apagar o ecrã (botão power) e esperar 2–3 min | **A emissão CONTINUA a tocar** |
| 4 | Com o ecrã apagado/bloqueado: ver o ecrã de bloqueio | Controlos de media com o título «Rádio Maranata 91.9 FM» e acção «Parar» |
| 5 | Ecrã de bloqueio → «Parar» | O áudio para e a notificação desaparece |
| 6 | Ligar de novo e sair da app (botão home / outra app) | O áudio continua; a notificação mantém-se |
| 7 | Voltar à app → Rádio | O botão mostra ◼/❚❚ «No ar» (estado ressincronizado, não «parado») |
| 8 | Deslizador de volume com a emissão nativa a tocar | O volume da emissão muda |
| 9 | Modo de avião com a emissão a tocar | Passado algum tempo: notificação some e a app mostra «A emissão caiu…» (ou erro ao religar) |
| 10 | PC/navegador (web) → Rádio | Comportamento igual ao da v1.19.0 (player da página) |

Notas:
- Em alguns fabricantes (Xiaomi/MIUI, Samsung) pode ser preciso permitir
  «execução em segundo plano» nas definições da app — o serviço foreground
  minimiza isto, mas as ROMs agressivas existem.
- A notificação usa o canal «Rádio em segundo plano» (importância baixa: não
  faz som nem vibra).
