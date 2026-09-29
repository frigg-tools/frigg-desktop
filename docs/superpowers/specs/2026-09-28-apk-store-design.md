# Apk Store — proposta de design

- Data: 2026-09-28
- Status: aprovado pelo usuário durante a conversa de implementação
- Branch: `codex/apk-store`
- Base: `origin/main` em `01a64c8e8f480a3a064644323e3e2776e4819221`

## Objetivo

Guardar APKs simples no Frigg com nome e descrição, reduzir o espaço ocupado quando gzip produzir um arquivo menor e instalar rapidamente um APK em um device Android conectado.

## Decisões

- A primeira versão aceita apenas um arquivo `.apk` por importação; não aceita APKs divididos nem arquivos de lojas.
- A importação está disponível na tela e no MCP. No MCP, o usuário fornece o caminho do arquivo; o agente não deve vasculhar o filesystem para encontrar APKs.
- Nome é obrigatório e pode ser preenchido inicialmente com o nome do arquivo. Descrição é opcional.
- A loja é local à instalação do Frigg e guarda dados em `~/.frigg/apk-store/`, com catálogo em `~/.frigg/apk-store.json`.
- Upload é transmitido em streaming. O limite é 1 GiB por arquivo. O serviço verifica extensão, assinatura ZIP inicial, tamanho e SHA-256.
- O serviço tenta gzip em streaming e conserva a representação comprimida somente quando ela reduz o tamanho. O catálogo registra tamanho original e armazenado.
- Antes da instalação, o APK é materializado em arquivo temporário, verificado por SHA-256 e removido ao final da operação.
- A instalação seleciona exatamente um device Android autorizado e online. Usa `adb install -r -t`, sem downgrade nem concessão automática de permissões, com timeout de cinco minutos.
- No máximo uma instalação da Apk Store pode usar cada serial por vez. Não há fila nem histórico de instalações.
- Rotas da loja são locais e protegidas por `localUiAccessMiddleware`; chamadas vindas da LAN não podem importar, excluir ou instalar arquivos.
- Excluir um item pede confirmação na UI e na skill MCP.
- A interface e a skill oferecem português e inglês. A skill MCP é distribuída em `plugin/skills/frigg-apk-store/` e recebe arquivo `VERSION` semver.

## Arquitetura

O servidor tem um `ApkStore` dedicado que mantém catálogo e blobs, grava arquivos temporários com permissões restritas, usa renames atômicos para blobs e catálogo, e expõe operações via um router protegido. A tela envia o próprio objeto `File` como stream binário. O MCP valida o caminho informado e transmite um Blob de arquivo ao mesmo endpoint, sem ler o APK inteiro em memória.

A tela mostra a quantidade e os tamanhos dos APKs, contexto e nome do arquivo, estado de compressão e ações de instalação/exclusão. A instalação solicita um serial conectado por operação e exibe estado ocupado, sucesso ou erro.

O MCP oferece ferramentas para importar um arquivo fornecido, listar a loja, instalar uma entrada em um serial e excluir uma entrada após confirmação do usuário. Cada tool usa o contrato REST da API em vez de acessar os arquivos internos da loja.

## Limites e falhas

- Rejeitar extensão diferente de `.apk`, arquivo vazio, assinatura não ZIP, nome ou descrição fora dos limites e upload acima de 1 GiB.
- Em upload interrompido, erro de disco, falha de compressão ou falha ao persistir o catálogo, remover temporários e qualquer blob ainda não referenciado.
- Em instalação, recusar serial ausente, offline ou não autorizado; rejeitar instalação concorrente no mesmo serial; informar falha ou timeout do ADB e remover o temporário em todos os caminhos.
- Não inferir versão, package ID, certificado, ABI ou metadados Android nesta entrega.
- Não oferecer lote, instalação em múltiplos devices, exportação, atualização automática, permissões automáticas, downgrade, fila ou histórico.

## Direção visual

Reaproveitar o fundo zinc e o acento esmeralda do Frigg. Usar títulos em Chakra Petch, alinhamento à esquerda e uma lista densa de itens como prateleira técnica: o arquivo e seu contexto têm prioridade, enquanto compressão e tamanho aparecem como metadados legíveis. Reservar a cor de estado para sucesso, falha e operação ativa; evitar painéis repetidos com sombras ou decoração sem função.

## Critérios de aceite

- Importar pela tela ou MCP, listar, excluir e instalar um único APK por operação.
- Armazenar gzip apenas se economizar espaço; apresentar tamanhos original e armazenado.
- Confirmar hash antes de instalar e limpar o arquivo temporário após sucesso ou falha.
- Exibir apenas devices Android autorizados e online como destino.
- Manter o MCP limitado aos contratos da loja e aos caminhos de arquivo explicitamente fornecidos pelo usuário.
- Incluir a skill MCP versionada e traduzir a UI para pt-BR e inglês.
