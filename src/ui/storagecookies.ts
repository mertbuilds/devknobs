import {
  addCookie,
  type Cookie,
  deleteCookie,
  filterCookies,
  HTTP_ONLY_NOTE,
  readCookies,
  sameCookies,
  setCookie,
} from "../storage/cookies";
import { preview, relative, sizeLabel } from "../storage/format";
import { parseEntries } from "../storage/web";
import { el } from "./dom";
import { controls, emptyLine, entryFold, entryHead, type Fold, noteLine, pairs, stack } from "./kit";
import {
  askIn,
  counted,
  editBox,
  type Section,
  type Shell,
  sync,
  rowKeys,
  valueBlock,
} from "./storageparts";

/**
 * The cookies the page can read, in the storage view: a row a cookie, its
 * name and its value each on a column under the table's head, which folds
 * out to what the browser tells of it. The line about HttpOnly always ends
 * the list, so a cookie that is missing here is no puzzle.
 */

/** Where two cookies of a name are told apart: by their path and domain. */
function idOf(cookie: Cookie): string {
  return `${cookie.name}\n${cookie.path ?? ""}\n${cookie.domain ?? ""}`;
}

/** What a cookie's fold lists of it: only what the browser told. */
export function cookieFields(cookie: Cookie, now: number): [string, string][] {
  const fields: [string, string][] = [["name", cookie.name === "" ? "(none)" : cookie.name]];
  if (cookie.domain !== null) fields.push(["domain", cookie.domain]);
  else if (cookie.placed) fields.push(["domain", "this host only"]);
  if (cookie.path !== null) fields.push(["path", cookie.path]);
  if (cookie.expires !== null) {
    fields.push(["expires", `${new Date(cookie.expires).toISOString()}, ${relative(cookie.expires, now)}`]);
  } else if (cookie.placed) fields.push(["expires", "with the session"]);
  fields.push(["size", sizeLabel(cookie.size)]);
  if (cookie.secure !== null) fields.push(["secure", cookie.secure ? "yes" : "no"]);
  if (cookie.sameSite !== null) fields.push(["sameSite", cookie.sameSite]);
  return fields;
}

interface RowView {
  cookie: Cookie;
  fold: Fold;
  remove(): void;
}

