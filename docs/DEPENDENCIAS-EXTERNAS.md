# Dependencias externas criticas

## SheetJS (`xlsx` 0.20.3)

- Origem: tarball oficial `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
  (nao usar o pacote abandonado do npm registry com CVEs conhecidos).
- Integridade: `package-lock.json` fixa
  `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`.
- Uso: exportacoes Excel (Financas, Relatorios, Membros, Admin) via `import('xlsx')` + `saveXlsx`.
- Riscos: `npm ci` depende do CDN SheetJS; sem rede a instalacao falha.
- Mitigacoes: manter lockfile; espelho interno do `.tgz` em CI offline; nao voltar ao `xlsx` npm antigo.

## Bootstrap de super administrador

- Super = apenas `admins/<email>.isSuper == true`.
- Bootstrap auto-extinguivel: email fundador, uma vez, com `role: admin` e `isSuper: true`.
- Worker e UI deixam de usar email hardcoded como fonte de autoridade.
