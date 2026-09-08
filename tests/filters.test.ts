/**
 * Phase 3 — inventory filtering correctness.
 *
 * Every case here runs against the real committed snapshot, not a hand-built
 * fixture, so a normalization regression in script/fetch-data.ts fails these
 * tests too. Expected counts are computed directly from the snapshot JSON with
 * plain `Array.filter`, independently of the filter engine, so the engine
 * cannot "pass" by agreeing with itself.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  parseQuery, serializeQuery, filterCarts, sortCarts, buildVocabulary,
  facetCountsFor, allFacetCounts, describeFilters, clearFilters, withoutFilter,
  emptyState, hasActiveFilters, paginate, MULTI_FIELDS,
  type FilterableCart, type FilterState,
} from "../src/lib/filters.ts";
import { normalizeColorFamily } from "../src/lib/normalize.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(readFileSync(resolve(root, "src/data/snapshot.json"), "utf8"));
const CARTS: FilterableCart[] = snapshot.carts;
const VOCAB = buildVocabulary(CARTS);

/** Parse a query and filter in one step, the way a page render does. */
function query(search: string) {
  const { state, ignored } = parseQuery(search, VOCAB);
  return { state, ignored, results: filterCarts(CARTS, state) };
}

describe("snapshot sanity", () => {
  test("the snapshot has carts and both conditions present", () => {
    assert.ok(CARTS.length > 0, "snapshot must not be empty");
    assert.ok(CARTS.some((cart) => cart.condition === "new"));
    assert.ok(CARTS.some((cart) => cart.condition === "used"));
  });

  test("every cart carries normalized lowercase enums", () => {
    for (const cart of CARTS) {
      assert.ok(["new", "used"].includes(cart.condition), `bad condition: ${cart.condition}`);
      assert.ok(["electric", "gas"].includes(cart.fuel), `bad fuel: ${cart.fuel}`);
      assert.equal(cart.make, cart.make.toLowerCase());
      assert.equal(cart.color, cart.color.toLowerCase());
    }
  });
});

describe("condition filtering", () => {
  test("?condition=new returns only new carts, and the count matches the snapshot", () => {
    const { results } = query("?condition=new");
    const expected = CARTS.filter((cart) => cart.condition === "new");

    assert.ok(results.length > 0, "expected at least one new cart");
    assert.equal(results.length, expected.length);
    assert.equal(results.length, snapshot.summary.new);
    // The decisive assertion: no used cart may appear under ?condition=new.
    assert.equal(results.filter((cart) => cart.condition === "used").length, 0);
    for (const cart of results) assert.equal(cart.condition, "new");
  });

  test("?condition=used returns only used carts, and the count matches the snapshot", () => {
    const { results } = query("?condition=used");
    const expected = CARTS.filter((cart) => cart.condition === "used");

    assert.ok(results.length > 0);
    assert.equal(results.length, expected.length);
    assert.equal(results.length, snapshot.summary.used);
    assert.equal(results.filter((cart) => cart.condition === "new").length, 0);
    for (const cart of results) assert.equal(cart.condition, "used");
  });

  test("new + used together returns the whole catalogue (union, not intersection)", () => {
    const { results } = query("?condition=new&condition=used");
    assert.equal(results.length, CARTS.length);
  });

  test("?condition=Pre-Owned is a synonym for used", () => {
    const { results } = query("?condition=Pre-Owned");
    assert.equal(results.length, snapshot.summary.used);
    for (const cart of results) assert.equal(cart.condition, "used");
  });

  test("legacy ?isNew=true still means condition=new", () => {
    const { results } = query("?isNew=true");
    assert.equal(results.length, snapshot.summary.new);
  });
});

