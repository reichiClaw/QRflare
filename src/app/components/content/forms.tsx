/**
 * Purpose-built editors for every content type. Each form receives the current
 * value, an onChange callback and a map of field errors (path → message).
 */
import { Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';

import type { ContentType, ContentValueInput } from '@shared/content/schemas';
import { utf8ByteLength, codePointLength } from '@shared/qr/encode';

import { Button } from '../ui/Button';
import { NumberInput, Segmented, Select, Switch, TextArea, TextInput } from '../ui/Field';
import { Callout } from '../ui/Primitives';

export interface FormProps<T extends ContentType> {
  value: ContentValueInput<T>;
  onChange: (value: ContentValueInput<T>) => void;
  errors: Record<string, string>;
}

type Patch<T extends ContentType> = (patch: Partial<ContentValueInput<T>>) => void;

function usePatch<T extends ContentType>(props: FormProps<T>): Patch<T> {
  return (patch) => props.onChange({ ...props.value, ...patch } as ContentValueInput<T>);
}

function asText(value: unknown): string {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Counter({ text }: { text: string }) {
  return (
    <span className="tabular-nums">
      {codePointLength(text)} characters · {utf8ByteLength(text)} bytes
    </span>
  );
}

/* 1. Text */
export function TextForm(props: FormProps<'text'>) {
  const patch = usePatch(props);
  return (
    <TextArea
      label="Text"
      value={props.value.text}
      onChange={(text) => patch({ text })}
      placeholder="Type or paste any text, including emoji 🚀"
      rows={6}
      error={props.errors.text}
      hint={<Counter text={props.value.text} />}
    />
  );
}

/* 2. URL */
export function UrlForm(props: FormProps<'url'>) {
  const patch = usePatch(props);
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="Website URL"
        type="url"
        inputMode="url"
        autoCapitalize="off"
        value={props.value.url}
        onChange={(url) => patch({ url })}
        placeholder="example.com/page"
        error={props.errors.url}
        required
      />
      <Switch
        label="Add https:// automatically"
        description="Custom schemes such as myapp:// are always kept as typed."
        checked={props.value.autoHttps ?? true}
        onChange={(autoHttps) => patch({ autoHttps })}
      />
    </div>
  );
}

/* 3. Email */
export function EmailForm(props: FormProps<'email'>) {
  const patch = usePatch(props);
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="To"
        type="email"
        inputMode="email"
        value={props.value.to}
        onChange={(to) => patch({ to })}
        placeholder="someone@example.com"
        error={props.errors.to}
        required
        description="Separate multiple recipients with commas."
      />
      <Row>
        <TextInput
          label="CC"
          value={props.value.cc ?? ''}
          onChange={(cc) => patch({ cc })}
          error={props.errors.cc}
        />
        <TextInput
          label="BCC"
          value={props.value.bcc ?? ''}
          onChange={(bcc) => patch({ bcc })}
          error={props.errors.bcc}
        />
      </Row>
      <TextInput
        label="Subject"
        value={props.value.subject ?? ''}
        onChange={(subject) => patch({ subject })}
        error={props.errors.subject}
      />
      <TextArea
        label="Body"
        value={props.value.body ?? ''}
        onChange={(body) => patch({ body })}
        rows={4}
        error={props.errors.body}
      />
    </div>
  );
}

/* 4. Phone */
export function PhoneForm(props: FormProps<'phone'>) {
  const patch = usePatch(props);
  return (
    <TextInput
      label="Phone number"
      type="tel"
      inputMode="tel"
      value={props.value.number}
      onChange={(number) => patch({ number })}
      placeholder="+1 415 555 0132"
      description="Use the international format with country code for best results."
      error={props.errors.number}
      required
    />
  );
}

