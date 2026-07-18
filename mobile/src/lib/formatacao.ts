import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatarData(data: string | Date): string {
  const d = typeof data === 'string' ? new Date(data) : data;
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

export function formatarDataHora(data: string | Date): string {
  const d = typeof data === 'string' ? new Date(data) : data;
  return format(d, 'dd/MM/yyyy HH:mm', { locale: ptBR });
}

export function formatarMoeda(valor: string | number): string {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
}
