declare module 'mermaid' {
  interface MermaidConfig {
    startOnLoad?: boolean;
    theme?: string;
    securityLevel?: string;
    [key: string]: unknown;
  }

  interface RenderResult {
    svg: string;
    bindFunctions?: (element: Element) => void;
  }

  const mermaid: {
    initialize: (config: MermaidConfig) => void;
    render: (id: string, text: string) => Promise<RenderResult>;
    parse: (text: string) => Promise<boolean>;
  };

  export default mermaid;
}