describe("multi-select colour", () => {
  const [first, second] = snapshot.facets.colors.map((facet: { key: string }) => facet.key);

  test("two colours selected returns the union of both and nothing else", () => {
    const { results } = query(`?color=${first}&color=${second}`);
    const expected = CARTS.filter((cart) => cart.color === first || cart.color === second);

    assert.ok(expected.length > 0);
    assert.equal(results.length, expected.length);
    // Nothing else: every result is one of the two colours.
    for (const cart of results) {
      assert.ok([first, second].includes(cart.color), `unexpected colour ${cart.color}`);
    }
    // And the union really is bigger than either part alone.
    const onlyFirst = filterCarts(CARTS, parseQuery(`?color=${first}`, VOCAB).state);
    assert.ok(results.length > onlyFirst.length);
    assert.equal(
      results.length,
      onlyFirst.length + filterCarts(CARTS, parseQuery(`?color=${second}`, VOCAB).state).length,
    );
  });

  test("comma-joined colours are the same query as repeated params", () => {
    const repeated = query(`?color=${first}&color=${second}`).results.map((cart) => cart.id).sort();
    const joined = query(`?color=${first},${second}`).results.map((cart) => cart.id).sort();
    assert.deepEqual(joined, repeated);
  });

  test("an exact colour matches through its family", () => {
    // "matte-black" is an exact DMS colour inside the "black" family.
    const exact = CARTS.find((cart) => cart.colorExact === "matte-black");
    assert.ok(exact, "snapshot should contain a matte-black cart");
    const { results } = query("?color=matte-black");
    assert.ok(results.length > 0);
    for (const cart of results) assert.equal(cart.colorExact, "matte-black");
    // And selecting the family returns that cart too.
    const family = query("?color=black").results;
    assert.ok(family.some((cart) => cart.id === exact!.id));
  });

  test("colour is not dropped when combined with other filters", () => {
    const { state } = parseQuery(`?condition=used&color=${first}`, VOCAB);
    assert.deepEqual(state.color, [first], "colour must survive parsing alongside condition");
    assert.deepEqual(state.condition, ["used"]);
  });
});

describe("combined filters", () => {
  test("condition + colour + price range returns the intersection", () => {
    const color = snapshot.facets.colors[0].key;
    const min = 5000;
    const max = 12000;
    const search = `?condition=used&color=${color}&priceMin=${min}&priceMax=${max}`;

    const { results } = query(search);
    const expected = CARTS.filter(
      (cart) =>
        cart.condition === "used" &&
        cart.color === color &&
        cart.price !== null &&
        cart.price >= min &&
        cart.price <= max,
    );

    assert.equal(results.length, expected.length);
    assert.deepEqual(
      results.map((cart) => cart.id).sort(),
      expected.map((cart) => cart.id).sort(),
    );
    for (const cart of results) {
      assert.equal(cart.condition, "used");
      assert.equal(cart.color, color);
      assert.ok(cart.price! >= min && cart.price! <= max);
    }
  });

  test("features are conjunctive: lifted AND street-legal means both", () => {
    const { results } = query("?feature=lifted&feature=street-legal");
    const expected = CARTS.filter(
      (cart) => cart.features.includes("lifted") && cart.features.includes("street-legal"),
    );
    assert.equal(results.length, expected.length);
    for (const cart of results) {
      assert.ok(cart.features.includes("lifted"));
      assert.ok(cart.features.includes("street-legal"));
    }
  });

  test("a reversed price range is corrected rather than returning nothing", () => {
    const forwards = query("?priceMin=4000&priceMax=9000").results.length;
    const backwards = query("?priceMin=9000&priceMax=4000").results.length;
    assert.ok(forwards > 0);
    assert.equal(backwards, forwards);
  });

  test("free-text search requires every term", () => {
    const { results } = query("?q=denago+lifted");
    assert.ok(results.length > 0);
    for (const cart of results) {
      assert.ok(cart.search.includes("denago"));
      assert.ok(cart.search.includes("lifted"));
    }
  });
});

describe("serialization round-trip", () => {
  const cases = [
    "?condition=new",
    "?condition=used&color=black&color=green",
    "?condition=used&color=black&priceMin=5000&priceMax=12000&sort=price-asc&page=2",
    "?make=club_car&make=denago&feature=lifted&passengers=4-passenger",
    "?q=lithium%20lifted&yearMin=2022&yearMax=2026",
    "?color=green,black&condition=new,used&battery=lithium",
    "",
  ];

  test("serialize → parse → serialize is idempotent", () => {
    for (const search of cases) {
      const first = serializeQuery(parseQuery(search, VOCAB).state);
      const second = serializeQuery(parseQuery(`?${first}`, VOCAB).state);
      assert.equal(second, first, `not idempotent for ${JSON.stringify(search)}`);
      // A third pass must also be stable.
      const third = serializeQuery(parseQuery(`?${second}`, VOCAB).state);
      assert.equal(third, first);
    }
  });

  test("parse → filter → re-serialize → parse → filter gives identical results", () => {
    for (const search of cases) {
      const { state } = parseQuery(search, VOCAB);
      const firstIds = filterCarts(CARTS, state).map((cart) => cart.id);
      const reparsed = parseQuery(`?${serializeQuery(state)}`, VOCAB).state;
      const secondIds = filterCarts(CARTS, reparsed).map((cart) => cart.id);
      assert.deepEqual(secondIds, firstIds, `results changed for ${JSON.stringify(search)}`);
    }
  });

  test("value order in the URL does not change the serialization", () => {
    const a = serializeQuery(parseQuery("?color=green&color=black", VOCAB).state);
    const b = serializeQuery(parseQuery("?color=black&color=green", VOCAB).state);
    assert.equal(a, b);
  });

  test("duplicate values collapse", () => {
    const { state } = parseQuery("?color=black&color=black&color=black", VOCAB);
    assert.deepEqual(state.color, ["black"]);
  });

  test("locked route values are omitted from the query string", () => {
    const { state } = parseQuery("?condition=new&color=black", VOCAB);
    const serialized = serializeQuery(state, { condition: ["new"] });
    assert.ok(!serialized.includes("condition"), `condition should be implied by the route: ${serialized}`);
    assert.ok(serialized.includes("color=black"));
  });

  test("defaults are omitted", () => {
    assert.equal(serializeQuery(emptyState()), "");
    const state = { ...emptyState(), sort: "featured" as const, page: 1 };
    assert.equal(serializeQuery(state), "");
  });
});

