'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { FormBanner } from '@/components/admin/form';
import { initialFormState, type FormState } from '@/lib/admin/form-state';
import { confirmNameMatches } from '@/lib/admin/confirm-name';

type ServerAction = (prev: FormState, fd: FormData) => Promise<FormState>;

interface Props {
  action: ServerAction;
  productId: string;
  /** Name the owner must type (Arabic name, falling back to the Latin one). */
  productName: string;
  /** Alternative accepted name (the database accepts either), if different. */
  altName?: string | null;
  sizes: number;
  stock: number;
  /** Current list filters (q / filter / page) so the owner lands back where they were. */
  back: string;
}

/**
 * "Delete permanently" button + confirmation dialog for one perfume.
 *
 * This is only the front door. The Server Action re-checks the role, and the
 * database function re-checks role, typed name and open orders — so nothing here
 * can be bypassed from the browser. The form is mounted only while the dialog is
 * open, which keeps the table light and resets the typed name on every open.
 */
export function DeleteProductDialog({ action, productId, productName, altName, sizes, stock, back }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (open && ref.current && !ref.current.open) ref.current.showModal();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="admin-btn-sm text-danger hover:bg-danger/5"
        aria-haspopup="dialog"
      >
        <Trash2 size={14} /> حذف نهائي
      </button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          if (busy.current) e.preventDefault(); // don't abandon a delete that is in flight
        }}
        onClick={(e) => {
          if (e.target === ref.current && !busy.current) ref.current?.close();
        }}
        className="m-auto w-[min(92vw,30rem)] rounded-lg border border-ink/10 bg-white p-0 text-ink shadow-xl backdrop:bg-ink/50"
      >
        {open && (
          <DeleteForm
            action={action}
            titleId={titleId}
            productId={productId}
            productName={productName}
            altName={altName}
            sizes={sizes}
            stock={stock}
            back={back}
            busy={busy}
            onCancel={() => ref.current?.close()}
          />
        )}
      </dialog>
    </>
  );
}

function DeleteForm({
  action,
  titleId,
  productId,
  productName,
  altName,
  sizes,
  stock,
  back,
  busy,
  onCancel,
}: Props & { titleId: string; busy: { current: boolean }; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const matches = confirmNameMatches(typed, productName, altName);

  useEffect(() => {
    busy.current = pending;
    return () => {
      busy.current = false;
    };
  }, [pending, busy]);

  return (
    <form action={formAction} className="space-y-4 p-5">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="back" value={back} />

      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={18} />
        </span>
        <div>
          <h2 id={titleId} className="text-base font-semibold">
            حذف العطر نهائيًا
          </h2>
          <p className="mt-0.5 text-sm font-medium">«{productName}»</p>
        </div>
      </div>

      <div className="rounded border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
        هذا الإجراء <strong>لا يمكن التراجع عنه</strong>. سيختفي العطر كليًا من الموقع ومن لوحة التحكم.
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <p className="font-medium">سيُحذف:</p>
          <ul className="mt-1 list-disc space-y-1 ps-5 text-ink-500">
            <li>العطر وصوره ووصفه ونوتاته وتصنيفاته وظهوره في الصفحة الرئيسية والمتجر</li>
            <li>
              كل مقاساته ({sizes}) والمخزون المسجّل لها ({stock} قطعة) وسجل حركة المخزون
            </li>
            <li>التقييمات وعناصر المفضلة المرتبطة به</li>
          </ul>
        </div>
        <div>
          <p className="font-medium">سيبقى كما هو:</p>
          <ul className="mt-1 list-disc space-y-1 ps-5 text-ink-500">
            <li>الطلبات السابقة وإجمالياتها وتقارير المبيعات (تحتفظ باسم العطر وسعره وقت الشراء)</li>
          </ul>
        </div>
        <p className="text-xs text-ink-500">
          يتعذّر الحذف أثناء وجود طلبات مفتوحة تحتوي هذا العطر. وإن أردت إخفاءه فقط مع إمكانية إرجاعه، استخدم «أرشفة»
          من صفحة المنتجات.
        </p>
      </div>

      <div>
        <label htmlFor={inputId} className="admin-label">
          للتأكيد اكتب اسم العطر: <span className="font-semibold">{productName}</span>
        </label>
        <input
          id={inputId}
          name="confirm_name"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          dir="auto"
          required
          disabled={pending}
          className="admin-input"
        />
        {state.fieldErrors?.confirm_name && <p className="mt-1 text-xs text-danger">{state.fieldErrors.confirm_name}</p>}
      </div>

      <FormBanner state={state} />

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} disabled={pending} className="btn-outline px-4 py-2">
          إلغاء
        </button>
        <button
          type="submit"
          disabled={!matches || pending}
          className="btn bg-danger px-4 py-2 text-white hover:bg-danger/90"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          احذف نهائيًا
        </button>
      </div>
    </form>
  );
}