/* 5. SMS */
export function SmsForm(props: FormProps<'sms'>) {
  const patch = usePatch(props);
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="Recipient number"
        type="tel"
        inputMode="tel"
        value={props.value.number}
        onChange={(number) => patch({ number })}
        placeholder="+1 415 555 0132"
        error={props.errors.number}
        required
      />
      <TextArea
        label="Message"
        value={props.value.message ?? ''}
        onChange={(message) => patch({ message })}
        rows={3}
        error={props.errors.message}
        hint={<Counter text={props.value.message ?? ''} />}
      />
    </div>
  );
}

/* 6. WhatsApp */
export function WhatsAppForm(props: FormProps<'whatsapp'>) {
  const patch = usePatch(props);
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="WhatsApp number"
        type="tel"
        inputMode="tel"
        value={props.value.number}
        onChange={(number) => patch({ number })}
        placeholder="+1 415 555 0132"
        description="International format including the country code."
        error={props.errors.number}
        required
      />
      <TextArea
        label="Pre-filled message (optional)"
        value={props.value.message ?? ''}
        onChange={(message) => patch({ message })}
        rows={3}
        error={props.errors.message}
      />
    </div>
  );
}

/* 7. Wi-Fi */
export function WifiForm(props: FormProps<'wifi'>) {
  const patch = usePatch(props);
  const encryption = props.value.encryption ?? 'WPA';
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="Network name (SSID)"
        value={props.value.ssid}
        onChange={(ssid) => patch({ ssid })}
        error={props.errors.ssid}
        required
        autoCapitalize="off"
      />
      <Segmented
        label="Security"
        value={encryption}
        onChange={(v) => patch({ encryption: v })}
        options={[
          { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
          { value: 'WEP', label: 'WEP' },
          { value: 'nopass', label: 'Open' },
        ]}
      />
      {encryption !== 'nopass' ? (
        <TextInput
          label="Password"
          secret
          value={props.value.password ?? ''}
          onChange={(password) => patch({ password })}
          error={props.errors.password}
          required
          description="Special characters are escaped automatically."
        />
      ) : null}
      <Switch
        label="Hidden network"
        checked={props.value.hidden ?? false}
        onChange={(hidden) => patch({ hidden })}
      />
    </div>
  );
}

/* 8. vCard */
const PHONE_TYPES = ['CELL', 'WORK', 'HOME', 'FAX', 'OTHER'] as const;
const EMAIL_TYPES = ['WORK', 'HOME', 'OTHER'] as const;

async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', 0.5);
  } finally {
    bitmap.close();
  }
}

