// Formaliza a comparação cruzada de candidatos/moradores de coliving que
// hoje é feita fora do sistema (formulário externo + comparação manual
// colada num assistente de IA — docs/39-modulo-coliving-triagem-e-matching-
// proposta.md). Função pura e determinística — nunca ML, nunca aprovação
// automática: a saída é sempre `{ scoreGeral, pontosAtrito, alertasCriticos
// }`, porque foi a lista de pontos de atrito (não o número isolado) que deu
// confiança ao exemplo real que originou esta especificação.
//
// Vetor comportamental (escala 1-3), 5 variáveis com peso entram na média
// ponderada; tabagismo e pets são filtros de exclusão checados à parte,
// nunca descontados da nota — mesma lógica do exemplo real (pets
// "neutralizado" quando nenhum candidato tem animal, mesmo com níveis
// declarados diferentes).

export type NivelVetor = 1 | 2 | 3;

export type QuadroAlergico =
  | 'nenhuma'
  | 'respiratoria'
  | 'animais'
  | 'alimentar'
  | 'medicamentosa_insetos'
  | 'outras'
  | 'prefiro_nao_responder';

export interface PerfilConvivencia {
  v1Limpeza: NivelVetor;
  v2Ruido: NivelVetor;
  v3Rotina: NivelVetor;
  v4Fumo: NivelVetor;
  v5Pets: NivelVetor;
  v6Dieta: NivelVetor;
  v7Conflito: NivelVetor;
  temPet: boolean;
  quadroAlergico: QuadroAlergico;
}

export interface PontoAtrito {
  variavel: 'limpeza' | 'ruido' | 'rotina' | 'dieta' | 'conflito';
  descricao: string;
}

export interface AlertaCritico {
  tipo: 'fumo' | 'pets' | 'saude';
  descricao: string;
}

export type ClassificacaoCompatibilidade =
  | 'alta_compatibilidade'
  | 'pontos_de_atencao'
  | 'atrito_relevante'
  | 'baixa_compatibilidade';

export interface ResultadoCompatibilidade {
  scoreGeral: number;
  classificacao: ClassificacaoCompatibilidade;
  pontosAtrito: PontoAtrito[];
  alertasCriticos: AlertaCritico[];
}

export const RUBRICA_NIVEL: Record<
  'limpeza' | 'ruido' | 'rotina' | 'fumo' | 'pets' | 'dieta' | 'conflito',
  Record<NivelVetor, string>
> = {
  limpeza: { 1: 'Básico', 2: 'Moderado', 3: 'Rigoroso' },
  ruido: { 1: 'Baixa tolerância', 2: 'Tolerância moderada', 3: 'Alta tolerância' },
  rotina: { 1: 'Diurno', 2: 'Misto', 3: 'Noturno' },
  fumo: { 1: 'Exige ambiente livre de fumo', 2: 'Tolera fumo em área externa', 3: 'Fumante' },
  pets: { 1: 'Baixa tolerância a pets', 2: 'Tolerância restrita', 3: 'Alta tolerância a pets' },
  dieta: { 1: 'Onívoro', 2: 'Vegetariano/vegano', 3: 'Restrição alimentar severa' },
  conflito: { 1: 'Evitação', 2: 'Prefere mediação', 3: 'Comunicação direta' },
};

const RUBRICA_VARIAVEL: Record<PontoAtrito['variavel'], string> = {
  limpeza: 'limpeza nas áreas comuns',
  ruido: 'tolerância a ruído/visitas',
  rotina: 'cronotipo de rotina',
  dieta: 'hábitos alimentares',
  conflito: 'resolução de conflitos',
};

interface VariavelComPeso {
  variavel: PontoAtrito['variavel'];
  peso: number;
  a: NivelVetor;
  b: NivelVetor;
}

function similaridade(a: NivelVetor, b: NivelVetor): number {
  return 1 - Math.abs(a - b) / 2;
}

