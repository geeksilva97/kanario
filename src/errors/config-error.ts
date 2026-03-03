import { KanarioError } from "./kanario-error.ts";

export type ConfigErrorMeta = {
  vars?: string[];
  model?: string;
};

export class ConfigError extends KanarioError<ConfigErrorMeta> {
  static is(err: unknown): err is ConfigError {
    return err instanceof ConfigError;
  }

  static missingEnvVars(vars: string[]) {
    return new ConfigError(
      "missing_env_vars",
      `Missing environment variables: ${vars.join(", ")}`,
      { vars },
    );
  }

  static unknownModel(model: string) {
    return new ConfigError(
      "unknown_model",
      `Unknown model "${model}". Choose "claude" or "gemini".`,
      { model },
    );
  }
}
