import { useCallback, useId, useState, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";

interface DropzoneProps {
  onArquivos: (arquivos: File[]) => void;
  aceitar?: string;
  ajuda?: string;
}

export function Dropzone({ onArquivos, aceitar, ajuda }: DropzoneProps) {
  const [arrastando, setArrastando] = useState(false);
  const inputId = useId();

  const tratarSolto = useCallback(
    (evento: DragEvent<HTMLDivElement>) => {
      evento.preventDefault();
      setArrastando(false);
      const arquivos = Array.from(evento.dataTransfer.files);
      if (arquivos.length) onArquivos(arquivos);
    },
    [onArquivos],
  );

  return (
    <div
      className={`dropzone${arrastando ? " arrastando" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={tratarSolto}
    >
      <UploadCloud size={30} strokeWidth={1.5} style={{ marginBottom: 10 }} />
      <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Arraste arquivos aqui ou clique para selecionar</p>
      <p style={{ margin: 0, fontSize: 13 }}>{ajuda ?? "OFX, CSV, PDF (extrato ou fatura) ou foto de boleto/recibo"}</p>
      <label htmlFor={inputId} className="btn" style={{ marginTop: 14, display: "inline-flex" }}>
        Selecionar arquivos
      </label>
      <input
        id={inputId}
        type="file"
        multiple
        accept={aceitar}
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          if (arquivos.length) onArquivos(arquivos);
          e.target.value = "";
        }}
      />
    </div>
  );
}
