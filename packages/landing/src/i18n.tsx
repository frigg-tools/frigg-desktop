import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'pt';

type Dict = typeof en;

export type ToolId =
  | 'traffic'
  | 'api'
  | 'breakpoints'
  | 'mocks'
  | 'logcat'
  | 'database'
  | 'sql'
  | 'frida'
  | 'devices'
  | 'mcp';

const en = {
  nav: { tools: 'Tools', how: 'How it works', download: 'Download', github: 'GitHub' },
  hero: {
    eyebrow: 'Mobile app development toolkit',
    title: 'Debug mobile apps from network to device.',
    subtitle:
      'Inspect live traffic, run API requests, mock or pause exchanges, stream device logs, query app data, and instrument rooted Android emulators — from one desktop workspace for Android and iOS. Free and open source.',
    download: 'Download for Mac',
    downloadGeneric: 'Download',
    viewGithub: 'View on GitHub',
    freeNote: 'Free & open source · macOS · Windows & Linux from source',
    cycleHint: 'Network, device and runtime tools — click a tab',
  },
  stream: { label: 'Live traffic' },
  tools: {
    eyebrow: 'The toolkit',
    title: 'One toolkit for the whole debugging loop.',
    subtitle:
      'Move from a failing request to the logs or data behind it, then test a change without leaving Frigg.',
    groups: {
      network: {
        title: 'Network debugging',
        desc: 'See what the app sends, shape what the API returns, and repeat requests while you investigate.',
      },
      device: {
        title: 'Device diagnostics',
        desc: 'Connect Android and iOS devices, then inspect their logs and the data stored by your app.',
      },
      advanced: {
        title: 'Advanced tools',
        desc: 'Connect external databases, instrument rooted Android emulators, or let an agent drive Frigg.',
      },
    },
    items: {
      traffic: {
        name: 'Traffic',
        tagline: 'See every request, live.',
        desc: 'A TLS-intercepting proxy puts every request your app makes on screen as it happens. Filter by host, path and device, inspect headers and bodies, and turn any real exchange into a mock with one click.',
        bullets: ['Live request feed', 'Filter by host / path / device', 'One-click → mock'],
      },
      api: {
        name: 'API client',
        tagline: 'A Postman that lives next to your traffic.',
        desc: 'Workspaces, nested folders, environments and {{variables}} — highlighted and autocompleted everywhere. Open requests as tabs, colorize JSON bodies, and run pre-request and test scripts in a sandboxed pm API.',
        bullets: ['Environments & {{variables}}', 'Tabs · scripts · pm.test', 'Seed vars across envs'],
      },
      breakpoints: {
        name: 'Breakpoints',
        tagline: 'Pause a request mid-flight and rewrite it.',
        desc: 'Catch a matching request or response before it lands. Edit the method, URL, headers, body or status, then continue, answer with a custom response, or abort it entirely. Match on the request side, the response side, or both.',
        bullets: ['Pause request or response', 'Edit anything, then continue', 'Custom response or abort'],
      },
      mocks: {
        name: 'Mocks',
        tagline: 'Fake any endpoint without touching the backend.',
        desc: 'Rules in nested folders, matched on method, host/path globs, query substring and body. Answer with your own status, headers, body and delay. Highest priority wins; mocked requests never reach upstream.',
        bullets: ['Glob match · query · body', 'Custom status / headers / delay', 'Folders & priority'],
      },
      logcat: {
        name: 'Logcat',
        tagline: 'Device logs, filtered to your app.',
        desc: 'Stream Android logcat and iOS logs in real time, scoped to a single app package (resolved to its PID), and filtered by level and free text. Color-coded by severity so errors jump out.',
        bullets: ['Android logcat + iOS logs', 'Filter by package / level / text', 'Color-coded severity'],
      },
      database: {
        name: 'App database',
        tagline: 'See what your app persisted on device.',
        desc: 'Open local Android Room and iOS app databases from a connected device. Browse tables, inspect rows, and run SQL to check what the app saved.',
        bullets: ['Android Room & iOS stores', 'Browse tables and rows', 'Run SQL on device data'],
      },
      sql: {
        name: 'SQL',
        tagline: 'Query your other databases in Frigg.',
        desc: 'Connect to MySQL, MariaDB, PostgreSQL, or SQLite databases. Browse and edit tables, run queries with schema-aware autocomplete, and keep saved credentials encrypted at rest.',
        bullets: ['MySQL · MariaDB · PostgreSQL · SQLite', 'Browse, edit & query', 'Encrypted saved credentials'],
      },
      frida: {
        name: 'Frida',
        tagline: 'Instrument Android apps at runtime.',
        desc: 'Install and run frida-server on a rooted Android emulator, attach to an app or spawn it, and stream script output in Frigg. Built-in examples and rooted AVD controls help you get started.',
        bullets: ['Attach or spawn an app', 'Built-in scripts · live output', 'Manage rooted Android emulators'],
      },
      devices: {
        name: 'Devices',
        tagline: 'Connect Android and iOS devices quickly.',
        desc: 'Set the proxy and install the Frigg CA on Android emulators and iOS simulators automatically. Physical phones connect through a QR setup page with manual proxy and certificate steps.',
        bullets: ['One-click emulator / simulator setup', 'Proxy + CA status', 'QR setup for physical phones'],
      },
      mcp: {
        name: 'MCP & Claude',
        tagline: 'Let an agent inspect and operate Frigg.',
        desc: 'The MCP server and Claude Code plugin expose Frigg traffic, mocks, API requests, devices, and automation workflows. Ask an agent to investigate a failed call and create a mock from the captured exchange.',
        bullets: ['MCP server · 51 tools', 'Claude Code plugin', 'Inspect traffic & create mocks'],
      },
    } satisfies Record<ToolId, { name: string; tagline: string; desc: string; bullets: string[] }>,
  },
  previews: {
    logcat: { title: 'logcat' },
    api: { title: 'API client', env: 'env' },
    mocks: { title: 'mocks', hint: 'Higher priority wins · upstream never hit' },
    breakpoints: { paused: 'Paused', respond: 'Respond', continue: 'Continue', abort: 'Abort' },
    database: { title: 'app database', rows: '3 rows · 1.2 ms' },
    sql: { title: 'SQL workspace', schema: 'SCHEMA', engines: 'MySQL · MariaDB · PostgreSQL · SQLite', rows: '3 rows returned' },
    frida: { title: 'Frida', rooted: 'rooted', server: 'server running', target: 'TARGET APP', run: 'Run script', output: 'LIVE OUTPUT', attached: 'script attached to app', waiting: 'waiting for hook…' },
    devices: {
      title: 'devices',
      setup: 'Set up',
      intercepting: 'Intercepting',
      caOk: 'proxy set · CA trusted',
      notSet: 'connected · not intercepting',
      hint: 'adb · simctl · networksetup',
    },
    mcp: {
      title: 'claude code',
      ask: 'Payments are failing — mock the charge endpoint so I can test the happy path.',
      reply: 'Found a 500 on /charges and added a mock returning 200. Retry the flow.',
    },
  },
  how: {
    eyebrow: 'How it works',
    title: 'From app behavior to a verified fix.',
    subtitle:
      'Connect a device, inspect its live traffic and state, then change a response and retry the flow in the same workspace.',
    connect: 'Connect the app',
    connectSub: 'Android · iOS · emulator · phone',
    inspect: 'Inspect & intervene',
    inspectSub: 'Traffic · API · mocks · breakpoints',
    verify: 'Verify the change',
    verifySub: 'Logs · app data · retry',
  },
  download: {
    eyebrow: 'Get Frigg',
    title: 'Download the desktop app.',
    subtitle: 'Boots the proxy and UI in-process — no terminal needed.',
    apple: 'Apple Silicon',
    intel: 'Intel',
    universal: 'macOS',
    version: 'Version',
    size: 'Size',
    loading: 'Loading latest release…',
    failed: 'Couldn’t reach GitHub. Open the releases page',
    releasesPage: 'All releases',
    gatekeeperTitle: 'First launch on macOS',
    gatekeeper:
      'The build is unsigned, so Gatekeeper blocks it the first time. Right-click the app → Open, or run:',
    sourceTitle: 'Prefer to run from source?',
    source: 'Clone the repo, then:',
    otherOs: 'Windows & Linux: build from source on the matching OS — see the README.',
  },
  footer: {
    tagline: 'Debug mobile apps from network to device.',
    madeWith: 'Open source under the project license.',
    docs: 'Docs',
    readme: 'README',
    design: 'Architecture',
    repo: 'Repository',
  },
};

