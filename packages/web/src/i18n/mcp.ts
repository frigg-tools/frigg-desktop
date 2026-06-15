import type { Bundle } from './index';

export const mcp: Bundle = {
  en: {
    title: 'MCP server',
    intro:
      'Frigg ships an MCP (Model Context Protocol) server so AI assistants like Claude can read and control Frigg directly — inspect traffic, manage mocks, list devices, and build & run API Client requests for you.',
    capabilitiesTitle: 'What an assistant can do',
    'cap.traffic': 'Read and clear intercepted traffic',
    'cap.mocks': 'List, create and delete mock rules and folders',
    'cap.devices': 'List connected Android/iOS devices and simulators',
    'cap.client':
      'Create workspaces, collections, requests and environments, set variables, and run requests',
    requirement: 'Frigg must be running for the MCP server to reach it (it bridges to this app on',
    'toolsCount': '{count} tools',
    unavailable:
      'The bundled MCP entry could not be located. Run Frigg from the repo (npm start) to use the MCP server.',
    'claudeCode.title': 'Claude Code',
    'claudeCode.desc': 'Install with one click, or copy the command to run in your terminal.',
    'claudeCode.install': 'Install for Claude Code',
    'claudeCode.installing': 'Installing…',
    'claudeCode.command': 'Or run this command:',
    'manual.title': 'Claude Desktop, Cursor, Windsurf & others',
    'manual.desc': 'Add this entry to the client’s MCP config (mcpServers), then restart it.',
    'manual.paths': 'Common config locations:',
    'path.claudeDesktop': 'Claude Desktop',
    'path.cursor': 'Cursor',
    'path.windsurf': 'Windsurf',
    loading: 'Loading MCP details…',
  },
  pt: {
    title: 'Servidor MCP',
    intro:
      'O Frigg vem com um servidor MCP (Model Context Protocol) para que IAs como o Claude leiam e controlem o Frigg direto — inspecionar tráfego, gerenciar mocks, listar devices e montar & rodar requests do API Client por você.',
    capabilitiesTitle: 'O que uma IA consegue fazer',
    'cap.traffic': 'Ler e limpar o tráfego interceptado',
    'cap.mocks': 'Listar, criar e excluir regras e pastas de mock',
    'cap.devices': 'Listar dispositivos Android/iOS e simuladores conectados',
    'cap.client':
      'Criar workspaces, coleções, requests e ambientes, definir variáveis e rodar requests',
    requirement: 'O Frigg precisa estar rodando para o MCP alcançá-lo (ele faz ponte com este app em',
    'toolsCount': '{count} ferramentas',
    unavailable:
      'Não foi possível localizar o MCP empacotado. Rode o Frigg pelo repositório (npm start) para usar o servidor MCP.',
    'claudeCode.title': 'Claude Code',
    'claudeCode.desc': 'Instale com um clique, ou copie o comando para rodar no terminal.',
    'claudeCode.install': 'Instalar no Claude Code',
    'claudeCode.installing': 'Instalando…',
    'claudeCode.command': 'Ou rode este comando:',
    'manual.title': 'Claude Desktop, Cursor, Windsurf e outros',
    'manual.desc': 'Adicione esta entrada na config MCP do cliente (mcpServers) e reinicie-o.',
    'manual.paths': 'Locais comuns da config:',
    'path.claudeDesktop': 'Claude Desktop',
    'path.cursor': 'Cursor',
    'path.windsurf': 'Windsurf',
    loading: 'Carregando detalhes do MCP…',
  },
};
