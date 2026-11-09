// @vitest-environment jsdom
/** The RDF value recipe (#235), run against the built public exports. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocale } from '@sempods/app-sdk';
import { SdkLocaleProvider } from '@sempods/app-sdk/react';
import {
  anonymous,
  createPod,
  type PodFetch,
  type SelectResult,
  type SparqlTerm,
} from '@sempods/client-sdk';
import {
  commonAddressPredicates,
  commonVocabulary,
  describeValue,
  readableName,
  type Vocabulary,
} from '../../../examples/todo/recipes/rdf-values.js';
import { ResourceValues } from '../../../examples/todo/recipes/rdf-value-view.js';

afterEach(cleanup);

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SCHEMA = 'https://schema.org/';

const values = {
  greeting: { type: 'literal', value: 'Grüezi', 'xml:lang': 'de-CH' },
  day: { type: 'literal', value: '2026-10-05', datatype: `${XSD}date` },
  instant: {
    type: 'literal',
    value: '2026-10-05T23:30:00Z',
    datatype: `${XSD}dateTime`,
  },
  floating: {
    type: 'literal',
    value: '2026-10-05T10:00:00',
    datatype: `${XSD}dateTime`,
  },
  impossible: { type: 'literal', value: '2026-02-30', datatype: `${XSD}date` },
  zonedDay: { type: 'literal', value: '2026-10-05Z', datatype: `${XSD}date` },
  ancient: { type: 'literal', value: '-0044-03-15', datatype: `${XSD}date` },
  dateText: { type: 'literal', value: '2026-10-05' },
  year: { type: 'literal', value: '2026', datatype: `${XSD}gYear` },
  count: { type: 'literal', value: '007', datatype: `${XSD}integer` },
  link: { type: 'literal', value: 'https://example.org/docs/a?x=1#top' },
  script: { type: 'literal', value: 'javascript:alert(1)' },
  credentials: { type: 'literal', value: 'https://user:pw@example.org/' },
  quote: { type: 'literal', value: 'say "hi"\\' },
  person: { type: 'uri', value: 'https://example.org/people/al%C3%AFce' },
  homepage: { type: 'uri', value: 'https://example.org/' },
  spoof: { type: 'uri', value: 'https://example.org/a‮txt.exe' },
  ship: { type: 'uri', value: 'urn:example:vocab#Ship' },
  node: { type: 'bnode', value: 'b0' },
  directed: {
    type: 'literal',
    value: 'مرحبا',
    'xml:lang': 'ar',
    'its:dir': 'rtl',
  },
};

/** One row per value, decoded by the SDK's own SELECT decoder. */
async function select(
  rows: readonly Readonly<Record<string, unknown>>[],
  variables = ['value'],
) {
  const fetch = vi.fn<PodFetch>(
    async () =>
      new Response(
        JSON.stringify({
          head: { vars: variables },
          results: { bindings: rows },
        }),
        { headers: { 'content-type': 'application/sparql-results+json' } },
      ),
  );
  const pod = createPod('https://pod.example/alice', {
    auth: anonymous(),
    fetch,
  });
  const answer = await pod.sparql.select(
    'SELECT ?value WHERE { ?s ?p ?value }',
  );
  if (answer.kind !== 'ok') throw new Error(answer.kind);
  return { result: answer.body, fetch };
}

async function terms() {
  const names = Object.keys(values) as (keyof typeof values)[];
  const { result } = await select(
    names.map((name) => ({ value: values[name] })),
  );
  return Object.fromEntries(
    names.map((name, index) => [name, result.rows[index]!['value']!]),
  ) as Record<keyof typeof values, SparqlTerm>;
}

function presenter(
  timeZone: string,
  vocabulary: Vocabulary = commonVocabulary,
) {
  const { format, language, locale } = createLocale({
    locale: 'de-DE',
    timeZone,
  });
  return (term: SparqlTerm, predicate?: string) =>
    describeValue(term, {
      format,
      language,
      locale,
      vocabulary,
      predicate,
      addressPredicates: commonAddressPredicates,
      texts: { blank: 'Unbenannter Knoten', unsupported: 'Nicht unterstützt' },
    });
}

