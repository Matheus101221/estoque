/* =========================================================
   CONFIGURAÇÃO
   =========================================================
   Já conectado na planilha "ESTOQUE VR / EXTREMA / SÃO LOURENÇO".
   Se o link ou o nome de alguma aba mudar, é só ajustar aqui.

   Colunas esperadas em cada aba (a ordem não importa, os nomes
   podem variar um pouco — o site tenta reconhecer sozinho):
      Veículo | Ano/Modelo | Cor | Chassi | Valor Mínimo | Valor Médio | Valor Máximo
      (Foto é opcional — se você adicionar uma coluna com link de imagem, o site já usa)
*/

const CONFIG = {
  // Cole aqui o ID da sua planilha do Google Sheets
  SPREADSHEET_ID: "1cfplMKRzot0vOfet2zE5TlLMykGueYgM50c48GltUaQ",

  // Nomes das abas (na mesma ordem que devem aparecer no site)
  // ⚠️ O nome aqui precisa ser IDÊNTICO ao nome da aba na planilha (maiúsculas/acentos inclusos).
  // Se a aba nova tiver outro nome, é só trocar a linha "ESTOQUE BOM REPOUSO" abaixo.
  SHEET_TABS: [
    "ESTOQUE VR",
    "ESTOQUE EXTREMA",
    "ESTOQUE SÃO LOURENÇO",
    "ESTOQUE BOM REPOUSO"
  ],

  // URL do Apps Script (App da Web) usado pelo botão "Marcar como vendida".
  // Fica vazia até você seguir os passos do arquivo apps-script-marcar-vendida.gs
  // e colar aqui a URL que termina em "/exec".
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzbZ6tzP5XKvyFk6moZqL2JdDEhdwCPNCI4ccGmGsXhKJCJvlVVTZJTIaGRiN9Nefw4yw/exec",
};

/* =========================================================
   DADOS DE EXEMPLO
   Usados só se a planilha real não puder ser carregada (link
   mudou de permissão, nome de aba errado, etc) — assim o site
   nunca fica em branco. Pode editar ou apagar à vontade.
   ========================================================= */
const MOCK_DATA = {
  "ESTOQUE VR": [
    { foto: "", modelo: "PHOENIX 50 S", ano: "2026/2026", cor: "Cinza", chassi: "99HPHS050TS005420", valorMinimo: 11590, valorMedio: 11990, valorMaximo: 12990 },
    { foto: "", modelo: "NEW JET 125", ano: "2026/2027", cor: "Branca/Marrom", chassi: "99HNJ1125VS003664", valorMinimo: 13490, valorMedio: 13900, valorMaximo: 15900 },
    { foto: "", modelo: "NEW JET 125", ano: "2026/2027", cor: "Branca/Marrom", chassi: "99HNJ1125VS007484", valorMinimo: 13490, valorMedio: 13900, valorMaximo: 15900 },
    { foto: "", modelo: "JEF170", ano: "2026/2027", cor: "Vermelha", chassi: "99HJF1170VS002236", valorMinimo: 15100, valorMedio: 15900, valorMaximo: 16900 },
    { foto: "", modelo: "URBAN 150 LITE", ano: "2026/2027", cor: "Vermelha", chassi: "99HULF150VS000208", valorMinimo: null, valorMedio: 16900, valorMaximo: null },
    { foto: "", modelo: "URBAN 150 LITE", ano: "2026/2027", cor: "Vermelha", chassi: "99HULF150VS000205", valorMinimo: null, valorMedio: 16900, valorMaximo: null },
    { foto: "", modelo: "NEW SHI 175", ano: "2026/2027", cor: "Vermelha", chassi: "99HNS1175VS002266", valorMinimo: 18700, valorMedio: 19900, valorMaximo: 20900 },
    { foto: "", modelo: "HAOJUE DR 160", ano: "2024/2025", cor: "Preta", chassi: "99KPCKGMKSM110584", valorMinimo: null, valorMedio: null, valorMaximo: null },
  ],
  "ESTOQUE EXTREMA": [
    { foto: "", modelo: "PHOENIX 50 S", ano: "2026/2026", cor: "Preta", chassi: "99HPHS050TS009911", valorMinimo: 11590, valorMedio: 11990, valorMaximo: 12990 },
    { foto: "", modelo: "NEW JET 125", ano: "2026/2027", cor: "Vermelha", chassi: "99HNJ1125VS001122", valorMinimo: 13490, valorMedio: 13900, valorMaximo: 15900 },
  ],
  "ESTOQUE SÃO LOURENÇO": [
    { foto: "", modelo: "JEF170", ano: "2026/2027", cor: "Preta", chassi: "99HJF1170VS004410", valorMinimo: 15100, valorMedio: 15900, valorMaximo: 16900 },
    { foto: "", modelo: "NEW SHI 175", ano: "2026/2027", cor: "Vermelha", chassi: "99HNS1175VS007733", valorMinimo: 18700, valorMedio: 19900, valorMaximo: 20900 },
  ],
  "ESTOQUE BOM REPOUSO": [
    { foto: "", modelo: "PHOENIX 50 S", ano: "2026/2026", cor: "Preta", chassi: "99HPHS050TS000001", valorMinimo: 11590, valorMedio: 11990, valorMaximo: 12990 },
  ]
};
