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
  | 'devices'
  | 'mcp';

const en = {
  nav: { tools: 'Tools', how: 'How it works', download: 'Download', github: 'GitHub' },
  hero: {
    eyebrow: 'The mobile-app debugging toolkit',
    title: 'Every tool you need to debug a mobile app.',
    subtitle:
      'Inspect traffic, mock responses, pause requests at a breakpoint, fire off API calls, stream device logs and browse the on-device database — Android & iOS, in one native app. Free and open source.',
    download: 'Download for Mac',
    downloadGeneric: 'Download',
    viewGithub: 'View on GitHub',
    freeNote: 'Free & open source · macOS · Windows & Linux from source',
    cycleHint: 'One app, every tool — click a tab',
  },
  stream: { label: 'Live traffic' },
  tools: {
    eyebrow: 'The toolkit',
    title: 'Seven tools, one window.',
    subtitle:
      'Each one is built for a real moment in mobile development — seeing what your app sends, faking what the server returns, and reading what the device knows.',
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
        name: 'Database',
        tagline: 'Query the database on the device.',
        desc: "Open the local databases — Android Room, iOS — of the apps installed on a connected device and run SQL against them. Browse tables, inspect rows and check exactly what your app persisted.",
        bullets: ['Android Room & iOS stores', 'Run SQL, browse tables', 'Inspect what the app saved'],
      },
      devices: {
        name: 'Devices',
        tagline: 'Intercept any device in one click.',
        desc: 'Set the proxy and install the Frigg CA on Android emulators and iOS simulators automatically — system cert when adb root is available. Any physical phone connects through a QR setup page.',
        bullets: ['One-click Android / iOS setup', 'Auto proxy + CA install', 'QR page for real devices'],
      },
      mcp: {
        name: 'MCP & Claude',
        tagline: 'Let an agent drive Frigg for you.',
        desc: 'A Model Context Protocol server plus a Claude Code plugin expose traffic, mocks and the API client as tools. Ask an agent to find a failing call and mock it — it reads the traffic and writes the rule.',
        bullets: ['MCP server · 18 tools', 'Claude Code plugin', 'Agents read traffic & write mocks'],
      },
    } satisfies Record<ToolId, { name: string; tagline: string; desc: string; bullets: string[] }>,
  },
  previews: {
    logcat: { title: 'logcat' },
    api: { title: 'API client', env: 'env' },
    mocks: { title: 'mocks', hint: 'Higher priority wins · upstream never hit' },
    breakpoints: { paused: 'Paused', respond: 'Respond', continue: 'Continue', abort: 'Abort' },
    database: { title: 'database', rows: '3 rows · 1.2 ms' },
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
    title: 'A proxy between your app and the internet.',
    subtitle:
      'Frigg runs a TLS-intercepting proxy. Point a device at it once, trust the CA, and every request flows through — visible, mockable, pausable.',
    device: 'Device / emulator',
    deviceSub: 'Android · iOS · any device',
    proxy: 'Frigg proxy',
    proxySub: 'TLS interception · :8888',
    internet: 'Internet',
    internetSub: 'Upstream servers',
    ui: 'Frigg UI · :4848',
    uiSub: 'Live feed · mocks · breakpoints',
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
    tagline: 'The toolkit for debugging mobile apps.',
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
    eyebrow: 'O toolkit pra debugar apps mobile',
    title: 'Todas as ferramentas pra debugar um app mobile.',
    subtitle:
      'Inspecione o tráfego, mocke respostas, pause requests num breakpoint, dispare chamadas de API, faça stream dos logs do device e consulte o banco do app — Android & iOS, num app nativo só. Grátis e open source.',
    download: 'Baixar para Mac',
    downloadGeneric: 'Baixar',
    viewGithub: 'Ver no GitHub',
    freeNote: 'Grátis & open source · macOS · Windows & Linux via código',
    cycleHint: 'Um app, todas as ferramentas — clique numa aba',
  },
  stream: { label: 'Tráfego ao vivo' },
  tools: {
    eyebrow: 'O toolkit',
    title: 'Sete ferramentas, uma janela.',
    subtitle:
      'Cada uma feita pra um momento real do dev mobile — ver o que seu app manda, fingir o que o servidor responde e ler o que o device sabe.',
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
        name: 'Banco de dados',
        tagline: 'Consulte o banco direto no device.',
        desc: 'Abra os bancos locais — Android Room, iOS — dos apps instalados num device conectado e rode SQL neles. Navegue tabelas, inspecione linhas e veja exatamente o que seu app persistiu.',
        bullets: ['Room (Android) & stores iOS', 'Rode SQL, navegue tabelas', 'Veja o que o app salvou'],
      },
      devices: {
        name: 'Devices',
        tagline: 'Intercepte qualquer device num clique.',
        desc: 'Define o proxy e instala a CA do Frigg em emuladores Android e simuladores iOS sozinho — cert de sistema quando tem adb root. Qualquer aparelho físico conecta por uma página de setup com QR.',
        bullets: ['Setup Android / iOS num clique', 'Proxy + CA automáticos', 'Página com QR pra device real'],
      },
      mcp: {
        name: 'MCP & Claude',
        tagline: 'Deixe um agente dirigir o Frigg.',
        desc: 'Um servidor Model Context Protocol e um plugin pro Claude Code expõem tráfego, mocks e o API client como tools. Peça pro agente achar a chamada que falha e mockar — ele lê o tráfego e escreve a regra.',
        bullets: ['Servidor MCP · 18 tools', 'Plugin do Claude Code', 'Agente lê tráfego & escreve mock'],
      },
    },
  },
  previews: {
    logcat: { title: 'logcat' },
    api: { title: 'API client', env: 'env' },
    mocks: { title: 'mocks', hint: 'Maior prioridade vence · upstream nunca é atingido' },
    breakpoints: { paused: 'Pausado', respond: 'Responder', continue: 'Continuar', abort: 'Abortar' },
    database: { title: 'banco de dados', rows: '3 linhas · 1.2 ms' },
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
    title: 'Um proxy entre seu app e a internet.',
    subtitle:
      'O Frigg roda um proxy que intercepta TLS. Aponte o device pra ele uma vez, confie na CA, e todo request passa por ali — visível, mockável, pausável.',
    device: 'Device / emulador',
    deviceSub: 'Android · iOS · qualquer device',
    proxy: 'Proxy Frigg',
    proxySub: 'Interceptação TLS · :8888',
    internet: 'Internet',
    internetSub: 'Servidores upstream',
    ui: 'UI do Frigg · :4848',
    uiSub: 'Feed ao vivo · mocks · breakpoints',
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
    tagline: 'O toolkit pra debugar apps mobile.',
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
