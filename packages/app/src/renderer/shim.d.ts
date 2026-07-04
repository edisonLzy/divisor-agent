declare module "*.css" {}

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
