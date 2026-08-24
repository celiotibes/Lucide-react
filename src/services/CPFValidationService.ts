/**
 * CPF Validation Service
 * Valida CPF com dígitos verificadores conforme Lei 12.682/2012
 * Estrutura: XXX.XXX.XXX-XX (11 dígitos, 2 dígitos verificadores)
 */

export class CPFValidationService {
  /**
   * Validar CPF completo com ambos os dígitos verificadores
   */
  isValidCPF(cpf: string): boolean {
    // Remover formatação
    const cleanCPF = this.cleanCPF(cpf);

    // Verificações básicas
    if (cleanCPF.length !== 11) {
      return false;
    }

    // Não permitir CPF com todos os dígitos iguais (CPF inválido por definição)
    if (this.isAllSameDigit(cleanCPF)) {
      return false;
    }

    // Validar primeiro dígito verificador
    if (!this.isValidFirstCheckDigit(cleanCPF)) {
      return false;
    }

    // Validar segundo dígito verificador
    if (!this.isValidSecondCheckDigit(cleanCPF)) {
      return false;
    }

    return true;
  }

  /**
   * Calcular primeiro dígito verificador (posição 9)
   */
  calculateFirstCheckDigit(cpfBase: string): string {
    const weights = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;

    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpfBase[i], 10) * weights[i];
    }

    const remainder = sum % 11;
    return remainder < 2 ? '0' : String(11 - remainder);
  }

  /**
   * Calcular segundo dígito verificador (posição 10)
   */
  calculateSecondCheckDigit(cpfWithFirstDigit: string): string {
    const weights = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;

    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpfWithFirstDigit[i], 10) * weights[i];
    }

    const remainder = sum % 11;
    return remainder < 2 ? '0' : String(11 - remainder);
  }

  /**
   * Verificar se o primeiro dígito verificador está correto
   */
  private isValidFirstCheckDigit(cpf: string): boolean {
    const firstDigit = this.calculateFirstCheckDigit(cpf.substring(0, 9));
    return firstDigit === cpf[9];
  }

  /**
   * Verificar se o segundo dígito verificador está correto
   */
  private isValidSecondCheckDigit(cpf: string): boolean {
    const secondDigit = this.calculateSecondCheckDigit(cpf.substring(0, 10));
    return secondDigit === cpf[10];
  }

  /**
   * Limpar formatação do CPF
   */
  private cleanCPF(cpf: string): string {
    return cpf.replace(/[^\d]/g, '');
  }

  /**
   * Verificar se todos os dígitos são iguais
   */
  private isAllSameDigit(cpf: string): boolean {
    return /^(\d)\1{10}$/.test(cpf);
  }

  /**
   * Formatar CPF para visualização
   * XXX.XXX.XXX-XX
   */
  formatCPF(cpf: string): string {
    const clean = this.cleanCPF(cpf);

    if (clean.length !== 11) {
      return cpf; // Retornar como está se não tiver 11 dígitos
    }

    return `${clean.substring(0, 3)}.${clean.substring(3, 6)}.${clean.substring(6, 9)}-${clean.substring(9, 11)}`;
  }

  /**
   * Extrair dígitos de verificação
   */
  getCheckDigits(cpf: string): { firstDigit: string; secondDigit: string } {
    const clean = this.cleanCPF(cpf);

    if (clean.length !== 11) {
      return { firstDigit: '', secondDigit: '' };
    }

    return {
      firstDigit: clean[9],
      secondDigit: clean[10],
    };
  }

  /**
   * Gerar CPF válido (para testes apenas)
   * @deprecated Apenas para testes, não use em produção
   */
  generateValidCPFForTesting(): string {
    // Gerar 9 primeiros dígitos aleatórios
    let cpf = '';
    for (let i = 0; i < 9; i++) {
      cpf += Math.floor(Math.random() * 10);
    }

    // Calcular dígitos verificadores
    const firstDigit = this.calculateFirstCheckDigit(cpf);
    cpf += firstDigit;

    const secondDigit = this.calculateSecondCheckDigit(cpf);
    cpf += secondDigit;

    return cpf;
  }

  /**
   * Validar e retornar feedback detalhado
   */
  validateWithFeedback(cpf: string): {
    valid: boolean;
    formatted: string;
    errors: string[];
  } {
    const errors: string[] = [];
    const clean = this.cleanCPF(cpf);

    if (clean.length !== 11) {
      errors.push(`CPF deve ter 11 dígitos (tem ${clean.length})`);
    }

    if (this.isAllSameDigit(clean)) {
      errors.push('CPF com todos os dígitos iguais é inválido');
    }

    if (clean.length === 11 && !this.isValidFirstCheckDigit(clean)) {
      errors.push('Primeiro dígito verificador incorreto');
    }

    if (clean.length === 11 && !this.isValidSecondCheckDigit(clean)) {
      errors.push('Segundo dígito verificador incorreto');
    }

    return {
      valid: errors.length === 0,
      formatted: this.formatCPF(cpf),
      errors,
    };
  }
}
