# Plano de melhoria de usabilidade do Frigg

Data: 27/09/2026 · Base: `origin/main` em `29720c8` (v1.4.2) · Implementação: branch `codex/frigg-usability`

## Objetivo e método

Permitir que uma pessoa conecte um dispositivo, confirme que HTTPS funciona e encontre uma requisição útil sem conhecer previamente proxy, CA ou ADB. Preservar o visual escuro, o verde esmeralda e a personalidade de ferramenta de desenvolvimento.

Executei a interface web sincronizada em `localhost:5173`, ligada ao backend do Frigg que já estava aberto no Mac. Percorri o onboarding e as telas Dispositivos, Tráfego, Mocks, API Client, Automação, Logcat, Frida, Banco de dados, SQL e MCP em 1280 × 720. Esta é uma avaliação heurística; ainda precisa de teste com pessoas novas e janela menor. Não alterei dispositivos nem dados existentes.

## Problemas observados

| Prioridade | Evidência | Efeito |
| --- | --- | --- |
| P0 | O onboarding explica conceitos em três passos e termina numa página longa que mistura Android, iOS, proxy manual, CA, fingerprint e certificados upstream. | A pessoa ainda precisa descobrir qual é o seu caminho e quando terminou. |
| P0 | Um Android mostra `SEM PROXY`, `CA —`, **Configurar interceptação** e **Instalar CA** simultaneamente, sem estado único de prontidão ou teste guiado. | Instalar a CA pode parecer conclusão mesmo sem tráfego HTTPS confirmado. |
| P1 | O menu apresenta 11 destinos no mesmo nível; Dispositivos aparece perto do fim. | A navegação não expressa o percurso conectar → capturar → investigar. |
| P1 | Tráfego exibiu 1.000 entradas dominadas por chamadas automáticas `generate_204`; o filtro de origem usa IP bruto. | O tráfego do app investigado fica perdido no ruído. |
| P1 | Lista e detalhe do tráfego usam textos pequenos e cinza muito escuro; abrir um detalhe trunca as URLs na lista. | Ler e comparar requisições exige esforço. |
| P1 | Novo mock abre um formulário extenso com correspondência, resposta e localização. | Uma resposta simples parece exigir domínio de todas as opções. |
| P2 | Logcat e Banco de dados pedem nova seleção mesmo com dispositivos detectados; API Client abre num vazio apesar da coleção existente. | O contexto não acompanha o usuário entre tarefas. |
| P2 | Português e inglês se misturam; várias siglas e metadados em caixa alta têm pouco contraste. | A interface exige tradução mental e esconde instruções. |

## Direção visual

Preservar a paleta e usar a cor para indicar o estado da tarefa, não para criar mais decoração:

| Papel | Cor |
| --- | --- |
| Fundo | `#09090b` |
| Superfície | `#18181b` |
| Divisor | `#27272a` |
| Texto principal | `#e4e4e7` |
| Ação e sucesso | `#34d399` |
| Atenção | `#fbbf24` |

Manter Chakra Petch na marca e nos títulos curtos, IBM Plex Sans nos controles e explicações, IBM Plex Mono para código e dados. Usar 13–14 px para instruções e estados; reservar 10–11 px para metadados secundários. Alinhar conteúdo à esquerda. O elemento distintivo será uma **linha de prontidão do dispositivo**, pois representa uma sequência real e responde “o que falta?”.

```text
┌ Navegação ──────┬ Dispositivos ────────────────────────────────┐
│ Capturar        │ Android | iOS | Manual                       │
│  Dispositivos   │ Dispositivo selecionado · próximo passo      │
│  Tráfego        │ Detectado ━ Proxy ━ Certificado ━ Validado   │
│  Mocks          │ [Ação do passo atual] [Testar captura]       │
│ Ferramentas     │ Detalhes técnicos ▾                         │
│ Avançado ▾      │ Outros dispositivos                          │
└─────────────────┴──────────────────────────────────────────────┘
```

Revisão do conceito: descartei um painel inicial de métricas. O problema central é orientação e confirmação; contadores e cards iguais adicionariam ruído. A identidade existente já é boa, então as mudanças principais são de hierarquia, fluxo e linguagem.

## Plano de entrega

### Etapa 1 — Conexão guiada (P0)

