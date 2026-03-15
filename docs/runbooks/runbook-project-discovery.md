# Runbook: Project Discovery (validação de ideias de projeto)

Prática estruturada para analisar ideias de projetos e empreendimentos: escopo, funcionalidades, limitações, dados, ROI, riscos, viabilidade, MVP e estrutura. Usada pela skill **project-discovery** no chat (Session) do OpenCode.

## Pré-requisitos

- OpenCode em execução com Session (chat) disponível (painel ou API).
- Skill **project-discovery** carregada (em `.opencode/skill/project-discovery/` ou via `skills.paths` / `skills.urls`).
- Modelo LLM configurado para o agent.

## Passos da prática (conteúdo da análise)

Executar as etapas abaixo na ordem, produzindo um relatório em Markdown.

### 1. Resumo da ideia e escopo entendido

- Parafrasear a ideia do usuário em 2–4 frases.
- Delimitar o escopo assumido (o que entra e o que fica de fora).

### 2. Funcionalidades possíveis

- Listar funcionalidades que o projeto poderia ter.
- Priorizar (ex.: must / should / could) ou ordenar por valor/esforço.

### 3. Limitações e dependências

- Identificar restrições técnicas, de negócio ou de recursos.
- Listar dependências externas (APIs, dados, parceiros, regulatório).

### 4. Análise de dados

- Quais dados o projeto precisa (entrada, saída, armazenamento).
- Fontes possíveis e qualidade esperada (disponibilidade, confiabilidade).

### 5. Análise de ROI (ordem de grandeza)

- Premissas de custo e receita (quando aplicável).
- Indicar ordem de grandeza e incertezas; não exigir números finos.

### 6. Riscos

- Riscos técnicos, de mercado e operacionais.
- Breve mitigação ou aceitação para cada um.

### 7. Viabilidade

- Conclusão: **viável** / **condicional** / **inviável** + motivo em 1–2 frases.

### 8. Foco MVP

- Definir escopo mínimo para validar a ideia (funcionalidades e métricas de sucesso).

### 9. Estrutura de projeto (barata e rápida)

- Stack sugerida (tecnologias, ferramentas).
- Fases de implementação e estimativa de esforço (ordem de grandeza: dias/semanas).

### 10. Relatório final

- Resumo executivo (1 parágrafo).
- Recomendação clara (seguir, ajustar escopo, ou não seguir) e próximos passos.

## Formato de saída

O resultado deve ser **Markdown estruturado** com as seções acima (títulos `##` ou `###`). Pode ser usado como mensagem na Session ou, no futuro, persistido por um pipeline (nesse caso pode definir-se um JSON schema adicional).

Exemplo de estrutura:

```markdown
## Resumo e escopo
...

## Funcionalidades
...

## Limitações e dependências
...

## Dados
...

## ROI (ordem de grandeza)
...

## Riscos
...

## Viabilidade
...

## MVP
...

## Estrutura de projeto
...

## Relatório final
...
```

## Como executar no painel

1. Abrir uma Session (chat) no painel OpenCode.
2. Digitar `/project-discovery` seguido da ideia, ou escrever a ideia e pedir análise com a skill Project Discovery.
3. O agent executa a prática e responde na mesma thread (streaming).

Via API: `POST /session/:sessionID/command` com `command: "project-discovery"` e `arguments: "<texto da ideia>"`.

## Rollback

Não aplicável (análise read-only). Para refazer, enviar nova mensagem ou novo comando.

## Referências

- [Feature: Project Discovery Validator](../features/project-discovery-validator.md)
- [Skill project-discovery](../../skill/project-discovery/README.md)
- [API OpenCode Server](../api/opencode-server.md) (Session e command)
