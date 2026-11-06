export type LogFields = Record<string, string | number | boolean>;

export type Logger = {
  info(event: string, fields: LogFields): void;
  warn(event: string, fields: LogFields): void;
  error(event: string, fields: LogFields): void;
};