describe("state restoration", () => {
  test("a four-filter URL restores all four controls", () => {
    const search = "?condition=used&color=black&make=club_car&feature=lifted";
    const { state, ignored } = parseQuery(search, VOCAB);

    assert.equal(ignored.length, 0);
    assert.deepEqual(state.condition, ["used"]);
    assert.deepEqual(state.color, ["black"]);
    assert.deepEqual(state.make, ["club_car"]);
    assert.deepEqual(state.feature, ["lifted"]);

    // All four are reported as active, which is what the chip row renders.
    const active = describeFilters(state);
    assert.equal(active.length, 4);
    const fields = active.map((entry) => entry.field).sort();
    assert.deepEqual(fields, ["color", "condition", "feature", "make"]);
  });

  test("sort and page survive a round-trip", () => {
    const { state } = parseQuery("?sort=price-asc&page=3", VOCAB);
    assert.equal(state.sort, "price-asc");
    assert.equal(state.page, 3);
    assert.equal(serializeQuery(state), "sort=price-asc&page=3");
  });

  test("an out-of-range or junk page falls back to page 1", () => {
    assert.equal(parseQuery("?page=0", VOCAB).state.page, 1);
    assert.equal(parseQuery("?page=-4", VOCAB).state.page, 1);
    assert.equal(parseQuery("?page=abc", VOCAB).state.page, 1);
  });

  test("an unknown sort key falls back to featured", () => {
    assert.equal(parseQuery("?sort=cheapest-ever", VOCAB).state.sort, "featured");
  });
});

describe("unknown values are ignored gracefully", () => {
  test("a colour absent from the data is reported, not applied", () => {
    const { state, ignored, results } = query("?color=chartreuse");

    assert.deepEqual(state.color, [], "an unknown colour must not become an active filter");
    assert.equal(ignored.length, 1);
    assert.equal(ignored[0].field, "color");
    assert.equal(ignored[0].value, "chartreuse");
    // The decisive part: it does not silently return zero results.
    assert.equal(results.length, CARTS.length);
  });

  test("an unknown value alongside a known one keeps the known one", () => {
    const { state, ignored, results } = query("?color=black&color=chartreuse");
    assert.deepEqual(state.color, ["black"]);
    assert.equal(ignored.length, 1);
    assert.equal(results.length, CARTS.filter((cart) => cart.color === "black").length);
  });

  test("unknown values across several fields are all reported", () => {
    const { ignored } = query("?make=tesla&color=chartreuse&battery=plutonium");
    assert.equal(ignored.length, 3);
    assert.deepEqual(ignored.map((entry) => entry.field).sort(), ["battery", "color", "make"]);
  });

  test("a malformed param is dropped without a spurious report", () => {
    const { state, ignored } = query("?color=&color=---&condition=");
    assert.deepEqual(state.color, []);
    assert.equal(ignored.length, 0);
  });
});

