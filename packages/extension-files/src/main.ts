import { defineMainExtension } from "@divisor-agent/extension-core/main";

import { FILES_SYSTEM_PROMPT_CONTENT, FILES_SYSTEM_PROMPT_ID } from "./constants";

export default defineMainExtension((ctx) => {
  ctx.systemPrompt.register({
    id: FILES_SYSTEM_PROMPT_ID,
    content: FILES_SYSTEM_PROMPT_CONTENT,
  });
});
