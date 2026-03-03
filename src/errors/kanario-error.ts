export class KanarioError<M extends Record<string, unknown> = Record<string, unknown>> extends Error {
  readonly type: string;
  readonly meta: M;

  // {} as M: TS can't prove {} satisfies a generic — safe because all subclass constructors pass real meta
  constructor(type: string, message: string, meta: M = {} as M) {
    super(message);
    this.name = this.constructor.name;
    this.type = type;
    this.meta = meta;
  }

  static is(err: unknown): err is KanarioError {
    return err instanceof KanarioError;
  }
}
