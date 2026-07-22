#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const docxModule = process.env.ORCHESTRATOR_DOCX_MODULE || "docx";
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} = require(docxModule);

const CONTENT_WIDTH_DXA = 9360;
const TABLE_INDENT_DXA = 120;
const CELL_MARGINS = {
  marginUnitType: WidthType.DXA,
  top: 80,
  bottom: 80,
  left: 120,
  right: 120,
};

const COLORS = {
  blue: "2E74B5",
  darkBlue: "1F4D78",
  ink: "0B2545",
  muted: "5E6A75",
  border: "CBD5E1",
  headerFill: "E8EEF5",
  softFill: "F4F6F9",
  pass: "1F6F43",
  passFill: "E8F5ED",
  fail: "9B1C1C",
  failFill: "FDECEC",
  blocked: "7A5A00",
  blockedFill: "FFF7D6",
  automation: "475569",
  automationFill: "EEF2F6",
};

const STATUS_CONFIG = {
  PASSOU: { label: "Passou", color: COLORS.pass, fill: COLORS.passFill },
  FALHOU: { label: "Falhou", color: COLORS.fail, fill: COLORS.failFill },
  BLOQUEADO: { label: "Bloqueado", color: COLORS.blocked, fill: COLORS.blockedFill },
  ERRO_AUTOMACAO: { label: "Erro de automação", color: COLORS.automation, fill: COLORS.automationFill },
  NAO_EXECUTADO: { label: "Não executado", color: COLORS.automation, fill: COLORS.automationFill },
};

