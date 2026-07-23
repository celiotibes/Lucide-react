/**
 * CRMT Marketing e Anúncios — Script de Automação (v2, auditado)
 * Cole este código em: Planilha "Central de Leads — CRMT Marketing e Anúncios 2026"
 *   > Extensões > Apps Script > cole tudo aqui > Salvar
 * Depois configure os gatilhos (Triggers) conforme instruído no final deste arquivo.
 */

var OPERATOR_EMAIL = "celiotibes@gmail.com";
var PLANILHA_CENTRAL_ID = "1wFoUCZaRPk2V1WbWyI0V4N5EC2yIZb2CNviOCPizaOQ";
var SLA_MINUTOS = 10;
var LEADS_SHEET = "Leads";
// Colunas da aba Leads (1-indexadas)
var COL = {
  ID: 1, DATA_ENTRADA: 2, NOME: 3, WHATSAPP: 4, CANAL: 5, PUBLICO: 6,
  UNIDADE: 7, STATUS: 8, ULTIMO_CONTATO: 9, MINUTOS: 10, ALERTA_SLA: 11,
  ALERTA_ENVIADO: 17
};
// Colunas das abas de imóveis na Planilha Central (0-indexadas p/ getValues):
// A=Nº(0) ... I=Status(8), J=Locatário(9), K=Início Contrato(10)
// Cabeçalho na linha 5, dados a partir da linha 6.

function checkSLA() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEADS_SHEET);
  var data = sh.getDataRange().getValues();
  for (var r = 4; r < data.length; r++) {
    var row = data[r];
    var status = row[COL.STATUS - 1];
    var dataEntrada = row[COL.DATA_ENTRADA - 1];
    var jaAlertado = row[COL.ALERTA_ENVIADO - 1];
    if (status !== "Novo" || !dataEntrada || jaAlertado == "1") continue;

    var minutos = (new Date() - new Date(dataEntrada)) / 60000;
    if (minutos > SLA_MINUTOS) {
      var nome = row[COL.NOME - 1];
      var whatsapp = String(row[COL.WHATSAPP - 1]).replace(/\D/g, "");
      if (whatsapp.indexOf("55") !== 0) whatsapp = "55" + whatsapp;
      var canal = row[COL.CANAL - 1];
      var publico = row[COL.PUBLICO - 1];
      var sugestao = publico === "Profissional"
        ? "Olá " + nome + "! Ambiente silencioso, Wi-Fi fibra e espaço para home office. Quer agendar uma visita ou tour em vídeo?"
        : "Olá " + nome + "! Kitnet completa, tudo incluso, a poucos minutos da UFSC. Posso te mandar fotos e agendar uma visita?";

      MailApp.sendEmail({
        to: OPERATOR_EMAIL,
        subject: "[URGENTE] Lead sem resposta ha " + Math.round(minutos) + " min — " + nome,
        htmlBody: "<p><b>" + nome + "</b> (" + canal + ") esta esperando resposta ha " + Math.round(minutos) + " minutos.</p>" +
          "<p><a href='https://wa.me/" + whatsapp + "?text=" + encodeURIComponent(sugestao) + "'>Abrir conversa no WhatsApp (mensagem pre-pronta)</a></p>" +
          "<p>Unidade de interesse: " + row[COL.UNIDADE - 1] + "</p>"
      });
      sh.getRange(r + 1, COL.ALERTA_ENVIADO).setValue("1");
    }
  }
}

function checkFollowUps() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEADS_SHEET);
  var data = sh.getDataRange().getValues();
  var pendentes = [];
  for (var r = 4; r < data.length; r++) {
    var row = data[r];
    if (row[COL.STATUS - 1] !== "Visitou" || !row[COL.ULTIMO_CONTATO - 1]) continue;
    var horas = (new Date() - new Date(row[COL.ULTIMO_CONTATO - 1])) / 3600000;
    if (horas >= 24 && horas < 48) {
      pendentes.push(row[COL.NOME - 1] + " — " + row[COL.UNIDADE - 1] + " (visitou ha " + Math.round(horas) + "h, oferecer fechamento)");
    }
  }
  if (pendentes.length > 0) {
    MailApp.sendEmail({
      to: OPERATOR_EMAIL,
      subject: "[Follow-up] " + pendentes.length + " lead(s) para oferta de fechamento",
      body: pendentes.join("\n")
    });
  }
}

function checkReviewRequests() {
  var central = SpreadsheetApp.openById(PLANILHA_CENTRAL_ID);
  var abas = ["Pottker 25", "Milton Sullivan 142", "Ana Maria Nunes 214"];
  var pendentes = [];
  abas.forEach(function (nomeAba) {
    var aba = central.getSheetByName(nomeAba);
    if (!aba) return;
    var data = aba.getDataRange().getValues();
    for (var r = 5; r < data.length; r++) { // dados a partir da linha 6
      var row = data[r];
      if (row[8] !== "Alugada" || !row[10]) continue;
      var dias = (new Date() - new Date(row[10])) / 86400000;
      if (dias >= 15 && dias < 16) {
        pendentes.push(nomeAba + " unidade " + row[0] + " — locatario: " + (row[9] || "sem nome registrado"));
      }
    }
  });
  if (pendentes.length > 0) {
    MailApp.sendEmail({
      to: OPERATOR_EMAIL,
      subject: "[Review] Pedir avaliacao Google/Airbnb — " + pendentes.length + " locatario(s) com 15 dias",
      body: pendentes.join("\n")
    });
  }
}

