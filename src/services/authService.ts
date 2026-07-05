/**
 * Serviço de Autenticação
 * Autenticação local com localStorage
 */

interface Usuario {
  id: string
  nome: string
  email: string
  dataCriacao: Date
  ultimoAcesso: Date
}

interface CredenciaisLogin {
  email: string
  senha: string
}

const CHAVE_USUARIO_ATUAL = 'lucide_usuario_atual'
const CHAVE_USUARIOS = 'lucide_usuarios'

export class ServicoAutenticacao {
  /**
   * Registrar novo usuário
   */
  registrar(email: string, senha: string, nome: string): { sucesso: boolean; mensagem?: string; usuarioId?: string } {
    try {
      // Validação básica
      if (!email || !senha || !nome) {
        return {
          sucesso: false,
          mensagem: 'Email, senha e nome são obrigatórios',
        }
      }

      if (!this.validarEmail(email)) {
        return {
          sucesso: false,
          mensagem: 'Email inválido',
        }
      }

      if (senha.length < 6) {
        return {
          sucesso: false,
          mensagem: 'Senha deve ter pelo menos 6 caracteres',
        }
      }

      // Verificar se usuário já existe
      const usuarios = this.listarUsuarios()
      if (usuarios.some(u => u.email === email)) {
        return {
          sucesso: false,
          mensagem: 'Email já registrado',
        }
      }

      // Criar novo usuário
      const novoUsuario: Usuario = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        nome,
        email,
        dataCriacao: new Date(),
        ultimoAcesso: new Date(),
      }

      // Salvar usuário (em produção, seria hash)
      usuarios.push({
        ...novoUsuario,
        dataCriacao: novoUsuario.dataCriacao.toISOString(),
        ultimoAcesso: novoUsuario.ultimoAcesso.toISOString(),
        senha: senha, // ⚠️ NÃO fazer isso em produção! Hash apenas!
      } as any)

      localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(usuarios))

      return {
        sucesso: true,
        usuarioId: novoUsuario.id,
      }
    } catch (erro) {
      console.error('Erro ao registrar:', erro)
      return {
        sucesso: false,
        mensagem: 'Erro ao registrar usuário',
      }
    }
  }

  /**
   * Login
   */
  login(email: string, senha: string): { sucesso: boolean; mensagem?: string; usuario?: Usuario } {
    try {
      const usuarios = this.listarUsuarios()
      const usuarioEncontrado = usuarios.find(u => u.email === email && (u as any).senha === senha)

      if (!usuarioEncontrado) {
        return {
          sucesso: false,
          mensagem: 'Email ou senha incorretos',
        }
      }

      // Atualizar último acesso
      usuarioEncontrado.ultimoAcesso = new Date().toISOString() as any

      // Atualizar na lista
      const indice = usuarios.findIndex(u => u.email === email)
      usuarios[indice] = usuarioEncontrado
      localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(usuarios))

      // Salvar usuário atual
      const usuarioAtual: Usuario = {
        id: usuarioEncontrado.id,
        nome: usuarioEncontrado.nome,
        email: usuarioEncontrado.email,
        dataCriacao: new Date(usuarioEncontrado.dataCriacao),
        ultimoAcesso: new Date(usuarioEncontrado.ultimoAcesso),
      }

      localStorage.setItem(CHAVE_USUARIO_ATUAL, JSON.stringify(usuarioAtual))

      return {
        sucesso: true,
        usuario: usuarioAtual,
      }
    } catch (erro) {
      console.error('Erro ao fazer login:', erro)
      return {
        sucesso: false,
        mensagem: 'Erro ao fazer login',
      }
    }
  }

  /**
   * Logout
   */
  logout(): boolean {
    try {
      localStorage.removeItem(CHAVE_USUARIO_ATUAL)
      return true
    } catch (erro) {
      console.error('Erro ao fazer logout:', erro)
      return false
    }
  }

  /**
   * Obter usuário atual
   */
  obterUsuarioAtual(): Usuario | null {
    try {
      const usuarioJSON = localStorage.getItem(CHAVE_USUARIO_ATUAL)
      if (!usuarioJSON) return null

      const usuario = JSON.parse(usuarioJSON)
      return {
        ...usuario,
        dataCriacao: new Date(usuario.dataCriacao),
        ultimoAcesso: new Date(usuario.ultimoAcesso),
      }
    } catch (erro) {
      console.error('Erro ao obter usuário atual:', erro)
      return null
    }
  }

  /**
   * Verificar se está logado
   */
  estaLogado(): boolean {
    return this.obterUsuarioAtual() !== null
  }

  /**
   * Listar todos os usuários (para dev apenas)
   */
  private listarUsuarios(): any[] {
    try {
      const usuariosJSON = localStorage.getItem(CHAVE_USUARIOS)
      if (!usuariosJSON) return []

      return JSON.parse(usuariosJSON)
    } catch (erro) {
      console.error('Erro ao listar usuários:', erro)
      return []
    }
  }

  /**
   * Validar email
   */
  private validarEmail(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return regex.test(email)
  }

  /**
   * Limpar dados de autenticação (para desenvolvimento)
   */
  limparDados(): boolean {
    try {
      localStorage.removeItem(CHAVE_USUARIO_ATUAL)
      localStorage.removeItem(CHAVE_USUARIOS)
      return true
    } catch (erro) {
      console.error('Erro ao limpar dados:', erro)
      return false
    }
  }
}

export const servicoAutenticacao = new ServicoAutenticacao()
