export type ServerLocale = 'en' | 'pt';

type Dictionary = Record<string, string>;

export function serverLocale(header: string | undefined): ServerLocale {
  return header !== undefined && header.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

const en: Dictionary = {
  'android.proxy.noLanIp':
    "Could not detect this machine's LAN IP, so the device proxy was not configured. Connect both to the same network and set the device Wi-Fi proxy manually to <this-machine-ip>:{proxyPort}.",
  'android.proxy.set': 'Global HTTP proxy set to {proxyValue}.',
  'android.proxy.failed': 'Failed to set the global HTTP proxy: {detail}.',
  'android.proxy.removed': 'Global HTTP proxy removed.',
  'android.proxy.removeFailed': 'Could not remove the global HTTP proxy: {detail}.',
  'android.cert.installFailed': 'CA certificate install failed: {detail}.',
  'android.cert.systemNoRoot':
    'adb root is not available on this device; falling back to manual user certificate install.',
  'android.cert.systemNoDevice':
    'Device did not come back after adb root; falling back to manual user certificate install.',
  'android.cert.systemNoRemount':
    'Could not remount the system partition as writable; falling back to manual user certificate install.',
  'android.cert.systemNoName':
    'Could not compute the Android certificate name ({detail}); falling back to manual user certificate install.',
  'android.cert.systemPushFailed':
    'Could not push the CA certificate to {path}: {detail}; falling back to manual user certificate install.',
  'android.cert.systemChmodFailed':
    'Could not set permissions on {path}: {detail}; falling back to manual user certificate install.',
  'android.cert.systemInstalled': 'Frigg CA installed as a system certificate at {path}.',
  'android.cert.userPushFailed': 'Could not copy the CA certificate to {path}: {detail}.',
  'android.cert.userDownloadHint': 'Download it on the device instead from http://{host}:{apiPort}/cert.crt.',
  'android.cert.userCopied': 'Frigg CA copied to {path}.',
  'android.cert.userSettingsFailed':
    'Could not open the security settings screen automatically; open Settings on the device.',
  'android.cert.userInstallSteps':
    'On the device: Settings → Security → Encryption & credentials → Install a certificate → CA certificate → pick frigg-ca.crt from Downloads.',
  'android.cert.userCoverage': 'That covers the system browser and any app that already trusts user certificates.',
  'android.cert.userAppGuidance':
    'To intercept your OWN app over HTTPS (it targets Android 7+/API 24+), edit its DEBUG build: (1) add res/xml/network_security_config.xml with a <base-config> whose <trust-anchors> include <certificates src="user"/> and <certificates src="system"/>; (2) set android:networkSecurityConfig="@xml/network_security_config" on the <application> tag in AndroidManifest.xml. Copy-paste snippet on the setup page (Devices → Setup page).',
  'ios.cert.installed': 'Frigg CA installed and trusted in the simulator keychain.',
  'ios.cert.failed': 'Certificate install failed: {detail}',
  'ios.cert.failedNoDetail': 'Certificate install failed.',
  'macos.proxy.noService':
    'No active network service found; configure the macOS proxy manually in System Settings.',
  'macos.proxy.commandFailed': 'networksetup {command} failed on {service}: {detail}.',
  'macos.proxy.enabled': 'macOS HTTP and HTTPS proxy on {service} set to 127.0.0.1:{port}.',
  'macos.proxy.disabled': 'macOS HTTP and HTTPS proxy on {service} disabled.',
  'setup.title': 'Frigg — Device Setup',
  'setup.heading': 'setup',
  'setup.tagline': "Route this device's HTTP(S) traffic through Frigg.",
  'setup.qrAlt': 'QR code for this setup page',
  'setup.qrCaption': 'Scan to open this page',
  'setup.proxyLabel': 'Proxy address',
  'setup.lanIpNote':
    "Frigg could not detect a LAN IP on this machine. Replace <span class=\"mono\">this-computer-ip</span> below with this computer's Wi-Fi IP address.",
  'setup.step1.title': 'Point your device at the proxy',
  'setup.step1.intro':
    'Connect the device to the <strong>same Wi-Fi network</strong> as this computer, then set a manual HTTP proxy on that Wi-Fi connection:',
  'setup.step1.server': 'Server / hostname:',
  'setup.step1.port': 'Port:',
  'setup.step1.hint':
    'iOS: Settings → Wi-Fi → your network → Configure Proxy → Manual. Android: long-press your network → Modify network → Advanced → Proxy → Manual.',
  'setup.step2.title': 'Download the Frigg CA certificate',
  'setup.step2.intro':
    'HTTPS inspection needs the Frigg certificate authority on the device. Download it here:',
  'setup.step2.pemHint': 'iOS / generic PEM',
  'setup.step2.crtHint': 'Android',
  'setup.step2.derHint': 'DER binary',
  'setup.step2.hint':
    'Open this page on the device itself (scan the QR code) so the download lands directly on it.',
  'setup.step3.title': 'Trust the certificate',
  'setup.step3.iosStep1': 'Settings → General → VPN &amp; Device Management → install the downloaded profile.',
  'setup.step3.iosStep2':
    'Settings → General → About → Certificate Trust Settings → enable full trust for <strong>Frigg CA</strong>.',
  'setup.step3.androidStep1':
    'Settings → Security → Encryption &amp; credentials → Install a certificate → CA certificate.',
  'setup.step3.androidStep2': 'Pick the downloaded <code>frigg-ca.crt</code>.',
  'setup.step4.title': "Intercepting your own app's HTTPS",
  'setup.step4.intro':
    "If you only use the system browser, you're done. To decrypt HTTPS from <strong>your own Android app</strong>, there's one catch: apps targeting <strong>Android 7+ (API 24)</strong> ignore user-installed CAs by default. You have two options.",
  'setup.step4.optionA.title': 'Option A — system certificate (no app changes)',
  'setup.step4.optionA.body':
    'On a rooted device or most emulators (without Google Play), Frigg installs its CA as a <em>system</em> certificate automatically during "Set up interception". Every app trusts it, no code change needed.',
  'setup.step4.optionB.title': 'Option B — opt your debug build into user CAs',
  'setup.step4.optionB.step1': 'Add <code>res/xml/network_security_config.xml</code>:',
  'setup.step4.optionB.step2':
    'Reference it from the <code>&lt;application&gt;</code> tag in <code>AndroidManifest.xml</code>:',
  'setup.step4.optionB.warn':
    'Ship this in <strong>debug builds only</strong> — never trust user CAs in a release build.',
  'setup.fingerprint': 'CA SHA-256 fingerprint',
};

const pt: Dictionary = {
  'android.proxy.noLanIp':
    'Não foi possível detectar o IP de rede local desta máquina, então o proxy do dispositivo não foi configurado. Conecte ambos à mesma rede e defina o proxy de Wi-Fi do dispositivo manualmente como <ip-desta-maquina>:{proxyPort}.',
  'android.proxy.set': 'Proxy HTTP global definido como {proxyValue}.',
  'android.proxy.failed': 'Falha ao definir o proxy HTTP global: {detail}.',
  'android.proxy.removed': 'Proxy HTTP global removido.',
  'android.proxy.removeFailed': 'Não foi possível remover o proxy HTTP global: {detail}.',
  'android.cert.installFailed': 'Falha ao instalar o certificado CA: {detail}.',
  'android.cert.systemNoRoot':
    'adb root não está disponível neste dispositivo; voltando para a instalação manual do certificado de usuário.',
  'android.cert.systemNoDevice':
    'O dispositivo não voltou após adb root; voltando para a instalação manual do certificado de usuário.',
  'android.cert.systemNoRemount':
    'Não foi possível remontar a partição do sistema como gravável; voltando para a instalação manual do certificado de usuário.',
  'android.cert.systemNoName':
    'Não foi possível calcular o nome do certificado Android ({detail}); voltando para a instalação manual do certificado de usuário.',
  'android.cert.systemPushFailed':
    'Não foi possível enviar o certificado CA para {path}: {detail}; voltando para a instalação manual do certificado de usuário.',
  'android.cert.systemChmodFailed':
    'Não foi possível ajustar as permissões em {path}: {detail}; voltando para a instalação manual do certificado de usuário.',
  'android.cert.systemInstalled': 'Frigg CA instalado como certificado de sistema em {path}.',
  'android.cert.userPushFailed': 'Não foi possível copiar o certificado CA para {path}: {detail}.',
  'android.cert.userDownloadHint': 'Em vez disso, baixe-o no dispositivo em http://{host}:{apiPort}/cert.crt.',
  'android.cert.userCopied': 'Frigg CA copiado para {path}.',
  'android.cert.userSettingsFailed':
    'Não foi possível abrir a tela de configurações de segurança automaticamente; abra as Configurações no dispositivo.',
  'android.cert.userInstallSteps':
    'No dispositivo: Configurações → Segurança → Criptografia e credenciais → Instalar um certificado → Certificado CA → escolha frigg-ca.crt em Downloads.',
  'android.cert.userCoverage':
    'Isso cobre o navegador do sistema e qualquer app que já confie em certificados de usuário.',
  'android.cert.userAppGuidance':
    'Para interceptar o SEU PRÓPRIO app por HTTPS (ele tem como alvo Android 7+/API 24+), edite o build de DEBUG: (1) adicione res/xml/network_security_config.xml com um <base-config> cujo <trust-anchors> inclua <certificates src="user"/> e <certificates src="system"/>; (2) defina android:networkSecurityConfig="@xml/network_security_config" na tag <application> do AndroidManifest.xml. Trecho para copiar e colar na página de configuração (Dispositivos → Página de configuração).',
  'ios.cert.installed': 'Frigg CA instalado e confiável na keychain do simulador.',
  'ios.cert.failed': 'Falha ao instalar o certificado: {detail}',
  'ios.cert.failedNoDetail': 'Falha ao instalar o certificado.',
  'macos.proxy.noService':
    'Nenhum serviço de rede ativo encontrado; configure o proxy do macOS manualmente nas Configurações do Sistema.',
  'macos.proxy.commandFailed': 'networksetup {command} falhou em {service}: {detail}.',
  'macos.proxy.enabled': 'Proxy HTTP e HTTPS do macOS em {service} definido como 127.0.0.1:{port}.',
  'macos.proxy.disabled': 'Proxy HTTP e HTTPS do macOS em {service} desativado.',
  'setup.title': 'Frigg — Configuração do Dispositivo',
  'setup.heading': 'configuração',
  'setup.tagline': 'Roteie o tráfego HTTP(S) deste dispositivo pelo Frigg.',
  'setup.qrAlt': 'QR code desta página de configuração',
  'setup.qrCaption': 'Escaneie para abrir esta página',
  'setup.proxyLabel': 'Endereço do proxy',
  'setup.lanIpNote':
    'O Frigg não conseguiu detectar um IP de rede local nesta máquina. Substitua <span class="mono">this-computer-ip</span> abaixo pelo endereço IP de Wi-Fi deste computador.',
  'setup.step1.title': 'Aponte seu dispositivo para o proxy',
  'setup.step1.intro':
    'Conecte o dispositivo à <strong>mesma rede Wi-Fi</strong> deste computador e defina um proxy HTTP manual nessa conexão Wi-Fi:',
  'setup.step1.server': 'Servidor / host:',
  'setup.step1.port': 'Porta:',
  'setup.step1.hint':
    'iOS: Ajustes → Wi-Fi → sua rede → Configurar Proxy → Manual. Android: pressione e segure sua rede → Modificar rede → Avançado → Proxy → Manual.',
  'setup.step2.title': 'Baixe o certificado CA do Frigg',
  'setup.step2.intro':
    'A inspeção de HTTPS precisa da autoridade certificadora do Frigg no dispositivo. Baixe-a aqui:',
  'setup.step2.pemHint': 'iOS / PEM genérico',
  'setup.step2.crtHint': 'Android',
  'setup.step2.derHint': 'binário DER',
  'setup.step2.hint':
    'Abra esta página no próprio dispositivo (escaneie o QR code) para que o download caia diretamente nele.',
  'setup.step3.title': 'Confie no certificado',
  'setup.step3.iosStep1':
    'Ajustes → Geral → Gerenciamento de VPN e Dispositivos → instale o perfil baixado.',
  'setup.step3.iosStep2':
    'Ajustes → Geral → Sobre → Ajustes de Confiança do Certificado → ative a confiança total para <strong>Frigg CA</strong>.',
  'setup.step3.androidStep1':
    'Configurações → Segurança → Criptografia e credenciais → Instalar um certificado → Certificado CA.',
  'setup.step3.androidStep2': 'Escolha o <code>frigg-ca.crt</code> baixado.',
  'setup.step4.title': 'Interceptando o HTTPS do seu próprio app',
  'setup.step4.intro':
    'Se você usa apenas o navegador do sistema, está pronto. Para descriptografar o HTTPS do <strong>seu próprio app Android</strong>, há um detalhe: apps que têm como alvo o <strong>Android 7+ (API 24)</strong> ignoram CAs instalados pelo usuário por padrão. Você tem duas opções.',
  'setup.step4.optionA.title': 'Opção A — certificado de sistema (sem mudanças no app)',
  'setup.step4.optionA.body':
    'Em um dispositivo com root ou na maioria dos emuladores (sem Google Play), o Frigg instala seu CA como certificado de <em>sistema</em> automaticamente durante "Configurar interceptação". Todos os apps confiam nele, sem mudança de código.',
  'setup.step4.optionB.title': 'Opção B — habilite seu build de debug para CAs de usuário',
  'setup.step4.optionB.step1': 'Adicione <code>res/xml/network_security_config.xml</code>:',
  'setup.step4.optionB.step2':
    'Referencie-o na tag <code>&lt;application&gt;</code> do <code>AndroidManifest.xml</code>:',
  'setup.step4.optionB.warn':
    'Use isto <strong>apenas em builds de debug</strong> — nunca confie em CAs de usuário em um build de release.',
  'setup.fingerprint': 'Impressão digital CA SHA-256',
};

const dictionaries: Record<ServerLocale, Dictionary> = { en, pt };

export function st(locale: ServerLocale, key: string, vars?: Record<string, string | number>): string {
  const template = dictionaries[locale][key] ?? en[key] ?? key;
  if (vars === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
