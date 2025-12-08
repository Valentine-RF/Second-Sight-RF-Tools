// Minimal ZeroMQ type declarations for dynamic import usage in gpuBridge.ts
// Covers the subset of Request socket APIs exercised by the bridge.

declare module 'zeromq' {
  interface RequestSocket {
    receiveTimeout?: number;
    sendTimeout?: number;

    connect(address: string): Promise<void>;
    close(): Promise<void>;
    receive(): Promise<Uint8Array[]>;
    send(message: string | ArrayBufferView | string[]): Promise<void>;
  }

  class Request implements RequestSocket {
    receiveTimeout?: number;
    sendTimeout?: number;

    constructor();
    connect(address: string): Promise<void>;
    close(): Promise<void>;
    receive(): Promise<Uint8Array[]>;
    send(message: string | ArrayBufferView | string[]): Promise<void>;
  }

  export { Request };
}
