/**
 * Upstream's own minimal search panel, moved VERBATIM out of
 * `AtomicCodeMirrorEditor.tsx` so the framework-free extension factory can use
 * it too.
 *
 * It is NOT `@codemirror/search`'s panel and there is no such export — CM6
 * exposes neither a ready-made minimal panel nor its default one, so upstream
 * builds this. An earlier extraction assumed it was a CM export, imported it
 * from `@codemirror/search`, and the whole editor failed to mount.
 *
 * Verbatim: do not edit except to keep it in sync with upstream.
 */
import type { EditorView, Panel } from '@codemirror/view'
import {
  findNext,
  findPrevious,
  getSearchQuery,
  // @ts-expect-error unused — kept because this import list is verbatim from
  // upstream (see file header); removing it would create a permanent diff
  // against `git diff b6ed65f..atomic/main -- src/`.
  searchPanelOpen,
  setSearchQuery,
  SearchQuery,
  closeSearchPanel,
} from '@codemirror/search'

// ---------------------------------------------------------------------
// Search panel
//
// Intentionally minimal: an input, previous / next / close icon
// buttons, and a live match counter. No replace, no case / regex /
// word toggles — reader-first, not editor-first. Keyboard users get
// the same behavior CM6's `searchKeymap` ships with
// (Cmd/Ctrl+G = next, Shift+same = previous, Escape = close).
//
// CM6 doesn't expose a ready-made "minimal" panel, and it doesn't
// expose its default either, so we build our own. Owning the DOM
// also means we can style it to match the rest of the app without
// fighting base CM6 styles.

const SEARCH_ICON_PREV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
const SEARCH_ICON_NEXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const SEARCH_ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

export function defaultSearchPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'cm-search';
  dom.setAttribute('aria-label', 'Find');

  const form = document.createElement('form');
  form.autocomplete = 'off';
  // Submit (Enter) on the input advances to the next match — matches
  // the muscle memory of browser find-on-page.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    findNext(view);
  });

  const initial = getSearchQuery(view.state);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search';
  searchInput.value = initial.search;
  searchInput.className = 'cm-atomic-search-input';
  searchInput.setAttribute('main-field', 'true');
  searchInput.setAttribute('aria-label', 'Search');

  const count = document.createElement('span');
  count.className = 'cm-atomic-search-count';
  count.setAttribute('aria-live', 'polite');

  const prevBtn = makeIconButton(
    SEARCH_ICON_PREV,
    'Previous match',
    () => findPrevious(view),
  );
  const nextBtn = makeIconButton(
    SEARCH_ICON_NEXT,
    'Next match',
    () => findNext(view),
  );
  const closeBtn = makeIconButton(
    SEARCH_ICON_CLOSE,
    'Close',
    () => closeSearchPanel(view),
  );

  // Count the matches in the document for the current query. Walks
  // the doc via SearchQuery's cursor (sparse — not every character
  // is visited), so cost is O(matches) rather than O(doc). Atoms
  // are short enough that even a naïve walk would be fine; the
  // cursor form is what CM6 itself uses.
  const recomputeCount = (query: SearchQuery) => {
    if (!query.search) {
      count.textContent = '';
      return;
    }
    try {
      if (!query.valid) {
        count.textContent = '';
        return;
      }
      let n = 0;
      let capped = false;
      const cursor = query.getCursor(view.state.doc);
      while (!cursor.next().done) {
        n++;
        if (n >= 10000) {
          // Sanity cap for pathological regexes. Show "9999+" rather
          // than a misleadingly-exact count we know is truncated.
          capped = true;
          break;
        }
      }
      count.textContent = capped
        ? '9999+ matches'
        : n === 0
          ? 'No matches'
          : n === 1
            ? '1 match'
            : `${n} matches`;
    } catch {
      // Regex compile failure — leave the counter blank; user will
      // see the input lacks its "valid" state via the container class.
      count.textContent = '';
    }
  };

  const dispatchQuery = () => {
    const query = new SearchQuery({
      search: searchInput.value,
      caseSensitive: initial.caseSensitive,
      regexp: initial.regexp,
      wholeWord: initial.wholeWord,
    });
    view.dispatch({ effects: setSearchQuery.of(query) });
    recomputeCount(query);
  };

  searchInput.addEventListener('input', dispatchQuery);
  recomputeCount(initial);

  form.append(searchInput, count, prevBtn, nextBtn, closeBtn);
  dom.append(form);

  return {
    dom,
    top: true,
    mount: () => {
      searchInput.focus();
      searchInput.select();
    },
    update: (update) => {
      const next = getSearchQuery(update.state);
      const prev = getSearchQuery(update.startState);
      // Sync the visible input if the query changed from outside
      // the panel — e.g. `openSearch("foo")` dispatched while the
      // panel was already open. Without this, the input shows the
      // old term while Next / Previous operate on the new query.
      // Guard on value inequality so we don't fight a user mid-edit
      // (programmatic .value assignment keeps the caret at the end).
      if (next.search !== prev.search && searchInput.value !== next.search) {
        searchInput.value = next.search;
      }
      // Recount on any query change or doc edit so "N matches"
      // stays live.
      if (update.docChanged || next.search !== prev.search) {
        recomputeCount(next);
      }
    },
  };
}

function makeIconButton(
  svg: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cm-atomic-search-btn';
  el.innerHTML = svg;
  el.setAttribute('aria-label', label);
  el.title = label;
  el.addEventListener('click', onClick);
  return el;
}
