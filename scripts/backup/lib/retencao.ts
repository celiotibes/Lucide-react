/** Política de retenção — lógica pura, sem I/O, para poder ser lida (e revisada) sem precisar
 * rodar rclone. `enviar-backup.ts` chama estas funções; nada aqui sabe o que é um "remote".
 *
 * POR QUE ESTA POLÍTICA (avô-pai-filho simplificado, três séries independentes):
 *
 * O caso de uso é reconstituição contábil pericial — o arquivo pode precisar provar algo anos
 * depois de gerado, inclusive depois que o processo já "esfriou" e voltou (recurso,
 * cumprimento de sentença). Isso pede um horizonte de retenção bem mais longo do que backup
 * de aplicação comum, mas manter TODO diário para sempre custa espaço sem ganho real — o que
 * importa para uma perícia futura é "o snapshot daquele mês existiu e fecha", não "todo dia
 * daquele mês".
 *
 * Três séries independentes (diários, semanais, mensais), cada envio manda uma cópia para
 * cada série a que pertence:
 *   - diários: toda execução. Retenção curta (padrão 14 dias) — cobre "percebi um problema
 *     esta semana e quero o snapshot de terça", não recuperação de longo prazo.
 *   - semanais: só no dia da semana configurado (padrão domingo). Retenção de alguns meses
 *     (padrão 90 dias ≈ 13 semanas) — cobre o intervalo entre "esqueci de olhar por um tempo"
 *     e "isso já é caso arquivado".
 *   - mensais: só no dia do mês configurado (padrão dia 1). Retenção de anos (padrão 3650
 *     dias = 10 anos — o teto geral de prescrição do art. 205 do Código Civil; não é o prazo
 *     de toda ação possível sobre locação, alguns são mais curtos, mas serve como teto seguro
 *     por padrão dado que o custo de guardar snapshots mensais de um banco desse porte é
 *     baixíssimo perto do risco de precisar e não ter. `reterDias: 0` nesta série desliga a
 *     poda — "nunca apagar" — para quem preferir não decidir um prazo).
 *
 * Cada série é uma cópia separada, não uma "promoção" do diário para o semanal: mais simples
 * de implementar e de auditar (cada pasta no remote conta sua própria história), ao custo de
 * enviar o mesmo arquivo até três vezes no mesmo dia (raro: só quando domingo E dia 1
 * coincidem). Esse custo é desprezível para um arquivo de banco de dados contábil.
 */

export type Categoria = "diarios" | "semanais" | "mensais";

export const CATEGORIAS: readonly Categoria[] = ["diarios", "semanais", "mensais"];

export interface PoliticaRetencao {
  diarios: { reterDias: number };
  semanais: { reterDias: number; diaISO: number }; // 1=segunda … 7=domingo
  mensais: { reterDias: number; diaDoMes: number }; // 1..31
}

export const POLITICA_PADRAO: PoliticaRetencao = {
  diarios: { reterDias: 14 },
  semanais: { reterDias: 90, diaISO: 7 },
  mensais: { reterDias: 3650, diaDoMes: 1 },
};

/** Dia ISO (1=segunda … 7=domingo) na hora LOCAL — de propósito local, não UTC: quem lê
 * "todo domingo" num crontab pensa no fuso do servidor, e é nesse mesmo fuso que o cron
 * dispara. Misturar UTC aqui só causaria confusão de "por que rodou sábado à noite e não
 * contou como domingo". */
function diaIsoLocal(data: Date): number {
  return ((data.getDay() + 6) % 7) + 1;
}

/** Quais séries este envio (feito agora) pertence. Sempre inclui "diarios"; "semanais" e
 * "mensais" dependem do calendário, mais o que for passado em `forcar` (para o operador cobrir
 * manualmente um dia em que o cron não rodou — ver README, seção "o que fazer quando falha"). */
export function categoriasDoEnvio(agora: Date, politica: PoliticaRetencao, forcar: Set<Categoria> = new Set()): Categoria[] {
  const categorias = new Set<Categoria>(["diarios", ...forcar]);
  if (diaIsoLocal(agora) === politica.semanais.diaISO) categorias.add("semanais");
  if (agora.getDate() === politica.mensais.diaDoMes) categorias.add("mensais");
  return CATEGORIAS.filter((c) => categorias.has(c));
}

export interface ArquivoComData {
  caminho: string;
  modificadoEm: Date;
}

/** Quais arquivos já passaram do prazo de retenção desta série. `reterDias <= 0` é o
 * interruptor de "nunca apagar" (usado por padrão nos mensais, se o dono optar por 0). */
export function arquivosParaApagar<T extends ArquivoComData>(arquivos: T[], agora: Date, reterDias: number): T[] {
  if (reterDias <= 0) return [];
  const limiteMs = reterDias * 24 * 60 * 60 * 1000;
  return arquivos.filter((a) => agora.getTime() - a.modificadoEm.getTime() > limiteMs);
}

export function reterDiasDaCategoria(politica: PoliticaRetencao, categoria: Categoria): number {
  return politica[categoria].reterDias;
}
