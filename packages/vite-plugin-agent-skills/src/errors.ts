export const pluginName = "vite-plugin-agent-skills";

export function pluginMessage(message: string): string {
  return `[${pluginName}] ${message}`;
}

export function pluginError(message: string, options?: ErrorOptions): Error {
  return new Error(pluginMessage(message), options);
}
