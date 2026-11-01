import { MIMOCODE_LAYOUT } from "../../constants/mimocode-paths.js";
import { OpencodeMcp } from "./opencode-mcp.js";

/**
 * MCP generator for **MiMo Code**, Xiaomi's fork of OpenCode. MiMo Code keeps
 * OpenCode's `mcp` / `tools` / `instructions` config keys but reads them from
 * `.mimocode/mimocode.jsonc` (project) and `~/.config/mimocode/mimocode.jsonc`
 * (global), so this target reuses {@link OpencodeMcp} with that layout.
 *
 * @see https://github.com/XiaomiMiMo/MiMo-Code/blob/main/packages/cli/src/config/mcp.ts
 */
export class MimocodeMcp extends OpencodeMcp {
  protected static override readonly layout = MIMOCODE_LAYOUT;

  /**
   * MiMo Code's local and remote server schemas add two keys OpenCode does not
   * have:
   * - `sampling` (`"deny"` | `"ask"` | `"allow"`): the policy for the server's
   *   client-side sampling requests (since v0.1.10).
   * - `alwaysDirectTools` (string array): tools exposed as top-level tools
   *   instead of through `mcp_tool_search` / `mcp_tool_use` (on `main`, not yet
   *   released). Releases without it ignore the key, since MiMo Code only
   *   rejects unknown keys at the top level of the config.
   *
   * @see https://github.com/XiaomiMiMo/MiMo-Code/blob/main/packages/cli/src/config/mcp.ts
   * @see https://github.com/XiaomiMiMo/MiMo-Code/blob/v0.1.16/packages/cli/src/config/config.ts
   */
  protected static override readonly extraPassthroughServerFields = [
    "sampling",
    "alwaysDirectTools",
  ];

  /**
   * MiMo Code resolves a relative `instructions` entry against the project
   * directory, not the config directory, so a global rule is written as a
   * `~/`-rooted path (which MiMo Code expands to the home directory).
   *
   * @see https://github.com/XiaomiMiMo/MiMo-Code/blob/main/packages/cli/src/session/instruction.ts
   */
  protected static override toGlobalInstructionEntry({ path }: { path: string }): string {
    return `~/${path}`;
  }
}
