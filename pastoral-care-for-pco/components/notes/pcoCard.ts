import { Node } from '@tiptap/react';

// ─── Planning Center content cards in Notes ──────────────────────────────────
// Cards are inserted as self-contained HTML (inline styles) so they render the
// same on the public note page as in the editor. They always carry their own
// light surface because their inner text colours are dark.

/** Inline styles for the saved PCO card container. */
export const PCO_CARD_STYLE =
  'background:#ffffff;color:#334155;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:16px 0;font-family:inherit;';

/** Container style prefix written by the original (pre-background) card builder. */
const LEGACY_CARD_PREFIX = 'border:1px solid #e2e8f0;border-radius:12px;';

/**
 * Notes saved before PCO cards had their own background store the container as
 * `<div style="border:1px solid #e2e8f0;border-radius:12px;...">` with dark text
 * and no background, which is unreadable on dark surfaces. Give those legacy
 * cards the same light surface (used at render time and when the editor loads).
 */
export const upgradeLegacyPcoCards = (html: string): string =>
  html.replace(
    /<div style="border:1px solid #e2e8f0;border-radius:12px;/g,
    '<div data-pco-card="legacy" style="background:#ffffff;color:#334155;border:1px solid #e2e8f0;border-radius:12px;',
  );

/**
 * Tiptap node that keeps a PCO card intact. Without it, StarterKit drops the
 * unknown <div>s and inline styles, flattening the card into plain paragraphs.
 * The card is an atom: it can be selected, moved and deleted, but not edited inline.
 */
export const PcoCardNode = Node.create({
  name: 'pcoCard',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      // Full outer HTML of the card; not rendered as a DOM attribute.
      html: { default: '', rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-pco-card]',
        getAttrs: el => ({ html: (el as HTMLElement).outerHTML }),
      },
      {
        // Legacy cards saved before `data-pco-card` existed.
        tag: 'div',
        getAttrs: el => {
          const style = (el as HTMLElement).getAttribute('style') || '';
          return style.startsWith(LEGACY_CARD_PREFIX)
            ? { html: upgradeLegacyPcoCards((el as HTMLElement).outerHTML) }
            : false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const template = document.createElement('template');
    template.innerHTML = String(node.attrs.html || '');
    return (template.content.firstElementChild as HTMLElement | null) ?? document.createElement('div');
  },
});
