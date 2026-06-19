import { formatResponseError, formatResponseSuccess, formatResponseSuccessNoData } from '../config';
import Album from '../models/album';
import Song from '../models/song';
import fileService from '../services/fileService';
const mm = require('music-metadata');
const fs = require('fs');
const crypto = require('crypto')
const multer = require('multer');
const path = require('path');
const { promisify } = require('util');
const Logger = require("../util/logger");
const Constants = require('../util/constants')

const appendFileAsync = promisify(fs.appendFile);
const unlinkAsync = promisify(fs.unlink);
const readFileAsync = promisify(fs.readFile);

const exec = promisify(require('child_process').exec);
const { execq } = require('child_process');
const os = require('os');
const { spawn } = require('child_process');
const FileModel = require("../models/file");

const logger = new Logger(Constants.ON_OFF_SETTING_LOG_ENABLE);


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'audio/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    },
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
        cb(null, true);
    } else {
        cb(new Error('Only images are allowed!'), false);
    }
};
const upload = multer({ storage, fileFilter });


const uploadsDir = path.join(__dirname, "../../audio_uploads");
const completedDir = path.join(uploadsDir, "completed");
const chunksDir = path.join(uploadsDir, "chunks");
const linkFileUrl = "/audio_uploads/completed/"

class SongClass {
    async addSong(req, res) {
        try {
            upload.single('fileAudio')(req, res, async (err) => {
                if (err) {
                    console.error('Upload error:', err);
                    return res.status(400).json(formatResponseError({ code: '400' }, false, 'Lỗi upload file'));
                }

                if (!req.file) {
                    return res.status(400).json(formatResponseError({ code: '400' }, false, 'Không tìm thấy file âm thanh'));
                }

                if (!isValidAudioFile(req.file)) {
                    return res.status(400).json(formatResponseError({ code: '400' }, false, 'Lỗi định dạng file'));
                }

                const metadata = await mm.parseFile(req.file.path);
                const durationInSeconds = metadata.format.duration;
                console.log(durationInSeconds)
                // const durationInSecondsRounded = Math.round(durationInSeconds);
                const durationInMillis = Math.round(durationInSeconds * 1000);
                const dataAlbum = await Album.findById(req.body.albumIdString)
                const dataSong = {
                    title: req.body.title,
                    trackNumber: req.body.trackNumber,
                    duration: durationInMillis,
                    data: `${req.file.filename}`,
                    dateModified: Date.now(),
                    artistId: Date.now(),
                    albumName: dataAlbum.albumName,
                    artistName: "Test artistName",
                    composer: "Test composer",
                    albumArtist: "Test albumArtist",
                    albumId: dataAlbum.idAlbum,
                    albumIdString: req.body.albumIdString
                };
                const saveSong = await new Song(dataSong).save();
                const songId = saveSong._id.toString();
                const songDirectory = path.join(__dirname, '..', '..', 'audio', songId);
                fs.mkdirSync(songDirectory, { recursive: true });
                const newFilePath = path.join(songDirectory, req.file.filename);
                fs.renameSync(req.file.path, newFilePath);
                const encKeyPath = path.join(songDirectory, 'enc.key');

                const ffmpegCommand = `ffmpeg -y -i "${newFilePath}" -hls_time 9 -hls_key_info_file "${path.join(songDirectory, 'enc.keyinfo')}" -hls_playlist_type vod -hls_segment_filename "${path.join(songDirectory, 'fileSequence%d.ts')}" "${path.join(songDirectory, 'index.m3u8')}"`;
                // console.log("câu lệnh " + ffmpegCommand)
                // await Song.findByIdAndUpdate(songId, { dataPath: ffmpegCommand });
                exec(`openssl rand 16 > ${encKeyPath}`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Lệnh thất bại: ${error.message}`);
                        return;
                    }
                    if (stderr) {
                        // console.error(`Lỗi: ${stderr}`);
                        return;
                    }

                    exec('openssl rand -hex 16', (error, stdout, stderr) => {
                        if (error) {
                            console.error(`Lỗi: ${error.message}`);
                            return;
                        }
                        if (stderr) {
                            // console.error(`stderr: ${stderr}`);
                            return;
                        }
                        const randomHex = stdout.trim();
                        const ipAddress = getIPAddress();
                        const serverPort = process.env.PORT || 8000;
                        const keyInfoContent = `http://${ipAddress}:${serverPort}/audio/${songId}/enc.key\n${encKeyPath}\n${randomHex}`;
                        fs.writeFileSync(path.join(songDirectory, 'enc.keyinfo'), keyInfoContent);
                        // const filePath = path.join(songDirectory, 'enc.keyinfo');
                        // console.log(filePath);
                        // const fileContent = fs.readFileSync(filePath, 'utf-8');
                        // const ffmpegCommand = `ffmpeg -y -i ${newFilePath} -hls_time 9 -hls_key_info_file ${path.join(songDirectory, 'enc.keyinfo')} -hls_playlist_type vod -hls_segment_filename "${songId}/fileSequence%d.ts" ${songId}/index.m3u8`;
                        //  console.log(ffmpegCommand);

                        // runFFMPEGCommand(ffmpegCommand)

                        // const ffmpegCommand = `ffmpeg -y -i ${newFilePath} -hls_time 9 -hls_key_info_file ${path.join(songDirectory, 'enc.keyinfo')} -hls_playlist_type vod -hls_segment_filename "${songId}/fileSequence%d.ts" ${songId}/index.m3u8`;

                        fs.readFile(encKeyPath, 'utf-8', (err, data) => {
                            if (err) {
                                console.error('Đọc tập tin enc.key thất bại:', err);
                                return;
                            }

                            // console.log('Nội dung của tập tin enc.key:', data);

                        });
                        exec(ffmpegCommand, (error, stdout, stderr) => {
                            if (error) {
                                // console.error(`Error: ${error.message}`);
                                return;
                            }
                            if (stderr) {
                                // console.error(`stderr: ${stderr}`);
                                return;
                            }
                            console.log(`tạo xong m3u8`);
                        });
                        res.status(200).json(formatResponseSuccess(saveSong, true, 'Lưu thành công'));
                    });
                });
            });
        } catch (error) {
            console.error('addSong error:', error);
            return res.status(500).json(formatResponseError({ code: '500' }, false, 'Lỗi xảy ra trong quá trình thực thi'));
        }
    }

    async getAllSong(req, res) {
        try {
            const data = await Song.find()
            if (data) {
                res.status(200).json(data);
            }
        } catch (error) {
            console.log(error)
            return res.status(200).json(
                formatResponseError({ code: '404' }, false, 'server error')
            );
        }
    }


    // hàm check dir
    // async checkFile(req, res) {
    //     try {
    //         const { fileHash } = req.params;
    //         const mergedFile = fs.readdirSync(completedDir).find(file => file.startsWith(fileHash));

    //         if (mergedFile) {
    //             const filePath = path.join(completedDir, mergedFile);
    //             console.log(`File đã tồn tại: ${filePath} danh sách ${mergedFile}`);
    //             return res.json({ exists: true, filePath, fileName: mergedFile });
    //         }

    //         const chunkFolder = path.join(chunksDir, fileHash);
    //         if (!fs.existsSync(chunkFolder)) {
    //             console.log(`Không tìm thấy thư mục chunk: ${chunkFolder}`);
    //             return res.json({ exists: false, uploadedChunks: [] });
    //         }

    //         // Lấy danh sách chunk đã upload
    //         const uploadedChunks = fs.readdirSync(chunkFolder)
    //             .filter(file => file.startsWith("chunk_")) // Chỉ lấy file chunk
    //             .map(file => parseInt(file.replace("chunk_", ""))); // Lấy index của chunk

    //         console.log(`File chưa merge, đã upload ${uploadedChunks.length} chunks`);

    //         return res.json({ exists: false, uploadedChunks });

    //     } catch (err) {
    //         logger.error("Lỗi checkFile:", err);
    //         return res.status(500).json({ success: false, error: "Internal Server Error!" });
    //     }
    // }

    async checkFile(req, res) {
        try {
            const { fileHash } = req.params;
            const fileRecord = await FileModel.findOne({ file_hash: fileHash });

            // File đã upload xong và merge hoàn tất
            if (fileRecord && fileRecord.status === "completed") {
                logger.info(`File exists: ${fileRecord.path}`);
                return res.json({
                    exists: true,
                    code: "FILE_EXISTS",
                    filePath: fileRecord.path,
                    fileName: fileRecord.file_name
                });
            }

            const chunkFolder = path.join(chunksDir, fileHash);
            let uploadedChunks = [];
            if (fs.existsSync(chunkFolder)) {
                uploadedChunks = fs.readdirSync(chunkFolder)
                    .filter(name => name.startsWith("chunk_"))
                    .map(name => parseInt(name.replace("chunk_", ""), 10))
                    .filter(n => !Number.isNaN(n))
                    .sort((a, b) => a - b);
            }

            if (uploadedChunks.length === 0) {
                logger.error(`file not exists: ${fileHash}`);
                return res.json({ exists: false, code: "FILE_NOT_EXISTS", uploadedChunks: [] });
            }

            logger.warn(`File not merged, uploaded ${uploadedChunks.length} chunks`);
            return res.json({ exists: false, code: "FILE_NOT_MERGED", uploadedChunks });

        } catch (err) {
            logger.error("Error checkFile:", err);
            return res.status(500).json({ success: false, error: "Internal Server Error!" });
        }
    }


    async uploadChunk(req, res) {
        try {
            logger.warn("call uploadChunk");

            const { fileHash, chunkIndex } = req.params;
            console.log("chunkIndex:", chunkIndex);

            if (!req.file) {
                return res.status(400).json({ success: false, error: "No file uploaded" });
            }

            const chunkFolder = path.join(chunksDir, fileHash);
            if (!fs.existsSync(chunkFolder)) fs.mkdirSync(chunkFolder, { recursive: true });

            const chunkPath = path.join(chunkFolder, `chunk_${chunkIndex}`);

            if (fs.existsSync(chunkPath)) {
                console.log(`Chunk ${chunkIndex} exists, next.`);
                return res.json({ success: true, chunkIndex, message: "Chunk already uploaded" });
            }

            fs.renameSync(req.file.path, chunkPath);

            await FileModel.updateOne(
                { file_hash: fileHash },
                { $addToSet: { uploaded_chunks: parseInt(chunkIndex) } },
                { upsert: true }
            );

            console.log(`Chunk ${chunkIndex} uploaded successfully`);

            res.json({ success: true, chunkIndex });

        } catch (err) {
            console.error("Error uploadChunk:", err);
            res.status(500).json({ success: false, error: "Internal Server Error!" });
        }
    }

    async mergeFile(req, res) {
        try {
            const { fileHash, totalChunks, fileName, fileSize } = req.body;
            const chunkFolder = path.join(chunksDir, fileHash);
            const filePath = path.join(completedDir, fileName);
    
            logger.warn(`Bắt đầu merge file: ${fileName}`);
    
            if (!fs.existsSync(chunkFolder)) {
                return res.status(400).json({ success: false, error: "Directory containing chunk not found!" });
            }
    
            if (!fs.existsSync(completedDir)) {
                fs.mkdirSync(completedDir, { recursive: true });
            }
    
            for (let i = 0; i < totalChunks; i++) {
                const chunkPath = path.join(chunkFolder, `chunk_${i}`);
                if (!fs.existsSync(chunkPath)) {
                    return res.status(400).json({ success: false, error: `Missing chunk ${i}!` });
                }
            }
    
            const writeStream = fs.createWriteStream(filePath, { flags: "w" });
    
            const mergeChunks = async () => {
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = path.join(chunkFolder, `chunk_${i}`);
    
                    await new Promise((resolve, reject) => {
                        const readStream = fs.createReadStream(chunkPath);
                        readStream.pipe(writeStream, { end: false });
                        readStream.on("end", resolve);
                        readStream.on("error", reject);
                    });
                }
    
                writeStream.end();
            };
    
            writeStream.on("close", async () => {
                console.log(`Merge success: ${filePath}`);
    
                try {
                    fs.rmSync(chunkFolder, { recursive: true, force: true });
                } catch (err) {
                    console.error("Xóa thư mục thất bại:", err);
                }
    
                await FileModel.findOneAndUpdate(
                    { file_hash: fileHash },
                    {
                        uploaded_chunks: [],
                        file_name: fileName,
                        file_size: fileSize,
                        path: linkFileUrl + fileName,
                        status: "completed"
                    },
                    { upsert: true, new: true }
                );
    
                res.json({ success: true, filePath: linkFileUrl + fileName, fileName });
            });
    
            writeStream.on("error", (err) => {
                console.error("Error merge:", err);
                res.status(500).json({ success: false, error: err.message });
            });
    
            await mergeChunks();
    
        } catch (err) {
            console.error("Error mergeFile:", err);
            res.status(500).json({ success: false, error: "Internal Server Error!" });
        }
    }

}

function isValidAudioFile(file) {
    const validExtensions = ['.mp3', '.wav', '.ogg'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    return validExtensions.includes(fileExtension);
}

function getIPAddress() {
    const networkInterfaces = os.networkInterfaces();
    const addresses = [];
    for (const interfaceKey in networkInterfaces) {
        const networkInterface = networkInterfaces[interfaceKey];
        for (const { address, family, internal } of networkInterface) {
            if (family === 'IPv4' && !internal) {
                addresses.push(address);
            }
        }
    }
    return addresses[0];
}

export default new SongClass();