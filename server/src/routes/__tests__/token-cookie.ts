/** Extrai o token de sessão do cookie `session_token` definido pelo login, como um navegador faria.
 * O login não devolve o token no corpo JSON (SEC-015: fica só no cookie httpOnly). */
export function tokenDoCookie(resp: { headers: Record<string, unknown> }): string {
  const cookies = ([] as string[]).concat((resp.headers["set-cookie"] as string[] | string | undefined) ?? []);
  const cookie = cookies.find((c) => c.startsWith("session_token="));
  if (!cookie) throw new Error("O login não definiu o cookie session_token");
  return decodeURIComponent(cookie.split(";")[0].slice("session_token=".length));
}
