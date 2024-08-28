const {ipcRenderer, shell} = require("electron");
const fs = require("fs");
const path = require("path");
const musicMetadata = require("music-metadata");
const flacTagger = require("flac-tagger");
const nodeId3 = require("node-id3");
const fflate = require("fflate");
