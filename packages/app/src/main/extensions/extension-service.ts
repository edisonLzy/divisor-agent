import { MainExtensionBridge } from "@divisor-agent/extension-core/main";

import { installedMainExtensions } from "./installed-extensions.js";

export class ExtensionService extends MainExtensionBridge {
  constructor() {
    super(installedMainExtensions);
    this.initialize();
  }
}
