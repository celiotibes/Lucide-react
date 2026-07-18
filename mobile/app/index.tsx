import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

interface Reparo {
  id: string;
  contestacao_id: string;
  status: string;
  data_agendamento?: string;
  orcamento_valor?: number;
}

const STATUS_CORES: Record<string, string> = {
  agendado: '#9c27b0',
  em_execucao: '#f44336',
  concluido: '#4caf50',
  pendente: '#ff9800',
};

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  em_execucao: 'Em Execução',
  concluido: 'Concluído',
  pendente: 'Pendente',
};

export default function HomeScreen() {
  const router = useRouter();
  const [reparos, setReparos] = useState<Reparo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);

  useEffect(() => {
    buscarReparos();
  }, []);

  const buscarReparos = async (mostrarCarregamento = true) => {
    if (mostrarCarregamento) {
      setCarregando(true);
    } else {
      setRecarregando(true);
    }

    try {
      const response = await fetch('/api/reparos/listar-pendentes', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Erro ao buscar reparos');
      }

      const data = await response.json();
      setReparos(data.reparos || []);
    } catch (erro) {
      console.error('Erro ao buscar reparos:', erro);
      Alert.alert('Erro', 'Não foi possível carregar os reparos');
    } finally {
      setCarregando(false);
      setRecarregando(false);
    }
  };

  const formatarData = (data: string | undefined) => {
    if (!data) return '-';
    return new Date(data).toLocaleDateString('pt-BR');
  };

  const renderReparoItem = ({ item }: { item: Reparo }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/reparos/${item.id}`)}
    >
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitulo}>Reparo #{item.id.substring(0, 8)}</Text>
          <Text style={styles.cardSubtitulo}>Contestação: {item.contestacao_id.substring(0, 8)}</Text>
        </View>
        <View
          style={[
            styles.badge,
            { backgroundColor: STATUS_CORES[item.status] || '#999' },
          ]}
        >
          <Text style={styles.badgeText}>
            {STATUS_LABELS[item.status] || item.status}
          </Text>
        </View>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.infoLine}>
          <Text style={styles.label}>Agendado:</Text>
          <Text style={styles.valor}>{formatarData(item.data_agendamento)}</Text>
        </View>

        {item.orcamento_valor && (
          <View style={styles.infoLine}>
            <Text style={styles.label}>Orçamento:</Text>
            <Text style={styles.valor}>R$ {item.orcamento_valor.toFixed(2)}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.linkText}>Abrir detalhes →</Text>
      </View>
    </TouchableOpacity>
  );

  if (carregando) {
    return (
      <View style={styles.containerCarregando}>
        <ActivityIndicator size="large" color="#2196f3" />
        <Text style={styles.textoCarregando}>Carregando reparos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#2196f3', '#1976d2']} style={styles.header}>
        <Text style={styles.headerTitulo}>Meus Reparos</Text>
        <Text style={styles.headerSubtitulo}>
          {reparos.length} reparo{reparos.length !== 1 ? 's' : ''} para acompanhar
        </Text>
      </LinearGradient>

      {reparos.length === 0 ? (
        <View style={styles.containerVazio}>
          <Text style={styles.textoVazio}>Nenhum reparo pendente</Text>
          <Text style={styles.textoVazioDescricao}>
            Você será notificado quando houver novos reparos para executar
          </Text>
        </View>
      ) : (
        <FlatList
          data={reparos}
          keyExtractor={(item) => item.id}
          renderItem={renderReparoItem}
          contentContainerStyle={styles.listaContainer}
          onEndReachedThreshold={0.1}
          refreshing={recarregando}
          onRefresh={() => buscarReparos(false)}
        />
      )}
    </View>
  );
}

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
  containerVazio: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  textoCarregando: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  textoVazio: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  textoVazioDescricao: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  header: {
    paddingTop: 40,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  headerTitulo: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitulo: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  listaContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cardTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  cardSubtitulo: {
    fontSize: 12,
    color: '#999',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardContent: {
    padding: 16,
  },
  infoLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  valor: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  linkText: {
    fontSize: 12,
    color: '#2196f3',
    fontWeight: '600',
  },
});
