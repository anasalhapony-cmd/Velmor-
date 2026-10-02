// Ambient stubs so the admin app can be type-checked OFFLINE (no node_modules).
// External packages get "typed-enough" declarations: return `any`, but accept
// the type-args / named type-imports our code uses, so the ONLY errors tsc
// reports are in OUR code (import paths, exports, props, signatures).
// The authoritative check remains `npm run verify` (real types) after install.

declare var process: { env: Record<string, string | undefined> };

// Minimal JSX for "jsx": "preserve".
declare namespace JSX {
  interface Element {}
  interface ElementClass {}
  interface ElementAttributesProperty { props: Record<string, unknown> }
  interface ElementChildrenAttribute { children: Record<string, unknown> }
  interface IntrinsicAttributes { key?: string | number }
  interface IntrinsicElements { [elemName: string]: any }
}

// React as a UMD-style global (components use React.ReactNode without importing).
declare namespace React {
  type ReactNode = unknown;
  type FC<P = unknown> = (props: P) => any;
  type ComponentType<P = unknown> = (props: P) => any;
  type FormEvent<T = unknown> = { preventDefault(): void; currentTarget: T };
  type ChangeEvent<T = unknown> = { target: T & { value: string; files?: unknown } };
  type MouseEvent<T = unknown> = { preventDefault(): void; currentTarget: T };
  type CSSProperties = Record<string, unknown>;
}

declare module 'react' {
  export function createContext<T>(v: T): { Provider: (p: any) => any; Consumer: (p: any) => any };
  export function useContext<T = unknown>(c: unknown): T;
  export function useState<T = unknown>(v?: T): [T, (x: T | ((prev: T) => T)) => void];
  export function useActionState<S = unknown>(a: unknown, s: S): [S, (fd: unknown) => void, boolean];
  export function useId(): string;
  export function useRef<T>(v: T): { current: T };
  export function useRef<T>(v: T | null): { current: T | null };
  export function useEffect(fn: () => void | (() => void), deps?: unknown[]): void;
  export function useLayoutEffect(fn: () => void | (() => void), deps?: unknown[]): void;
  export function useTransition(): [boolean, (fn: () => void) => void];
  export function useSyncExternalStore<T>(sub: (cb: () => void) => () => void, get: () => T, server?: () => T): T;
  export const Fragment: (p: { children?: unknown }) => any;
  export type CSSProperties = Record<string, string | number | undefined>;
  export type MouseEvent<T = unknown> = { preventDefault(): void; currentTarget: T; clientX: number; clientY: number; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean };
  export function useMemo<T>(fn: () => T, deps?: unknown[]): T;
  export function useCallback<T>(fn: T, deps?: unknown[]): T;
  export function cache<T>(fn: T): T;
  export type ReactNode = unknown;
  export type FC<P = unknown> = (props: P) => any;
  const React: unknown;
  export default React;
}
declare module 'react/jsx-runtime';
declare module 'react-dom' {
  export function useFormStatus(): { pending: boolean };
}

declare module 'next' {
  export type Metadata = Record<string, unknown>;
  export type Viewport = Record<string, unknown>;
  export namespace MetadataRoute {
    type Sitemap = Array<Record<string, unknown>>;
    type Robots = Record<string, unknown>;
  }
}
declare module 'next/link' {
  const Link: (props: Record<string, unknown>) => any;
  export default Link;
}
declare module 'next/navigation' {
  export function redirect(url: string): never;
  export function notFound(): never;
  export function usePathname(): string;
  export function useRouter(): { push(u: string, o?: { scroll?: boolean }): void; replace(u: string, o?: { scroll?: boolean }): void; refresh(): void; back(): void; prefetch(u: string): void };
  export function useSearchParams(): URLSearchParams;
}
declare module 'next/cache' {
  export function revalidatePath(path: string, type?: string): void;
  export function revalidateTag(tag: string): void;
}
declare module 'next/headers' {
  export function cookies(): Promise<{
    get(n: string): { value: string } | undefined;
    getAll(): { name: string; value: string }[];
    set(...a: unknown[]): void;
  }>;
  export function headers(): Promise<{ get(n: string): string | null }>;
}
declare module 'next/server' {
  type ResLike = { headers: Headers; cookies: { set(...a: unknown[]): void } };
  export type NextRequest = {
    headers: Headers;
    cookies: { get(n: string): { value: string } | undefined; getAll(): unknown[]; set(...a: unknown[]): void };
    nextUrl: { pathname: string; searchParams: URLSearchParams; clone(): { pathname: string; search: string; searchParams: URLSearchParams } };
    formData(): Promise<FormData>;
    json(): Promise<unknown>;
    text(): Promise<string>;
  };
  export const NextResponse: {
    next(init?: unknown): ResLike;
    redirect(url: unknown): ResLike;
    json(body: unknown, init?: unknown): ResLike;
  };
}
declare module 'next/*';

