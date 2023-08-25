require("dotenv").config();
const { S3Client } = require("@aws-sdk/client-s3");
const multer = require("multer");
const nodepath = require("path");
const multerS3 = require("multer-s3");
const config = require("../config");

const S3 = new S3Client({
  region: config.R2_REGION,
  endpoint: config.R2_ENDPOINT,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  },
});

const MIME_TYPE_MAP = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpg",
};

const imageUpload = multer({
  storage: multerS3({
    s3: S3,
    bucket: config.R2_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const filename = nodepath.parse(file.originalname);
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .slice(0, 14);
      cb(
        null,
        req.params.id + "/" + `${timestamp}-${filename.name}${filename.ext}`
      );
    },
  }),
  fileFilter: (req, file, cb) => {
    const isValid = !!MIME_TYPE_MAP[file.mimetype];
    let error = isValid ? null : new Error("Invalid mime type!");
    cb(error, isValid);
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB allowed
});

module.exports = imageUpload;
