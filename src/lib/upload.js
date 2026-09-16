// src/lib/upload.js
// Member-photo upload handling (Member Portal only — see routes/portal.js).
// Local disk storage, scoped by org and member so multi-tenant data never
// mixes on disk even though it's served from one shared /uploads root.

import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "member-photos");

const ALLOWED_MIME_TYPES = {
  "image/jpeg": ".jpg",
  "image/png":  ".png",
  "image/webp": ".webp",
  "image/gif":  ".gif",
};

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const { organizationId, memberId } = req.user;
    const dir = path.join(UPLOAD_ROOT, organizationId, memberId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = ALLOWED_MIME_TYPES[file.mimetype] || path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME_TYPES[file.mimetype]) {
    return cb(new Error("Only JPEG, PNG, WEBP, or GIF images are allowed."));
  }
  cb(null, true);
}

export const memberPhotoUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5,                  // max files per upload request
  },
});

// Absolute path on disk for a stored photo, given its public URL
// (e.g. "/uploads/member-photos/<org>/<member>/<file>"). Used to unlink
// the file when its MemberPhoto row is deleted.
export function absolutePathForPhotoUrl(url) {
  const relative = url.replace(/^\/uploads\//, "");
  return path.join(process.cwd(), "uploads", relative);
}
