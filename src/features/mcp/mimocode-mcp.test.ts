import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { RULESYNC_RELATIVE_DIR_PATH } from "../../constants/rulesync-paths.js";
import { setupTestDirectory } from "../../test-utils/test-directories.js";
import { writeFileContent } from "../../utils/file.js";
import { MimocodeMcp } from "./mimocode-mcp.js";
import { OpencodeMcp } from "./opencode-mcp.js";
import { Opencodev1Mcp } from "./opencodev1-mcp.js";
import { RulesyncMcp } from "./rulesync-mcp.js";

describe("MimocodeMcp", () => {
  let testDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ testDir, cleanup } = await setupTestDirectory());
    vi.spyOn(process, "cwd").mockReturnValue(testDir);
  });

  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  it("should resolve project and global settable paths to mimocode.json", () => {
    expect(MimocodeMcp.getSettablePaths()).toEqual({
      relativeDirPath: ".mimocode",
      relativeFilePath: "mimocode.json",
    });
    expect(MimocodeMcp.getSettablePaths({ global: true })).toEqual({
      relativeDirPath: join(".config", "mimocode"),
      relativeFilePath: "mimocode.json",
    });
  });

  it("should write servers into .mimocode/mimocode.jsonc in the OpenCode shape", async () => {
    const rulesyncMcp = new RulesyncMcp({
      relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
      relativeFilePath: "mcp.json",
      fileContent: JSON.stringify({
        mcpServers: { "test-server": { command: "node", args: ["server.js"] } },
      }),
    });

    const mcp = await MimocodeMcp.fromRulesyncMcp({ outputRoot: testDir, rulesyncMcp });

    expect(mcp).toBeInstanceOf(MimocodeMcp);
    expect(mcp.getFilePath()).toBe(join(testDir, ".mimocode", "mimocode.jsonc"));
    expect(mcp.getJson().mcp).toEqual({
      "test-server": { type: "local", command: ["node", "server.js"], enabled: true },
    });
  });

  it("should pass sampling and alwaysDirectTools through onto local and remote servers (issue #3701)", async () => {
    const rulesyncMcp = new RulesyncMcp({
      relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
      relativeFilePath: "mcp.json",
      fileContent: JSON.stringify({
        mcpServers: {
          local: {
            command: "node",
            args: ["server.js"],
            sampling: "allow",
            alwaysDirectTools: ["search"],
          },
          remote: { type: "http", url: "https://example.com/mcp", sampling: "deny" },
          // No transport: written as a bare toggle, which has no place for them.
          toggled: { disabled: true, sampling: "allow", alwaysDirectTools: ["search"] },
        },
      }),
    });

    const mcp = await MimocodeMcp.fromRulesyncMcp({ outputRoot: testDir, rulesyncMcp });

    expect(mcp.getJson().mcp).toEqual({
      local: {
        type: "local",
        command: ["node", "server.js"],
        enabled: true,
        sampling: "allow",
        alwaysDirectTools: ["search"],
      },
      remote: { type: "remote", url: "https://example.com/mcp", enabled: true, sampling: "deny" },
      toggled: { enabled: false },
    });
  });

  it("should round-trip sampling and alwaysDirectTools through import and generate", async () => {
    const imported = new MimocodeMcp({
      relativeDirPath: ".mimocode",
      relativeFilePath: "mimocode.json",
      fileContent: JSON.stringify({
        mcp: {
          a: {
            type: "local",
            command: ["a"],
            sampling: "ask",
            alwaysDirectTools: ["x", "y"],
          },
        },
      }),
    }).toRulesyncMcp();

    const mcp = await MimocodeMcp.fromRulesyncMcp({ outputRoot: testDir, rulesyncMcp: imported });

    expect(mcp.getJson().mcp).toEqual({
      a: {
        type: "local",
        command: ["a"],
        enabled: true,
        sampling: "ask",
        alwaysDirectTools: ["x", "y"],
      },
    });
  });

  it("should not write sampling or alwaysDirectTools for OpenCode, whose schema lacks them", async () => {
    const fileContent = JSON.stringify({
      mcpServers: {
        a: { command: "a", sampling: "allow", alwaysDirectTools: ["x"] },
      },
    });
    const rulesyncMcp = () =>
      new RulesyncMcp({
        relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
        relativeFilePath: "mcp.json",
        fileContent,
      });

    const v1 = await Opencodev1Mcp.fromRulesyncMcp({
      outputRoot: testDir,
      rulesyncMcp: rulesyncMcp(),
    });
    const v2 = await OpencodeMcp.fromRulesyncMcp({
      outputRoot: testDir,
      rulesyncMcp: rulesyncMcp(),
    });

    expect(JSON.stringify(v1.getJson())).not.toMatch(/sampling|alwaysDirectTools/);
    expect(JSON.stringify(v2.getJson())).not.toMatch(/sampling|alwaysDirectTools/);
  });

  it("should import a transport-less server into the mimocode block", () => {
    const mcp = new MimocodeMcp({
      relativeDirPath: ".mimocode",
      relativeFilePath: "mimocode.json",
      fileContent: JSON.stringify({ mcp: { toggled: { enabled: false } } }),
      validate: false,
    });

    const imported = JSON.parse(mcp.toRulesyncMcp().getFileContent());
    expect(imported.mcpServers).toEqual({});
    expect(imported.mimocode.mcpServers.toggled).toEqual({ disabled: true });
    expect(imported.opencode).toBeUndefined();
  });

  it("should register project instructions verbatim, relative to the project root", async () => {
    const mcp = await MimocodeMcp.fromInstructions({
      outputRoot: testDir,
      instructions: [".mimocode/memories/overview.md"],
    });
    if (mcp === null) throw new Error("expected a registrar result");

    expect(mcp.getFilePath()).toBe(join(testDir, ".mimocode", "mimocode.jsonc"));
    expect((mcp.getJson() as Record<string, unknown>).instructions).toEqual([
      ".mimocode/memories/overview.md",
    ]);
  });

  it("should register global instructions as home-rooted paths and own their managed entries", async () => {
    await writeFileContent(
      join(testDir, ".config", "mimocode", "mimocode.json"),
      JSON.stringify({
        instructions: ["~/.config/mimocode/memories/stale.md", "docs/user.md"],
      }),
    );

    const mcp = await MimocodeMcp.fromInstructions({
      outputRoot: testDir,
      instructions: [".config/mimocode/memories/style.md"],
      global: true,
    });
    if (mcp === null) throw new Error("expected a registrar result");

    // MiMo Code resolves relative entries against the project directory, so a
    // global rule must be spelled from the home directory to be found.
    expect((mcp.getJson() as Record<string, unknown>).instructions).toEqual([
      "docs/user.md",
      "~/.config/mimocode/memories/style.md",
    ]);
  });

  it("should not read the OpenCode V2 mcp.servers envelope, which MiMo Code does not lower", async () => {
    await writeFileContent(
      join(testDir, ".mimocode", "mimocode.json"),
      JSON.stringify({
        mcp: { servers: { nested: { type: "local", command: ["a"] } } },
      }),
    );

    // MiMo Code reads `servers` as a server, which is neither a transport nor a toggle.
    await expect(MimocodeMcp.fromFile({ outputRoot: testDir })).rejects.toThrow(
      /"path": \[\s*"mcp",\s*"servers"\s*\]/,
    );
  });

  it("should reject a non-boolean disabled, which MiMo Code does not lower either", async () => {
    await writeFileContent(
      join(testDir, ".mimocode", "mimocode.json"),
      JSON.stringify({ mcp: { a: { type: "local", command: ["a"], disabled: "true" } } }),
    );

    await expect(MimocodeMcp.fromFile({ outputRoot: testDir })).rejects.toThrow(
      /"path": \[\s*"mcp",\s*"a"\s*\]/,
    );
  });
});

