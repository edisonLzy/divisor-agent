import { defineMainExtension } from "@divisor-agent/extension-core/main";

import {
  EXTENSION_ID,
  EXTENSION_NAME,
  FILES_SYSTEM_PROMPT_CONTENT,
  FILES_SYSTEM_PROMPT_ID,
} from "./common/constants";

export default defineMainExtension({
  id: EXTENSION_ID,
  name: EXTENSION_NAME,
  setup(ctx) {
    ctx.systemPrompt.register({
      id: FILES_SYSTEM_PROMPT_ID,
      content: FILES_SYSTEM_PROMPT_CONTENT,
    });
  },
});
