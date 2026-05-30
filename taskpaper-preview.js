/*
 * taskpaper-preview-kit · core.js
 * ───────────────────────────────────────────────────────────────────────────
 * The PORTABLE layer. Pure DOM-in / DOM-out — not a single host API in here.
 * Anything that knows about DEVONthink, OmniFocus, Reminders or a URL scheme
 * lives in a separate file and is INJECTED via the options object.
 *
 * What it does, in order (see run()):
 *   1. synthesizeFrontmatter — turn a leading "key: value" paragraph (or the
 *      page <title> + <meta>) into a <dl class="frontmatter"> banner.
 *   2. unfoldTaskPaperPre   — turn TaskPaper outlines that the renderer dumped
 *      into <pre><code> (because of tab indentation) into real nested <ul>.
 *   3. wrapSections          — wrap each <h2> + its content in <section
 *      class="md-section md-section-SLUG"> so theme CSS can card it.
 *   4. markProjectHeaders    — tag "Foo:" paragraphs that precede a list.
 *   5. pillifyTags           — wrap @na, @due(…), @remind … in styled spans.
 *   6. opts.installActions   — OPTIONAL hook (see actions.js). Core never calls
 *      a URL scheme itself; it just hands the processed DOM to whatever you
 *      injected.
 *
 * Exposes a single global: window.TPK
 * ───────────────────────────────────────────────────────────────────────────
 */
