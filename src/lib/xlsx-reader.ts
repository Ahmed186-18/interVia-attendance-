import { inflateRawSync } from "zlib";

type CellValue = string | number | boolean | null;

function decodeXml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function zipEntries(buffer: Buffer) {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("ملف Excel غير صالح: لم يتم العثور على فهرس ZIP");

  const entries = new Map<string, Buffer>();
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("فهرس ملف Excel تالف");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("مدخل ZIP محلي تالف");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) entries.set(name, compressed);
    else if (method === 8) entries.set(name, inflateRawSync(compressed));

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function textNodes(xml: string) {
  const texts: string[] = [];
  const pattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) texts.push(decodeXml(match[1]));
  return texts.join("");
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/)?.[0] || "A";
  return Array.from(letters).reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export function readXlsxSheet(buffer: Buffer, sheetName: string): CellValue[][] {
  const entries = zipEntries(buffer);
  const workbook = entries.get("xl/workbook.xml")?.toString("utf8");
  const relationships = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbook || !relationships) throw new Error("ملف Excel لا يحتوي على تعريف أوراق صالح");

  const escapedName = sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sheetTag = workbook.match(new RegExp(`<sheet\\b[^>]*name="${escapedName}"[^>]*>`))?.[0];
  const relationId = sheetTag?.match(/\br:id="([^"]+)"/)?.[1];
  if (!relationId) throw new Error(`ورقة ${sheetName} غير موجودة في ملف Excel`);

  const escapedRelation = relationId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const relationTag = relationships.match(new RegExp(`<Relationship\\b[^>]*Id="${escapedRelation}"[^>]*>`))?.[0];
  const target = relationTag?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error(`تعذر تحديد ملف ورقة ${sheetName}`);
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sheet = entries.get(sheetPath)?.toString("utf8");
  if (!sheet) throw new Error(`تعذر قراءة محتوى ورقة ${sheetName}`);

  const sharedXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const sharedStrings: string[] = [];
  const sharedPattern = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let sharedMatch: RegExpExecArray | null;
  while ((sharedMatch = sharedPattern.exec(sharedXml)) !== null) {
    sharedStrings.push(textNodes(sharedMatch[1]));
  }

  const rows: CellValue[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(sheet)) !== null) {
    const row: CellValue[] = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      const attributes = cellMatch[1];
      const content = cellMatch[2];
      const reference = attributes.match(/\br="([^"]+)"/)?.[1];
      if (!reference) continue;
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const raw = content.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value: CellValue = null;
      if (type === "inlineStr") value = textNodes(content);
      else if (type === "s" && raw !== undefined) value = sharedStrings[Number(raw)] ?? "";
      else if (type === "b" && raw !== undefined) value = raw === "1";
      else if (raw !== undefined) {
        const decoded = decodeXml(raw);
        const number = Number(decoded);
        value = type === "str" || !Number.isFinite(number) ? decoded : number;
      }
      row[columnIndex(reference)] = value;
    }
    rows.push(row);
  }
  return rows;
}
