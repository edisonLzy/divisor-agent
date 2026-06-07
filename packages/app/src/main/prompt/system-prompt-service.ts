export interface SystemPromptBuilder {
  buildSystemPrompt(raw: string): string;
}

export class SystemPromptService implements SystemPromptBuilder {
  private builders: SystemPromptBuilder[] = [];

  addBuilder(builder: SystemPromptBuilder) {
    this.builders.push(builder);
  }

  buildSystemPrompt(raw: string): string {
    return this.builders.reduce((prompt, builder) => builder.buildSystemPrompt(prompt), raw);
  }
}
