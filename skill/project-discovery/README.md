# Skill: project-discovery

Analisa ideias de projetos e empreendimentos e gera um relatório de discovery estruturado em Markdown.

## Descrição

Esta skill é usada pelo agent do OpenCode para validar ideias de projeto: escopo, funcionalidades, limitações, dados, ROI, riscos, viabilidade, MVP e estrutura de projeto (stack e fases). A saída é um relatório em Markdown com seções fixas.

## Uso

- **No chat (painel):** Digite `/project-discovery` seguido da ideia, ou use o atalho `/discovery` e depois escreva a ideia.
- **Como comando:** O nome do comando é `project-discovery`; os argumentos são o texto da ideia (ex.: via `POST /session/:sessionID/command` com `command: "project-discovery"` e `arguments: "<ideia>"`).

## Conteúdo da prática

As etapas da análise estão documentadas em [docs/runbooks/runbook-project-discovery.md](../../docs/runbooks/runbook-project-discovery.md). O corpo da skill (`SKILL.md`) contém as instruções enviadas ao agent; o placeholder `$ARGUMENTS` é substituído pela ideia do usuário.

## Referências

- [Feature: Project Discovery Validator](../../docs/features/project-discovery-validator.md)
- [Runbook: Project Discovery](../../docs/runbooks/runbook-project-discovery.md)
