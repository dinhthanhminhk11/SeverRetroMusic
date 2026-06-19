const multer = require("multer");
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, "../../audio_uploads");
const chunksDir = path.join(uploadsDir, "chunks");

fs.mkdirSync(chunksDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(chunksDir, { recursive: true });
        cb(null, chunksDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });

module.exports = upload;