describe('RDF value recipe', () => {
  it('keeps language, datatype and the lexical form exact beside readable text', async () => {
    const t = await terms();
    const show = presenter('Europe/Berlin');
    expect(show(t.greeting)).toEqual({
      text: 'Grüezi',
      language: 'de-CH',
      note: 'Schweizer Hochdeutsch',
      exact: '"Grüezi"@de-CH',
    });
    expect(show(t.count)).toEqual({
      text: '007',
      note: 'Ganzzahl',
      exact: `"007"^^<${XSD}integer>`,
    });
    // Unknown datatype: a readable name from its IRI, no request.
    expect(show(t.year)).toMatchObject({ text: '2026', note: 'gYear' });
    expect(show(t.quote).exact).toBe('"say \\"hi\\"\\\\"');
    expect(show(t.node)).toEqual({ text: 'Unbenannter Knoten', exact: '_:b0' });
    // An RDF 1.2 direction changes the term; it is kept, not shown as plain text.
    expect(show(t.directed)).toEqual({
      text: 'Nicht unterstützt',
      exact: JSON.stringify(values.directed),
    });
  });

  it('formats calendar days independently of the time zone and instants in it', async () => {
    const t = await terms();
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago'])
      expect(presenter(zone)(t.day).text).toBe('05.10.2026');
    expect(presenter('Europe/Berlin')(t.instant).text).toBe(
      '06.10.2026, 01:30',
    );
    expect(presenter('America/New_York')(t.instant).text).toBe(
      '05.10.2026, 19:30',
    );
    expect(presenter('Europe/Berlin')(t.instant).exact).toBe(
      `"2026-10-05T23:30:00Z"^^<${XSD}dateTime>`,
    );
  });

  it('shows invalid, unsupported and non-date forms exactly as stored', async () => {
    const t = await terms();
    const show = presenter('Europe/Berlin');
    for (const name of [
      'floating',
      'impossible',
      'zonedDay',
      'ancient',
    ] as const)
      expect(show(t[name]).text).toBe(values[name].value);
    expect(show(t.dateText)).toEqual({
      text: '2026-10-05',
      exact: '"2026-10-05"',
    });
  });

  it('keeps a web address apart from the term and offers only http(s)', async () => {
    const t = await terms();
    const show = presenter('Europe/Berlin');
    expect(show(t.link)).toEqual({
      text: 'example.org/docs/a',
      exact: '"https://example.org/docs/a?x=1#top"',
      address: {
        href: 'https://example.org/docs/a?x=1#top',
        host: 'example.org',
        path: '/docs/a',
      },
    });
    expect(show(t.script)).toEqual({
      text: 'javascript:alert(1)',
      exact: '"javascript:alert(1)"',
    });
    expect(show(t.credentials).address).toBeUndefined();
    // An IRI is a web address only as the value of an address predicate.
    expect(show(t.homepage, `${SCHEMA}knows`)).toEqual({
      text: 'example.org',
      exact: '<https://example.org/>',
    });
    expect(show(t.homepage, `${SCHEMA}url`).address?.href).toBe(
      'https://example.org/',
    );
  });

  it('labels from the app vocabulary first, then a visible readable name', async () => {
    const t = await terms();
    const app: Vocabulary = {
      ...commonVocabulary,
      [RDF_TYPE]: { en: 'kind', de: 'Art' },
      'urn:example:vocab#Ship': { en: 'Ship', de: 'Schiff' },
    };
    const show = presenter('Europe/Berlin', app);
    expect(show(t.ship).text).toBe('Schiff');
    expect(show(t.person).text).toBe('alïce');
    expect(show(t.spoof)).toEqual({
      text: 'a\\u202etxt.exe',
      exact: '<https://example.org/a\\u202etxt.exe>',
    });
    expect(readableName('https://example.org/%E2%80%AEexe')).toBe(
      '%E2%80%AEexe',
    );
    expect(readableName('http://example.org/vocab/')).toBe('vocab');
    expect(readableName('urn:isbn:9780000000000')).toBe('9780000000000');
  });

  it('renders details with a separate open link and never fetches a value', async () => {
    const { result, fetch } = await select(
      [
        {
          property: { type: 'uri', value: `${SCHEMA}url` },
          value: values.homepage,
        },
        {
          property: { type: 'uri', value: `${SCHEMA}knows` },
          value: values.person,
        },
        {
          property: { type: 'uri', value: `${SCHEMA}name` },
          value: values.greeting,
        },
        {
          property: { type: 'uri', value: `${SCHEMA}startDate` },
          value: values.instant,
        },
        { value: values.count },
      ],
      ['property', 'value'],
    );
    const onShow = vi.fn();
    render(
      <SdkLocaleProvider locale="de-DE" timeZone="Europe/Berlin">
        <ResourceValues result={result} onShow={onShow} />
      </SdkLocaleProvider>,
    );
    const link = screen.getByRole('link', { name: 'example.org öffnen' });
    expect(link.getAttribute('href')).toBe('https://example.org/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
    // A resource IRI opens in the app instead.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'alïce anzeigen' }));
    expect(onShow).toHaveBeenCalledWith(values.person.value);
    expect(screen.getByText('Grüezi').getAttribute('lang')).toBe('de-CH');
    expect(screen.getByText('06.10.2026, 01:30')).toBeTruthy();
    expect(
      screen.getByText(`"2026-10-05T23:30:00Z"^^<${XSD}dateTime>`),
    ).toBeTruthy();
    // Labels: common vocabulary, else readable fallback; unbound rows are skipped.
    expect(screen.getByText('Webadresse')).toBeTruthy();
    expect(screen.getByText('startDate')).toBeTruthy();
    expect(screen.queryByText('007')).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('says so when no row is bound', async () => {
    const empty: SelectResult = { variables: ['property', 'value'], rows: [] };
    render(
      <SdkLocaleProvider language="en">
        <ResourceValues result={empty} onShow={() => {}} />
      </SdkLocaleProvider>,
    );
    expect(screen.getByText('No values.')).toBeTruthy();
  });
});