1. Terminar o onboarding com a escolha de Android, iOS Simulator ou configuração manual e continuar diretamente no percurso escolhido.
2. Mostrar no topo de Dispositivos um dispositivo selecionado, seu estado de prontidão, o próximo passo e o resultado da última tentativa. Mover fingerprint, certificados upstream e instruções de remoção para **Detalhes técnicos**.
3. Distinguir `proxy configurado`, `CA instalada/confiável` e `HTTPS validado`. Quando não houver evidência, dizer “Não foi possível verificar” com motivo e próximo passo; `—` nunca significa sucesso.
4. Oferecer **Testar captura** após a configuração, com verificação ou instrução concreta no aparelho, e abrir o Tráfego filtrado para esse dispositivo.

**Critério:** uma pessoa nova conclui o fluxo sem README e sabe se HTTPS foi de fato observado. Cada falha mostra uma ação específica.

### Etapa 2 — Navegação e tráfego (P1)

1. Agrupar o menu por tarefas: **Capturar** (Dispositivos, Tráfego, Mocks), **Explorar** (API Client, Logcat, Banco de dados) e **Avançado** (Automação, Frida, SQL, MCP, Logs). O grupo avançado pode ser recolhido.
2. Compartilhar a seleção de dispositivo entre Dispositivos, Tráfego, Logcat e Banco de dados. Mostrar nome/modelo, deixando IP e serial nos detalhes.
3. Dar destaque à busca e aos filtros por app, host e dispositivo. Oferecer opção reversível para ocultar chamadas de conectividade conhecidas e indicar quantos itens foram ocultados.
4. No detalhe, priorizar URL completa, método, status, tempo, origem, requisição e resposta. Permitir ampliar o painel para corpos grandes.
5. Padronizar vazios e erros para responder: o que aconteceu, o que fazer e o que esperar.

**Critério:** após configurar, uma requisição relevante aparece em até duas ações; filtros ativos e itens ocultos ficam explícitos.

### Etapa 3 — Criação e acabamento (P2)

1. Fazer “Criar mock” de uma requisição capturada o caminho principal: revisar correspondência, definir status/corpo e salvar. Colocar query, matcher de corpo, headers, atraso, pasta e prioridade em **Mais opções**.
2. No API Client, explicar workspace, ambiente e coleção no momento de uso; oferecer criar ou abrir uma requisição recente no estado vazio.
3. Unificar vocabulário pt-BR/EN, nomes de ações e mensagens de resultado. Dar nomes acessíveis a controles só com ícone e explicar CA, ADB e MCP quando aparecem.
4. Revisar contraste, foco visível, teclado, alvos de clique, escala de texto, redução de movimento e largura de 900–1024 px.

**Critério:** um mock simples não exige preencher campos avançados; os controles essenciais funcionam por teclado e são compreensíveis nos dois idiomas.

## Validação

Observar 3–5 pessoas que não conhecem o Frigg tentando: conectar dispositivo, validar HTTPS, encontrar chamada do app, criar mock e desligar interceptação. Medir conclusão sem ajuda, tempo, hesitações e erros. Meta inicial: ao menos 4 de 5 completam as três primeiras tarefas sem orientação e ninguém confunde CA instalada com HTTPS validado. Comparar com a interface atual após um protótipo navegável de Dispositivos e Tráfego.

## Implementação nesta branch

- Agrupei a navegação por tarefa e deixei Avançado recolhido por padrão.
- O onboarding pergunta qual plataforma será usada; Dispositivos abre nessa plataforma e mostra só o fluxo correspondente. Fingerprint e certificados mTLS ficam em **Detalhes técnicos**.
- Android mostra dispositivo pronto, destino do proxy e HTTPS observado em estados separados. Quando o estado da CA do emulador não pode ser consultado, a tela agora diz que é desconhecido. Selecionar um aparelho compartilha o contexto com Logcat e Banco de dados; abrir o tráfego filtra pela origem desse Android.
- Tráfego permite ocultar chamadas de conectividade reconhecidas, mostra quantas foram ocultadas, identifica IPs dos Androids e orienta como gerar tráfego para o aparelho selecionado. A lista e os filtros têm alvos maiores e contraste reforçado.
- A tela vazia do API Client permite reabrir uma requisição recente ou criar outra. No editor de mocks, opções avançadas começam recolhidas e são abertas automaticamente quando a regra já as utiliza.
- Adicionei foco visível e respeito à preferência de redução de movimento, com textos novos em português e inglês.

## Limites da validação

A validação desta implementação é estática e de compilação; não substitui observação com 3–5 pessoas. A aplicação reconhece HTTPS observado por dispositivo Android quando o backend fornece essa evidência. Para iOS e proxy manual, o backend não fornece um sinal equivalente nesta tela, então não afirmo que a CA foi validada nessas plataformas. O botão **Abrir tráfego do dispositivo** leva à captura filtrada para orientar essa confirmação.