export function cookieSection(shell: Shell): Section {
  const { site } = shell;
  const node = el("div", "st-list");
  const adding = el("div", "st-list");
  const head = entryHead({ name: "name", value: "value" });
  const list = el("div", "st-list");
  const foot = el("div", "st-list");
  // A page cannot tell which cookies are HttpOnly: it is said once, where the list ends.
  node.append(adding, head, list, foot, noteLine(HTTP_ONLY_NOTE));

  let cookies: Cookie[] = [];
  let error: string | null = null;
  let read = false;
  const open = new Set<string>();
  let views = new Map<string, RowView>();
  let editing = 0;
  /** Counts the reads, so one that comes back late draws nothing over a newer one. */
  let asked = 0;

  function draw(): void {
    const matching = filterCookies(cookies, shell.query());
    const next = new Map<string, RowView>();
    const nodes = matching.map((cookie) => {
      const id = idOf(cookie);
      const kept = views.get(id);
      const view = kept && sameCookies([kept.cookie], [cookie]) ? kept : build(cookie, id);
      next.set(id, view);
      return view.fold.node;
    });
    views = next;
    head.hidden = nodes.length === 0;
    sync(list, nodes);
    if (error !== null) foot.replaceChildren(noteLine(error));
    else if (matching.length === 0) {
      foot.replaceChildren(
        emptyLine(shell.query().trim() === "" ? "no cookies a page can read" : "nothing matches"),
      );
    } else foot.replaceChildren();
    shell.counted();
  }

  async function refresh(): Promise<void> {
    if (editing > 0) return;
    const mine = ++asked;
    const now = await readCookies(site);
    if (mine !== asked || editing > 0) return;
    if (read && now.error === error && sameCookies(now.cookies, cookies)) return;
    read = true;
    cookies = now.cookies;
    error = now.error;
    draw();
  }

  function closed(saved: boolean): void {
    editing--;
    if (saved) shell.touched();
    else void refresh();
  }

  function build(cookie: Cookie, id: string): RowView {
    const title = cookie.name === "" ? "(no name)" : cookie.name;
    const fold = entryFold({
      name: title,
      value: preview(cookie.value),
      end: sizeLabel(cookie.size),
      open: open.has(id),
      onToggle(out) {
        if (out) {
          open.add(id);
          fill();
        } else {
          open.delete(id);
          closeEdit?.();
        }
      },
    });

    /** Closes the row's text box, while it is open: a row folded away keeps none. */
    let closeEdit: (() => void) | null = null;

    function fill(): void {
      const parts = [pairs(cookieFields(cookie, shell.now())).node, valueBlock(shell, cookie.value, title)];
      if (!cookie.placed) {
        parts.push(noteLine("this browser does not tell a cookie's path, domain or expiry"));
      }
      parts.push(
        controls([
          { label: "copy value", run: () => shell.copy(cookie.value, title) },
          { label: "edit", run: edit },
          { label: "delete", run: drop },
        ]).node,
      );
      fold.body.replaceChildren(stack(parts));
    }

    function edit(): void {
      editing++;
      const box = editBox(shell, {
        label: `value of ${title}`,
        value: cookie.value,
        save(text) {
          if (setCookie(site, cookie, text, shell.now())) return null;
          return `${title} could not be changed: it may sit on another path or domain, or be HttpOnly now`;
        },
        close(saved) {
          closeEdit = null;
          fill();
          closed(saved);
        },
      });
      closeEdit = box.cancel;
      fold.body.replaceChildren(box.node);
      box.area.focus({ preventScroll: true });
    }

    function drop(): void {
      if (!deleteCookie(site, cookie)) {
        shell.say(`${title} could not be deleted: it may sit on another path or domain`);
        fill();
        return;
      }
      open.delete(id);
      shell.touched();
    }

    function remove(): void {
      open.add(id);
      fold.set(true);
      askIn(shell, fold.body, `delete ${title}?`, "delete", drop, fill);
    }

    if (open.has(id)) fill();
    return { cookie, fold, remove };
  }

  rowKeys(list, () => [...views.values()].map((view) => ({ main: view.fold.main, remove: view.remove })));

  /** The box to add in, while it is open. */
  let addBox: HTMLTextAreaElement | null = null;

  function add(): void {
    if (addBox) {
      addBox.focus({ preventScroll: true });
      return;
    }
    editing++;
    const box = editBox(shell, {
      label: "add cookies",
      placeholder: "name=value, a line each, or a json object of names",
      action: "add",
      save(text) {
        const entries = parseEntries(text);
        if (!entries) return "write name=value, a line each, or a json object of names";
        const refused = entries.filter((entry) => !addCookie(site, entry.name, entry.value));
        if (refused.length === 0) return null;
        return `the browser did not take ${refused.map((entry) => entry.name).join(", ")}`;
      },
      close(saved) {
        addBox = null;
        adding.replaceChildren();
        closed(saved);
      },
    });
    addBox = box.area;
    adding.replaceChildren(box.node);
    box.area.focus({ preventScroll: true });
  }

  /** Where the browser says when a cookie changes, it is heard, and no tick is needed. */
  const store = site.cookieStore;
  const onChange = (): void => void refresh();
  let heard = false;
  try {
    store?.addEventListener("change", onChange);
    heard = store !== undefined;
  } catch {
    heard = false;
  }

  return {
    node,
    live: !heard,
    noun: ["cookie", "cookies"],
    refresh,
    filter() {
      if (read) draw();
    },
    count: () => (read ? cookies.length : null),
    controls: () => [{ label: "add", run: add }],
    clear() {
      if (cookies.length === 0) {
        shell.say("no cookies to clear");
        return;
      }
      shell.ask(`clear ${counted(cookies.length, ["cookie", "cookies"])}?`, "clear", () => {
        const left = cookies.filter((cookie) => !deleteCookie(site, cookie)).length;
        if (left > 0) {
          shell.say(
            `${counted(left, ["cookie", "cookies"])} could not be removed: set on another path or domain`,
          );
        }
        shell.touched();
      });
    },
    destroy() {
      asked++;
      try {
        store?.removeEventListener("change", onChange);
      } catch {
        // Nothing was heard.
      }
    },
  };
}
