# Adding a content type

Content types are data-driven: one schema, one builder, one registry entry and one form. The API, batch mode, JSON Schema, OpenAPI examples and round-trip tests pick a new type up automatically. This walkthrough adds a fictional `mastodon` type.

## 1. Schema – `src/shared/content/schemas.ts`

Define a strict Zod object for the value and add it to the discriminated union:

```ts
export const MastodonValueSchema = z
  .object({
    instance: z.string().trim().min(1, 'Instance is required.').max(200),
    handle: z.string().trim().min(1, 'Handle is required.').max(100),
  })
  .strict();

// in ContentSchema:
z.object({ type: z.literal('mastodon'), value: MastodonValueSchema }).strict(),

// and in CONTENT_TYPES:
'mastodon',
```

Use `superRefine` for cross-field rules and keep error messages human-readable – they are shown verbatim in the UI and the API.

## 2. Builder – `src/shared/content/builders.ts`

Builders are pure functions from a validated value to the payload string. Escape according to the target format and return warnings for advisories:

```ts
const buildMastodon: Builder<'mastodon'> = (v) => ({
  payload: `https://${v.instance.replace(/^https?:\/\//, '')}/@${v.handle.replace(/^@/, '')}`,
});

// register it:
const BUILDERS = { /* … */ mastodon: buildMastodon };
```

## 3. Registry – `src/shared/content/registry.ts`

Metadata drives the picker, the API docs and the tests:

```ts
mastodon: meta({
  id: 'mastodon',
  label: 'Mastodon profile',
  shortLabel: 'Mastodon',
  description: 'Link to a profile on any Mastodon instance.',
  group: 'apps',
  icon: 'AtSign',           // any key in src/app/lib/icons.ts
  defaultValue: { instance: '', handle: '' },
  example: { instance: 'mastodon.social', handle: 'edgeqr' },
  sensitive: false,
}),
```

`example` **must** produce a valid payload – `tests/unit/roundtrip.test.ts` encodes, renders and decodes every example.

## 4. Batch mapping – `src/shared/batch/rows.ts`

Add the column that the generic `data` CSV column should fill:

```ts
export const PRIMARY_FIELD: Record<ContentType, string> = { /* … */ mastodon: 'handle' };
```

## 5. Form – `src/app/components/content/forms.tsx` and `ContentPanel.tsx`

```tsx
export function MastodonForm(props: FormProps<'mastodon'>) {
  const patch = usePatch(props);
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="Instance"
        value={props.value.instance}
        onChange={(instance) => patch({ instance })}
        error={props.errors.instance}
        required
      />
      <TextInput
        label="Handle"
        value={props.value.handle}
        onChange={(handle) => patch({ handle })}
        error={props.errors.handle}
        required
      />
    </div>
  );
}
```

Register it in the `FORMS` map in `ContentPanel.tsx`. Field errors arrive keyed by path (`props.errors.instance`), so labels and error messages are wired up automatically.

## 6. Tests and docs

- Add builder tests in `tests/unit/builders.test.ts` (escaping, validation errors).
- Add an example to `public/openapi.yaml` if the type is notable, and a row to the content-type table in `README.md`.
- Run `npm run check` – the round-trip suite will now decode your example.

## Icons

Icons are Lucide components mapped by name in `src/app/lib/icons.ts`. Add an import there if the icon you want is not yet listed; Lucide is bundled locally, nothing is fetched at runtime.
