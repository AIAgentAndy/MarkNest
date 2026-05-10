export type AssetUrlResolver = (src: string) => Promise<string | null>;

export type RenderMarkdownOptions = {
  markdown: string;
  resolveAssetUrl?: AssetUrlResolver;
  trustHtml?: boolean;
};

export type RenderedMarkdown = {
  html: string;
  objectUrls: string[];
};