(function () {
  "use strict";

  var TPK = (window.TPK = window.TPK || {});

  TPK.defaults = {
    indentPx: 22,
    baseStyles: true,        // inject minimal pill/section CSS (themeless usable)
    frontmatterBanner: true, // synthesize <dl.frontmatter> banner
    wordCount: true,         // bottom-left live word / character count
    debugMarker: true,       // bottom-right "loaded ✓" confirmation
    adapter: null,           // { findBacklink(root), findId(root) } — host hooks
    installActions: null,    // function(root, opts) from actions.js (optional)
    action: null,            // a recipe object consumed by installActions
  };

  // ── helpers (shared with actions.js / adapters via TPK.util) ───────────────
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slugify(s) {
    return (
      String(s)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .split("-")[0] || "section"
    );
  }

  TPK.util = { escapeHtml: escapeHtml, slugify: slugify };

  // ── Minimal base styles ─────────────────────────────────────────────────────
  // Just enough that pills look like pills and sections breathe, in light and
  // dark — so the kit looks intentional with ZERO extra CSS. Every selector is
  // wrapped in :where() → zero specificity, so any custom CSS you add overrides
  // it effortlessly.
  function injectBaseStyles() {
    if (document.getElementById("tpk-base")) return;
    var css =
      ":where(dl.frontmatter){display:grid;grid-template-columns:auto 1fr;gap:2px 14px;" +
      "margin:0 0 1.2em;padding:.7em 1em;border-radius:8px;background:rgba(127,127,127,.08);" +
      "font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;}" +
      ":where(dl.frontmatter dt){font-weight:600;opacity:.7;}" +
      ":where(dl.frontmatter dd){margin:0;}" +
      ":where(.md-section){margin:0 0 1.1em;}" +
      ":where(p.project){font-weight:600;margin:1em 0 .3em;opacity:.85;}" +
      ":where(.tag){display:inline-flex;align-items:center;gap:.25em;border-radius:999px;" +
      "padding:.05em .55em;font-size:.85em;font-weight:600;line-height:1.45;" +
      "background:rgba(127,127,127,.16);color:inherit;white-space:nowrap;}" +
      ":where(.tag .tag-arg){opacity:.7;font-weight:500;}" +
      ":where(.tag-remind){background:#dbeafe;color:#1d4ed8;}" +
      ":where(.tag-reminded){background:#dcfce7;color:#15803d;}" +
      ":where(.tag-due){background:#fef3c7;color:#b45309;}" +
      ":where(.tag-na){background:#ede9fe;color:#6d28d9;}" +
      ":where(.tag-flagged){background:#fee2e2;color:#b91c1c;}" +
      ":where(.tag-done){background:rgba(127,127,127,.16);color:inherit;text-decoration:line-through;opacity:.6;}" +
      "@media (prefers-color-scheme:dark){" +
      ":where(.tag-remind){background:rgba(59,130,246,.22);color:#93c5fd;}" +
      ":where(.tag-reminded){background:rgba(34,197,94,.20);color:#86efac;}" +
      ":where(.tag-due){background:rgba(245,158,11,.20);color:#fcd34d;}" +
      ":where(.tag-na){background:rgba(139,92,246,.24);color:#c4b5fd;}" +
      ":where(.tag-flagged){background:rgba(239,68,68,.24);color:#fca5a5;}}";
    var style = document.createElement("style");
    style.id = "tpk-base";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Frontmatter synthesis ──────────────────────────────────────────────────
  function makeDl(pairs) {
    var dl = document.createElement("dl");
    dl.className = "frontmatter";
    pairs.forEach(function (kv) {
      var dt = document.createElement("dt");
      dt.textContent = kv[0];
      var dd = document.createElement("dd");
      dd.textContent = kv[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    return dl;
  }

  function synthesizeFrontmatter(root) {
    if (root.querySelector("dl.frontmatter")) return;

    // Strategy 1 — leading <p> of visible "key: value" lines.
    var first = root.firstElementChild;
    if (first && first.tagName === "P") {
      var text = first.innerHTML
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "");
      var lines = text
        .split("\n")
        .map(function (l) { return l.trim(); })
        .filter(Boolean);
      var kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;
      if (lines.length > 0 && lines.every(function (l) { return kv.test(l); })) {
        var pairs = lines.map(function (l) {
          var m = kv.exec(l);
          return [m[1], m[2]];
        });
        first.replaceWith(makeDl(pairs));
        return;
      }
    }

    // Strategy 2 — synthesize from <title> + <meta>. Host-neutral DOM reads;
    // handy in renderers (like DEVONthink) that swallow YAML as metadata.
    var pairs2 = [];
    var title = (document.title || "").trim();
    if (title) pairs2.push(["title", title]);
    var kw = document.querySelector('meta[name="keywords" i]');
    if (kw && kw.content) pairs2.push(["keywords", kw.content]);
    var au = document.querySelector('meta[name="author" i]');
    if (au && au.content) pairs2.push(["author", au.content]);
    if (!pairs2.length) return;
    var dl = makeDl(pairs2);
    if (root.firstElementChild) root.insertBefore(dl, root.firstElementChild);
    else root.appendChild(dl);
  }

  // ── TaskPaper-in-<pre> parser ──────────────────────────────────────────────
  function isLanguageCodeBlock(pre) {
    if ([].slice.call(pre.classList).some(function (c) { return /^language-/.test(c); }))
      return true;
    var code = pre.querySelector("code");
    return !!(code && [].slice.call(code.classList).some(function (c) {
      return /^language-/.test(c);
    }));
  }

  function looksLikeTaskPaper(text) {
    return /(^|\n)[ \t]*-[ \t]+/.test(text);
  }

  function lineIndent(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      if (s[i] === "\t") n++;
      else if (s[i] === " ") n += 0.25; // 4 spaces ≈ 1 tab
      else break;
    }
    return Math.floor(n);
  }

  function parseTaskPaper(text, indentPx) {
    var fragment = document.createDocumentFragment();
    var lines = text.replace(/\r/g, "").split("\n");
    var stack = []; // {indent, ul}

    lines.forEach(function (raw) {
      var line = raw.replace(/[ \t]+$/, "");
      if (!line.trim()) return;

      var indent = lineIndent(line);
      var stripped = line.replace(/^[ \t]+/, "");
      var taskMatch = /^-\s+(.*)$/.exec(stripped);

      if (taskMatch) {
        while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();

        var targetUl;
        if (stack.length && stack[stack.length - 1].indent === indent) {
          targetUl = stack[stack.length - 1].ul;
        } else if (stack.length && stack[stack.length - 1].indent < indent) {
          var parent = stack[stack.length - 1];
          var lastLi = parent.ul.lastElementChild;
          targetUl = document.createElement("ul");
          if (lastLi && lastLi.tagName === "LI") {
            lastLi.appendChild(targetUl);
          } else {
            fragment.appendChild(targetUl);
            if (indent > 0) targetUl.style.marginLeft = indent * indentPx + "px";
          }
          stack.push({ indent: indent, ul: targetUl });
        } else {
          targetUl = document.createElement("ul");
          fragment.appendChild(targetUl);
          if (indent > 0) targetUl.style.marginLeft = indent * indentPx + "px";
          stack.push({ indent: indent, ul: targetUl });
        }

        var li = document.createElement("li");
        li.appendChild(document.createTextNode(taskMatch[1]));
        targetUl.appendChild(li);
      } else if (stripped.endsWith(":")) {
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
        var p = document.createElement("p");
        p.className = "project";
        p.textContent = stripped;
        if (indent > 0) p.style.marginLeft = indent * indentPx + "px";
        fragment.appendChild(p);
      } else {
        var pp = document.createElement("p");
        pp.textContent = stripped;
        if (indent > 0) pp.style.marginLeft = indent * indentPx + "px";
        fragment.appendChild(pp);
      }
    });
    return fragment;
  }

  function unfoldTaskPaperPre(root, indentPx) {
    [].slice.call(root.querySelectorAll("pre")).forEach(function (pre) {
      if (isLanguageCodeBlock(pre)) return;
      var code = pre.querySelector("code");
      var text = (code ? code.textContent : pre.textContent) || "";
      if (!looksLikeTaskPaper(text)) return;
      pre.replaceWith(parseTaskPaper(text, indentPx));
    });
  }

  // ── Section wrapping ────────────────────────────────────────────────────────
  function wrapSections(root) {
    [].slice.call(root.querySelectorAll("h2")).forEach(function (h2) {
      var parent = h2.parentElement;
      if (!parent || parent.classList.contains("md-section")) return;
      var section = document.createElement("section");
      section.className = "md-section md-section-" + slugify(h2.textContent || "");
      parent.insertBefore(section, h2);
      var node = h2;
      while (node && !(node !== h2 && node.tagName === "H2")) {
        var next = node.nextSibling;
        section.appendChild(node);
        node = next;
      }
    });
  }

  // ── Project headers (for non-tab-indented lists) ───────────────────────────
  function markProjectHeaders(root) {
    [].slice.call(root.querySelectorAll("p")).forEach(function (p) {
      if (p.classList.contains("project")) return;
      var txt = (p.textContent || "").trim();
      if (!txt.endsWith(":") || txt.indexOf("\n") !== -1) return;
      var next = p.nextElementSibling;
      if (!next || (next.tagName !== "UL" && next.tagName !== "OL")) return;
      p.classList.add("project");
    });
  }

  // ── TaskPaper @tags ─────────────────────────────────────────────────────────
  var TAG_RE = /@([A-Za-z][\w-]*)(?:\(([^)]*)\))?/g;
  var TAG_RE_FULL = /^@([A-Za-z][\w-]*)(?:\(([^)]*)\))?$/;

  function makeTagSpan(name, arg) {
    var span = document.createElement("span");
    span.className = "tag tag-" + name.toLowerCase();
    span.setAttribute("data-tag", name.toLowerCase());
    if (arg) {
      span.innerHTML =
        '<span class="tag-name">@' + escapeHtml(name) +
        '</span><span class="tag-arg">' + escapeHtml(arg) + "</span>";
    } else {
      span.textContent = "@" + name;
    }
    return span;
  }

  function replaceAutolinkedTags(root) {
    [].slice.call(root.querySelectorAll("a")).forEach(function (a) {
      var m = TAG_RE_FULL.exec((a.textContent || "").trim());
      if (m) a.replaceWith(makeTagSpan(m[1], m[2]));
    });
  }

  function pillifyTags(root) {
    replaceAutolinkedTags(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.parentElement) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.closest("pre, code, .tag"))
          return NodeFilter.FILTER_REJECT;
        return /@[A-Za-z]/.test(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    var targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);

    targets.forEach(function (node) {
      var text = node.nodeValue;
      TAG_RE.lastIndex = 0;
      if (!TAG_RE.test(text)) return;
      TAG_RE.lastIndex = 0;

      var frag = document.createDocumentFragment();
      var last = 0;
      var m;
      while ((m = TAG_RE.exec(text)) !== null) {
        if (m.index > last)
          frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        frag.appendChild(makeTagSpan(m[1], m[2]));
        last = m.index + m[0].length;
      }
      if (last < text.length)
        frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  TPK.makeTagSpan = makeTagSpan; // handy for adapters/actions

  // ── Word / character count ──────────────────────────────────────────────────
  function showWordCount(root) {
    if (!document.body || document.getElementById("tpk-count")) return;
    var clone = root.cloneNode(true);
    ["[data-tpk-action]", "[data-tpk-debug]", "[data-tpk-count]"].forEach(function (sel) {
      [].slice.call(clone.querySelectorAll(sel)).forEach(function (n) { n.remove(); });
    });
    var text = (clone.textContent || "").trim();
    var words = (text.match(/\S+/g) || []).length;
    var chars = text.replace(/\s+/g, "").length;
    var el = document.createElement("div");
    el.id = "tpk-count";
    el.setAttribute("data-tpk-count", "1");
    el.textContent =
      words.toLocaleString() + " words · " + chars.toLocaleString() + " chars";
    el.style.cssText =
      "position:fixed;bottom:12px;left:12px;z-index:99996;" +
      "font:11px/1 ui-monospace,Menlo,monospace;color:rgba(127,127,127,.9);" +
      "background:rgba(127,127,127,.12);padding:5px 9px;border-radius:6px;" +
      "pointer-events:none;-webkit-user-select:none;user-select:none;";
    document.body.appendChild(el);
  }

  // ── Debug marker ────────────────────────────────────────────────────────────
  var didDebug = false;
  function showDebugMarker(root, opts) {
    if (didDebug || !document.body) return;
    didDebug = true;
    var ad = opts.adapter || {};
    var backlink = ad.findBacklink ? ad.findBacklink(root) : null;
    var id = ad.findId ? ad.findId(root) : null;
    var stats = {
      sections: root.querySelectorAll(".md-section").length,
      tags: root.querySelectorAll(".tag").length,
      frontmatter: !!root.querySelector("dl.frontmatter"),
      projects: root.querySelectorAll("p.project").length,
      remind: root.querySelectorAll(".tag-remind").length,
    };
    var ok = stats.tags > 0;
    var d = document.createElement("div");
    d.setAttribute("data-tpk-debug", "1");
    d.innerHTML =
      '<div style="font-weight:600;margin-bottom:2px;">✓ taskpaper-preview-kit</div>' +
      '<div style="opacity:.85;">sections: ' + stats.sections +
      " · tags: " + stats.tags + " · @remind: " + stats.remind +
      " · projects: " + stats.projects +
      " · fm: " + (stats.frontmatter ? "yes" : "no") + "</div>" +
      '<div style="opacity:.7;font-size:10px;margin-top:2px;font-family:ui-monospace,Menlo,monospace;">' +
      "id: " + (id || "—") + " · link: " + (backlink ? "yes" : "—") + "</div>";
    d.style.cssText =
      "position:fixed;bottom:12px;right:12px;background:" + (ok ? "#16a34a" : "#d97706") +
      ";color:#fff;font:11px/1.4 -apple-system,sans-serif;padding:8px 12px;" +
      "border-radius:6px;z-index:99999;opacity:.97;pointer-events:none;" +
      "transition:opacity .6s;box-shadow:0 4px 12px rgba(0,0,0,.18);max-width:340px;";
    document.body.appendChild(d);
    setTimeout(function () { d.style.opacity = "0"; }, 5400);
    setTimeout(function () { d.remove(); }, 6200);
    try { console.log("[taskpaper-preview-kit]", stats); } catch (e) {}
  }

  // ── Pipeline ────────────────────────────────────────────────────────────────
  TPK.run = function (opts) {
    opts = Object.assign({}, TPK.defaults, opts || {});
    var body = document.body;
    if (!body || body.hasAttribute("data-md-processed")) return;

    if (opts.baseStyles) injectBaseStyles();
    if (opts.frontmatterBanner) synthesizeFrontmatter(body);
    unfoldTaskPaperPre(body, opts.indentPx);
    wrapSections(body);
    markProjectHeaders(body);
    pillifyTags(body);
    if (typeof opts.installActions === "function") opts.installActions(body, opts);

    body.setAttribute("data-md-processed", "1");
    if (opts.wordCount) showWordCount(body);
    if (opts.debugMarker) showDebugMarker(body, opts);
  };

  // Run now + on the usual lifecycle events, and re-run when the host swaps the
  // <body> (DEVONthink does this when you switch documents).
  TPK.autorun = function (opts) {
    var go = function () { TPK.run(opts); };
    if (document.body) go();
    document.addEventListener("DOMContentLoaded", go);
    window.addEventListener("load", go);

    var pending = null;
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType === 1 && n.tagName === "BODY" && document.body) {
            document.body.removeAttribute("data-md-processed");
            if (TPK._resetActions) TPK._resetActions();
          }
        }
      }
      if (pending) return;
      pending = setTimeout(function () { pending = null; go(); }, 80);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  };
})();
/*
 * taskpaper-preview-kit · actions.js
 * ───────────────────────────────────────────────────────────────────────────
 * THE SEAM. This is the whole point of the kit: a preview can't write files,
 * but it CAN fire a URL. So every "do something with my @remind tasks" target
 * is just a function that turns tasks into a URL. Swap the recipe, get a
 * different destination — no other code changes.
 *
 * Three shipped recipes, in order of how much you have to install:
 *
 *   TPK.actions.omnifocusPaste()        OmniFocus — DEFAULT.
 *                                        Pastes TaskPaper verbatim, so OmniFocus
 *                                        parses @due / @flagged / nesting itself.
 *                                        The backlink rides along as a note line.
 *   TPK.actions.shortcutsReminder(name)  Apple Reminders via a 1-action Shortcut.
 *                                        Zero paid dependency — every Mac/iOS has
 *                                        Shortcuts. See "Add Reminder.md" for it.
 *   TPK.actions.customScheme(base)       Your own URL handler / CLI (e.g.
 *                                        "milan://reminder/sync"). The handler
 *                                        scans the file and can WRITE BACK —
 *                                        that's how a round-trip @reminded(id)
 *                                        becomes possible. See README "round-trip".
 *
 * Recipe shape:
 *   { mode: "collect" | "per-pill" | "batch-doc",
 *     label: "OmniFocus",
 *     build(ctx): string             // collect / batch-doc: one URL for all
 *     buildOne(task, ctx): string }  // per-pill: one URL per task
 *
 * ctx = { tasks:[{text,due}], count, id, backlink, root }
 * ───────────────────────────────────────────────────────────────────────────
 */
