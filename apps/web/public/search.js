/*
 * The search field's keyboard shortcut (SPEC §49.1 as ADR 0018 rewrote it, §57.2).
 *
 * §49.1 admits a script only for something belonging to the reader's own device that the
 * server cannot do, and names three properties that all have to hold. This meets them:
 *
 *   the page works without it   the field is a `GET` form; every reader can click it, and
 *                               `/search` is still a page with the same form on it
 *   hidden until it works       the `⌘K` badge carries `hidden` in the markup and this
 *                               removes it, after writing which key this device actually has
 *   no network, no content      focus and a text selection, and nothing else — no
 *                               suggestions are fetched and nothing the page says is
 *                               rendered here
 *
 * The badge is the reason this is a script rather than markup: whether a reader presses ⌘ or
 * Ctrl is a fact about their machine, the server cannot know it, and a bar that promises the
 * wrong key to half its readers is worse than one that promises nothing.
 *
 * A file rather than an inline script, because `script-src 'self'` carries no `unsafe-inline`
 * and no nonce.
 */
(function () {
  /*
   * The page's own field wins over the masthead's.
   *
   * On `/search` there are two, and the one somebody means is the big one they are looking
   * at rather than the small one above it — which is also where the results are.
   */
  var field =
    document.querySelector("main [data-search-field]") ||
    document.querySelector("[data-search-field]");
  if (!field) return;

  /*
   * `navigator.platform` is deprecated and is still the only honest answer to this question.
   * The user agent string is the fallback, and both are wrong for somebody using an Apple
   * keyboard on another operating system — who gets a badge naming the other key and a
   * shortcut that accepts either, so nothing breaks.
   */
  var apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

  /* Two of them on `/search`: the badge in the bar and the one in the page's own note. */
  var hints = document.querySelectorAll("[data-search-hint]");
  for (var i = 0; i < hints.length; i++) {
    hints[i].textContent = apple ? "⌘K" : "Ctrl K";
    hints[i].hidden = false;
  }

  /* A shortcut that fires while somebody is typing is a shortcut that eats their text. */
  function typing(element) {
    if (!element) return false;
    var name = element.tagName;
    return (
      name === "INPUT" ||
      name === "TEXTAREA" ||
      name === "SELECT" ||
      element.isContentEditable === true
    );
  }

  document.addEventListener("keydown", function (event) {
    if (event.defaultPrevented) return;

    /* A key press from an IME composition, and a few synthetic events, carry no `key`. */
    var key = event.key || "";
    var combo = (event.metaKey || event.ctrlKey) && !event.altKey && key.toLowerCase() === "k";
    /* `/` is the other half of the convention, and only where it is not a character being typed. */
    var slash = key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !typing(event.target);

    if (combo || slash) {
      /*
       * Below 48rem the masthead's field is `display: none` and a magnifier linking to
       * `/search` is in its place. Focusing a hidden element does nothing, and swallowing the
       * key press to do nothing is worse than leaving it alone — so the shortcut simply is
       * not there at that width, which is also where the badge announcing it is hidden.
       */
      if (field.offsetParent === null) return;

      event.preventDefault();
      field.focus();
      /* Selected rather than appended to: the shortcut means "search for something", and on
         `/search` the field already holds the last query. */
      if (field.select) field.select();
      return;
    }

    /* Escape leaves the field without leaving the page — the browser's own behaviour for a
       `type="search"` input is to clear it, which loses a query somebody is still editing. */
    if (key === "Escape" && document.activeElement === field) {
      event.preventDefault();
      field.blur();
    }
  });
})();
