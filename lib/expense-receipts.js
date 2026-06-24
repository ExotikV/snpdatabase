export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function sanitizeFileName(name) {
  const base = String(name ?? "receipt")
    .trim()
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, " ");
  return base.slice(0, 120) || "receipt";
}

function inferContentType(fileName, contentType) {
  const mime = String(contentType ?? "")
    .trim()
    .toLowerCase()
    .split(";")[0];
  if (mime && ALLOWED_MIME_TYPES.has(mime)) return mime;

  const ext = String(fileName ?? "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();
  return MIME_BY_EXTENSION[ext] ?? "";
}

export function parseReceiptUpload(payload) {
  if (!payload?.receipt) return null;

  const fileName = sanitizeFileName(payload.receipt.fileName);
  const contentType = inferContentType(fileName, payload.receipt.contentType);
  const dataBase64 = String(payload.receipt.dataBase64 ?? "").trim();

  if (!dataBase64) return null;

  if (!contentType) {
    throw new Error("Receipt must be a JPEG, PNG, WebP, HEIC, or PDF file");
  }

  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length === 0) {
    throw new Error("Receipt file is empty");
  }
  if (buffer.length > MAX_RECEIPT_BYTES) {
    throw new Error("Receipt file must be 5 MB or smaller");
  }

  return { fileName, contentType, buffer };
}

export async function uploadExpenseReceipt(supabase, expenseId, receipt) {
  const path = `${expenseId}/${Date.now()}-${receipt.fileName}`;
  const { error } = await supabase.storage.from(EXPENSE_RECEIPTS_BUCKET).upload(path, receipt.buffer, {
    contentType: receipt.contentType,
    upsert: false,
  });

  if (error) throw error;
  return path;
}

export async function deleteExpenseReceipt(supabase, receiptPath) {
  if (!receiptPath?.trim()) return;

  const { error } = await supabase.storage.from(EXPENSE_RECEIPTS_BUCKET).remove([receiptPath.trim()]);
  if (error) throw error;
}

export async function getExpenseReceiptSignedUrl(supabase, receiptPath, expiresIn = 3600) {
  if (!receiptPath?.trim()) return null;

  const { data, error } = await supabase.storage
    .from(EXPENSE_RECEIPTS_BUCKET)
    .createSignedUrl(receiptPath.trim(), expiresIn);

  if (error) throw error;
  return data?.signedUrl ?? null;
}