function parseArguments(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--input" || value === "-i") args.input = argv[++index];
    else if (value === "--output" || value === "-o") args.output = argv[++index];
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Argumento desconhecido: ${value}`);
  }
  return args;
}

function printHelp() {
  console.log("Uso: node generate-evidence-docx.cjs --input execucao.json --output evidencias.docx");
}

function normalizeStatus(value) {
  const normalized = String(value || "ERRO_AUTOMACAO").trim().toUpperCase();
  return STATUS_CONFIG[normalized] ? normalized : "ERRO_AUTOMACAO";
}

function formatDate(value) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function normalizeInput(raw) {
  const input = raw?.json ?? raw;
  if (!input || typeof input !== "object") throw new Error("O JSON de entrada é inválido.");
  const results = input.resultados ?? input.scenarios;
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("O JSON deve conter ao menos um item em 'resultados' ou 'scenarios'.");
  }

  const normalizedResults = results.map((item, index) => {
    const result = item.resultado_teste ?? item.result ?? {};
    return {
      ...item,
      scenario_id: item.scenario_id ?? item.id ?? `CT-${String(index + 1).padStart(3, "0")}`,
      scenario_title: item.scenario_title ?? item.title ?? `Cenário ${index + 1}`,
      cenario: item.cenario ?? item.bdd ?? "Gherkin não informado.",
      status: normalizeStatus(item.status ?? result.status),
      resultado_teste: {
        resumo: result.resumo ?? item.evidence ?? "Sem resumo informado.",
        passos: Array.isArray(result.passos) ? result.passos : [],
        evidencias: Array.isArray(result.evidencias) ? result.evidencias : [],
        falhas_reais: Array.isArray(result.falhas_reais) ? result.falhas_reais : [],
        falhas_automacao: Array.isArray(result.falhas_automacao) ? result.falhas_automacao : [],
      },
    };
  });

  const computedTotals = { PASSOU: 0, FALHOU: 0, BLOQUEADO: 0, ERRO_AUTOMACAO: 0 };
  for (const result of normalizedResults) computedTotals[result.status] += 1;
  const statusGeral = normalizeStatus(
    input.status_geral ??
      (computedTotals.FALHOU > 0
        ? "FALHOU"
        : computedTotals.BLOQUEADO > 0
          ? "BLOQUEADO"
          : computedTotals.ERRO_AUTOMACAO > 0
            ? "ERRO_AUTOMACAO"
            : "PASSOU"),
  );

  return {
    execution_id: input.execution_id ?? `execucao-${Date.now()}`,
    projeto: input.projeto ?? input.projectName ?? "Projeto não informado",
    cliente: input.cliente ?? input.clientName ?? "Não informado",
    sprint: input.sprint ?? input.sprintName ?? "Não informada",
    sistema_url: input.sistema_url ?? input.systemUrl ?? "Não informado",
    inicio_processamento: input.inicio_processamento ?? input.startedAt,
    fim_processamento: input.fim_processamento ?? input.finishedAt,
    status_geral: statusGeral,
    totais: { ...computedTotals, ...(input.totais ?? {}) },
    resultados: normalizedResults,
  };
}

function statusRun(status, options = {}) {
  const normalized = normalizeStatus(status);
  const config = STATUS_CONFIG[normalized];
  return new TextRun({
    text: options.text ?? config.label,
    bold: true,
    color: config.color,
    size: options.size ?? 20,
    font: "Calibri",
  });
}

function textRun(text, options = {}) {
  return new TextRun({
    text: String(text ?? ""),
    font: options.font ?? "Calibri",
    size: options.size ?? 22,
    bold: options.bold,
    italics: options.italics,
    color: options.color,
    break: options.break,
  });
}

function cellParagraph(children, options = {}) {
  return new Paragraph({
    style: options.style ?? "TableText",
    alignment: options.alignment ?? AlignmentType.LEFT,
    children: Array.isArray(children) ? children : [textRun(children, { size: 19 })],
  });
}

function tableCell(children, width, options = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    children: Array.isArray(children) ? children : [cellParagraph(children)],
  });
}

function fixedTable(rows, columnWidths, options = {}) {
  if (columnWidths.reduce((sum, value) => sum + value, 0) !== CONTENT_WIDTH_DXA) {
    throw new Error(`Geometria de tabela inválida: ${columnWidths.join("+")} deve somar ${CONTENT_WIDTH_DXA}.`);
  }
  const border = { style: BorderStyle.SINGLE, size: 4, color: COLORS.border };
  return new Table({
    rows,
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    indent: { size: TABLE_INDENT_DXA, type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    margins: CELL_MARGINS,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
  });
}

function metadataParagraphs(rows) {
  return rows.map(
    ([label, value]) =>
      new Paragraph({
        style: "Metadata",
        children: [textRun(`${label}: `, { size: 20, bold: true, color: COLORS.ink }), textRun(value, { size: 20 })],
      }),
  );
}

function statusCallout(label, status) {
  const normalized = normalizeStatus(status);
  const config = STATUS_CONFIG[normalized];
  return new Paragraph({
    style: "StatusCallout",
    shading: { fill: config.fill, type: ShadingType.CLEAR, color: "auto" },
    children: [textRun(`${label}: `, { size: 21, bold: true, color: COLORS.ink }), statusRun(normalized, { size: 21 })],
  });
}

function summaryTable(data) {
  const widths = [1872, 1872, 1872, 1872, 1872];
  const entries = [
    ["Total", data.resultados.length, COLORS.headerFill],
    ["Passou", data.totais.PASSOU ?? 0, COLORS.passFill],
    ["Falhou", data.totais.FALHOU ?? 0, COLORS.failFill],
    ["Bloqueado", data.totais.BLOQUEADO ?? 0, COLORS.blockedFill],
    ["Erro automação", data.totais.ERRO_AUTOMACAO ?? 0, COLORS.automationFill],
  ];
  return fixedTable(
    [
      new TableRow({
        tableHeader: true,
        children: entries.map(([label, , fill], index) =>
          tableCell(
            [cellParagraph([textRun(label, { size: 18, bold: true, color: COLORS.ink })], { alignment: AlignmentType.CENTER })],
            widths[index],
            { fill },
          ),
        ),
      }),
      new TableRow({
        children: entries.map(([, value, fill], index) =>
          tableCell(
            [cellParagraph([textRun(value, { size: 28, bold: true, color: COLORS.ink })], { alignment: AlignmentType.CENTER })],
            widths[index],
            { fill },
          ),
        ),
      }),
    ],
    widths,
  );
}

function stepsTable(steps) {
  const widths = [780, 2800, 1680, 4100];
  const headerLabels = ["#", "Passo", "Status", "Detalhe"];
  const rows = [
    new TableRow({
      tableHeader: true,
      children: headerLabels.map((label, index) =>
        tableCell(
          [cellParagraph([textRun(label, { size: 18, bold: true, color: COLORS.ink })], { alignment: AlignmentType.CENTER })],
          widths[index],
          { fill: COLORS.headerFill },
        ),
      ),
    }),
  ];

  for (const [index, step] of steps.entries()) {
    const status = normalizeStatus(step.status === "NAO_EXECUTADO" ? "NAO_EXECUTADO" : step.status);
    rows.push(
      new TableRow({
        children: [
          tableCell([cellParagraph([textRun(index + 1, { size: 18 })], { alignment: AlignmentType.CENTER })], widths[0]),
          tableCell([cellParagraph([textRun(step.descricao ?? step.description ?? "Passo sem descrição", { size: 18 })])], widths[1]),
          tableCell([cellParagraph([statusRun(status, { size: 18 })], { alignment: AlignmentType.CENTER })], widths[2], {
            fill: STATUS_CONFIG[status].fill,
          }),
          tableCell([cellParagraph([textRun(step.detalhe ?? step.detail ?? "-", { size: 18 })])], widths[3]),
        ],
      }),
    );
  }
  return fixedTable(rows, widths);
}

function imageDimensions(buffer, extension) {
  if (extension === ".png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if ((extension === ".jpg" || extension === ".jpeg") && buffer.length > 4) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (!length) break;
      offset += 2 + length;
    }
  }
  return { width: 1200, height: 675 };
}

function imageType(extension) {
  if (extension === ".jpg" || extension === ".jpeg") return "jpg";
  if (extension === ".gif") return "gif";
  if (extension === ".bmp") return "bmp";
  return "png";
}

function resolveEvidencePaths(scenario, inputDirectory) {
  const values = [];
  for (const evidence of scenario.resultado_teste.evidencias) {
    values.push(typeof evidence === "string" ? evidence : evidence.caminho ?? evidence.path ?? evidence.url);
  }
  for (const image of scenario.images ?? []) {
    values.push(typeof image === "string" ? image : image.caminho ?? image.path ?? image.url);
  }
  if (scenario.evidence_path) values.push(scenario.evidence_path);

  return [...new Set(values.filter(Boolean))].map((value) => {
    const raw = String(value);
    if (/^https?:\/\//i.test(raw)) return { kind: "remote", value: raw };
    const resolved = path.isAbsolute(raw) ? raw : path.resolve(inputDirectory, raw);
    return fs.existsSync(resolved) ? { kind: "local", value: resolved } : { kind: "missing", value: resolved };
  });
}

function evidenceImage(pathname, scenarioTitle) {
  const buffer = fs.readFileSync(pathname);
  const extension = path.extname(pathname).toLowerCase();
  const dimensions = imageDimensions(buffer, extension);
  const scale = Math.min(600 / dimensions.width, 460 / dimensions.height, 1);
  return new ImageRun({
    type: imageType(extension),
    data: buffer,
    transformation: {
      width: Math.max(1, Math.round(dimensions.width * scale)),
      height: Math.max(1, Math.round(dimensions.height * scale)),
    },
    altText: {
      name: path.basename(pathname),
      title: `Evidência de ${scenarioTitle}`,
      description: `Screenshot capturada durante a execução do cenário ${scenarioTitle}.`,
    },
  });
}

function bulletParagraph(text, reference, color) {
  return new Paragraph({
    style: "Normal",
    numbering: { reference, level: 0 },
    children: [textRun(text, { color })],
  });
}

function scenarioChildren(scenario, index, inputDirectory) {
  const children = [];
  const status = normalizeStatus(scenario.status);
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
      keepNext: true,
      children: [textRun(`${scenario.scenario_id} — ${scenario.scenario_title}`, { size: 32, bold: true, color: COLORS.blue })],
    }),
    statusCallout("Status do cenário", status),
    new Paragraph({
      style: "Metadata",
      children: [textRun("Executado em: ", { size: 20, bold: true, color: COLORS.ink }), textRun(formatDate(scenario.data_execucao), { size: 20 })],
    }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [textRun("Cenário Gherkin", { size: 26, bold: true, color: COLORS.blue })] }),
    ...scenario.cenario.split(/\r?\n/).map(
      (line) =>
        new Paragraph({
          style: "CodeBlock",
          shading: { fill: COLORS.softFill, type: ShadingType.CLEAR, color: "auto" },
          children: [textRun(line || " ", { font: "Consolas", size: 18, color: COLORS.ink })],
        }),
    ),
    new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [textRun("Resultado observado", { size: 26, bold: true, color: COLORS.blue })] }),
    new Paragraph({ style: "Normal", children: [textRun(scenario.resultado_teste.resumo)] }),
  );

  if (scenario.resultado_teste.passos.length > 0) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [textRun("Passos executados", { size: 26, bold: true, color: COLORS.blue })] }),
      stepsTable(scenario.resultado_teste.passos),
    );
  }

  if (scenario.resultado_teste.falhas_reais.length > 0) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [textRun("Falhas funcionais", { size: 26, bold: true, color: COLORS.fail })] }));
    for (const failure of scenario.resultado_teste.falhas_reais) {
      children.push(bulletParagraph(typeof failure === "string" ? failure : JSON.stringify(failure), "failure-bullets", COLORS.fail));
    }
  }

  if (scenario.resultado_teste.falhas_automacao.length > 0) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [textRun("Falhas de automação", { size: 26, bold: true, color: COLORS.automation })] }));
    for (const failure of scenario.resultado_teste.falhas_automacao) {
      children.push(bulletParagraph(typeof failure === "string" ? failure : JSON.stringify(failure), "automation-bullets", COLORS.automation));
    }
  }

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [textRun("Evidências visuais", { size: 26, bold: true, color: COLORS.blue })] }));
  const evidencePaths = resolveEvidencePaths(scenario, inputDirectory);
  const localEvidence = evidencePaths.filter((entry) => entry.kind === "local");

  if (localEvidence.length === 0) {
    children.push(
      new Paragraph({
        style: "Note",
        children: [textRun("Nenhuma screenshot local válida foi encontrada para este cenário.", { italics: true, color: COLORS.muted })],
      }),
    );
  } else {
    for (const [evidenceIndex, evidence] of localEvidence.entries()) {
      children.push(
        new Paragraph({
          style: "Caption",
          keepNext: true,
          alignment: AlignmentType.CENTER,
          children: [textRun(`Evidência ${index + 1}.${evidenceIndex + 1} — ${path.basename(evidence.value)}`, { size: 18, italics: true, color: COLORS.muted })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          keepLines: true,
          children: [evidenceImage(evidence.value, scenario.scenario_title)],
        }),
      );
    }
  }

  for (const evidence of evidencePaths.filter((entry) => entry.kind !== "local")) {
    const prefix = evidence.kind === "remote" ? "URL não incorporada" : "Arquivo não encontrado";
    children.push(new Paragraph({ style: "Note", children: [textRun(`${prefix}: ${evidence.value}`, { size: 18, color: COLORS.muted })] }));
  }
  return children;
}

function createDocument(data, inputDirectory) {
  const children = [
    new Paragraph({ style: "Kicker", children: [textRun("RELATÓRIO DE QUALIDADE", { size: 20, bold: true, color: COLORS.blue })] }),
    new Paragraph({ style: "Title", children: [textRun("Evidências de Execução de Testes", { size: 46, bold: true, color: "000000" })] }),
    new Paragraph({ style: "Subtitle", children: [textRun(`${data.projeto} — ${data.sprint}`, { size: 24, color: COLORS.muted })] }),
    ...metadataParagraphs([
      ["Execução", data.execution_id],
      ["Cliente", data.cliente],
      ["Projeto", data.projeto],
      ["Sprint", data.sprint],
      ["Sistema", data.sistema_url],
      ["Início", formatDate(data.inicio_processamento)],
      ["Fim", formatDate(data.fim_processamento)],
    ]),
    new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [textRun("Resumo executivo", { size: 32, bold: true, color: COLORS.blue })] }),
    statusCallout("Status geral", data.status_geral),
    new Paragraph({ style: "TableCitation", children: [textRun("Distribuição dos cenários por resultado.", { size: 18, color: COLORS.muted, italics: true })] }),
    summaryTable(data),
  ];

  for (const [index, scenario] of data.resultados.entries()) {
    children.push(...scenarioChildren(scenario, index, inputDirectory));
  }

  return new Document({
    creator: "Orchestrator QA",
    title: `Evidências de Teste — ${data.projeto}`,
    subject: `Execução ${data.execution_id}`,
    description: "Relatório automático de evidências de execução de testes.",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "000000" },
          paragraph: { spacing: { before: 0, after: 120, line: 300, lineRule: LineRuleType.AUTO } },
        },
      },
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 22, color: "000000" },
          paragraph: { spacing: { before: 0, after: 120, line: 300, lineRule: LineRuleType.AUTO } },
        },
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Subtitle",
          quickFormat: true,
          run: { font: "Calibri", size: 46, bold: true, color: "000000" },
          paragraph: { spacing: { before: 0, after: 80, line: 276, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
        {
          id: "Subtitle",
          name: "Subtitle",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 24, color: COLORS.muted },
          paragraph: { spacing: { before: 0, after: 280, line: 300, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 32, bold: true, color: COLORS.blue },
          paragraph: { spacing: { before: 360, after: 200, line: 300, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 26, bold: true, color: COLORS.blue },
          paragraph: { spacing: { before: 280, after: 140, line: 300, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 24, bold: true, color: COLORS.darkBlue },
          paragraph: { spacing: { before: 200, after: 100, line: 300, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
        {
          id: "Kicker",
          name: "Kicker",
          basedOn: "Normal",
          next: "Title",
          run: { font: "Calibri", size: 20, bold: true, color: COLORS.blue, allCaps: true },
          paragraph: { spacing: { before: 0, after: 40, line: 280, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
        {
          id: "Metadata",
          name: "Metadata",
          basedOn: "Normal",
          next: "Metadata",
          run: { font: "Calibri", size: 20, color: "000000" },
          paragraph: { spacing: { before: 0, after: 40, line: 280, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
        {
          id: "StatusCallout",
          name: "Status Callout",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Calibri", size: 21, color: "000000" },
          paragraph: { indent: { left: 160, right: 160 }, spacing: { before: 80, after: 120, line: 300, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
        {
          id: "TableText",
          name: "Table Text",
          basedOn: "Normal",
          run: { font: "Calibri", size: 19, color: "000000" },
          paragraph: { spacing: { before: 0, after: 0, line: 276, lineRule: LineRuleType.AUTO } },
        },
        {
          id: "CodeBlock",
          name: "Code Block",
          basedOn: "Normal",
          run: { font: "Consolas", size: 18, color: COLORS.ink },
          paragraph: { indent: { left: 160, right: 160 }, spacing: { before: 0, after: 20, line: 260, lineRule: LineRuleType.AUTO }, keepLines: true },
        },
        {
          id: "Caption",
          name: "Caption",
          basedOn: "Normal",
          run: { font: "Calibri", size: 18, italics: true, color: COLORS.muted },
          paragraph: { spacing: { before: 120, after: 80, line: 276, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
        {
          id: "Note",
          name: "Note",
          basedOn: "Normal",
          run: { font: "Calibri", size: 19, italics: true, color: COLORS.muted },
          paragraph: { spacing: { before: 80, after: 120, line: 290, lineRule: LineRuleType.AUTO } },
        },
        {
          id: "TableCitation",
          name: "Table Citation Text",
          basedOn: "Normal",
          run: { font: "Calibri", size: 18, italics: true, color: COLORS.muted },
          paragraph: { spacing: { before: 80, after: 80, line: 280, lineRule: LineRuleType.AUTO }, keepNext: true },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "failure-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 540, hanging: 270 }, spacing: { after: 80, line: 300, lineRule: LineRuleType.AUTO } },
                run: { font: "Calibri", size: 22, color: COLORS.fail },
              },
            },
          ],
        },
        {
          reference: "automation-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 540, hanging: 270 }, spacing: { after: 80, line: 300, lineRule: LineRuleType.AUTO } },
                run: { font: "Calibri", size: 22, color: COLORS.automation },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [textRun("ORCHESTRATOR  |  EVIDÊNCIAS DE QA", { size: 17, bold: true, color: COLORS.muted })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [textRun("Página ", { size: 17, color: COLORS.muted }), PageNumber.CURRENT],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.input || !args.output) {
    printHelp();
    throw new Error("Informe --input e --output.");
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const data = normalizeInput(raw);
  const document = createDocument(data, path.dirname(inputPath));
  const buffer = await Packer.toBuffer(document);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log(JSON.stringify({ output: outputPath, bytes: buffer.length, scenarios: data.resultados.length, status: data.status_geral }));
}

main().catch((error) => {
  console.error(`Falha ao gerar DOCX: ${error.message}`);
  process.exitCode = 1;
});
