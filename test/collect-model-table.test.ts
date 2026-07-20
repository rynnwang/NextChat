import { collectModelTable, collectModels } from "../app/utils/model";
import { DEFAULT_MODELS } from "../app/constant";

describe("collectModelTable", () => {
  test("includes the built-in models keyed by name@providerId", () => {
    const table = collectModelTable(DEFAULT_MODELS, "");
    const gpt4o = table["gpt-4o@openai"];
    expect(gpt4o).toBeDefined();
    expect(gpt4o.available).toBe(true);
    expect(gpt4o.name).toBe("gpt-4o");
    // displayName defaults to the model name
    expect(gpt4o.displayName).toBe("gpt-4o");
  });

  test("'-all' marks every model as unavailable", () => {
    const table = collectModelTable(DEFAULT_MODELS, "-all");
    expect(Object.values(table).every((m) => m.available === false)).toBe(true);
  });

  test("disabling a single model leaves the others available", () => {
    const table = collectModelTable(DEFAULT_MODELS, "-gpt-4o@openai");
    expect(table["gpt-4o@openai"].available).toBe(false);
    expect(table["gpt-4.1-mini@openai"].available).toBe(true);
  });

  test("adds a brand-new custom model with an explicit provider", () => {
    const table = collectModelTable(DEFAULT_MODELS, "+my-model@myorg");
    const custom = table["my-model@myorg"];
    expect(custom).toBeDefined();
    expect(custom.available).toBe(true);
    expect(custom.displayName).toBe("my-model");
  });

  test("honours a custom display name via name=displayName syntax", () => {
    const table = collectModelTable(DEFAULT_MODELS, "+my-model@myorg=Shiny");
    expect(table["my-model@myorg"].displayName).toBe("Shiny");
  });
});

describe("collectModels", () => {
  test("returns one entry per row of the model table", () => {
    const table = collectModelTable(DEFAULT_MODELS, "");
    const models = collectModels(DEFAULT_MODELS, "");
    expect(models).toHaveLength(Object.keys(table).length);
  });

  test("contains the built-in gpt-4o model", () => {
    const models = collectModels(DEFAULT_MODELS, "");
    expect(models.some((m) => m.name === "gpt-4o")).toBe(true);
  });
});
