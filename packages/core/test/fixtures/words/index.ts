// Harmless stand-in word lists for the test suite. The real lists are private.
import agenticAi from "./agentic-ai.json" with { type: "json" };
import it from "./it.json" with { type: "json" };
import machineLearning from "./machine-learning.json" with { type: "json" };
import softwareEngineering from "./software-engineering.json" with { type: "json" };

export const words = {
  "agentic-ai": agenticAi,
  "machine-learning": machineLearning,
  "software-engineering": softwareEngineering,
  it,
};
