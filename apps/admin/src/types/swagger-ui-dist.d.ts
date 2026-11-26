declare module "swagger-ui-dist/swagger-ui-es-bundle.js" {
  interface SwaggerUIOptions {
    domNode: HTMLElement;
    spec?: object;
    url?: string;
    deepLinking?: boolean;
    docExpansion?: "list" | "full" | "none";
    defaultModelsExpandDepth?: number;
    tryItOutEnabled?: boolean;
    displayRequestDuration?: boolean;
    filter?: boolean | string;
    requestInterceptor?: (req: { method?: string; url?: string; headers: Record<string, string>; credentials?: RequestCredentials }) => unknown;
  }
  const SwaggerUI: (options: SwaggerUIOptions) => unknown;
  export default SwaggerUI;
}


