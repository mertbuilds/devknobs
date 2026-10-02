/**
 * The default locale of every `Intl` service and `toLocale*` method, the one a
 * browser takes from its language setting when the caller names none. Each
 * member is swapped for an accessor that hands out a proxy of the real one,
 * which puts the knob's tag in when the locales are left out. Whatever the page
 * or another knob assigns meanwhile (geo puts its own `DateTimeFormat` there)
 * only replaces what sits under the proxy, so both apply, and a reset leaves
 * the last assignment in place.
 */

/** A patched member, and where the `locales` argument sits in its calls. */
interface Member {
  owner: object;
  key: string;
  index: number;
}

interface Slot extends Member {
  descriptor: PropertyDescriptor;
  /** The value under the proxy: the original, or whatever was assigned since. */
  inner: unknown;
  get(): unknown;
}

type Callable = (...args: unknown[]) => unknown;

const SERVICES = [
  "Collator",
  "DateTimeFormat",
  "DisplayNames",
  "DurationFormat",
  "ListFormat",
  "NumberFormat",
  "PluralRules",
  "RelativeTimeFormat",
  "Segmenter",
] as const;

let tag: string | null = null;
const slots: Slot[] = [];
const proxies = new WeakMap<object, object>();
const targets = new WeakMap<object, object>();

function members(): Member[] {
  const list: Member[] = SERVICES.map((key) => ({ owner: Intl, key, index: 0 }));
  const methods: [object | undefined, string][] = [
    [Number.prototype, "toLocaleString"],
    [typeof BigInt === "function" ? BigInt.prototype : undefined, "toLocaleString"],
    [Array.prototype, "toLocaleString"],
    [Date.prototype, "toLocaleString"],
    [Date.prototype, "toLocaleDateString"],
    [Date.prototype, "toLocaleTimeString"],
  ];
  for (const [owner, key] of methods) if (owner) list.push({ owner, key, index: 0 });
  list.push({ owner: String.prototype, key: "localeCompare", index: 1 });
  return list;
}

/** The tag in its canonical form, or null when it is not a valid BCP 47 tag. */
export function canonicalTag(lang: string): string | null {
  try {
    return Intl.getCanonicalLocales(lang)[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * The arguments with `locale` put in where the caller left the locales out:
 * missing, `undefined` or an empty list, all of which mean the default.
 */
export function withLocale(args: unknown[], index: number, locale: string | null): unknown[] {
  if (locale === null) return args;
  const given = args[index];
  if (given !== undefined && !(Array.isArray(given) && given.length === 0)) return args;
  const next = args.slice();
  next[index] = locale;
  return next;
}

/**
 * One proxy per real member, so the same member reads as the same function
 * every time. It reads the tag on each call, so a proxy a page kept hold of
 * goes quiet on reset. `instanceof`, statics such as `supportedLocalesOf` and
 * subclassing all reach the real constructor through it.
 */
function proxyFor(inner: Callable, index: number): Callable {
  const known = proxies.get(inner);
  if (known) return known as Callable;
  const proxy = new Proxy(inner, {
    apply: (target, thisArg, args: unknown[]) =>
      Reflect.apply(target, thisArg, withLocale(args, index, tag)),
    construct: (target, args: unknown[], newTarget) =>
      Reflect.construct(target, withLocale(args, index, tag), newTarget),
  });
  proxies.set(inner, proxy);
  targets.set(proxy, inner);
  return proxy;
}

function install(member: Member): void {
  const descriptor = Object.getOwnPropertyDescriptor(member.owner, member.key);
  if (!descriptor || !("value" in descriptor) || !descriptor.configurable) return;
  const slot: Slot = {
    ...member,
    descriptor,
    inner: descriptor.value,
    get(): unknown {
      const inner = slot.inner;
      return typeof inner === "function" ? proxyFor(inner as Callable, member.index) : inner;
    },
  };
  function set(this: unknown, value: unknown): void {
    // An instance that assigns its own copy gets an own property, the way it
    // would over the plain data property this accessor stands in for.
    if (this !== member.owner && typeof this === "object" && this !== null) {
      Object.defineProperty(this, member.key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
      return;
    }
    slot.inner = (typeof value === "function" && targets.get(value)) || value;
  }
  Object.defineProperty(member.owner, member.key, {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: slot.get,
    set,
  });
  slots.push(slot);
}

/** Put the plain property back, holding whatever was assigned last. */
function uninstall(slot: Slot): void {
  const current = Object.getOwnPropertyDescriptor(slot.owner, slot.key);
  // Redefined from outside since: that is the host's now, not devknobs' to undo.
  if (current?.get !== slot.get) return;
  Object.defineProperty(slot.owner, slot.key, { ...slot.descriptor, value: slot.inner });
}

/**
 * Make `lang` the default locale, or hand the default back to the browser with
 * null. A tag `Intl` refuses is not applied, so it cannot make every call throw.
 */
export function setDefaultLocale(lang: string | null): void {
  tag = lang === null ? null : canonicalTag(lang);
  if (tag === null) {
    for (const slot of slots) uninstall(slot);
    slots.length = 0;
    return;
  }
  if (slots.length === 0) for (const member of members()) install(member);
}
