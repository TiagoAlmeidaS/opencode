# Feature: Central de configuração (hub KINETIC) na aba Management

## Objetivo

Centralizar configurações relacionadas com o projeto e integrações Git no ecrã **Management**: widget [`ProjectSettingsDrawer`](../../packages/flutter_app/lib/screens/project_settings_drawer.dart) com `embedded: true`, estilo KINETIC em tema escuro e lista clássica em tema claro. No **header** global (mobile: `AppBar.actions`; desktop: barra fina `KINETIC_SYNC`) ficam **notificações** e **perfil** (bottom sheet → `ConnectionScreen`); a configuração project/Git/LLM não está no drawer.

## Uso

| Onde | Como abrir |
|------|------------|
| **Management** | Aba **Manage** na barra inferior → scroll: bloco KINETIC (Configuration, providers, repos, terminal protocol) e, abaixo, grelha **Daemon & operations**. |
| Header | Notificações (placeholder) + Perfil apenas. |

### Secções do painel (Management)

1. **Cabeçalho** — Título “Configuration” e subtítulo de ambiente (GIT_INTEGRATIONS).
2. **Providers** — Cartões em vidro: **GitHub** (estado derivado de `AppState.githubToken`), **GitLab** e **Azure DevOps** (placeholders).
3. **Repository sync** — Lista de projetos conhecidos (`AppState.projects`), filtro textual, toggles de seleção local em memória, interruptor **Auto-sync** (estado local na sessão; sem persistência em disco nesta versão).
4. **Terminal protocol** — Atalhos: **LLM** → `LlmSettingsScreen`; **SSH** e **Git global** → “Em breve” (`SnackBar`).

### GitHub — Manage

O botão **Manage** abre **`DialogAddProject`** (OAuth/PAT / adicionar repositório), via `ManagementHubScreen._showAddProject`.

## Limitações

- **Apenas GitHub** tem integração real no app; GitLab e Azure DevOps mostram “Connect” desativado ou mensagem “Em breve”.
- **Não** são mostradas versões fictícias de backend; o texto reflete apenas estado da app (`githubToken`, projetos carregados).
- **Auto-sync** e seleção de repos no hub são **locais ao estado** do ecrã Management (memória); persistência com `SharedPreferences` pode ser uma fase posterior.

## Referências

- Código: [`project_settings_drawer.dart`](../../packages/flutter_app/lib/screens/project_settings_drawer.dart), [`management_hub_screen.dart`](../../packages/flutter_app/lib/screens/management_hub_screen.dart), [`main_layout.dart`](../../packages/flutter_app/lib/screens/main_layout.dart).
- LLM: [`llm_settings_screen.dart`](../../packages/flutter_app/lib/screens/llm_settings_screen.dart).
- GitHub / add project: [`dialog_add_project.dart`](../../packages/flutter_app/lib/widgets/dialog_add_project.dart), [feature Flutter](flutter-app.md).
- Design KINETIC: [`kinetic_tokens.dart`](../../packages/flutter_app/lib/theme/kinetic_tokens.dart), [arquitetura KINETIC](../architecture/flutter-kinetic-design-system.md).