export function VCardForm(props: FormProps<'vcard'>) {
  const patch = usePatch(props);
  const v = props.value;
  const phones = v.phones ?? [];
  const emails = v.emails ?? [];
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await shrinkPhoto(file);
      patch({ photo: dataUrl });
      setPhotoError(null);
    } catch {
      setPhotoError('The image could not be processed.');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="vCard version"
        value={v.version ?? '3.0'}
        onChange={(version) => patch({ version })}
        options={[
          { value: '3.0', label: '3.0 (most compatible)' },
          { value: '4.0', label: '4.0' },
        ]}
      />
      <Row>
        <TextInput
          label="First name"
          value={v.firstName ?? ''}
          onChange={(firstName) => patch({ firstName })}
          error={props.errors.firstName}
          autoComplete="off"
        />
        <TextInput
          label="Last name"
          value={v.lastName ?? ''}
          onChange={(lastName) => patch({ lastName })}
          error={props.errors.lastName}
          autoComplete="off"
        />
      </Row>
      <TextInput
        label="Display name"
        value={v.displayName ?? ''}
        onChange={(displayName) => patch({ displayName })}
        description="Defaults to first + last name."
      />
      <Row>
        <TextInput
          label="Organization"
          value={v.organization ?? ''}
          onChange={(organization) => patch({ organization })}
        />
        <TextInput label="Job title" value={v.title ?? ''} onChange={(title) => patch({ title })} />
      </Row>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Phone numbers</legend>
        {phones.map((phone, i) => (
          <div key={i} className="flex items-end gap-2">
            <Select
              label={`Type ${i + 1}`}
              value={phone.type ?? 'CELL'}
              onChange={(type) =>
                patch({
                  phones: phones.map((p, j) =>
                    j === i ? { ...p, type: type as (typeof PHONE_TYPES)[number] } : p,
                  ),
                })
              }
              options={PHONE_TYPES.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))}
            />
            <div className="flex-1">
              <TextInput
                label={`Number ${i + 1}`}
                type="tel"
                value={phone.number}
                onChange={(number) =>
                  patch({ phones: phones.map((p, j) => (j === i ? { ...p, number } : p)) })
                }
                error={props.errors[`phones.${i}.number`]}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              icon={Trash2}
              aria-label={`Remove phone ${i + 1}`}
              onClick={() => patch({ phones: phones.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        {phones.length < 6 ? (
          <Button
            size="sm"
            variant="outline"
            icon={Plus}
            onClick={() => patch({ phones: [...phones, { type: 'CELL', number: '' }] })}
            className="self-start"
          >
            Add phone
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Email addresses</legend>
        {emails.map((email, i) => (
          <div key={i} className="flex items-end gap-2">
            <Select
              label={`Type ${i + 1}`}
              value={email.type ?? 'WORK'}
              onChange={(type) =>
                patch({
                  emails: emails.map((p, j) =>
                    j === i ? { ...p, type: type as (typeof EMAIL_TYPES)[number] } : p,
                  ),
                })
              }
              options={EMAIL_TYPES.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))}
            />
            <div className="flex-1">
              <TextInput
                label={`Address ${i + 1}`}
                type="email"
                value={email.address}
                onChange={(address) =>
                  patch({ emails: emails.map((p, j) => (j === i ? { ...p, address } : p)) })
                }
                error={props.errors[`emails.${i}.address`]}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              icon={Trash2}
              aria-label={`Remove email ${i + 1}`}
              onClick={() => patch({ emails: emails.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        {emails.length < 6 ? (
          <Button
            size="sm"
            variant="outline"
            icon={Plus}
            onClick={() => patch({ emails: [...emails, { type: 'WORK', address: '' }] })}
            className="self-start"
          >
            Add email
          </Button>
        ) : null}
      </fieldset>

      <TextInput
        label="Website"
        type="url"
        value={v.website ?? ''}
        onChange={(website) => patch({ website })}
        error={props.errors.website}
      />
      <TextInput label="Street" value={v.street ?? ''} onChange={(street) => patch({ street })} />
      <Row>
        <TextInput label="City" value={v.city ?? ''} onChange={(city) => patch({ city })} />
        <TextInput
          label="Postal code"
          value={v.postalCode ?? ''}
          onChange={(postalCode) => patch({ postalCode })}
        />
      </Row>
      <Row>
        <TextInput label="State / region" value={v.region ?? ''} onChange={(region) => patch({ region })} />
        <TextInput label="Country" value={v.country ?? ''} onChange={(country) => patch({ country })} />
      </Row>
      <TextInput
        label="Birthday"
        type="date"
        value={v.birthday ?? ''}
        onChange={(birthday) => patch({ birthday })}
        error={props.errors.birthday}
      />
      <TextArea label="Notes" value={v.notes ?? ''} onChange={(notes) => patch({ notes })} rows={2} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Contact photo (optional)</span>
        <p className="text-xs text-muted">
          Shrunk to a 48 px thumbnail (~1–2 KB). It is only embedded when the QR code still has room.
        </p>
        <div className="flex items-center gap-3">
          {v.photo ? (
            <img
              src={v.photo}
              alt="Contact photo preview"
              width={48}
              height={48}
              className="rounded-md border border-default"
            />
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => void onPhoto(e.target.files?.[0])}
            aria-label="Choose contact photo"
          />
          <Button size="sm" variant="outline" icon={Upload} onClick={() => fileRef.current?.click()}>
            {v.photo ? 'Replace photo' : 'Add photo'}
          </Button>
          {v.photo ? (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => patch({ photo: undefined })}>
              Remove
            </Button>
          ) : null}
        </div>
        {photoError ? <p className="text-xs text-red-600">{photoError}</p> : null}
      </div>
    </div>
  );
}

/* 9. MeCard */
export function MeCardForm(props: FormProps<'mecard'>) {
  const patch = usePatch(props);
  const v = props.value;
  return (
    <div className="flex flex-col gap-3">
      <Row>
        <TextInput
          label="Last name"
          value={v.lastName ?? ''}
          onChange={(lastName) => patch({ lastName })}
          error={props.errors.lastName}
        />
        <TextInput
          label="First name"
          value={v.firstName ?? ''}
          onChange={(firstName) => patch({ firstName })}
          error={props.errors.firstName}
        />
      </Row>
      <Row>
        <TextInput
          label="Telephone"
          type="tel"
          value={v.phone ?? ''}
          onChange={(phone) => patch({ phone })}
          error={props.errors.phone}
        />
        <TextInput
          label="Email"
          type="email"
          value={v.email ?? ''}
          onChange={(email) => patch({ email })}
          error={props.errors.email}
        />
      </Row>
      <TextInput label="Address" value={v.address ?? ''} onChange={(address) => patch({ address })} />
      <TextInput
        label="Website"
        type="url"
        value={v.website ?? ''}
        onChange={(website) => patch({ website })}
        error={props.errors.website}
      />
      <TextArea label="Note" value={v.note ?? ''} onChange={(note) => patch({ note })} rows={2} />
    </div>
  );
}

/* 10. Event */
const COMMON_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Istanbul',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Africa/Johannesburg',
];

export function EventForm(props: FormProps<'event'>) {
  const patch = usePatch(props);
  const v = props.value;
  const allDay = v.allDay ?? false;
  const zones = useMemo(() => {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const list = supported && supported.length > 0 ? supported : COMMON_ZONES;
    return [
      { value: '', label: 'Floating (device local time)' },
      ...(local && !list.includes(local) ? [local] : []),
      ...list,
    ].map((z) => (typeof z === 'string' ? { value: z, label: z } : z));
  }, []);
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="Event title"
        value={v.title}
        onChange={(title) => patch({ title })}
        error={props.errors.title}
        required
      />
      <Switch
        label="All-day event"
        checked={allDay}
        onChange={(next) =>
          patch({
            allDay: next,
            start: v.start.slice(0, next ? 10 : 16),
            end: (v.end ?? '').slice(0, next ? 10 : 16),
          })
        }
      />
      <Row>
        <TextInput
          label="Start"
          type={allDay ? 'date' : 'datetime-local'}
          value={v.start}
          onChange={(start) => patch({ start })}
          error={props.errors.start}
          required
        />
        <TextInput
          label="End"
          type={allDay ? 'date' : 'datetime-local'}
          value={v.end ?? ''}
          onChange={(end) => patch({ end })}
          error={props.errors.end}
        />
      </Row>
      {!allDay ? (
        <Select
          label="Time zone"
          value={v.timeZone ?? ''}
          onChange={(timeZone) => patch({ timeZone })}
          options={zones}
          error={props.errors.timeZone}
          description="Times are converted to UTC so every calendar app shows the same moment."
        />
      ) : null}
      <TextInput label="Location" value={v.location ?? ''} onChange={(location) => patch({ location })} />
      <TextArea
        label="Description"
        value={v.description ?? ''}
        onChange={(description) => patch({ description })}
        rows={3}
      />
      <TextInput
        label="URL"
        type="url"
        value={v.url ?? ''}
        onChange={(url) => patch({ url })}
        error={props.errors.url}
      />
    </div>
  );
}

/* 11. Geo */
export function GeoForm(props: FormProps<'geo'>) {
  const patch = usePatch(props);
  const v = props.value;
  return (
    <div className="flex flex-col gap-3">
      <Row>
        <TextInput
          label="Latitude"
          inputMode="decimal"
          value={asText(v.latitude)}
          onChange={(latitude) => patch({ latitude })}
          placeholder="48.858844"
          error={props.errors.latitude}
          required
        />
        <TextInput
          label="Longitude"
          inputMode="decimal"
          value={asText(v.longitude)}
          onChange={(longitude) => patch({ longitude })}
          placeholder="2.294351"
          error={props.errors.longitude}
          required
        />
      </Row>
      <TextInput
        label="Label or search query (optional)"
        value={v.label ?? ''}
        onChange={(label) => patch({ label })}
        placeholder="Eiffel Tower"
      />
    </div>
  );
}

/* 12. EPC */
export function EpcForm(props: FormProps<'epc'>) {
  const patch = usePatch(props);
  const v = props.value;
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="Recipient name"
        value={v.name}
        onChange={(name) => patch({ name })}
        error={props.errors.name}
        required
        maxLength={70}
      />
      <Row>
        <TextInput
          label="IBAN"
          value={v.iban}
          onChange={(iban) => patch({ iban })}
          error={props.errors.iban}
          required
          autoCapitalize="characters"
          placeholder="DE89 3704 0044 0532 0130 00"
          className="font-mono uppercase"
        />
        <TextInput
          label="BIC (optional)"
          value={v.bic ?? ''}
          onChange={(bic) => patch({ bic })}
          error={props.errors.bic}
          className="font-mono uppercase"
        />
      </Row>
      <Row>
        <TextInput
          label="Amount (EUR)"
          inputMode="decimal"
          value={v.amount ?? ''}
          onChange={(amount) => patch({ amount })}
          placeholder="12.50"
          error={props.errors.amount}
          description="Leave empty to let the payer choose."
        />
        <TextInput
          label="Purpose code (optional)"
          value={v.purpose ?? ''}
          onChange={(purpose) => patch({ purpose })}
          error={props.errors.purpose}
          placeholder="GDDS"
          maxLength={4}
        />
      </Row>
      <TextInput
        label="Structured reference (optional)"
        value={v.reference ?? ''}
        onChange={(reference) => patch({ reference })}
        error={props.errors.reference}
        maxLength={35}
        description="ISO 11649 creditor reference. Use either this or a remittance text."
      />
      <TextInput
        label="Remittance text (optional)"
        value={v.remittance ?? ''}
        onChange={(remittance) => patch({ remittance })}
        error={props.errors.remittance}
        maxLength={140}
      />
      <TextInput
        label="Information for the payer (optional)"
        value={v.information ?? ''}
        onChange={(information) => patch({ information })}
        maxLength={70}
      />
      <Callout tone="info">
        EPC069-12 (SEPA) transfers are always in EUR and are recognised by most European banking apps.
      </Callout>
    </div>
  );
}

/* 13. Bitcoin */
export function BitcoinForm(props: FormProps<'bitcoin'>) {
  const patch = usePatch(props);
  const v = props.value;
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="Bitcoin address"
        value={v.address}
        onChange={(address) => patch({ address })}
        error={props.errors.address}
        required
        className="font-mono"
        autoCapitalize="off"
      />
      <Row>
        <TextInput
          label="Amount in BTC (optional)"
          inputMode="decimal"
          value={v.amount ?? ''}
          onChange={(amount) => patch({ amount })}
          error={props.errors.amount}
          placeholder="0.001"
        />
        <TextInput label="Label (optional)" value={v.label ?? ''} onChange={(label) => patch({ label })} />
      </Row>
      <TextInput
        label="Message (optional)"
        value={v.message ?? ''}
        onChange={(message) => patch({ message })}
      />
    </div>
  );
}

/* 14. Ethereum */
export function EthereumForm(props: FormProps<'ethereum'>) {
  const patch = usePatch(props);
  const v = props.value;
  const token = v.token;
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="Recipient address"
        value={v.address}
        onChange={(address) => patch({ address })}
        error={props.errors.address}
        required
        className="font-mono"
        placeholder="0x…"
        autoCapitalize="off"
      />
      <Row>
        <TextInput
          label="Chain ID (optional)"
          inputMode="numeric"
          value={v.chainId ?? ''}
          onChange={(chainId) => patch({ chainId })}
          error={props.errors.chainId}
          placeholder="1"
        />
        <TextInput
          label="Amount in ETH (optional)"
          inputMode="decimal"
          value={v.amount ?? ''}
          onChange={(amount) => patch({ amount })}
          error={props.errors.amount}
          placeholder="0.5"
          disabled={Boolean(token)}
        />
      </Row>
      <Switch
        label="ERC-20 token transfer"
        description="Encodes an EIP-681 transfer call instead of a plain ETH payment."
        checked={Boolean(token)}
        onChange={(on) =>
          patch({
            token: on ? { contract: '', amount: '', decimals: 18 } : undefined,
            amount: on ? '' : v.amount,
          })
        }
      />
      {token ? (
        <div className="grid gap-3 rounded-lg border border-default p-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <TextInput
              label="Token contract"
              value={token.contract}
              onChange={(contract) => patch({ token: { ...token, contract } })}
              error={props.errors['token.contract']}
              className="font-mono"
              placeholder="0x…"
            />
          </div>
          <div className="sm:col-span-2">
            <TextInput
              label="Token amount"
              inputMode="decimal"
              value={token.amount}
              onChange={(amount) => patch({ token: { ...token, amount } })}
              error={props.errors['token.amount']}
              placeholder="25"
            />
          </div>
          <NumberInput
            label="Decimals"
            value={Number(token.decimals ?? 18)}
            onChange={(decimals) => patch({ token: { ...token, decimals } })}
            min={0}
            max={36}
            error={props.errors['token.decimals']}
          />
        </div>
      ) : null}
    </div>
  );
}

/* 15. OTP Auth */
function randomBase32(length = 32): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % 32]).join('');
}

export function OtpAuthForm(props: FormProps<'otpauth'>) {
  const patch = usePatch(props);
  const v = props.value;
  const type = v.type ?? 'totp';
  return (
    <div className="flex flex-col gap-3">
      <Callout tone="warning">
        The secret stays in this browser tab. It is never logged, stored automatically or sent anywhere.
      </Callout>
      <Segmented
        label="Type"
        value={type}
        onChange={(next) => patch({ type: next })}
        options={[
          { value: 'totp', label: 'TOTP (time-based)' },
          { value: 'hotp', label: 'HOTP (counter)' },
        ]}
      />
      <Row>
        <TextInput
          label="Account name"
          value={v.account}
          onChange={(account) => patch({ account })}
          error={props.errors.account}
          required
          placeholder="alice@example.com"
          autoComplete="off"
        />
        <TextInput
          label="Issuer"
          value={v.issuer ?? ''}
          onChange={(issuer) => patch({ issuer })}
          error={props.errors.issuer}
          placeholder="Example Corp"
        />
      </Row>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextInput
            label="Secret (base32)"
            secret
            value={v.secret}
            onChange={(secret) => patch({ secret })}
            error={props.errors.secret}
            required
            className="font-mono"
            autoCapitalize="characters"
          />
        </div>
        <Button
          variant="outline"
          icon={RefreshCw}
          onClick={() => patch({ secret: randomBase32() })}
          aria-label="Generate a random secret"
        >
          Generate
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Algorithm"
          value={v.algorithm ?? 'SHA1'}
          onChange={(algorithm) => patch({ algorithm: algorithm as 'SHA1' | 'SHA256' | 'SHA512' })}
          options={['SHA1', 'SHA256', 'SHA512'].map((a) => ({ value: a, label: a }))}
        />
        <Select
          label="Digits"
          value={asText(v.digits) || '6'}
          onChange={(digits) => patch({ digits: Number(digits) })}
          options={['6', '7', '8'].map((d) => ({ value: d, label: d }))}
        />
        {type === 'totp' ? (
          <NumberInput
            label="Period (s)"
            value={Number(v.period ?? 30)}
            onChange={(period) => patch({ period })}
            min={5}
            max={300}
            error={props.errors.period}
          />
        ) : (
          <NumberInput
            label="Counter"
            value={Number(v.counter ?? 0)}
            onChange={(counter) => patch({ counter })}
            min={0}
            error={props.errors.counter}
          />
        )}
      </div>
    </div>
  );
}

/* 16. Social */
const NETWORKS: Array<{
  value: NonNullable<ContentValueInput<'social'>['network']>;
  label: string;
  placeholder: string;
}> = [
  { value: 'linkedin', label: 'LinkedIn', placeholder: 'username or profile URL' },
  { value: 'instagram', label: 'Instagram', placeholder: '@username' },
  { value: 'facebook', label: 'Facebook', placeholder: 'page name or URL' },
  { value: 'x', label: 'X', placeholder: '@handle' },
  { value: 'youtube', label: 'YouTube', placeholder: '@channel' },
  { value: 'tiktok', label: 'TikTok', placeholder: '@username' },
  { value: 'telegram', label: 'Telegram', placeholder: 'username' },
  { value: 'signal', label: 'Signal', placeholder: '+1 415 555 0132 or signal.me link' },
  { value: 'github', label: 'GitHub', placeholder: 'username' },
  { value: 'custom', label: 'Other profile URL', placeholder: 'https://…' },
];

export function SocialForm(props: FormProps<'social'>) {
  const patch = usePatch(props);
  const network = props.value.network ?? 'instagram';
  const meta = NETWORKS.find((n) => n.value === network) ?? NETWORKS[0]!;
  return (
    <div className="flex flex-col gap-3">
      <Select
        label="Network"
        value={network}
        onChange={(next) => patch({ network: next as typeof network })}
        options={NETWORKS.map((n) => ({ value: n.value, label: n.label }))}
      />
      <TextInput
        label={
          network === 'custom'
            ? 'Profile URL'
            : network === 'signal'
              ? 'Phone number or link'
              : 'Username or profile URL'
        }
        value={props.value.handle}
        onChange={(handle) => patch({ handle })}
        placeholder={meta.placeholder}
        error={props.errors.handle}
        required
        autoCapitalize="off"
      />
    </div>
  );
}

/* 17. App link */
export function AppLinkForm(props: FormProps<'applink'>) {
  const patch = usePatch(props);
  const kind = props.value.kind ?? 'appstore';
  const labels: Record<typeof kind, { label: string; placeholder: string; description: string }> = {
    appstore: {
      label: 'App Store URL',
      placeholder: 'https://apps.apple.com/app/id123456789',
      description: 'Copy the link from App Store Connect or the store page.',
    },
    playstore: {
      label: 'Google Play URL or package name',
      placeholder: 'com.example.app',
      description: 'A package name is expanded to the store URL automatically.',
    },
    deeplink: {
      label: 'Deep link',
      placeholder: 'myapp://open/item/42',
      description: 'Any custom scheme URI that your app registers.',
    },
    universal: {
      label: 'Universal / App Link',
      placeholder: 'https://example.com/app/item/42',
      description: 'An https URL that opens the app when installed.',
    },
  };
  const meta = labels[kind];
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Link type"
        value={kind}
        onChange={(next) => patch({ kind: next })}
        columns={2}
        options={[
          { value: 'appstore', label: 'App Store' },
          { value: 'playstore', label: 'Google Play' },
          { value: 'deeplink', label: 'Deep link' },
          { value: 'universal', label: 'Universal link' },
        ]}
      />
      <TextInput
        label={meta.label}
        value={props.value.value}
        onChange={(value) => patch({ value })}
        placeholder={meta.placeholder}
        description={meta.description}
        error={props.errors.value}
        required
        autoCapitalize="off"
      />
    </div>
  );
}

