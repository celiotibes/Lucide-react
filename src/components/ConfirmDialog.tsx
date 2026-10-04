import { useEffect, useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  cancelText = "Cancelar",
  confirmText = "Confirmar",
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogId = `confirm-dialog-${useId().replace(/:/g, "")}`;

  // Focus cancel button when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => cancelButtonRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Handle Escape key to cancel
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  // Handle click outside the dialog to cancel
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const backdrop = e.currentTarget;
    if (e.target === backdrop) {
      onCancel();
    }
  };

  if (!isOpen) {
    return null;
  }

  const titleId = `${dialogId}-title`;
  const descId = `${dialogId}-desc`;

  return (
    <div
      id={dialogId}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          borderRadius: "8px",
          border: "1px solid var(--line)",
          backgroundColor: "var(--surface)",
          color: "var(--ink)",
          padding: 0,
          boxShadow: "var(--shadow-hover)",
          maxWidth: "90vw",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div style={{ padding: "20px 24px" }}>
          <div
            id={titleId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: isDanger ? "var(--warn)" : "var(--ink)",
            }}
          >
            {isDanger && <AlertTriangle size={20} />}
            {title}
          </div>

          <div
            id={descId}
            style={{
              fontSize: "14px",
              lineHeight: 1.5,
              color: "var(--ink)",
              marginBottom: "20px",
              whiteSpace: "pre-wrap",
              wordWrap: "break-word",
            }}
          >
            {message}
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}
          >
            <button
              ref={cancelButtonRef}
              className="btn"
              onClick={onCancel}
              style={{
                order: 2,
              }}
            >
              {cancelText}
            </button>
            <button
              className={`btn ${isDanger ? "danger" : "primary"}`}
              onClick={onConfirm}
              style={{
                order: 1,
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
