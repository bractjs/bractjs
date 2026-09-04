interface HmrMessage {
    type: string;
    file?: string;
    duration?: number;
    [key: string]: unknown;
}
export declare function createHmrServer(port?: number): {
    broadcast(msg: HmrMessage): void;
    stop(): void;
};
export {};
