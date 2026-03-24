/**
 * Copy into your preview app (e.g. dev server on :3001), next to react-grab setup.
 * Registers a plugin that posts rich context to Basalt (:3000) when the user copies/grabs an element.
 *
 * Adjust BASALT_ORIGIN if Basalt runs elsewhere. Message type must match Basalt's IncomingReactGrabProvider.
 *
 * Depends on your installed `react-grab` API (plugin shape may differ by version).
 */
import { registerPlugin } from 'react-grab';

const BASALT_ORIGIN = 'http://localhost:3000';
const MESSAGE_TYPE = 'basalt-react-grab-context';

function truncate(s: string, max: number) {
    if (s.length <= max) return s;
    return s.slice(0, max) + '…';
}

export function registerBasaltReactGrabBridge() {
    if (typeof window === 'undefined') return () => {};

    return registerPlugin({
        id: 'basalt-postmessage',
        setup(api) {
            return {
                onCopySuccess({ element }) {
                    const src = api.getSource?.(element);
                    const filePath = src?.filePath ?? null;
                    const line = src?.lineNumber ?? undefined;
                    const componentName = src?.componentName ?? null;

                    let htmlSnippet: string | undefined;
                    let selector: string | undefined;
                    try {
                        if (element instanceof Element) {
                            htmlSnippet = truncate(element.outerHTML || '', 4000);
                            if (element.id) selector = `#${CSS.escape(element.id)}`;
                            else if (typeof element.className === 'string' && element.className.trim()) {
                                const first = element.className.trim().split(/\s+/)[0];
                                if (first) selector = `${element.tagName.toLowerCase()}.${CSS.escape(first)}`;
                            }
                        }
                    } catch {
                        /* ignore */
                    }

                    const elementDescriptor = [
                        componentName,
                        filePath && line != null ? `${filePath}:${line}` : filePath,
                        htmlSnippet ? truncate(htmlSnippet, 200) : '',
                    ]
                        .filter(Boolean)
                        .join(' ')
                        .trim();

                    window.parent?.postMessage(
                        {
                            type: MESSAGE_TYPE,
                            payload: {
                                filePath,
                                componentName,
                                line,
                                column: undefined,
                                selector,
                                stackString: undefined,
                                elementDescriptor: elementDescriptor || undefined,
                                htmlSnippet,
                            },
                        },
                        BASALT_ORIGIN
                    );
                },
            };
        },
    });
}
