import { describe, expect, it } from "vitest";

import { analyzeJavaScriptSemantics } from "./javascriptSemanticAnalysis.js";

const operations = (source: string) =>
  analyzeJavaScriptSemantics(source).eventOperations.map(
    ({ method, emitterKey, resolution }) => ({
      method,
      emitterKey,
      resolution,
    }),
  );

describe("JavaScript semantic analysis: this-receiver event identity", () => {
  it("does not claim one exact emitter for `this` in unrelated classes (#3360)", () => {
    expect(
      operations(`
        import { EventEmitter } from 'node:events';
        class Producer extends EventEmitter {
          run() { this.on('ready', () => {}); }
        }
        class Unrelated extends EventEmitter {
          run() { this.emit('ready'); }
        }
        new Producer().run();
        new Unrelated().run();
        const stable = new EventEmitter();
        stable.on('ready', () => {});
        stable.emit('ready');
      `),
    ).toEqual([
      { method: "on", emitterKey: "this", resolution: "partial" },
      { method: "emit", emitterKey: "this", resolution: "partial" },
      {
        method: "on",
        emitterKey: expect.stringMatching(/^binding:.*stable$/u),
        resolution: "complete",
      },
      {
        method: "emit",
        emitterKey: expect.stringMatching(/^binding:.*stable$/u),
        resolution: "complete",
      },
    ]);
  });

  it("keeps inherited `this` registrations linked as candidates", () => {
    const [register, dispatch] = operations(`
      import { EventEmitter } from 'node:events';
      class Base extends EventEmitter {
        listen() { this.on('ready', () => {}); }
      }
      class Child extends Base {
        fire() { this.emit('ready'); }
      }
    `);
    expect(register).toEqual({
      method: "on",
      emitterKey: "this",
      resolution: "partial",
    });
    expect(dispatch?.emitterKey).toBe(register?.emitterKey);
  });

  it("still leaves a dynamic event name unresolved on `this`", () => {
    expect(
      operations(`function f(name) { this.emit(name); }`)[0]?.resolution,
    ).toBe("unresolved");
  });
});
