declare module 'wait-on' {
  interface WaitOnOptions {
    resources: string[];
    timeout?: number;
    tcpTimeout?: number;
    interval?: number;
  }
  export default function waitOn(options: WaitOnOptions): Promise<void>;
}