describe("facet counts", () => {
  test("counts with no filters equal the snapshot facet counts", () => {
    const counts = facetCountsFor(CARTS, emptyState(), "condition");
    const byValue = new Map(counts.map((entry) => [entry.value, entry.count]));
    assert.equal(byValue.get("new"), snapshot.summary.new);
    assert.equal(byValue.get("used"), snapshot.summary.used);
  });

  test("a facet's own selection is excluded from its counts, so multi-select can be extended", () => {
    const state = { ...emptyState(), color: ["black"] };
    const counts = facetCountsFor(CARTS, state, "color");
    const green = counts.find((entry) => entry.value === "green");
    assert.ok(green, "green should still be offered");
    // Green's count is its full count, not zero, because the black selection is
    // excluded when counting the colour facet itself.
    assert.equal(green!.count, CARTS.filter((cart) => cart.color === "green").length);
  });

  test("other facets do constrain the counts", () => {
    const state = { ...emptyState(), condition: ["new"] };
    const counts = facetCountsFor(CARTS, state, "color");
    for (const entry of counts) {
      const expected = CARTS.filter((cart) => cart.color === entry.value && cart.condition === "new").length;
      assert.equal(entry.count, expected, `colour ${entry.value} count under condition=new`);
    }
  });

  test("adding a facet value yields exactly the count that was advertised", () => {
    const state = { ...emptyState(), condition: ["used"] };
    for (const entry of facetCountsFor(CARTS, state, "make")) {
      const next = { ...state, make: [entry.value] };
      assert.equal(filterCarts(CARTS, next).length, entry.count, `make=${entry.value}`);
    }
  });

  test("every facet field produces counts and no negative or zero-count entries", () => {
    const counts = allFacetCounts(CARTS, emptyState());
    for (const field of MULTI_FIELDS) {
      assert.ok(counts[field].length > 0, `${field} should have options`);
      for (const entry of counts[field]) assert.ok(entry.count > 0, `${field}/${entry.value} should be > 0`);
    }
  });

  test("a zero-match option is simply absent, so it cannot be selected into a dead end", () => {
    // Gas carts and lithium packs barely overlap; whatever is offered must be real.
    const state = { ...emptyState(), fuel: ["gas"] };
    for (const entry of facetCountsFor(CARTS, state, "battery")) {
      assert.ok(filterCarts(CARTS, { ...state, battery: [entry.value] }).length > 0);
    }
  });
});

describe("sorting and pagination", () => {
  test("price-asc is ascending and price-desc is its reverse", () => {
    const asc = sortCarts(CARTS, "price-asc").map((cart) => cart.price ?? Infinity);
    for (let i = 1; i < asc.length; i += 1) assert.ok(asc[i] >= asc[i - 1]);
    const desc = sortCarts(CARTS, "price-desc").map((cart) => cart.price ?? -Infinity);
    for (let i = 1; i < desc.length; i += 1) assert.ok(desc[i] <= desc[i - 1]);
  });

  test("sorting is stable across repeated calls", () => {
    const a = sortCarts(CARTS, "year-desc").map((cart) => cart.id);
    const b = sortCarts(CARTS, "year-desc").map((cart) => cart.id);
    assert.deepEqual(a, b);
  });

  test("pagination covers every result exactly once", () => {
    const results = filterCarts(CARTS, emptyState());
    const pageSize = 24;
    const seen: string[] = [];
    let page = 1;
    for (;;) {
      const slice = paginate(results, page, pageSize);
      seen.push(...slice.items.map((cart) => cart.id));
      if (page >= slice.pageCount) break;
      page += 1;
    }
    assert.equal(seen.length, results.length);
    assert.equal(new Set(seen).size, results.length);
  });

  test("a page beyond the end clamps to the last page", () => {
    const results = filterCarts(CARTS, emptyState());
    const slice = paginate(results, 9999, 24);
    assert.equal(slice.page, slice.pageCount);
    assert.ok(slice.items.length > 0);
  });
});

describe("clearing filters", () => {
  test("clear all removes every filter but keeps the sort", () => {
    const { state } = parseQuery("?condition=used&color=black&sort=price-asc&page=4", VOCAB);
    const cleared = clearFilters(state);
    assert.equal(hasActiveFilters(cleared), false);
    assert.equal(cleared.sort, "price-asc");
    assert.equal(cleared.page, 1);
    assert.equal(filterCarts(CARTS, cleared).length, CARTS.length);
  });

  test("removing one filter leaves the others intact", () => {
    const { state } = parseQuery("?condition=used&color=black&make=club_car", VOCAB);
    const next = withoutFilter(state, "color", "black");
    assert.deepEqual(next.color, []);
    assert.deepEqual(next.condition, ["used"]);
    assert.deepEqual(next.make, ["club_car"]);
  });

  test("the empty state names its active filters", () => {
    // A deliberately contradictory query: gas + lithium in one city.
    const { state } = parseQuery("?fuel=gas&battery=lithium&color=patriotic", VOCAB);
    const results = filterCarts(CARTS, state);
    const active = describeFilters(state);
    assert.ok(active.length >= 2, "the empty state must be able to name what is filtered");
    if (results.length === 0) {
      assert.ok(active.every((entry) => entry.label.includes(":")));
    }
  });
});