(function () {
  "use strict";
  var TPK = (window.TPK = window.TPK || {});
  TPK.actions = TPK.actions || {};

  // ── Extract the unsynced @remind tasks from the processed DOM ──────────────
  // We rely on core's pill classes: @remind → .tag-remind (and @reminded →
  // .tag-reminded, @done → .tag-done), so .tag-remind already means "unsynced".
  function pendingTasks(root) {
    var seen = [];
    var out = [];
    [].slice.call(root.querySelectorAll(".tag-remind")).forEach(function (pill) {
      var block = pill.closest("li") || pill.closest("p") || pill.parentElement;
      if (!block || seen.indexOf(block) !== -1) return;
      seen.push(block);

      var clone = block.cloneNode(true);
      [].slice.call(clone.querySelectorAll("ul, ol")).forEach(function (n) { n.remove(); });
      var line = (clone.textContent || "").replace(/\s+/g, " ").trim();

      var due = null;
      var dueM = /@(?:due|remind)\(([^)]*)\)/i.exec(line);
      if (dueM) {
        var d = /\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/.exec(dueM[1]);
        if (d) due = d[0].replace(" ", "T");
      }
      // Drop the @remind token itself; keep other TaskPaper tags for OmniFocus.
      var text = line.replace(/@remind(\([^)]*\))?/i, "").replace(/\s+/g, " ").trim();
      out.push({ text: text, due: due });
    });
    return out;
  }

  // ── Recipes ────────────────────────────────────────────────────────────────
  TPK.actions.omnifocusPaste = function (opts) {
    opts = opts || {};
    return {
      mode: "collect",
      label: opts.label || "OmniFocus",
      build: function (ctx) {
        var content = ctx.tasks
          .map(function (t) {
            var line = "- " + t.text;
            // Indented, non-dash line = a note on the task in TaskPaper syntax.
            if (ctx.backlink) line += "\n\t" + ctx.backlink;
            return line;
          })
          .join("\n");
        var url = "omnifocus:///paste?content=" + encodeURIComponent(content);
        if (opts.target) url += "&target=" + encodeURIComponent(opts.target);
        return url;
      },
    };
  };

  TPK.actions.omnifocusAdd = function (opts) {
    opts = opts || {};
    return {
      mode: "per-pill",
      label: opts.label || "OmniFocus",
      buildOne: function (task, ctx) {
        var url = "omnifocus:///add?name=" + encodeURIComponent(task.text);
        if (ctx.backlink) url += "&note=" + encodeURIComponent(ctx.backlink);
        if (task.due) url += "&due=" + encodeURIComponent(task.due);
        if (opts.project) url += "&project=" + encodeURIComponent(opts.project);
        if (opts.autosave) url += "&autosave=true";
        return url;
      },
    };
  };

  TPK.actions.shortcutsReminder = function (name) {
    name = name || "Add Reminder";
    return {
      mode: "collect",
      label: "Reminders",
      build: function (ctx) {
        var body = ctx.tasks.map(function (t) { return t.text; }).join("\n");
        if (ctx.backlink) body += "\n" + ctx.backlink;
        return (
          "shortcuts://run-shortcut?name=" + encodeURIComponent(name) +
          "&input=text&text=" + encodeURIComponent(body)
        );
      },
    };
  };

  // The original "delegate to my own CLI" pattern. The handler gets only a
  // path segment (an id, or "_" to mean "ask the host for the selection"),
  // scans the file itself, and can write @reminded(id) back. One button.
  TPK.actions.customScheme = function (base) {
    return {
      mode: "batch-doc",
      label: "Sync",
      build: function (ctx) {
        var ident = ctx.id || "_";
        return base.replace(/\/+$/, "") + "/" + encodeURIComponent(ident);
      },
    };
  };

  // ── Floating button + clickable pills ──────────────────────────────────────
  var installed = false;
  TPK._resetActions = function () { installed = false; };

  function fire(url, btn) {
    if (btn) {
      var lbl = btn.querySelector("[data-tpk-label]");
      var orig = lbl ? lbl.textContent : null;
      btn.style.background = "#16a34a";
      if (lbl) lbl.textContent = "Sending…";
      setTimeout(function () {
        btn.style.background = "#2563eb";
        if (lbl && orig != null) lbl.textContent = orig;
      }, 1600);
    }
    window.location.href = url;
  }

  function makeButton(label, count, title) {
    var btn = document.createElement("a");
    btn.href = "#";
    btn.setAttribute("data-tpk-action", "1");
    btn.title = title || "";
    btn.innerHTML =
      '<span style="font-size:13px;line-height:1;">📤</span>' +
      '<span data-tpk-label>' + label + "</span>" +
      '<span style="background:rgba(255,255,255,.22);padding:1px 7px;border-radius:999px;' +
      'font-variant-numeric:tabular-nums;font-weight:600;">' + count + "</span>";
    btn.style.cssText =
      "position:fixed;top:12px;right:12px;display:inline-flex;align-items:center;gap:7px;" +
      "background:#2563eb;color:#fff;text-decoration:none;" +
      "font:12px/1 -apple-system,BlinkMacSystemFont,sans-serif;font-weight:500;" +
      "padding:7px 11px 7px 9px;border-radius:6px;z-index:99998;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.18);cursor:pointer;" +
      "transition:background .15s,transform .08s;-webkit-user-select:none;user-select:none;";
    btn.addEventListener("mouseenter", function () { btn.style.background = "#1d4fd8"; });
    btn.addEventListener("mouseleave", function () { btn.style.background = "#2563eb"; });
    return btn;
  }

  // The hook core calls. Reads opts.action (a recipe) and wires the UI.
  TPK.installActions = function (root, opts) {
    if (installed || !document.body) return;
    var recipe = opts.action;
    if (!recipe) return;

    var ad = opts.adapter || {};
    var ctx = {
      tasks: pendingTasks(root),
      id: ad.findId ? ad.findId(root) : null,
      backlink: ad.findBacklink ? ad.findBacklink(root) : null,
      root: root,
    };
    ctx.count = ctx.tasks.length;

    if (recipe.mode === "per-pill") {
      // Make each @remind pill individually actionable.
      var pills = [].slice.call(root.querySelectorAll(".tag-remind"));
      if (!pills.length) return;
      installed = true;
      pills.forEach(function (pill, i) {
        var task = ctx.tasks[i] || { text: (pill.closest("li") || pill).textContent, due: null };
        pill.style.cursor = "pointer";
        pill.title = "→ " + recipe.label;
        pill.addEventListener("click", function (e) {
          e.preventDefault();
          window.location.href = recipe.buildOne(task, ctx);
        });
      });
      return;
    }

    // collect / batch-doc → one floating button.
    var pending =
      recipe.mode === "batch-doc"
        ? root.querySelectorAll(".tag-remind").length
        : ctx.count;
    if (pending === 0) return;
    installed = true;

    var title =
      "Send " + pending + " @remind task" + (pending === 1 ? "" : "s") +
      " → " + recipe.label +
      (ctx.id ? "\nid: " + ctx.id : "") +
      (ctx.backlink ? "\nlink: " + ctx.backlink : "");
    var btn = makeButton(recipe.label, pending, title);
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      fire(recipe.build(ctx), btn);
    });
    document.body.appendChild(btn);
  };
})();
/*
 * taskpaper-preview-kit · adapter-devonthink.js
 * ───────────────────────────────────────────────────────────────────────────
 * The ONLY host-specific file. It provides two hooks the kit asks for:
 *
 *   findBacklink(root) → "x-devonthink-item://<UUID>"  (clickable jump back)
 *   findId(root)       → short hex id embedded in the file (for round-trip)
 *
 * Want to target another host (Obsidian, a static blog, Quarto…)? Write your
 * own ~30-line adapter exposing the same two functions. That's the porting
 * story — the core and the actions stay untouched.
 *
 * Two independent identifiers, either may be present:
 *   uuid — DEVONthink record UUID, harvested from the WebView environment.
 *   id   — a short hex code the user/CLI writes into the file (e.g.
 *          frontmatter `id: 3f7a`). Portable; survives moves & renames.
 * ───────────────────────────────────────────────────────────────────────────
 */
