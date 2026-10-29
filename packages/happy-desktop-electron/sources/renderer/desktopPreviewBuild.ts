declare const __HAPPY_RENDERER_VERSION__: string;

/**
 * Whether this renderer is a development or preview build. A preview's version
 * is `X.Y.Z-preview.N`, the `RELEASE_VERSION` the release workflows build it
 * with; a development server counts as one too. Stable renderers carry a
 * plain `X.Y.Z`.
 */
export const desktopPreviewBuild: boolean =
    import.meta.env.DEV || __HAPPY_RENDERER_VERSION__.includes("-preview.");
