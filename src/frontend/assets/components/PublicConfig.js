
const defaultConfig = {
	folderLists: [],
	musicLists: {},
	playList: [],
	currentMusic: null,
	volume: .8,
	loop: 0,
	lrcShow: true,
	musicFormats: ".mp3 .wav .flac",
	backgroundBlur: true,
	lyricBlur: true,
	lyricSize: 1.5,
	lyricSpace: .5,
}

const configListeners = {};

const config = {
	getItem(key) {
		const data = localStorage.SimMusicConfig;
		if (!data) {
			localStorage.SimMusicConfig = "{}";
			return this.getItem(key);
		}
		try {
			const config = JSON.parse(data);
			if (config[key] || config[key] === false || config[key] === 0) return config[key];
			return defaultConfig[key];
		} catch(_ignore) {
			alert("配置文件损坏，程序将无法正常运行。");
		}
	},
	setItem(key, value) {
		const data = localStorage.SimMusicConfig;
		if (!data) {
			localStorage.SimMusicConfig = "{}";
			return this.setItem(key, value);
		}
		try {
			const config = JSON.parse(data);
			config[key] = value;
			const newConfig = JSON.stringify(config);
			localStorage.SimMusicConfig = newConfig;
		} catch(_ignore) {
			alert("配置文件损坏，程序将无法正常运行。");
		}
		if (configListeners[key]) configListeners[key](value);
	},
	listenChange(key, callback) {
		configListeners[key] = callback;
	}
}