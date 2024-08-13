
const defaultConfig = {
	musicLists: {},
	playList: [],
	currentMusic: null,
	volume: .8,
	loop: 0,
	lrcShow: true,
	musicFormats: ".mp3 .wav .flac",
	listDomCache: true,
	backgroundBlur: true,
	lyricBlur: true,
	lyricSize: 1.5,
	lyricTranslation: .8,
	lyricSpace: .5,
	lyricMultiLang: true,
	leftBarWidth: 200,
	autoDesktopLyrics: false,
	desktopLyricsProtection: true,
	desktopLyricsAutoHide: true,
	desktopLyricsColor: "#1E9FFF",
	desktopLyricsStroke: "#1672B8",
	desktopLyricsSize: 30,
	desktopLyricsWidth: 700,
	desktopLyricsTop: screen.height - 300,
	desktopLyricsLeft: screen.width / 2,
	extensions: ["assets/extensions/local.json"],
	extensionCache: {},
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
		} catch {
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
		} catch {
			alert("配置文件损坏，程序将无法正常运行。");
		}
		if (configListeners[key]) configListeners[key](value);
	},
	listenChange(key, callback) {
		configListeners[key] = callback;
	}
}