const pt: Dict = {
  nav: { tools: 'Ferramentas', how: 'Como funciona', download: 'Download', github: 'GitHub' },
  hero: {
    eyebrow: 'Kit de desenvolvimento mobile',
    title: 'Depure apps mobile da rede ao device.',
    subtitle:
      'Inspecione tráfego ao vivo, rode requests de API, crie mocks ou pause chamadas, acompanhe logs, consulte dados do app e instrumente emuladores Android com root — tudo num workspace desktop para Android e iOS. Grátis e open source.',
    download: 'Baixar para Mac',
    downloadGeneric: 'Baixar',
    viewGithub: 'Ver no GitHub',
    freeNote: 'Grátis & open source · macOS · Windows & Linux via código',
    cycleHint: 'Rede, device e runtime — clique numa aba',
  },
  stream: { label: 'Tráfego ao vivo' },
  tools: {
    eyebrow: 'O toolkit',
    title: 'Um toolkit para todo o ciclo de debugging.',
    subtitle:
      'Saia de um request com falha para os logs ou dados por trás dele e teste uma mudança sem sair do Frigg.',
    groups: {
      network: {
        title: 'Debugging de rede',
        desc: 'Veja o que o app envia, controle a resposta da API e repita requests durante a investigação.',
      },
      device: {
        title: 'Diagnóstico de devices',
        desc: 'Conecte Android e iOS para inspecionar logs e os dados que o app salvou no aparelho.',
      },
      advanced: {
        title: 'Ferramentas avançadas',
        desc: 'Conecte bancos externos, instrumente emuladores Android com root ou deixe um agente operar o Frigg.',
      },
    },
    items: {
      traffic: {
        name: 'Tráfego',
        tagline: 'Veja cada requisição, ao vivo.',
        desc: 'Um proxy que intercepta TLS joga na tela toda requisição que seu app faz, na hora. Filtre por host, path e device, inspecione headers e body, e transforme qualquer troca real num mock com um clique.',
        bullets: ['Feed de requests ao vivo', 'Filtro por host / path / device', 'Um clique → mock'],
      },
      api: {
        name: 'API client',
        tagline: 'Um Postman que mora ao lado do tráfego.',
        desc: 'Workspaces, pastas aninhadas, environments e {{variáveis}} — destacadas e autocompletadas em tudo. Abra requests em abas, colorize o JSON e rode scripts de pre-request e teste numa API pm em sandbox.',
        bullets: ['Environments & {{variáveis}}', 'Abas · scripts · pm.test', 'Semear vars entre envs'],
      },
      breakpoints: {
        name: 'Breakpoints',
        tagline: 'Pause um request em trânsito e reescreva.',
        desc: 'Pegue um request ou response que casa antes de chegar. Edite método, URL, headers, body ou status, e siga, responda com algo custom, ou aborte. Case no lado do request, do response, ou ambos.',
        bullets: ['Pausa request ou response', 'Edite tudo, e siga', 'Resposta custom ou abort'],
      },
      mocks: {
        name: 'Mocks',
        tagline: 'Finja qualquer endpoint sem mexer no backend.',
        desc: 'Regras em pastas aninhadas, casadas por método, globs de host/path, trecho de query e body. Responda com seu status, headers, body e delay. Maior prioridade vence; request mockado nunca vai pro upstream.',
        bullets: ['Glob · query · body', 'Status / headers / delay custom', 'Pastas & prioridade'],
      },
      logcat: {
        name: 'Logcat',
        tagline: 'Logs do device, filtrados pro seu app.',
        desc: 'Stream do logcat do Android e dos logs do iOS em tempo real, no escopo de um pacote (resolvido pro PID), filtrado por nível e texto. Colorido por severidade, então erro salta aos olhos.',
        bullets: ['logcat Android + logs iOS', 'Filtro por pacote / nível / texto', 'Cor por severidade'],
      },
      database: {
        name: 'Banco do app',
        tagline: 'Veja o que seu app salvou no device.',
        desc: 'Abra bancos locais Android Room e iOS a partir de um device conectado. Navegue tabelas, inspecione linhas e rode SQL para conferir o que o app persistiu.',
        bullets: ['Android Room & stores iOS', 'Navegue tabelas e linhas', 'SQL nos dados do device'],
      },
      sql: {
        name: 'SQL',
        tagline: 'Consulte outros bancos pelo Frigg.',
        desc: 'Conecte a bancos MySQL, MariaDB, PostgreSQL ou SQLite. Navegue e edite tabelas, rode queries com autocomplete baseado no schema e salve credenciais criptografadas em repouso.',
        bullets: ['MySQL · MariaDB · PostgreSQL · SQLite', 'Navegue, edite e consulte', 'Credenciais salvas criptografadas'],
      },
      frida: {
        name: 'Frida',
        tagline: 'Instrumente apps Android em runtime.',
        desc: 'Instale e rode frida-server num emulador Android com root, conecte a um app aberto ou inicie o app e acompanhe a saída dos scripts no Frigg. Exemplos integrados e controles de AVD com root ajudam a começar.',
        bullets: ['Attach ou spawn de app', 'Scripts integrados · saída ao vivo', 'Gerencie emuladores Android com root'],
      },
      devices: {
        name: 'Devices',
        tagline: 'Conecte Android e iOS com poucos passos.',
        desc: 'Configure o proxy e instale a CA do Frigg automaticamente em emuladores Android e simuladores iOS. Celulares físicos conectam por uma página com QR e passos manuais de proxy e certificado.',
        bullets: ['Setup de emulador / simulador', 'Status do proxy e da CA', 'Setup por QR em aparelhos físicos'],
      },
      mcp: {
        name: 'MCP & Claude',
        tagline: 'Deixe um agente inspecionar e operar o Frigg.',
        desc: 'O servidor MCP e o plugin do Claude Code expõem tráfego, mocks, requests de API, devices e automações. Peça ao agente para investigar uma chamada com falha e criar um mock a partir da troca capturada.',
        bullets: ['Servidor MCP · 51 ferramentas', 'Plugin do Claude Code', 'Inspecione tráfego e crie mocks'],
      },
    },
  },
  previews: {
    logcat: { title: 'logcat' },
    api: { title: 'API client', env: 'env' },
    mocks: { title: 'mocks', hint: 'Maior prioridade vence · upstream nunca é atingido' },
    breakpoints: { paused: 'Pausado', respond: 'Responder', continue: 'Continuar', abort: 'Abortar' },
    database: { title: 'banco do app', rows: '3 linhas · 1.2 ms' },
    sql: { title: 'workspace SQL', schema: 'SCHEMA', engines: 'MySQL · MariaDB · PostgreSQL · SQLite', rows: '3 linhas retornadas' },
    frida: { title: 'Frida', rooted: 'com root', server: 'servidor ativo', target: 'APP ALVO', run: 'Rodar script', output: 'SAÍDA AO VIVO', attached: 'script conectado ao app', waiting: 'aguardando hook…' },
    devices: {
      title: 'devices',
      setup: 'Configurar',
      intercepting: 'Interceptando',
      caOk: 'proxy setado · CA confiável',
      notSet: 'conectado · sem interceptar',
      hint: 'adb · simctl · networksetup',
    },
    mcp: {
      title: 'claude code',
      ask: 'Os pagamentos estão falhando — mocka o endpoint de charge pra eu testar o caminho feliz.',
      reply: 'Achei um 500 em /charges e adicionei um mock retornando 200. Tenta o fluxo de novo.',
    },
  },
  how: {
    eyebrow: 'Como funciona',
    title: 'Do comportamento do app à correção verificada.',
    subtitle:
      'Conecte um device, inspecione o tráfego e o estado do app, altere uma resposta e repita o fluxo no mesmo workspace.',
    connect: 'Conecte o app',
    connectSub: 'Android · iOS · emulador · celular',
    inspect: 'Inspecione e intervenha',
    inspectSub: 'Tráfego · API · mocks · breakpoints',
    verify: 'Verifique a mudança',
    verifySub: 'Logs · dados do app · repetir',
  },
  download: {
    eyebrow: 'Pegar o Frigg',
    title: 'Baixe o app desktop.',
    subtitle: 'Sobe o proxy e a UI no próprio processo — sem terminal.',
    apple: 'Apple Silicon',
    intel: 'Intel',
    universal: 'macOS',
    version: 'Versão',
    size: 'Tamanho',
    loading: 'Carregando última release…',
    failed: 'Não consegui falar com o GitHub. Abra a página de releases',
    releasesPage: 'Todas as releases',
    gatekeeperTitle: 'Primeira abertura no macOS',
    gatekeeper:
      'O build não é assinado, então o Gatekeeper bloqueia na primeira vez. Botão direito no app → Abrir, ou rode:',
    sourceTitle: 'Prefere rodar do código?',
    source: 'Clone o repo, e então:',
    otherOs: 'Windows & Linux: gere o build no SO correspondente — veja o README.',
  },
  footer: {
    tagline: 'Depure apps mobile da rede ao device.',
    madeWith: 'Open source sob a licença do projeto.',
    docs: 'Docs',
    readme: 'README',
    design: 'Arquitetura',
    repo: 'Repositório',
  },
};

const dicts: Record<Lang, Dict> = { en, pt };

function detectLang(): Lang {
  const saved = localStorage.getItem('frigg.lang');
  if (saved === 'en' || saved === 'pt') return saved;
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

const LangContext = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({
  lang: 'en',
  t: en,
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    setLangState(detectLang());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem('frigg.lang', l);
    setLangState(l);
  }, []);

  return (
    <LangContext.Provider value={{ lang, t: dicts[lang], setLang }}>{children}</LangContext.Provider>
  );
}

export function useT() {
  return useContext(LangContext);
}
