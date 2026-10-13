const started = Date.now();

function stamp(): string {
  return `+${((Date.now() - started) / 1000).toFixed(1)}s`;
}

export const log = {
  info: (...a: unknown[]) => console.log(stamp(), ...a),
  warn: (...a: unknown[]) => console.warn(stamp(), "WARN", ...a),
  error: (...a: unknown[]) => console.error(stamp(), "ERROR", ...a),
};
