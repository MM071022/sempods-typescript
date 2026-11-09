# Show RDF values from a SPARQL read

Use this guide when an app shows values that `pod.sparql.select` returns
without a fixed field mapping, for example in a resource's details or as a
graph node's caption. Each value gets readable text, and the exact RDF term
stays available. A web address is offered as a separate action to open it.

The recipe uses only public exports: `SparqlTerm` from a SELECT, the SDK
formatters and plain React. It has no renderer registry, and the vocabulary is
the app's own. Copy and adapt it:

- [`rdf-values.ts`](../examples/todo/recipes/rdf-values.ts) turns one term
  into its presentation. It has no React dependency, so it also works
  headless with `createLocale`.
- [`rdf-value-view.tsx`](../examples/todo/recipes/rdf-value-view.tsx) has a
  compact `ValueText` and a `ResourceValues` details list. It shows the app's
  vocabulary layered over the common labels.

For values the app edits, use [field definitions](build-your-app.md) instead.
A SELECT row is a read-only view of the data, not a snapshot an app can
write back.

## The small path

Pass the device's time zone to the provider. Its default is `UTC`, which
would show every instant in UTC. In this fragment of the host, `selected`
and `show` are the app's own:

```tsx
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

<SempodsProvider
  runtime={runtime}
  contextSelection="on-demand"
  timeZone={timeZone}
>
  <AppAccess appName="My explorer" />
  <Details iri={selected} onShow={show} />
</SempodsProvider>;
```

Read one resource's values across the Pod, then render the result:

```tsx
function Details({
  iri,
  onShow,
}: {
  readonly iri: string;
  readonly onShow: (iri: string) => void;
}) {
  const load = usePodLoad(
    (pod, signal) =>
      pod.sparql.select(
        `SELECT ?property ?value WHERE {
          GRAPH ?context { <${iri}> ?property ?value }
        } LIMIT 200`,
        { signal },
      ),
    { key: iri },
  );
  if (load.state.kind !== 'ready') return <LoadNotice {...load} />;
  return <ResourceValues result={load.state.data} onShow={onShow} />;
}
```

Only embed an IRI that came from a decoded term or that the app checked
itself. The SDK rejects a decoded IRI containing spaces, `<`, `>` or quotes.
Never embed text a person typed. `ResourceValues` skips rows whose `?property`
is unbound or not an IRI. With no rows left, it says so instead of showing an
empty list. `usePodLoad` and its states are described in the
[Pod overview guide](react-authoring.md#pod-overviews-with-contexts-on-demand).

One `describeValue(term, options)` result feeds both the compact text and the
details:

| Field      | Holds                                                        |
| ---------- | ------------------------------------------------------------ |
| `text`     | Readable text, such as a node caption or a table cell        |
| `language` | The literal's language tag, for the element's `lang`         |
| `note`     | The language name, or the datatype's label                   |
| `exact`    | The term as received, in N-Triples style                     |
| `address`  | A web address offered as an action, kept apart from the term |

## Literals stay exact

- **Language.** A language-tagged literal shows its lexical form unchanged,
  marked with `lang` and `dir="auto"`. The language name comes from
  `Intl.DisplayNames`, for example `Grüezi` · _Schweizer Hochdeutsch_.
- **Datatype.** A literal without a datatype is `xsd:string`, or
  `rdf:langString` when it has a language (RDF 1.1). The SDK does not fill
  the datatype in, and `exact` shows it as received. The note names any
  other datatype, using the vocabulary first.
- **Lexical form.** Numbers, booleans and other datatypes show their stored
  text. Converting `007`, a large integer or a decimal to a JavaScript
  number would change the value.
- **Unsupported terms.** A term the SDK reports as `unsupported` shows the
  app's neutral text and keeps its JSON in `exact`. Flattening it would lose data: an
  RDF 1.2 text direction (`its:dir`), for example, changes the term's
  identity.
- **Exact form.** `exact` is `"…"@lang`, `"…"^^<datatype>`, `<iri>` or `_:b0`.
  Control and Unicode format characters, such as a bidi override, are
  escaped as `\uXXXX`, so they appear as text instead of reordering it.
  A blank node label is local to one result; it does not identify the node
  in another read.

## Calendar days and instants

The recipe formats with the provider's `format.dateOnly` and
`format.dateTime`, the same formatters `DateChooser` in `@sempods/app-ui`
uses. Headless code gets them from `createLocale({ locale, timeZone }).format`.

- An `xsd:date` from year 0001 to 9999 without a time zone is a calendar
  day. It shows the same day in every time zone: `2026-10-05` becomes
  `05.10.2026` in German.
- An `xsd:dateTime` with a time zone names one instant. It shows in the
  provider's `timeZone`: `2026-10-05T23:30:00Z` becomes `06.10.2026, 01:30`
  in Berlin and `05.10.2026, 19:30` in New York.
- Everything else shows as stored: impossible days (`2026-02-30`), dates
  with a time zone (`2026-10-05Z`), years before 0001 (`-0044-03-15`) and
  date-times without a time zone. A date-like value of another datatype
  also stays as stored, such as `"2026-10-05"` as `xsd:string`.

`format.dateTime` accepts anything `new Date()` parses, and `new Date()`
reads a date-time without a time zone as the device's local time. The
recipe's `readableDate` therefore checks the XSD lexical form before it
formats.

## Resources and web addresses

A resource IRI shows its label. `ResourceValues` lets a person open it in the
app (`onShow`). It never requests the IRI, and it never turns the IRI into a
link.

A value counts as a web address only in two cases:

- It is an `xsd:string` or `xsd:anyURI` literal.
- It is an IRI that is the value of one of the app's address predicates, such
  as `schema:url` (`commonAddressPredicates`).

In both cases, `webAddress` must also accept it: `http:` or `https:` only,
without user name or password, and without whitespace or invisible
characters. `javascript:`, `data:` and other schemes stay text.

For a web address, the presentation keeps three things apart:

- `text` is the readable host and path, such as `example.org/docs/a`. Query
  and fragment are left out, and IDNs show as `xn--…`.
- `exact` is the original term. A literal stays a literal: the recipe does not
  make it a resource or query it.
- `address.href` is what a separate link opens, with `target="_blank"`,
  `rel="noopener noreferrer"` and `referrerPolicy="no-referrer"`. Only an
  explicit click opens the address. Parsing or rendering a value never fetches
  it. With `@sempods/app-ui`, `LinkButton` takes the same `href`, `target`,
  `rel` and `referrerPolicy`.

## Vocabulary labels

`labelFor(iri, vocabulary, language)` looks the IRI up in a fixed table, in
the UI language and then in English. A term that is not in the table gets a
readable name from the IRI itself: its last `#`, `/` or `:` segment, decoded
unless decoding would add invisible characters. The lookup never fetches
anything, so an unknown term costs no request. To use the app's own
words, spread the app's vocabulary after the common labels:

```ts
const vocabulary: Vocabulary = {
  ...commonVocabulary,
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': { en: 'kind', de: 'Art' },
  'urn:example:vocab#Ship': { en: 'Ship', de: 'Schiff' },
};
```

Keep the vocabulary, the address predicates and the graph presentation in the
app, and record them in the app's notes.

## Limits

- Numbers and booleans show their stored text, not a localized form.
- The recipe shows no images or other media, and it does not look labels up
  on the web.
- The [test](../packages/app-sdk/src/rdf-values-recipe.test.tsx) runs the
  recipe in jsdom against the built packages. Browser rendering of the link
  and real Pod responses are not covered.
