import { Copy, RotateCcw, Sparkles } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { exampleContent, getContentMeta } from '@shared/content/registry';
import { ContentSchema, type ContentInput, type ContentType } from '@shared/content/schemas';
import type { PrepareResult } from '@shared/pipeline';
import { utf8ByteLength } from '@shared/qr/encode';

import { copyText } from '../../lib/download';
import { TypeIcon } from '../../lib/icons';
import { useEditor } from '../../store/editor';
import { useSettings } from '../../store/settings';
import { toast } from '../../store/toast';
import { Button } from '../ui/Button';
import { Callout, Collapsible, ConfirmDialog } from '../ui/Primitives';
import { ContentTypePicker } from './ContentTypePicker';
import * as Forms from './forms';

type AnyFormProps = Forms.FormProps<ContentType>;

const FORMS: { [K in ContentType]: (props: Forms.FormProps<K>) => ReactElement } = {
  text: Forms.TextForm,
  url: Forms.UrlForm,
  email: Forms.EmailForm,
  phone: Forms.PhoneForm,
  sms: Forms.SmsForm,
  whatsapp: Forms.WhatsAppForm,
  wifi: Forms.WifiForm,
  vcard: Forms.VCardForm,
  mecard: Forms.MeCardForm,
  event: Forms.EventForm,
  geo: Forms.GeoForm,
  epc: Forms.EpcForm,
  bitcoin: Forms.BitcoinForm,
  ethereum: Forms.EthereumForm,
  otpauth: Forms.OtpAuthForm,
  social: Forms.SocialForm,
  applink: Forms.AppLinkForm,
  customuri: Forms.CustomUriForm,
  json: Forms.JsonForm,
  raw: Forms.RawForm,
};

function fieldErrors(content: ContentInput, showErrors: boolean): Record<string, string> {
  if (!showErrors) return {};
  const parsed = ContentSchema.safeParse(content);
  if (parsed.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path
      .filter((p) => p !== 'value')
      .map(String)
      .join('.');
    if (!(path in errors)) errors[path] = issue.message;
  }
  return errors;
}

export function ContentPanel({ result }: { result: PrepareResult | null }) {
  const content = useEditor((s) => s.content);
  const dirty = useEditor((s) => s.dirty);
  const setContentType = useEditor((s) => s.setContentType);
  const setContentValue = useEditor((s) => s.setContentValue);
  const resetContent = useEditor((s) => s.resetContent);
  const loadSnapshot = useEditor((s) => s.loadSnapshot);
  const showRaw = useSettings((s) => s.showRawPayload);
  const [pendingType, setPendingType] = useState<ContentType | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const meta = getContentMeta(content.type);
  const errors = useMemo(() => fieldErrors(content, dirty), [content, dirty]);
  const Form = FORMS[content.type] as (props: AnyFormProps) => ReactElement;

  const [pickerOpen, setPickerOpen] = useState(true);

  const requestTypeChange = (type: ContentType) => {
    if (type === content.type) {
      setPickerOpen(false);
      return;
    }
    if (dirty) setPendingType(type);
    else {
      setContentType(type);
      setPickerOpen(false);
    }
  };

  const prepared = result && result.ok ? result : null;
  const payload = prepared?.payload ?? '';

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="content-type-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="content-type-heading" className="text-xs font-semibold uppercase tracking-wide text-muted">
            1. What should the code contain?
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            aria-controls="content-type-picker"
          >
            {pickerOpen ? 'Hide types' : 'Change type'}
          </Button>
        </div>
        {pickerOpen ? (
          <div id="content-type-picker">
            <ContentTypePicker value={content.type} onChange={requestTypeChange} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="content-fields-heading" className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              <TypeIcon name={meta.icon} size={16} />
            </span>
            <div>
              <h2 id="content-fields-heading" className="text-sm font-semibold">
                {meta.label}
              </h2>
              <p className="text-xs text-muted">{meta.description}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={Sparkles}
              onClick={() => loadSnapshot({ content: exampleContent(content.type) })}
              title="Fill with an example"
            >
              Example
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              onClick={() => (dirty ? setConfirmReset(true) : resetContent())}
              title="Clear the fields"
              aria-label="Reset content"
            >
              Reset
            </Button>
          </div>
        </div>
        <Form value={content.value} onChange={(value) => setContentValue(value)} errors={errors} />
        {meta.sensitive ? (
          <Callout tone="info">
            This content type can contain personal or secret data. It is generated locally and never leaves
            this device.
          </Callout>
        ) : null}
        {prepared && prepared.contentWarnings.length > 0 ? (
          <Callout tone="warning">
            <ul className="list-disc pl-4">
              {prepared.contentWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Callout>
        ) : null}
      </section>

      <Collapsible
        title="Raw payload"
        defaultOpen={showRaw}
        badge={
          payload ? (
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-muted">
              {utf8ByteLength(payload)} bytes
            </span>
          ) : null
        }
      >
        <div className="flex flex-col gap-2">
          <pre
            className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-3 p-3 font-mono text-xs scroll-thin"
            aria-label="Encoded payload"
          >
            {payload || (
              <span className="text-muted">
                Fill in the fields above to see the exact text that will be encoded.
              </span>
            )}
          </pre>
          {prepared ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                Segments: {prepared.encode.segments.map((s) => `${s.mode} ×${s.numChars}`).join(', ')}
              </span>
              <Button
                size="sm"
                variant="outline"
                icon={Copy}
                onClick={async () => {
                  const ok = await copyText(payload);
                  if (ok) toast.success('Payload copied');
                  else toast.error('Clipboard unavailable', 'Your browser blocked clipboard access.');
                }}
              >
                Copy payload
              </Button>
            </div>
          ) : null}
        </div>
      </Collapsible>

      <ConfirmDialog
        open={pendingType !== null}
        title="Discard current content?"
        description="Switching the content type clears the fields you have filled in."
        confirmLabel="Switch type"
        onCancel={() => setPendingType(null)}
        onConfirm={() => {
          if (pendingType) setContentType(pendingType);
          setPendingType(null);
          setPickerOpen(false);
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Reset content?"
        description="All fields of this content type will be cleared. You can undo this afterwards."
        confirmLabel="Reset"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetContent();
          setConfirmReset(false);
        }}
      />
    </div>
  );
}
