/// <reference types="vite/client" />

declare module '*.css' {
  const content: string;

  export default content;
}

declare module 'three' {
  const Three: unknown;

  export default Three;
}