describe("MimocodeMcp retraction (issue #2562)", () => {
  let testDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ testDir, cleanup } = await setupTestDirectory());
    vi.spyOn(process, "cwd").mockReturnValue(testDir);
  });

  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  it("retracts mcp when no server is left, keeping unrelated keys", async () => {
    await writeFileContent(
      join(testDir, ".mimocode", "mimocode.json"),
      JSON.stringify({ other: 1, mcp: { old: { type: "local", command: ["old"] } } }),
    );
    const mcp = await MimocodeMcp.fromRulesyncMcp({
      outputRoot: testDir,
      rulesyncMcp: new RulesyncMcp({
        relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
        relativeFilePath: "mcp.json",
        fileContent: JSON.stringify({ mcpServers: {} }),
      }),
    });

    expect(mcp.getRelativePathFromCwd()).toBe(join(".mimocode", "mimocode.json"));
    expect(JSON.parse(mcp.getFileContent())).toEqual({ other: 1 });
  });

  it('should reject configShape "v2", which MiMo Code does not read', async () => {
    const rulesyncMcp = new RulesyncMcp({
      relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
      relativeFilePath: "mcp.json",
      fileContent: JSON.stringify({ mcpServers: {} }),
    });

    await expect(
      MimocodeMcp.fromRulesyncMcp({
        outputRoot: testDir,
        rulesyncMcp,
        featureOptions: { configShape: "v2" },
      }),
    ).rejects.toThrow('`configShape: "v2"` is supported only for OpenCode');
  });
});