export function calcularCompatibilidade(a: PerfilConvivencia, b: PerfilConvivencia): ResultadoCompatibilidade {
  const variaveis: VariavelComPeso[] = [
    { variavel: 'limpeza', peso: 3, a: a.v1Limpeza, b: b.v1Limpeza },
    { variavel: 'ruido', peso: 3, a: a.v2Ruido, b: b.v2Ruido },
    { variavel: 'rotina', peso: 2, a: a.v3Rotina, b: b.v3Rotina },
    { variavel: 'dieta', peso: 1, a: a.v6Dieta, b: b.v6Dieta },
    { variavel: 'conflito', peso: 2, a: a.v7Conflito, b: b.v7Conflito },
  ];

  const somaPesos = variaveis.reduce((soma, v) => soma + v.peso, 0);
  const somaPonderada = variaveis.reduce((soma, v) => soma + v.peso * similaridade(v.a, v.b), 0);
  const scoreGeral = arredondar((somaPonderada / somaPesos) * 100);

  const pontosAtrito: PontoAtrito[] = variaveis
    .filter((v) => v.a !== v.b)
    .sort((v1, v2) => v2.peso * Math.abs(v2.a - v2.b) - v1.peso * Math.abs(v1.a - v1.b))
    .map((v) => ({
      variavel: v.variavel,
      descricao: `Divergência em ${RUBRICA_VARIAVEL[v.variavel]}: ${RUBRICA_NIVEL[v.variavel][v.a]} × ${RUBRICA_NIVEL[v.variavel][v.b]}.`,
    }));

  const alertasCriticos: AlertaCritico[] = [
    ...avaliarFumo(a, b),
    ...avaliarPets(a, b),
    ...avaliarSaude(a, b),
  ];

  return { scoreGeral, classificacao: classificar(scoreGeral), pontosAtrito, alertasCriticos };
}

function avaliarFumo(a: PerfilConvivencia, b: PerfilConvivencia): AlertaCritico[] {
  const desvio = Math.abs(a.v4Fumo - b.v4Fumo);
  if (desvio === 0) return [];
  if (a.v4Fumo === 1 && b.v4Fumo === 3) {
    return [{ tipo: 'fumo', descricao: 'Incompatibilidade crítica: um candidato exige ambiente livre de fumo e o outro é fumante ativo.' }];
  }
  if (a.v4Fumo === 3 && b.v4Fumo === 1) {
    return [{ tipo: 'fumo', descricao: 'Incompatibilidade crítica: um candidato é fumante ativo e o outro exige ambiente livre de fumo.' }];
  }
  return [{ tipo: 'fumo', descricao: 'Divergência moderada de tolerância a fumo — confirmar se o uso em área externa é aceitável para ambos.' }];
}

function avaliarPets(a: PerfilConvivencia, b: PerfilConvivencia): AlertaCritico[] {
  if (!a.temPet && !b.temPet) return [];
  if (a.v5Pets === 1 && b.temPet) {
    return [{ tipo: 'pets', descricao: 'Incompatibilidade crítica: um candidato declara intolerância/alergia severa a pets e o outro possui animal.' }];
  }
  if (b.v5Pets === 1 && a.temPet) {
    return [{ tipo: 'pets', descricao: 'Incompatibilidade crítica: um candidato possui animal e o outro declara intolerância/alergia severa a pets.' }];
  }
  if ((a.temPet && b.v5Pets === 2) || (b.temPet && a.v5Pets === 2)) {
    return [{ tipo: 'pets', descricao: 'Tolerância restrita a pets declarada — confirmar porte/comportamento do animal antes de aprovar.' }];
  }
  return [];
}

function avaliarSaude(a: PerfilConvivencia, b: PerfilConvivencia): AlertaCritico[] {
  const alertas: AlertaCritico[] = [];
  if (a.quadroAlergico === 'respiratoria' && b.v1Limpeza <= 1) {
    alertas.push({
      tipo: 'saude',
      descricao: 'Um candidato declara quadro alérgico respiratório e o outro declara nível básico de limpeza — risco de agravamento do quadro alérgico.',
    });
  }
  if (b.quadroAlergico === 'respiratoria' && a.v1Limpeza <= 1) {
    alertas.push({
      tipo: 'saude',
      descricao: 'Um candidato declara quadro alérgico respiratório e o outro declara nível básico de limpeza — risco de agravamento do quadro alérgico.',
    });
  }
  return alertas;
}

function classificar(scoreGeral: number): ClassificacaoCompatibilidade {
  if (scoreGeral >= 85) return 'alta_compatibilidade';
  if (scoreGeral >= 65) return 'pontos_de_atencao';
  if (scoreGeral >= 40) return 'atrito_relevante';
  return 'baixa_compatibilidade';
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