/**
 * Sincronização reversa: lead "Fechado" -> unidade correspondente vira "Alugada"
 * na Planilha Central. Localiza a unidade ESPECÍFICA pelo número no campo
 * Unidade_Interesse (ex: "Pottker 25 - Kitnet 6" -> unidade nº 6).
 * Se não houver número ou a unidade não estiver vacante, avisa por e-mail
 * em vez de chutar — nunca marca a unidade errada.
 */
function onEditLeadsSheet(e) {
  var sh = e.range.getSheet();
  if (sh.getName() !== LEADS_SHEET) return;
  if (e.range.getColumn() !== COL.STATUS) return;
  if (e.value !== "Fechado") return;

  var row = sh.getRange(e.range.getRow(), 1, 1, 17).getValues()[0];
  var unidadeInteresse = String(row[COL.UNIDADE - 1] || "");
  var nomeLocatario = row[COL.NOME - 1];
  if (!unidadeInteresse) return;

  var nomeImovel = unidadeInteresse.split(" - ")[0].trim();
  // Extrai o último número do texto DEPOIS do nome do imóvel
  // (evita capturar o "25" de "Pottker 25" ou o "142" de "Milton Sullivan 142")
  var resto = unidadeInteresse.slice(nomeImovel.length);
  var m = resto.match(/(\d+)\s*$/);
  var unitNum = m ? Number(m[1]) : null;

  var central = SpreadsheetApp.openById(PLANILHA_CENTRAL_ID);
  var aba = central.getSheetByName(nomeImovel);
  if (!aba) {
    MailApp.sendEmail(OPERATOR_EMAIL, "[Sync] Atualizacao manual necessaria",
      "Nao encontrei a aba '" + nomeImovel + "' na Planilha Central para o lead " + nomeLocatario +
      " (unidade de interesse: '" + unidadeInteresse + "'). Marque a unidade como 'Alugada' manualmente.");
    return;
  }

  var data = aba.getDataRange().getValues();
  for (var r = 5; r < data.length; r++) { // dados a partir da linha 6
    if (unitNum !== null && Number(data[r][0]) !== unitNum) continue;
    if (unitNum === null && data[r][8] !== "Vacante") continue;

    if (data[r][8] !== "Vacante") {
      MailApp.sendEmail(OPERATOR_EMAIL, "[Sync] Conflito de status",
        nomeImovel + " unidade " + data[r][0] + " nao esta 'Vacante' (status atual: " + data[r][8] +
        "). Lead " + nomeLocatario + " foi fechado — verifique manualmente.");
      return;
    }
    aba.getRange(r + 1, 9).setValue("Alugada");        // I = Status
    aba.getRange(r + 1, 10).setValue(nomeLocatario);   // J = Locatário
    aba.getRange(r + 1, 11).setValue(new Date());      // K = Início Contrato
    MailApp.sendEmail(OPERATOR_EMAIL, "[Sync] Unidade atualizada automaticamente",
      nomeImovel + ", unidade " + data[r][0] + " marcada como Alugada para " + nomeLocatario + ".");
    return;
  }
  MailApp.sendEmail(OPERATOR_EMAIL, "[Sync] Unidade nao localizada",
    "Nao encontrei a unidade '" + unidadeInteresse + "' em " + nomeImovel +
    " para o lead " + nomeLocatario + ". Atualize a Planilha Central manualmente.");
}

/**
 * INSTALAÇÃO DOS GATILHOS (uma vez, pelo editor do Apps Script):
 * Menu lateral "Acionadores" (ícone de relógio) > "+ Adicionar acionador":
 * 1. checkSLA            -> Baseado em tempo -> Temporizador por minutos -> a cada 5 minutos
 * 2. checkFollowUps      -> Baseado em tempo -> Temporizador por horas   -> a cada hora
 * 3. checkReviewRequests -> Baseado em tempo -> Temporizador diário      -> uma vez por dia
 * 4. onEditLeadsSheet    -> Da planilha -> Ao editar
 *    IMPORTANTE: o gatilho nº 4 precisa ser criado por esse menu (gatilho "instalável").
 *    Ele NÃO funciona sozinho, porque envia e-mail e abre outra planilha —
 *    coisas que um gatilho simples de edição não tem permissão de fazer.
 * Na primeira vez, o Google pede autorização — aceite (é sua própria conta e planilha).
 *
 * DICA: para testar sem esperar, selecione a função checkSLA no menu suspenso
 * do editor e clique em "Executar".
 */
