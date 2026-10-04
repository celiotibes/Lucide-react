import { useId, useRef, useState, type FormEvent } from "react";
import { Loader2, LogIn } from "lucide-react";
import { useSessao } from "../hooks/useSessao";

/** Tela de login do servidor (POST /api/auth/login). Só aparece sob demanda — o app local-first
 * não exige login. A senha vive apenas no estado do campo enquanto se digita: é enviada no
 * corpo do POST e descartada logo em seguida; nada vai para localStorage/sessionStorage, e o
 * token de sessão nem chega ao JS (fica no cookie httpOnly). */
export function LoginView({ aoEntrar }: { aoEntrar?: () => void }) {
  const { entrar } = useSessao();
  const idEmail = useId();
  const idSenha = useId();
  const idErro = useId();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const campoSenha = useRef<HTMLInputElement>(null);
  const campoEmail = useRef<HTMLInputElement>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (carregando) return;
    if (!email.trim() || !senha) {
      setErro("Informe o e-mail e a senha.");
      (email.trim() ? campoSenha : campoEmail).current?.focus();
      return;
    }
    setErro(null);
    setCarregando(true);
    try {
      const resultado = await entrar(email, senha);
      setSenha(""); // a senha não fica na memória da tela depois do envio
      if (resultado.ok) {
        aoEntrar?.();
      } else {
        setErro(resultado.mensagem ?? null);
        campoSenha.current?.focus();
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>Entrar no servidor</h2>
      <p style={{ color: "var(--ink-soft)", marginTop: -8, fontSize: 13.5 }}>
        Necessário apenas para as funções que usam o servidor. O restante do sistema continua
        funcionando offline, sem login.
      </p>
      <form onSubmit={enviar} noValidate aria-busy={carregando}>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginBottom: 12 }}>
          <label htmlFor={idEmail}>
            E-mail
            <input
              ref={campoEmail}
              id={idEmail}
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={carregando}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? idErro : undefined}
            />
          </label>
          <label htmlFor={idSenha}>
            Senha
            <input
              ref={campoSenha}
              id={idSenha}
              type="password"
              name="senha"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              disabled={carregando}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? idErro : undefined}
            />
          </label>
        </div>
        {erro && (
          <div id={idErro} role="alert" className="aviso-caixa" style={{ marginTop: 0, marginBottom: 12 }}>
            {erro}
          </div>
        )}
        <button type="submit" className="btn primary" disabled={carregando}>
          {carregando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <LogIn size={14} aria-hidden="true" />}
          {carregando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
