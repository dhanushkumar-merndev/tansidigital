declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(location: string);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }

  export interface StatementSync {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): unknown;
  }
}
