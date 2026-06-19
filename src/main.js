import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fs from 'fs';
import morgan from 'morgan';
import dotenv from 'dotenv';
import socket from 'socket.io';
const rateLimit = require('express-rate-limit');

const addon = require('../build/Release/addon');
dotenv.config();
const app = express();

const routerFiles = fs.readdirSync('./src/routes');
const PORT = process.env.PORT || 3001;
const key = process.env.KEY_128
const iv = process.env.IV_128
const path = require('path');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, try again later.",
  skip: (req) =>
    req.path.includes('/upload-chunk') ||
    req.path.includes('/check-file') ||
    req.path.includes('/merge-file')
});
app.use(limiter);
app.use(express.raw({ type: 'application/x-protobuf' }));
app.use(morgan('tiny'));
app.use(express.json());
app.use(cors());
app.set('trust proxy', 1);

app.use('/uploads', express.static('uploads'));
app.use('/audio', express.static(path.resolve(__dirname, '..', 'audio')));
// using router
routerFiles.forEach((file) => {
  app.use('/api/v1', require(`./routes/${file}`).default);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.info(`Server listening on 0.0.0.0:${PORT} (truy cập qua IP LAN, vd http://192.168.1.9:${PORT})`);
  addon.init(key, iv)
});

mongoose.set('strictQuery', true);
// connect database
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    family: 4
  })
  .then(() => {
    console.info('Connect database successfully');
  })
  .catch((error) => {
    console.info(error);
  });
