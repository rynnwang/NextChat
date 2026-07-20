import { collectModelTable } from "../app/utils/model";
import { DEFAULT_MODELS } from "../app/constant";

describe("collectModelTable", () => {
  test("includes the built-in models keyed by name@providerId", () => {
    const table = collectModelTable(DEFAULT_MODELS);
    const gpt4o = table["gpt-4o@openai"];
    expect(gpt4o).toBeDefined();
    expect(gpt4o.available).toBe(true);
    expect(gpt4o.name).toBe("gpt-4o");
    // displayName defaults to the model name
    expect(gpt4o.displayName).toBe("gpt-4o");
  });

  test("returns one entry per model", () => {
    const table = collectModelTable(DEFAULT_MODELS);
    expect(Object.keys(table)).toHaveLength(DEFAULT_MODELS.length);
  });
});
