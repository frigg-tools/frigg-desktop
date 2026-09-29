# Frigg

<p align="center"><img src="packages/desktop/build/icon.png" width="112" alt="Ícone do Frigg" /></p>

**Um kit de desenvolvimento e debugging para apps Android e iOS.**

Depure da rede ao estado do device: inspecione requests, rode chamadas de API, crie mocks ou pause trocas, acompanhe logs, consulte bancos locais e use ferramentas avançadas no mesmo workspace desktop.

O Frigg é gratuito e open source, com interface em inglês e português brasileiro.

[Baixar o app desktop](https://github.com/frigg-tools/frigg-desktop/releases/latest) · [O que o Frigg faz](#o-que-o-frigg-faz) · [English](./README.md)

## O que o Frigg faz

### Debugging de rede

- **Tráfego** — inspecione requests HTTP(S) ao vivo, filtre por host, caminho ou device e veja headers e bodies.
- **API client** — organize requests em workspaces, pastas e environments; use variáveis, abas, scripts de pre-request e testes.
- **Breakpoints** — pause requests ou responses, edite em trânsito e continue, substitua a resposta ou aborte.
- **Mocks** — encontre regras por método, URL, query e body; responda com status, headers, conteúdo e delay personalizados.

### Diagnóstico de devices

- **Setup de device** — configure emuladores Android e simuladores iOS em poucos cliques. Celulares físicos podem se conectar por uma página com QR.
- **Logs** — acompanhe Android logcat e logs do iOS, filtrados por app, nível e texto.
- **Bancos locais do app** — navegue e consulte bancos Android Room e iOS a partir de um device conectado.

### Ferramentas avançadas

- **SQL** — conecte a MySQL, MariaDB, PostgreSQL ou SQLite; navegue e edite tabelas e rode queries com autocomplete baseado no schema.
- **Frida** — instale frida-server, rode scripts em apps num emulador Android com root e acompanhe a saída. O Frigg pode listar, iniciar e criar AVDs com root.
- **MCP e skills para IA** — conecte Codex, Claude Code e Cursor ao Frigg por meio de 52 ferramentas MCP e skills reutilizáveis de API Client e inspeção de tráfego.

## Suporte por plataforma

| Alvo | Configuração | Observações |
| --- | --- | --- |
| Emulador Android ou aparelho USB | Proxy e CA configurados em **Devices** | Usa CA de sistema quando `adb root` está disponível; caso contrário, instale a CA de usuário manualmente. |
| Simulador iOS | Instale a CA em **Devices** e ative o proxy do macOS | O simulador usa a configuração de proxy do Mac. |
| Android ou iPhone físico | Abra a página de setup por QR e configure o proxy Wi-Fi e o certificado | O celular e o computador com Frigg precisam estar na mesma rede Wi-Fi. |
| Emulador Android com root | Selecione um AVD em **Frida** | Conecte a um app aberto ou inicie o app e rode scripts Frida. |

## Download

Baixe a versão desktop mais recente em [GitHub Releases](https://github.com/frigg-tools/frigg-desktop/releases/latest). Escolha <code>arm64</code> para Apple Silicon ou <code>x64</code> para Macs Intel, abra o <code>.dmg</code> e arraste o Frigg para Aplicativos.

A versão para macOS não é assinada, então o Gatekeeper bloqueia a primeira abertura. Clique com o botão direito no app e escolha **Abrir**, ou rode:

~~~bash
xattr -dr com.apple.quarantine /Applications/Frigg.app
~~~

Releases com tag (<code>vX.Y.Z</code>) são compiladas e publicadas automaticamente pelo [CI](.github/workflows/release.yml). Os pacotes para Windows e Linux podem ser gerados no sistema operacional correspondente; veja [App desktop](#app-desktop).

## Início rápido pelo código

~~~bash
npm install
npm run dev
~~~

Isso inicia o servidor (API <code>:4848</code>, proxy <code>:8888</code>) e a interface web (<code>:5173</code>). Abra <http://localhost:5173>, conclua a configuração inicial e conecte um device em **Devices**.

Para compilar a versão servida pelo servidor:

~~~bash
npm run build
npm start
~~~

## App desktop

~~~bash
npm run desktop        # inicia o Frigg numa janela nativa
npm run desktop:dist   # gera um pacote em packages/desktop/release/
~~~

O app desktop inicia o servidor no próprio processo e serve a interface incluída no pacote. Os destinos são macOS <code>.dmg</code>, Windows <code>.exe</code> (NSIS) e Linux AppImage; gere cada pacote no sistema operacional correspondente.

## Conectar um device

### Emulador Android ou aparelho USB

Instale o ADB (<code>brew install --cask android-platform-tools</code>). Em **Devices → Android**, escolha **Set up interception**. O Frigg configura o proxy HTTP global do device e instala a CA como certificado de sistema quando <code>adb root</code> está disponível. Caso contrário, coloca o certificado em Downloads e abre as configurações de segurança do Android para instalar a CA de usuário manualmente.

Apps com alvo Android API 24 ou mais recente só confiam em CAs instaladas pelo usuário quando o build de debug habilita isso em <code>networkSecurityConfig</code>:

~~~xml
<network-security-config>
  <base-config>
    <trust-anchors>
      <certificates src="user" />
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
~~~

Use **Remove** no Frigg para limpar a configuração do proxy.

### Simulador iOS

Inicie um simulador e use **Devices → iOS Simulator → Install CA cert**. Simuladores herdam o proxy do Mac; ative o controle de proxy do macOS na mesma tela para encaminhar o tráfego pelo Frigg.

### Aparelhos físicos

Abra no celular a página de setup em <code>http://&lt;seu-ip-da-rede&gt;:4848/setup</code>. Mantenha o celular e o Mac na mesma rede Wi-Fi, configure o proxy Wi-Fi para <code>&lt;seu-ip-da-rede&gt;:8888</code>, baixe a CA do Frigg pela página e confie nela nas configurações de segurança do aparelho. No iOS, instale o perfil e habilite a confiança total em **Certificate Trust Settings**.

## Clientes de IA, MCP e skills

Abra **MCP** no Frigg para instalar o servidor MCP local e as skills do Frigg globalmente para sua conta de usuário no Codex, Claude Code e Cursor. A tela mostra o estado de cada recurso separadamente, detecta conflitos de configuração existentes e oferece uma ação explícita para substituir. Recarregue ou reinicie o cliente de IA depois da configuração.

A skill `frigg-api-client` orienta a IA a criar workspaces, coleções, requests e ambientes. A skill `frigg-traffic-inspector` explica como localizar uma troca e buscar os detalhes limitados de request/response. As skills funcionam nos três clientes; o plugin do Claude Code continua disponível para seus fluxos adicionais específicos do Claude.

A tela MCP também mantém instruções manuais para outros clientes. O Frigg salva o registro de propriedade das integrações do usuário em <code>~/.frigg/agent-integrations.json</code>.

### Plugin do Claude Code

Instale o plugin Frigg no Claude Code:

~~~text
/plugin marketplace add frigg-tools/frigg-desktop
/plugin install frigg@frigg-tools
~~~

Com o Frigg rodando, o plugin pode conferir o status, inspecionar tráfego capturado, criar mocks, rodar requests salvos do API client e orientar a configuração. O MCP instalado pela tela do Frigg usa automaticamente a porta ativa da API. Depois de alterar o código do MCP, gere novamente o servidor incluído com <code>npm run build:plugin</code>.

## Dados e arquivos locais

O Frigg salva o par de chaves da CA, regras de mock e dados do API client em <code>~/.frigg/</code>. Credenciais salvas de conexões SQL externas ficam criptografadas em repouso.

## Desenvolvimento

O Frigg é um monorepo com npm workspaces:

- <code>packages/shared</code> — tipos de domínio compartilhados
- <code>packages/server</code> — servidor Node.js e TypeScript, proxy, API HTTP/WebSocket e conectores de devices
- <code>packages/web</code> — interface React
- <code>packages/desktop</code> — shell Electron
- <code>packages/mcp</code> — servidor MCP e plugin do Claude Code

Veja contratos dos módulos e arquitetura em [DESIGN.md](./DESIGN.md).

~~~bash
npm test
FRIGG_PROXY_PORT=9999 FRIGG_API_PORT=4040 npm start
~~~
