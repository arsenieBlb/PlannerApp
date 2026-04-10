/**
 * AI provider factory. Returns the appropriate provider based on environment.
 * Swap providers by changing AI_PROVIDER env var or via Settings.
 */

import type { AIProvider } from "./types";
import { MockAIProvider } from "./mock";

let _mock: MockAIProvider | null = null;
let _openai: AIProvider | undefined;

export function getAIProvider(providerName?: string): AIProvider {
  const name = providerName ?? process.env.AI_PROVIDER ?? "mock";

  if (name === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      console.warn("[AI] OPENAI_API_KEY not set, falling back to mock provider");
      return getMockProvider();
    }
    if (!_openai) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OpenAIProvider } = require("./openai");
      _openai = new OpenAIProvider() as AIProvider;
    }
    return _openai!;
  }

  return getMockProvider();
}

function getMockProvider(): MockAIProvider {
  if (!_mock) _mock = new MockAIProvider();
  return _mock;
}

export type { AIProvider };
