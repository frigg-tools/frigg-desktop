# Skills para recursos MCP do Frigg

Skills são a documentação operacional que ensina Codex, Claude Code, Cursor e outros agentes a usar os recursos MCP do Frigg.

## Regra para novas features

Toda nova capacidade do Frigg que seja exposta pelo MCP precisa incluir uma skill dedicada em `plugin/skills/<nome-da-skill>/SKILL.md`. A skill deve ensinar um agente a reconhecer quando a capacidade se aplica e a executá-la pelas ferramentas MCP corretas.

Ao desenvolver uma feature MCP, inclua a skill no mesmo conjunto de mudanças da implementação. Atualize também skills existentes quando o fluxo ou as ferramentas que elas documentam mudarem. Uma alteração da skill deve atualizar o arquivo `VERSION` no mesmo diretório.

## Conteúdo esperado

Cada `SKILL.md` deve documentar:

- os pedidos e situações que devem ativar a skill;
- as ferramentas MCP e a sequência necessária para concluir o fluxo;
- decisões que o agente precisa tomar e quais dados pedir quando faltarem;
- os resultados esperados, falhas comuns e como recuperar;
- limites de segurança e ações que exigem confirmação do usuário.

Use exemplos baseados nos contratos MCP atuais. Não invente nomes de ferramentas nem dependa de caminhos locais ou portas fixas quando o agente puder consultar o estado do Frigg.

## Versão

Cada diretório em `plugin/skills/` deve conter um `VERSION` com uma versão `MAJOR.MINOR.PATCH` (por exemplo, `1.2.0`). A versão é independente da versão do aplicativo.

- **PATCH**: correções de instrução e esclarecimentos sem novo fluxo.
- **MINOR**: novo fluxo ou capacidade compatível dentro do propósito da skill.
- **MAJOR**: mudança incompatível no propósito ou nas instruções principais.

Incremente a versão sempre que alterar o conteúdo da skill. O Frigg compara `VERSION` e o conteúdo instalado em cada cliente para mostrar atualizações disponíveis. Skills instaladas antes deste controle aparecem com versão desconhecida e podem ser atualizadas pela aba MCP.

## Checklist de implementação MCP

- [ ] A feature MCP tem uma skill dedicada em `plugin/skills/`.
- [ ] A skill ensina um fluxo completo usando os nomes e contratos atuais das ferramentas.
- [ ] `VERSION` existe e foi incrementado quando a skill mudou.
- [ ] A mudança continua incluída nos pacotes MCP e desktop do Frigg.
- [ ] A aba MCP mostra a skill e permite instalá-la ou atualizá-la em Codex, Claude Code e Cursor.
