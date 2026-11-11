/** A demo action that has no backend yet. Nothing was saved. */
export class DemoUnavailableError extends Error {
  constructor() {
    super("Not available yet in demo mode");
    this.name = "DemoUnavailableError";
  }
}
