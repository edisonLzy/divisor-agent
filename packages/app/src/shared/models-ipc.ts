export interface AvailableModel {
  providerId: string;
  modelId: string;
  modelName: string;
}

export interface AgentModelsIPC {
  // Sets the model for a given session. Returns true on success, false on failure.
  setModel: (model: Pick<AvailableModel, "modelId" | "providerId">) => Promise<boolean>;
  // get all available models to the renderer process
  getAvailableModels: () => Promise<AvailableModel[]>;
}
