import App from './App.svelte';

// モジュール読み込み成功を通知
if (window.markModuleLoaded) {
	window.markModuleLoaded();
}

const app = new App({
	target: document.getElementById('app'),
	props: {
		name: 'world'
	}
});

// アプリケーション初期化成功を通知
if (window.markAppLoaded) {
	window.markAppLoaded();
}

export default app;