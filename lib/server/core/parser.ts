export const parseCSV = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  const csvString = new TextDecoder("utf-8", { fatal: true }).decode(uint8Array).replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csvString.length; index += 1) {
    const character = csvString[index];
    const nextCharacter = csvString[index + 1];
    if (character === '"') {
      if (quoted && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);

  if (rows.length < 2) {
    throw new Error("CSV file must include a header row and at least one data row");
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  if (headers.some((header) => !header)) throw new Error("CSV header contains an empty column name.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV header contains duplicate column names.");

  const data = rows.slice(1).map((values) => {
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {} as Record<string, string>);
  });

  return data;
};
