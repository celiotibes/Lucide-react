import type { DefinicaoProvedorIA, IdProvedorIA } from "../tipos";
import { provedorAnthropic } from "./anthropic";
import { provedorOpenAI } from "./openai";
import { provedorGemini } from "./gemini";
import { provedorOllama } from "./ollama";

export { provedorAnthropic, provedorOpenAI, provedorGemini, provedorOllama };

/** Registro de provedores disponíveis — é aqui, e só aqui, que um quinto provedor entraria. */
export const PROVEDORES_IA: Record<IdProvedorIA, DefinicaoProvedorIA> = {
  anthropic: provedorAnthropic,
  openai: provedorOpenAI,
  google: provedorGemini,
  ollama: provedorOllama,
};
