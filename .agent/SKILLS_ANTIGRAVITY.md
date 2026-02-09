# Antigravity Awesome Skills no projeto

As [Antigravity Awesome Skills](https://github.com/sickn33/antigravity-awesome-skills) (700+ skills para Cursor/Claude Code/etc.) foram instaladas neste projeto.

## Onde está

- **Repositório clonado:** `.agent/antigravity-awesome-skills/`
- **Skills (para Cursor):** `.cursor/skills` → aponta para `.agent/antigravity-awesome-skills/skills/`

No Cursor você pode usar no chat: **@nome-da-skill** (ex.: `@brainstorming`, `@react-patterns`).

## Instalação (quem clonar o projeto)

Como o repositório antigravity não é commitado (está no `.gitignore`), rode uma vez no projeto:

```powershell
cd c:\Projetos\ChampionsChurch
git clone -c core.symlinks=false --depth 1 https://github.com/sickn33/antigravity-awesome-skills.git .agent/antigravity-awesome-skills
cmd /c mklink /J ".cursor\skills" ".agent\antigravity-awesome-skills\skills"
```

Se a pasta `.cursor` não existir, crie antes: `New-Item -ItemType Directory -Path .cursor -Force`.

## Atualizar as skills

```powershell
git -C .agent/antigravity-awesome-skills pull
```

## Referência

- Repositório: https://github.com/sickn33/antigravity-awesome-skills
- Catálogo de skills: `.agent/antigravity-awesome-skills/CATALOG.md` (após o clone)
- Bundles recomendados: `.agent/antigravity-awesome-skills/docs/BUNDLES.md`
