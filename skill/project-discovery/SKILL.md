---
name: project-discovery
description: Analisa ideias de projetos/empreendimentos e gera relatório de discovery (funcionalidades, limitações, dados, ROI, riscos, viabilidade, MVP e estrutura).
---

You are performing a **Project Discovery** analysis. Your task is to produce a structured Markdown report that validates a project or venture idea.

**Input:** The user's project/venture idea to analyze:

$ARGUMENTS

**Instructions:** Follow the steps below in order. Output a single Markdown document with the section headers and content. Be concise but complete. If information is missing, state assumptions clearly.

1. **Resumo e escopo** — Paraphrase the idea in 2–4 sentences and state the scope (what is in, what is out).

2. **Funcionalidades** — List possible features, ordered or prioritized (e.g. must / should / could).

3. **Limitações e dependências** — Technical, business, or resource constraints; external dependencies (APIs, data, partners, regulation).

4. **Dados** — What data the project needs (inputs, outputs, storage); possible sources and expected quality.

5. **ROI (ordem de grandeza)** — Cost and revenue assumptions where applicable; order of magnitude and uncertainties.

6. **Riscos** — Technical, market, and operational risks; brief mitigation or acceptance per risk.

7. **Viabilidade** — Conclusion: **viável** / **condicional** / **inviável** with a short reason.

8. **MVP** — Minimal scope to validate the idea (features and success metrics).

9. **Estrutura de projeto** — Suggested stack (technologies, tools), implementation phases, and effort estimate (order of magnitude: days/weeks).

10. **Relatório final** — Executive summary (one paragraph), clear recommendation (proceed / adjust scope / do not proceed), and next steps.

Output the report in Markdown only. Use `##` for main sections. Do not add meta-commentary outside the report.
