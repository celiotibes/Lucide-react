/**
 * Kit mínimo de componentes de UI usado só pelo Painel de Conferência.
 *
 * O Painel de Conferência foi originalmente escrito contra um kit de componentes estilo
 * shadcn/ui (`@/components/ui/*`) que nunca existiu neste projeto (não há Radix, não há
 * Tailwind configurado, e o alias "@/" também não existe em vite.config.ts/tsconfig — foram
 * verificados e confirmados ausentes). Sem isso, o Painel nem chegava a compilar, muito antes
 * de qualquer fetch quebrado.
 *
 * Este arquivo fornece implementações nativas (sem dependências externas) das mesmas
 * assinaturas usadas pelas telas/modais do Painel, para que o componente realmente renderize
 * e funcione. Não busca paridade visual com shadcn/ui — as classNames Tailwind repassadas
 * pelas telas continuam sendo aceitas (e ficam inertes sem Tailwind), mas o essencial
 * (estrutura, comportamento, estilo básico legível) é resolvido aqui com estilo inline.
 */
import React, { createContext, useContext, type ReactNode } from "react";

function cx(...partes: (string | undefined | false)[]): string {
  return partes.filter(Boolean).join(" ");
}

// ===== Button =====
type ButtonVariant = "default" | "outline" | "ghost" | "destructive" | "secondary";
type ButtonSize = "default" | "sm";

const CORES_BOTAO: Record<ButtonVariant, React.CSSProperties> = {
  default: { background: "#2563eb", color: "#fff", border: "1px solid #2563eb" },
  destructive: { background: "#dc2626", color: "#fff", border: "1px solid #dc2626" },
  outline: { background: "transparent", color: "inherit", border: "1px solid #cbd5e1" },
  secondary: { background: "#e2e8f0", color: "#0f172a", border: "1px solid #e2e8f0" },
  ghost: { background: "transparent", color: "inherit", border: "1px solid transparent" },
};

export function Button({
  children,
  onClick,
  disabled,
  variant = "default",
  size = "default",
  className,
  type = "button",
}: {
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        borderRadius: 6,
        fontSize: size === "sm" ? 13 : 14,
        padding: size === "sm" ? "4px 10px" : "8px 14px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        ...CORES_BOTAO[variant],
      }}
    >
      {children}
    </button>
  );
}

// ===== Badge =====
export function Badge({
  children,
  variant,
  className,
}: {
  children?: ReactNode;
  variant?: string;
  className?: string;
}) {
  const cores: Record<string, React.CSSProperties> = {
    default: { background: "#dbeafe", color: "#1e3a8a" },
    secondary: { background: "#e2e8f0", color: "#334155" },
    outline: { background: "transparent", color: "inherit", border: "1px solid #cbd5e1" },
    destructive: { background: "#fee2e2", color: "#991b1b" },
    success: { background: "#dcfce7", color: "#166534" },
    warning: { background: "#fef3c7", color: "#92400e" },
  };
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 600,
        ...(cores[variant || "default"] || cores.default),
      }}
    >
      {children}
    </span>
  );
}

// ===== Input / Textarea / Label =====
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, style, ...resto } = props;
  return (
    <input
      {...resto}
      className={className}
      style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 10px", fontSize: 14, width: "100%", ...style }}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, style, ...resto } = props;
  return (
    <textarea
      {...resto}
      className={className}
      style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 10px", fontSize: 14, width: "100%", ...style }}
    />
  );
}

export function Label({
  children,
  htmlFor,
  className,
}: {
  children?: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={className} style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
      {children}
    </label>
  );
}

// ===== Select (nativo, com API controlada compatível: value/onValueChange) =====
export function Select({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?: (valor: string) => void;
  children?: ReactNode;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onValueChange?.(e.target.value)}
      style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 10px", fontSize: 14, width: "100%" }}
    >
      {children}
    </select>
  );
}
// SelectTrigger/SelectValue existem só para compatibilidade de API com o código das telas —
// o <select> nativo acima já é o próprio "trigger" e já mostra o valor selecionado sozinho.
export function SelectTrigger(_props: { children?: ReactNode; className?: string }) {
  return null;
}
export function SelectValue(_props: { placeholder?: string }) {
  return null;
}
export function SelectContent({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function SelectItem({ value, children }: { value: string; children?: ReactNode }) {
  return <option value={value}>{children}</option>;
}

// ===== Dialog (modal simples, sem portal) =====
export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  children?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      role="presentation"
      onClick={() => onOpenChange(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
    >
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: "100%" }}>
        {children}
      </div>
    </div>
  );
}
export function DialogContent({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        background: "var(--painel-bg, #fff)",
        color: "inherit",
        borderRadius: 10,
        padding: 20,
        maxWidth: 640,
        margin: "0 auto",
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
      }}
    >
      {children}
    </div>
  );
}
export function DialogHeader({ children }: { children?: ReactNode }) {
  return <div style={{ marginBottom: 12 }}>{children}</div>;
}
export function DialogTitle({ children }: { children?: ReactNode }) {
  return <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{children}</h2>;
}
export function DialogDescription({ children }: { children?: ReactNode }) {
  return (
    <p style={{ fontSize: 13, opacity: 0.7, margin: "4px 0 0" }}>{children}</p>
  );
}
export function DialogFooter({ children }: { children?: ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>{children}</div>;
}

// ===== Table =====
export function Table({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <table className={className} style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      {children}
    </table>
  );
}
export function TableHeader({ children, className }: { children?: ReactNode; className?: string }) {
  return <thead className={className}>{children}</thead>;
}
export function TableBody({ children }: { children?: ReactNode }) {
  return <tbody>{children}</tbody>;
}
export function TableRow({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <tr className={className} style={{ borderBottom: "1px solid #e2e8f0" }}>
      {children}
    </tr>
  );
}
export function TableHead({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={className} style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>
      {children}
    </th>
  );
}
export function TableCell({
  children,
  className,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={className} colSpan={colSpan} style={{ padding: "10px 12px", verticalAlign: "middle" }}>
      {children}
    </td>
  );
}

// ===== Tabs =====
interface TabsCtxValor {
  value: string;
  onValueChange: (valor: string) => void;
}
const TabsCtx = createContext<TabsCtxValor | null>(null);

export function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string;
  onValueChange: (valor: string) => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <TabsCtx.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}
export function TabsList({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={className} style={{ display: "flex", gap: 4 }}>
      {children}
    </div>
  );
}
export function TabsTrigger({ value, children }: { value: string; children?: ReactNode }) {
  const ctx = useContext(TabsCtx);
  if (!ctx) throw new Error("TabsTrigger precisa estar dentro de <Tabs>");
  const ativa = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange(value)}
      style={{
        flex: 1,
        padding: "8px 12px",
        fontSize: 14,
        fontWeight: ativa ? 700 : 500,
        background: ativa ? "rgba(37, 99, 235, 0.1)" : "transparent",
        border: "none",
        borderBottom: ativa ? "2px solid #2563eb" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children?: ReactNode;
}) {
  const ctx = useContext(TabsCtx);
  if (!ctx) throw new Error("TabsContent precisa estar dentro de <Tabs>");
  if (ctx.value !== value) return null;
  return <div className={className}>{children}</div>;
}
