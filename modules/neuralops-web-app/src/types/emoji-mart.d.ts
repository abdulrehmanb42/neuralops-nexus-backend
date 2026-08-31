declare module "@emoji-mart/data" {
  const data: Record<string, unknown>;
  export default data;
}

declare module "emoji-mart" {
  // v5 Picker is a custom element; constructing it mounts into opts.parent.
  export class Picker {
    constructor(opts: Record<string, unknown>);
  }
}