declare module 'server-only';
declare module 'node:crypto' {
  export function createHash(alg: string): { update(d: string): { digest(enc: 'hex'): string } };
  export function randomUUID(): string;
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}
declare const Buffer: { from(s: string): Uint8Array };

declare module '@supabase/ssr' {
  export function createServerClient<T = unknown>(url: string, key: string, opts: unknown): any;
  export function createBrowserClient<T = unknown>(url: string, key: string): any;
}
declare module '@supabase/supabase-js' {
  export function createClient<T = unknown>(url: string, key: string, opts?: unknown): any;
  export type SupabaseClient<T = unknown> = any;
}

declare module 'zod' {
  const z: any;
  export namespace z {
    export type infer<T> = any;
  }
  export { z };
  export type ZodError = { issues: { path: (string | number)[]; message: string }[] };
  export type ZodType<T = unknown> = any;
}

declare module 'clsx' {
  export type ClassValue = unknown;
  export function clsx(...inputs: ClassValue[]): string;
}
declare module 'tailwind-merge' {
  export function twMerge(...inputs: string[]): string;
}

declare module 'zustand' {
  export function create<T = unknown>(init?: any): any;
  const c: any;
  export default c;
}
declare module 'zustand/*';
declare module '@hookform/resolvers/zod';
declare module 'react-hook-form' {
  export function useForm<T = unknown>(opts?: any): any;
}
declare module 'framer-motion' {
  export const motion: any;
  export const AnimatePresence: (p: any) => any;
  export function useReducedMotion(): boolean;
  export function useInView(...a: any[]): boolean;
}
declare module '*.css';

declare module 'lucide-react' {
  export type LucideIcon = (props: Record<string, unknown>) => any;
  export const AlertCircle: LucideIcon, AlertTriangle: LucideIcon, ArrowLeft: LucideIcon,
    ArrowRight: LucideIcon, BadgeCheck: LucideIcon, BarChart3: LucideIcon, Boxes: LucideIcon,
    Check: LucideIcon, CheckCircle2: LucideIcon, ChevronLeft: LucideIcon, ChevronRight: LucideIcon,
    Copy: LucideIcon, Droplet: LucideIcon, ExternalLink: LucideIcon, Flower2: LucideIcon,
    FolderTree: LucideIcon, Heart: LucideIcon, History: LucideIcon, Layers: LucideIcon,
    LayoutDashboard: LucideIcon, Loader2: LucideIcon, LogOut: LucideIcon, Megaphone: LucideIcon,
    Menu: LucideIcon, MessageCircle: LucideIcon, Minus: LucideIcon, Newspaper: LucideIcon,
    Package: LucideIcon, PackageSearch: LucideIcon, Pencil: LucideIcon, Plus: LucideIcon,
    RotateCcw: LucideIcon, ScrollText: LucideIcon, Search: LucideIcon, Settings: LucideIcon,
    Shield: LucideIcon, ShoppingBag: LucideIcon, SlidersHorizontal: LucideIcon, Sparkles: LucideIcon,
    Star: LucideIcon, Tag: LucideIcon, Ticket: LucideIcon, Trash2: LucideIcon, Truck: LucideIcon,
    Upload: LucideIcon, Users: LucideIcon, Wallet: LucideIcon, XCircle: LucideIcon, X: LucideIcon,
    HelpCircle: LucideIcon, FileText: LucideIcon;
}
