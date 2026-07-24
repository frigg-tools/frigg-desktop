# Design: Sistema de Logging em Tempo Real do Frigg

## Objetivo

Adicionar um sistema de logging local e temporário ao Frigg para ajudar no diagnóstico de problemas: mensagens de erro mal formatadas, funcionalidades que falharam, crashes e comportamentos inesperados. Os logs ficam armazenados na máquina do usuário e são acessíveis via interface interna do app.

## Escopo

- **Cobertura:** server Node.js (`packages/server`), processo principal do Electron (`packages/desktop`) e UI React (`packages/web`).
- **Acesso:** arquivos locais no disco do usuário + painel de logs dentro do app.
- **Retenção:** rotação diária, mantendo os últimos 7 dias.
- **Conteúdo:** apenas eventos internos do app (startup, shutdown, erros de API, falhas de device, warnings de UI, crashes). **Não** inclui tráfego HTTP interceptado (sem headers/body de requisições).

## Arquitetura

Um único `LoggerService` no `packages/server` centraliza todos os logs. Ele recebe publicações de três fontes:

1. **Server:** logs diretos do processo Node.js.
2. **Desktop:** logs do processo Electron main, publicados no mesmo serviço (desktop roda o server in-process em produção).
3. **Web:** logs da UI React, enviados para o server via WebSocket existente.

A UI React se inscreve no stream de logs via WebSocket para visualização em tempo real e pode consultar histórico via API REST.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Server    │     │   Desktop   │     │     Web     │
│  (Node.js)  │     │  (Electron) │     │   (React)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                    ┌──────▼──────┐
                    │ LoggerService│
                    │  (server)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐    │     ┌──────▼──────┐
       │   Arquivo   │    │     │     WS      │
       │  ~/.frigg/  │    │     │   stream    │
       │   logs/     │    │     └──────┬──────┘
       └─────────────┘    │            │
                          │     ┌──────▼──────┐
                          │     │   UI Logs   │
                          │     │   (React)   │
                          │     └─────────────┘
                          │
                   ┌──────▼──────┐
                   │  API REST   │
                   │  histórico  │
                   └─────────────┘
```

## Componentes

### `LoggerService` (`packages/server/src/logging/logger-service.ts`)

- Responsável por receber, formatar, persistir e distribuir logs.
- Mantém um buffer em memória dos últimos N logs para novos subscribers.
- Escreve em arquivo JSONL com rotação diária.
- Emite eventos para subscribers WebSocket.
- Exposto globalmente via container do server.

### `LogEntry`

Formato padronizado de cada log:

```ts
interface LogEntry {
  timestamp: string;      // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  source: 'server' | 'desktop' | 'web';
  context?: string;       // ex: "device-manager", "api-router", "react"
  message: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}
```

### `createLogger(source, context)`

Factory que retorna uma instância de logger tipada para cada fonte/contexto. Usada assim:

```ts
const logger = createLogger('server', 'device-manager');
logger.info('Device connected', { deviceId: 'abc' });
logger.error('Failed to connect', error);
```

### Web Logger (`packages/web/src/logging/web-logger.ts`)

- Wrapper ao redor do `console` que também envia logs para o server via WebSocket.
- Captura erros globais do React e da janela (`window.onerror`, `window.onunhandledrejection`).
- Em modo dev, continua espelhando no console do navegador.

### Desktop Logger (`packages/desktop/src/logging/desktop-logger.ts`)

- Envia logs do processo main para o `LoggerService` do server.
- Captura `uncaughtException` e `unhandledRejection` do Electron.

## Fluxo de dados

### Publicação de log

1. Qualquer componente chama `logger.info(...)` etc.
2. A mensagem é convertida para `LogEntry`.
3. `LoggerService`:
   - adiciona ao buffer circular em memória;
   - escreve no arquivo do dia (append JSONL);
   - notifica todos os subscribers WebSocket ativos.

### Visualização na UI

1. A UI abre o painel de logs.
2. Conecta ao stream via WebSocket e recebe o buffer recente imediatamente.
3. Novos logs chegam em tempo real.
4. O usuário pode aplicar filtros por nível, fonte e texto.
5. A UI também pode buscar histórico via API REST (`GET /api/logs?from=...&to=...&level=...`).

## Armazenamento e retenção

- **Local:** `~/.frigg/logs/` (respeita o diretório de dados do usuário do Electron quando disponível).
- **Formato:** JSONL, um objeto por linha.
- **Nome do arquivo:** `frigg-YYYY-MM-DD.logl`.
- **Rotação:** um novo arquivo por dia, baseado no timestamp UTC do log.
- **Limpeza:** ao iniciar, o service remove arquivos com mais de 7 dias.
- **Tamanho:** sem limite explícito por arquivo; a rotação diária e a janela de 7 dias limitam o crescimento.

## UI / Painel de logs

- Nova aba ou seção em alguma tela existente (provisoriamente em **Settings → Logs** ou aba própria **Logs**).
- Tabela com colunas: timestamp, nível, fonte, contexto, mensagem.
- Filtros: nível mínimo, fonte, busca por texto.
- Botão para abrir a pasta de logs no sistema.
- Botão para copiar logs selecionados.
- Indicador de "ao vivo" quando conectado ao stream.

## Captura de crashes e erros globais

### Server

- Listener de `uncaughtException`: loga `fatal` e encerra o processo de forma controlada.
- Listener de `unhandledRejection`: loga `error` com stack trace.

### Desktop

- `process.on('uncaughtException')`: loga `fatal` e mostra dialogo nativo.
- `process.on('unhandledRejection')`: loga `error`.

### Web

- `window.onerror`: loga `error`.
- `window.onunhandledrejection`: loga `error`.
- `ErrorBoundary` React na raiz do app: loga `error` com informação do componente.

## Privacidade e segurança

- Não logar tráfego HTTP interceptado (requisições/respostas, headers, bodies).
- Não logar tokens, senhas ou credenciais de device.
- `metadata` deve ser usado com cuidado; nunca incluir dados sensíveis sem sanitização.
- Logs ficam apenas localmente; nenhum envio para serviço externo.

## API

### WebSocket

- Evento `log:subscribe`: cliente pede para receber stream.
- Evento `log:entry`: server envia `LogEntry` para os subscribers.

### REST

- `GET /api/logs?from=<iso>&to=<iso>&level=<level>&source=<source>&q=<text>&limit=<n>`
  - Retorna array de `LogEntry` do arquivo, filtrado e limitado.

## Testes

- Testes unitários para `LoggerService` usando diretório temporário.
- Testes para rotação diária e limpeza de arquivos antigos.
- Testes para serialização segura de `Error`.
- Testes de integração para endpoint REST de histórico.
- Testes do Web Logger garantindo que erros globais são enviados.

## Tarefas de implementação (resumo)

1. Criar `LoggerService` e `LogEntry` no `packages/server`.
2. Implementar rotação diária e limpeza de logs antigos.
3. Criar factory `createLogger` e substituir `console.log`/`console.error` existentes nos pontos de entrada.
4. Adicionar endpoints WebSocket e REST no server.
5. Criar Web Logger no `packages/web` e capturar erros globais.
6. Criar Desktop Logger no `packages/desktop` e capturar erros globais.
7. Construir painel de logs na UI React.
8. Adicionar testes.
