import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';

interface Reparo {
  id: string;
  contestacao_id: string;
  status: 'pendente' | 'orcado' | 'aprovado' | 'agendado' | 'em_execucao' | 'concluido';
  orcamento_valor?: number;
  orcamento_data?: string;
  orcamento_fornecedor?: string;
  data_agendamento?: string;
  data_inicio_execucao?: string;
  descricao_trabalho_realizado?: string;
}

interface Contestacao {
  id: string;
  motivo: string;
  descricaoDesacordo: string;
  dataAbertura: string;
}

const CORES = {
  pendente: '#ff9800',
  orcado: '#2196f3',
  aprovado: '#4caf50',
  agendado: '#9c27b0',
  em_execucao: '#f44336',
  concluido: '#4caf50',
};

const LABELS = {
  pendente: 'Pendente',
  orcado: 'Orçado',
  aprovado: 'Aprovado',
  agendado: 'Agendado',
  em_execucao: 'Em Execução',
  concluido: 'Concluído',
};

export default function TelaDetalhReparo() {
  const { reparoId } = useLocalSearchParams<{ reparoId: string }>();
  const router = useRouter();

  const [reparo, setReparo] = useState<Reparo | null>(null);
  const [contestacao, setContestacao] = useState<Contestacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  const [novoStatus, setNovoStatus] = useState<string>('');
  const [descricaoTrabalho, setDescricaoTrabalho] = useState('');

  useEffect(() => {
    buscarDetalhesReparo();
  }, [reparoId]);

  const buscarDetalhesReparo = async () => {
    try {
      // Simular busca do reparo
      const res = await fetch(`/api/reparos/${reparoId}`, {
        method: 'GET',
      });

      const data = await res.json();

      if (res.ok) {
        setReparo(data.reparo);
        setContestacao(data.contestacao);
        setNovoStatus(data.reparo.status);
      } else {
        Alert.alert('Erro', 'Não foi possível carregar os detalhes do reparo');
      }
    } catch (erro) {
      console.error('Erro ao buscar detalhes:', erro);
      Alert.alert('Erro', 'Erro ao buscar informações do reparo');
    } finally {
      setCarregando(false);
    }
  };

  const selecionarFoto = async (tipo: 'antes' | 'durante' | 'depois') => {
    try {
      const resultado = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      });

      if (!resultado.canceled && resultado.assets.length > 0) {
        const uri = resultado.assets[0].uri;
        setFotos([...fotos, uri]);
      }
    } catch (erro) {
      Alert.alert('Erro', 'Não foi possível acessar a câmera');
    }
  };

  const galeria = async () => {
    try {
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7,
      });

      if (!resultado.canceled) {
        const novasFotos = resultado.assets.map((asset) => asset.uri);
        setFotos([...fotos, ...novasFotos]);
      }
    } catch (erro) {
      Alert.alert('Erro', 'Não foi possível acessar a galeria');
    }
  };

  const enviarFotosEAtualizarStatus = async () => {
    if (fotos.length === 0 && novoStatus === reparo?.status) {
      Alert.alert('Erro', 'Selecione pelo menos uma foto ou mude o status');
      return;
    }

    setEnviandoFotos(true);

    try {
      // Upload das fotos
      for (const fotoUri of fotos) {
        const formData = new FormData();
        formData.append('reparoId', reparoId!);
        formData.append('foto', {
          uri: fotoUri,
          name: `foto-${Date.now()}.jpg`,
          type: 'image/jpeg',
        } as any);
        formData.append('tipo', 'durante'); // ou antes/depois

        const resUpload = await fetch('/api/reparos/upload-foto', {
          method: 'POST',
          body: formData,
        });

        if (!resUpload.ok) {
          throw new Error('Erro ao fazer upload da foto');
        }
      }

      // Atualizar status
      if (novoStatus !== reparo?.status) {
        const resStatus = await fetch(`/api/reparos/${reparoId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: novoStatus,
            descricao: descricaoTrabalho,
          }),
        });

        if (!resStatus.ok) {
          throw new Error('Erro ao atualizar status');
        }
      }

      Alert.alert('Sucesso', 'Fotos e status atualizados com sucesso!');
      setFotos([]);
      setDescricaoTrabalho('');
      buscarDetalhesReparo();
    } catch (erro) {
      Alert.alert('Erro', 'Erro ao enviar fotos ou atualizar status');
    } finally {
      setEnviandoFotos(false);
    }
  };

  if (carregando) {
    return (
      <View style={styles.containerCarregando}>
        <ActivityIndicator size="large" color="#2196f3" />
      </View>
    );
  }

  if (!reparo || !contestacao) {
    return (
      <View style={styles.containerErro}>
        <Text style={styles.textoErro}>Reparo não encontrado</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.botaoVoltar}>
          <Text style={styles.textoBotao}>← Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Cabeçalho com Status */}
      <LinearGradient colors={['#2196f3', '#1976d2']} style={styles.header}>
        <Text style={styles.titulo}>Detalhes do Reparo</Text>
        <View
          style={[
            styles.badgeStatus,
            { backgroundColor: CORES[reparo.status as keyof typeof CORES] },
          ]}
        >
          <Text style={styles.textoBadge}>{LABELS[reparo.status as keyof typeof LABELS]}</Text>
        </View>
      </LinearGradient>

      {/* Informações da Contestação */}
      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Informações da Contestação</Text>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Motivo</Text>
            <Text style={styles.valor}>{contestacao.motivo}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Descrição</Text>
            <Text style={styles.valor}>{contestacao.descricaoDesacordo}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Aberta em</Text>
            <Text style={styles.valor}>{new Date(contestacao.dataAbertura).toLocaleDateString('pt-BR')}</Text>
          </View>
        </View>
      </View>

      {/* Informações do Reparo */}
      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Informações do Reparo</Text>

        <View style={styles.card}>
          {reparo.orcamento_valor && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Orçamento</Text>
              <Text style={styles.valor}>R$ {reparo.orcamento_valor.toFixed(2)}</Text>
            </View>
          )}

          {reparo.orcamento_fornecedor && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Fornecedor</Text>
              <Text style={styles.valor}>{reparo.orcamento_fornecedor}</Text>
            </View>
          )}

          {reparo.data_agendamento && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Agendado para</Text>
              <Text style={styles.valor}>{new Date(reparo.data_agendamento).toLocaleDateString('pt-BR')}</Text>
            </View>
          )}

          {reparo.data_inicio_execucao && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Início da Execução</Text>
              <Text style={styles.valor}>{new Date(reparo.data_inicio_execucao).toLocaleDateString('pt-BR')}</Text>
            </View>
          )}

          {reparo.descricao_trabalho_realizado && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Trabalho Realizado</Text>
              <Text style={styles.valor}>{reparo.descricao_trabalho_realizado}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Seleção de Novo Status */}
      {reparo.status !== 'concluido' && (
        <View style={styles.secao}>
          <Text style={styles.tituloSecao}>Atualizar Status</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Novo Status</Text>

            {['em_execucao', 'concluido'].map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.opcaoStatus,
                  novoStatus === status && styles.opcaoStatusSelecionada,
                ]}
                onPress={() => setNovoStatus(status)}
              >
                <Text
                  style={[
                    styles.textoOpcaoStatus,
                    novoStatus === status && styles.textoOpcaoStatusSelecionado,
                  ]}
                >
                  {LABELS[status as keyof typeof LABELS]}
                </Text>
              </TouchableOpacity>
            ))}

            {novoStatus === 'concluido' && (
              <View style={styles.inputArea}>
                <Text style={styles.label}>Descrição do Trabalho Realizado</Text>
                <TextInput
                  style={styles.textarea}
                  placeholder="Descreva o trabalho realizado..."
                  value={descricaoTrabalho}
                  onChangeText={setDescricaoTrabalho}
                  multiline
                  numberOfLines={4}
                  placeholderTextColor="#999"
                />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Upload de Fotos */}
      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Fotos do Reparo</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Adicionar Fotos</Text>

          <View style={styles.botoesCamera}>
            <TouchableOpacity style={styles.botaoCamera} onPress={() => selecionarFoto('antes')}>
              <Text style={styles.textoBotao}>📷 Câmera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.botaoGaleria} onPress={galeria}>
              <Text style={styles.textoBotao}>🖼️ Galeria</Text>
            </TouchableOpacity>
          </View>

          {/* Grid de Fotos */}
          {fotos.length > 0 && (
            <View style={styles.gridFotos}>
              {fotos.map((foto, idx) => (
                <View key={idx} style={styles.containerFoto}>
                  <Image source={{ uri: foto }} style={styles.foto} />
                  <TouchableOpacity
                    style={styles.botaoRemover}
                    onPress={() => setFotos(fotos.filter((_, i) => i !== idx))}
                  >
                    <Text style={styles.textoRemover}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.contadorFotos}>{fotos.length} foto(s) selecionada(s)</Text>
        </View>
      </View>

      {/* Botões de Ação */}
      <View style={styles.secao}>
        <TouchableOpacity
          style={[styles.botaoPrincipal, enviandoFotos && styles.botaoDesabilitado]}
          onPress={enviarFotosEAtualizarStatus}
          disabled={enviandoFotos}
        >
          <Text style={styles.textoBotaoPrincipal}>
            {enviandoFotos ? '⏳ Enviando...' : '✓ Enviar Fotos e Atualizar'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.botaoSecundario} onPress={() => router.back()}>
          <Text style={styles.textoBotao}>← Voltar</Text>
        </TouchableOpacity>
      </View>

      {/* Espaço Final */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// Importação necessária para TextInput
import { TextInput } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerCarregando: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  containerErro: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  textoErro: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  badgeStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  textoBadge: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  secao: {
    padding: 16,
  },
  tituloSecao: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
  },
  infoRow: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  valor: {
    fontSize: 14,
    color: '#333',
  },
  botoesCamera: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  botaoCamera: {
    flex: 1,
    backgroundColor: '#2196f3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  botaoGaleria: {
    flex: 1,
    backgroundColor: '#4caf50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  textoBotao: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  gridFotos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  containerFoto: {
    position: 'relative',
    width: '32%',
  },
  foto: {
    width: '100%',
    height: 100,
    borderRadius: 8,
  },
  botaoRemover: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#f44336',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textoRemover: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  contadorFotos: {
    fontSize: 12,
    color: '#999',
  },
  opcaoStatus: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#ddd',
  },
  opcaoStatusSelecionada: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
  },
  textoOpcaoStatus: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  textoOpcaoStatusSelecionado: {
    color: '#2196f3',
    fontWeight: '600',
  },
  inputArea: {
    marginTop: 12,
  },
  textarea: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    minHeight: 100,
    color: '#333',
  },
  botaoPrincipal: {
    backgroundColor: '#4caf50',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  botaoDesabilitado: {
    backgroundColor: '#ccc',
  },
  textoBotaoPrincipal: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  botaoSecundario: {
    backgroundColor: '#f0f0f0',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  botaoVoltar: {
    backgroundColor: '#2196f3',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
});
