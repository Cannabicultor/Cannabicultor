import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/tmp/cannabicultor-directory-agent-sheet";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const font = "Arial";

const sharedLocalHeaders = [
  "id", "nombre", "slug", "descripcion_seo", "direccion_fisica", "ciudad",
  "provincia_comunidad", "codigo_postal", "pais", "latitud", "longitud",
  "telefono_contacto", "email_contacto", "website_oficial", "google_place_id",
  "horario_json", "breeders_disponibles", "status", "is_indexed", "last_updated_by",
];

const sheets = [
  {
    name: "Variedades",
    tableName: "VariedadesTable",
    headers: [
      "id", "nombre", "slug", "breeder_slug", "genotipo", "tipo_semilla",
      "porcentaje_thc", "porcentaje_cbd", "floracion_semanas", "maduracion_exterior",
      "linaje_padre", "linaje_madre", "perfil_terpenos", "descripcion_tldr",
      "status", "is_indexed", "last_updated_by",
    ],
    widths: [90, 190, 190, 180, 120, 130, 105, 105, 120, 160, 180, 180, 230, 360, 110, 110, 170],
    statusColumn: 15,
    indexedColumn: 16,
  },
  {
    name: "Breeders",
    tableName: "BreedersTable",
    headers: [
      "id", "nombre", "slug", "pais_origen", "anio_fundacion", "website_oficial",
      "logo_url", "descripcion_seo", "status", "is_indexed",
    ],
    widths: [90, 200, 190, 135, 115, 250, 250, 360, 110, 110],
    statusColumn: 9,
    indexedColumn: 10,
  },
  ...["Growshops", "Asociaciones_CSC", "Tiendas_CBD"].map((name) => ({
    name,
    tableName: `${name.replace(/[^A-Za-z]/g, "")}Table`,
    headers: sharedLocalHeaders,
    widths: [90, 190, 190, 320, 260, 155, 180, 115, 115, 105, 105, 155, 220, 240, 220, 330, 260, 110, 110, 170],
    statusColumn: 18,
    indexedColumn: 19,
  })),
];

for (const definition of sheets) {
  const sheet = workbook.worksheets.add(definition.name);
  sheet.showGridLines = false;
  const finalColumn = String.fromCharCode(64 + definition.headers.length);
  sheet.getRange(`A1:${finalColumn}2`).values = [definition.headers, Array(definition.headers.length).fill("")];
  sheet.getRange(`A1:${finalColumn}2`).format.font = { name: font, size: 10 };
  sheet.getRange(`A1:${finalColumn}1`).format = {
    fill: "#1F4E78",
    font: { name: font, size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#FFFFFF" },
  };
  sheet.getRange(`A2:${finalColumn}2`).format.verticalAlignment = "center";
  sheet.getRange(`A1:${finalColumn}2`).format.rowHeightPx = 26;
  definition.widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 2, 1).format.columnWidthPx = width;
  });
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(3);
  sheet.getRange(`A2:${finalColumn}2`).format.verticalAlignment = "center";
  sheet.getRange(`A2:${finalColumn}2`).format.font = { name: font, size: 10 };
  sheet.getRangeByIndexes(1, definition.statusColumn - 1, 1, 1).dataValidation = {
    rule: { type: "list", values: ["borrador", "publicado", "inactivo"] },
  };
  sheet.getRangeByIndexes(1, definition.indexedColumn - 1, 1, 1).dataValidation = {
    rule: { type: "list", values: ["true", "false"] },
  };
  sheet.getRangeByIndexes(1, definition.statusColumn - 1, 1, 1).conditionalFormats.add("cellIs", {
    operator: "equal", formula: "\"borrador\"", format: { fill: "#FFF2CC", font: { color: "#7F6000" } },
  });
  sheet.getRangeByIndexes(1, definition.statusColumn - 1, 1, 1).conditionalFormats.add("cellIs", {
    operator: "equal", formula: "\"publicado\"", format: { fill: "#E2F0D9", font: { color: "#375623" } },
  });
  sheet.getRangeByIndexes(1, definition.statusColumn - 1, 1, 1).conditionalFormats.add("cellIs", {
    operator: "equal", formula: "\"inactivo\"", format: { fill: "#FCE4D6", font: { color: "#9C0006" } },
  });
  const table = sheet.tables.add(`A1:${finalColumn}2`, true, definition.tableName);
  table.showBandedColumns = false;
}

workbook.recalculate();
for (const definition of sheets) {
  const check = await workbook.inspect({
    kind: "table",
    range: `${definition.name}!A1:${String.fromCharCode(64 + definition.headers.length)}2`,
    include: "values,formulas",
    tableMaxRows: 3,
    tableMaxCols: 25,
  });
  if (!check.ndjson.includes(definition.headers[0])) throw new Error(`Header verification failed for ${definition.name}`);
  const preview = await workbook.render({ sheetName: definition.name, autoCrop: "all", scale: 1.5, format: "png" });
  await fs.writeFile(`${outputDir}/${definition.name}.png`, new Uint8Array(await preview.arrayBuffer()));
}
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
if (errors.ndjson.includes("#REF!") || errors.ndjson.includes("#DIV/0!")) throw new Error("Formula errors found");
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/directorio-cannabicultor-agentes.xlsx`);
console.log(`${outputDir}/directorio-cannabicultor-agentes.xlsx`);
