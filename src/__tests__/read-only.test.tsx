import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  AtomicCodeMirrorEditor,
  type AtomicCodeMirrorEditorHandle,
  type AtomicCodeMirrorEditorProps,
} from '../AtomicCodeMirrorEditor';

const hosts: { host: HTMLElement; root: Root }[] = [];

function mount(props: AtomicCodeMirrorEditorProps) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<AtomicCodeMirrorEditor {...props} />);
  });
  hosts.push({ host, root });
  const rerender = (next: AtomicCodeMirrorEditorProps) => {
    act(() => {
      root.render(<AtomicCodeMirrorEditor {...next} />);
    });
  };
  return { host, rerender };
}

afterEach(() => {
  for (const { host, root } of hosts.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  document.querySelectorAll('.cm-atomic-table-menu').forEach((menu) => menu.remove());
  vi.restoreAllMocks();
});

const TABLE = '| A | B |\n| --- | --- |\n| 1 | 2 |';

// jsdom does not implement the computed `isContentEditable` boolean (it
// always returns undefined, confirmed against a bare jsdom instance,
// regardless of what's actually set). It's also asymmetric on the two ways
// the source sets editability: table-widget.ts assigns the `contentEditable`
// IDL property, which jsdom tracks on the property but never reflects to the
// attribute; CodeMirror's own `.cm-content` sets the `contenteditable`
// *attribute*, which jsdom tracks on the attribute but never reflects to the
// property. Checking either covers both call sites (and still agrees with a
// real browser, where the two are always in sync).
const isEditable = (el: HTMLElement | null | undefined) =>
  el?.contentEditable === 'true' || el?.getAttribute('contenteditable') === 'true';

describe('read-only mode', () => {
  it('renders table cells non-editable when read-only', () => {
    const { host } = mount({ markdownSource: TABLE, readOnly: true });
    const sources = host.querySelectorAll<HTMLElement>(
      '.cm-atomic-table-cell-source',
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(isEditable(source)).toBe(false);
    }
  });

  it('keeps table cells editable in the default (editable) mode', () => {
    const { host } = mount({ markdownSource: TABLE });
    const source = host.querySelector<HTMLElement>(
      '.cm-atomic-table-cell-source',
    );
    expect(source).not.toBeNull();
    expect(isEditable(source)).toBe(true);
  });

  it('toggles table cell editability in place when the prop flips', () => {
    const { host, rerender } = mount({ markdownSource: TABLE, readOnly: false });
    expect(
      isEditable(host.querySelector<HTMLElement>('.cm-atomic-table-cell-source')),
    ).toBe(true);

    rerender({ markdownSource: TABLE, readOnly: true });
    const cells = host.querySelectorAll<HTMLElement>(
      '.cm-atomic-table-cell-source',
    );
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(isEditable(cell)).toBe(false);

    // ...and back.
    rerender({ markdownSource: TABLE, readOnly: false });
    expect(
      isEditable(host.querySelector<HTMLElement>('.cm-atomic-table-cell-source')),
    ).toBe(true);
  });

  it('toggles read-only through the imperative handle', () => {
    const handleRef = createRef<AtomicCodeMirrorEditorHandle | null>() as {
      current: AtomicCodeMirrorEditorHandle | null;
    };
    const { host } = mount({ markdownSource: TABLE, editorHandleRef: handleRef });
    const content = host.querySelector<HTMLElement>('.cm-content');
    expect(isEditable(content)).toBe(true);
    expect(
      isEditable(host.querySelector<HTMLElement>('.cm-atomic-table-cell-source')),
    ).toBe(true);

    act(() => handleRef.current?.setReadOnly(true));
    expect(isEditable(content)).toBe(false);
    expect(host.querySelector('.cm-editor')?.classList).toContain(
      'cm-atomic-readonly',
    );
    for (const cell of host.querySelectorAll<HTMLElement>(
      '.cm-atomic-table-cell-source',
    )) {
      expect(isEditable(cell)).toBe(false);
    }

    act(() => handleRef.current?.setReadOnly(false));
    expect(isEditable(content)).toBe(true);
    expect(host.querySelector('.cm-editor')?.classList).not.toContain(
      'cm-atomic-readonly',
    );
  });

  it('preserves an open search panel while toggling read-only', () => {
    const handleRef = createRef<AtomicCodeMirrorEditorHandle | null>() as {
      current: AtomicCodeMirrorEditorHandle | null;
    };
    mount({ markdownSource: 'find the needle', editorHandleRef: handleRef });

    act(() => handleRef.current?.openSearch('needle'));
    expect(handleRef.current?.isSearchOpen()).toBe(true);

    act(() => handleRef.current?.setReadOnly(true));
    expect(handleRef.current?.isSearchOpen()).toBe(true);
  });

  it('opens a link when its text (not just the icon) is clicked in read-only', () => {
    const onLinkClick = vi.fn();
    const { host } = mount({
      markdownSource: 'See [the docs](https://example.com/docs).',
      readOnly: true,
      onLinkClick,
    });

    const link = host.querySelector<HTMLElement>('.cm-atomic-link');
    expect(link).not.toBeNull();
    act(() => {
      link?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(onLinkClick).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('uses window.open when no link callback is supplied', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { host } = mount({
      markdownSource: 'See [the docs](https://example.com/docs).',
      readOnly: true,
    });

    act(() => {
      host.querySelector<HTMLElement>('.cm-atomic-link')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    expect(open).toHaveBeenCalledWith(
      'https://example.com/docs',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('opens a table-cell link from its text (not just the icon) in read-only', () => {
    const onLinkClick = vi.fn();
    const { host } = mount({
      markdownSource:
        '| Site | Note |\n| --- | --- |\n| [docs](https://example.com/docs) | ok |',
      readOnly: true,
      onLinkClick,
    });

    const wrap = host.querySelector<HTMLElement>('.cm-atomic-link-wrap');
    expect(wrap).not.toBeNull();
    expect(wrap?.dataset.url).toBe('https://example.com/docs');
    // Click the link text, not the trailing icon.
    const textTarget =
      wrap?.querySelector<HTMLElement>(':not(.cm-atomic-link-icon)') ?? wrap;
    act(() => {
      textTarget?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(onLinkClick).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('keeps task checkboxes toggleable in read-only', () => {
    const onMarkdownChange = vi.fn();
    const { host } = mount({
      markdownSource: '- [ ] buy milk',
      readOnly: true,
      onMarkdownChange,
    });

    const checkbox = host.querySelector<HTMLInputElement>(
      'input.cm-atomic-task-checkbox',
    );
    expect(checkbox).not.toBeNull();
    act(() => {
      checkbox?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(onMarkdownChange).toHaveBeenCalledWith('- [x] buy milk');
  });

  it('blocks a stale table menu action after switching to read-only', () => {
    const onMarkdownChange = vi.fn();
    const handleRef = createRef<AtomicCodeMirrorEditorHandle | null>() as {
      current: AtomicCodeMirrorEditorHandle | null;
    };
    const { host, rerender } = mount({
      markdownSource: TABLE,
      onMarkdownChange,
      editorHandleRef: handleRef,
    });

    act(() => {
      host.querySelector<HTMLElement>('tbody td')?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 10,
          clientY: 10,
        }),
      );
    });
    const menuAction = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cm-atomic-table-menu-item'),
    ).find((button) => button.textContent === 'Insert row above');
    expect(menuAction).toBeDefined();

    rerender({
      markdownSource: TABLE,
      readOnly: true,
      onMarkdownChange,
      editorHandleRef: handleRef,
    });
    act(() => menuAction?.click());

    expect(handleRef.current?.getMarkdown()).toBe(TABLE);
    expect(onMarkdownChange).not.toHaveBeenCalled();
  });
});