/* 18. Custom URI */
export function CustomUriForm(props: FormProps<'customuri'>) {
  const patch = usePatch(props);
  const v = props.value;
  const mode = v.mode ?? 'builder';
  const query = v.query ?? [];
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Mode"
        value={mode}
        onChange={(next) => patch({ mode: next })}
        options={[
          { value: 'builder', label: 'Builder' },
          { value: 'raw', label: 'Raw URI' },
        ]}
      />
      {mode === 'raw' ? (
        <TextInput
          label="URI"
          value={v.raw ?? ''}
          onChange={(raw) => patch({ raw })}
          placeholder="myapp://open/item/42?ref=poster"
          error={props.errors.raw}
          required
          className="font-mono"
          autoCapitalize="off"
        />
      ) : (
        <>
          <Row>
            <TextInput
              label="Scheme"
              value={v.scheme ?? ''}
              onChange={(scheme) => patch({ scheme })}
              placeholder="myapp"
              error={props.errors.scheme}
              required
              className="font-mono"
              autoCapitalize="off"
            />
            <TextInput
              label="Authority (optional)"
              value={v.authority ?? ''}
              onChange={(authority) => patch({ authority })}
              placeholder="open"
              className="font-mono"
              autoCapitalize="off"
            />
          </Row>
          <TextInput
            label="Path"
            value={v.path ?? ''}
            onChange={(path) => patch({ path })}
            placeholder="/item/42"
            className="font-mono"
            autoCapitalize="off"
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Query parameters</legend>
            {query.map((q, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <TextInput
                    label={`Key ${i + 1}`}
                    value={q.key}
                    onChange={(key) => patch({ query: query.map((x, j) => (j === i ? { ...x, key } : x)) })}
                    className="font-mono"
                  />
                </div>
                <div className="flex-1">
                  <TextInput
                    label={`Value ${i + 1}`}
                    value={q.value}
                    onChange={(value) =>
                      patch({ query: query.map((x, j) => (j === i ? { ...x, value } : x)) })
                    }
                    className="font-mono"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  icon={Trash2}
                  aria-label={`Remove parameter ${i + 1}`}
                  onClick={() => patch({ query: query.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              icon={Plus}
              onClick={() => patch({ query: [...query, { key: '', value: '' }] })}
              className="self-start"
            >
              Add parameter
            </Button>
          </fieldset>
        </>
      )}
    </div>
  );
}

/* 19. JSON */
export function JsonForm(props: FormProps<'json'>) {
  const patch = usePatch(props);
  const v = props.value;
  const pretty = () => {
    try {
      patch({ json: JSON.stringify(JSON.parse(v.json), null, 2) });
    } catch {
      /* invalid JSON – error shown by validation */
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <TextArea
        label="JSON document"
        mono
        value={v.json}
        onChange={(json) => patch({ json })}
        rows={8}
        placeholder='{"id": 42}'
        error={props.errors.json}
        spellCheck={false}
        hint={<Counter text={v.json} />}
      />
      <div className="flex items-center justify-between gap-3">
        <Switch
          label="Minify before encoding"
          checked={v.minify ?? true}
          onChange={(minify) => patch({ minify })}
        />
        <Button size="sm" variant="outline" onClick={pretty}>
          Format
        </Button>
      </div>
      <Callout tone="info">The JSON is validated but never executed or interpreted.</Callout>
    </div>
  );
}

/* 20. Raw */
export function RawForm(props: FormProps<'raw'>) {
  const patch = usePatch(props);
  return (
    <TextArea
      label="Raw payload"
      mono
      value={props.value.payload}
      onChange={(payload) => patch({ payload })}
      rows={6}
      placeholder="Exactly what should be encoded"
      error={props.errors.payload}
      spellCheck={false}
      hint={<Counter text={props.value.payload} />}
      description="Expert mode: no formatting or escaping is applied."
    />
  );
}
