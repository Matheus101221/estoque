// =========================================================
// Marcar unidade como vendida — Apps Script
// =========================================================
// O que faz: quando o site chama esse script, ele acha a linha
// com o chassi informado (na aba informada) e escreve "Vendido"
// na coluna "Status" — criando essa coluna se ainda não existir.
//
// COMO INSTALAR:
// 1. Abra a planilha "ESTOQUE VR / EXTREMA / SÃO LOURENÇO".
// 2. Menu Extensões > Apps Script.
// 3. Apague o código de exemplo que aparece e cole este arquivo inteiro.
// 4. Salve (ícone de disquete ou Ctrl+S). Dê um nome ao projeto,
//    ex: "MarcarVendida".
// 5. Clique em "Implantar" (Deploy) > "Nova implantação".
// 6. Em "Tipo", escolha "App da Web" (Web app).
// 7. Configure:
//      Executar como: Eu (seu e-mail)
//      Quem pode acessar: Qualquer pessoa (Anyone)
// 8. Clique em Implantar. Na primeira vez o Google vai pedir para
//    autorizar o acesso à sua conta — autorize (é o script mexendo
//    na sua própria planilha).
// 9. Copie a URL que aparece, terminando em "/exec".
// 10. Cole essa URL no config.js, no campo APPS_SCRIPT_URL.
//
// Sempre que editar este código, você precisa fazer uma NOVA
// implantação (ou "Gerenciar implantações" > editar > nova versão)
// para as mudanças valerem no site.
// =========================================================

const SPREADSHEET_ID = "1cfplMKRzot0vOfet2zE5TlLMykGueYgM50c48GltUaQ";
const STATUS_COLUMN_NAME = "Status";
const SOLD_VALUE = "Vendido";

function normalize_(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const sheetName = body.sheetName;
    const chassi = normalize_(body.chassi);

    if (!sheetName || !chassi) {
      return jsonOutput_({ ok: false, error: "sheetName e chassi são obrigatórios" });
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return jsonOutput_({ ok: false, error: `Aba "${sheetName}" não encontrada` });
    }

    const values = sheet.getDataRange().getValues();
    if (values.length === 0) {
      return jsonOutput_({ ok: false, error: "Aba vazia" });
    }

    // Acha a linha de cabeçalho procurando uma célula "Chassi" nas primeiras linhas
    let headerRowIndex = -1;
    let chassiCol = -1;
    for (let r = 0; r < Math.min(values.length, 6); r++) {
      for (let c = 0; c < values[r].length; c++) {
        const norm = normalize_(values[r][c]);
        if (norm === "chassi" || norm === "chassis") {
          headerRowIndex = r;
          chassiCol = c;
          break;
        }
      }
      if (headerRowIndex >= 0) break;
    }
    if (headerRowIndex === -1) {
      return jsonOutput_({ ok: false, error: 'Não achei uma coluna "Chassi" nas primeiras linhas dessa aba' });
    }

    // Acha (ou cria) a coluna "Status"
    let statusCol = -1;
    for (let c = 0; c < values[headerRowIndex].length; c++) {
      if (normalize_(values[headerRowIndex][c]) === "status") { statusCol = c; break; }
    }
    if (statusCol === -1) {
      statusCol = values[headerRowIndex].length;
      sheet.getRange(headerRowIndex + 1, statusCol + 1).setValue(STATUS_COLUMN_NAME);
    }

    // Acha a linha com o chassi pedido
    let targetRow = -1;
    for (let r = headerRowIndex + 1; r < values.length; r++) {
      if (normalize_(values[r][chassiCol]) === chassi) { targetRow = r; break; }
    }
    if (targetRow === -1) {
      return jsonOutput_({ ok: false, error: "Chassi não encontrado nessa aba da planilha" });
    }

    sheet.getRange(targetRow + 1, statusCol + 1).setValue(SOLD_VALUE);

    return jsonOutput_({ ok: true });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