(function () {
  "use strict";
  var TPK = (window.TPK = window.TPK || {});
  TPK.adapters = TPK.adapters || {};

  var UUID_RE = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i;
  var ID_RE = /^[0-9a-f]{4,16}$/i;

  function findUUID() {
    var candidates = [
      window.location && window.location.href,
      (document.querySelector('meta[name="uuid" i]') || {}).content,
      (document.querySelector('meta[name="x-devonthink-uuid" i]') || {}).content,
      (document.querySelector('meta[name="devonthink-uuid" i]') || {}).content,
      (document.querySelector("base[href]") || {}).getAttribute &&
        document.querySelector("base[href]").getAttribute("href"),
      document.referrer,
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (!candidates[i]) continue;
      var m = UUID_RE.exec(candidates[i]);
      if (m) return m[0].toUpperCase();
    }
    return null;
  }

  function findId() {
    // 1. Synthesized frontmatter (<dl.frontmatter><dt>id</dt><dd>…</dd>)
    var dts = document.querySelectorAll("dl.frontmatter dt");
    for (var i = 0; i < dts.length; i++) {
      var key = (dts[i].textContent || "").trim().toLowerCase();
      if (key === "id" || key === "file-id" || key === "fileid") {
        var dd = dts[i].nextElementSibling;
        if (dd && dd.tagName === "DD") {
          var v = (dd.textContent || "").trim();
          if (ID_RE.test(v)) return v.toLowerCase();
        }
      }
    }
    // 2. <meta name="id"|"file-id"|"fileid" content="…">
    var meta = document.querySelector(
      'meta[name="id" i], meta[name="file-id" i], meta[name="fileid" i]'
    );
    if (meta && ID_RE.test((meta.content || "").trim()))
      return meta.content.trim().toLowerCase();
    return null;
  }

  TPK.adapters.devonthink = {
    findUUID: findUUID,
    findId: function () { return findId(); },
    findBacklink: function () {
      var u = findUUID();
      return u ? "x-devonthink-item://" + u : null;
    },
  };
})();
/*
 * boot — the config you actually edit
 * ───────────────────────────────────────────────────────────────────────────
 * Picks the DEVONthink adapter and a task target, then starts the kit. This is
 * the block to edit: choose your action below.
 * ───────────────────────────────────────────────────────────────────────────
 */
(function () {
  "use strict";
  if (!window.TPK) {
    try { console.error("[taskpaper-preview-kit] core not loaded"); } catch (e) {}
    return;
  }

  TPK.autorun({
    indentPx: 22,
    frontmatterBanner: true,
    wordCount: true,   // bottom-left word / character count
    debugMarker: true, // flip to false once you've confirmed it loads

    adapter: TPK.adapters.devonthink,
    installActions: TPK.installActions,

    // ── Choose ONE task target ──────────────────────────────────────────────
    action: TPK.actions.omnifocusPaste(), // ← DEFAULT: native TaskPaper into OmniFocus

    // Zero-dependency alternative (every Mac has Shortcuts — see "Add Reminder.md"):
    // action: TPK.actions.shortcutsReminder("Add Reminder"),

    // One task per click instead of one batch paste:
    // action: TPK.actions.omnifocusAdd({ autosave: true }),

    // Delegate to your own CLI/handler so it can WRITE @reminded(id) back:
    // action: TPK.actions.customScheme("milan://reminder/sync"),
  });
})();
