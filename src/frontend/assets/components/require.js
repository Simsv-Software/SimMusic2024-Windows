const {ipcRenderer, shell} = require("electron");
const fs = require("fs");
const path = require("path");
const musicMetadata = require("music-metadata");
const nodeId3 = require("node-id3");