# 光化学オキシダント予測ビューワー

このプロジェクトは、光化学オキシダント（OX）の予測データを視覚的に表示するWebアプリケーションです。Svelte + Viteを使用して構築されています。

## 機能概要

- **予測データの可視化**
  - 24時間先までの光化学オキシダント濃度予測
  - 注意報発令レベル（120ppm）を超える確率の表示
  - インタラクティブなグラフによるデータ表示

- **地図インターフェース**
  - 国土地理院の地図タイルを使用
  - クロスヘアによる地点選択
  - 現在地への移動機能
  - 選択地点の住所表示

- **リアルタイムデータ更新**
  - 地図移動時の自動データ更新
  - 効率的なデバウンス処理による更新制御

## 必要条件

- [Node.js](https://nodejs.org) (バージョン16以上)
- npm (Node.jsに同梱)

## 開始方法

### 依存関係のインストール

```bash
npm install
```

### 開発サーバーの起動

```bash
npm run dev
```

[localhost:8080](http://localhost:8080)にアクセスすると、アプリケーションが表示されます。

## プロジェクト構成

```
.
├── src/
│   ├── App.svelte      # メインアプリケーションコンポーネント
│   ├── retrieve.js     # データ取得用モジュール
│   └── main.js         # アプリケーションのエントリーポイント
├── public/
│   └── images/         # アイコンや画像ファイル
└── vite.config.js      # Vite設定ファイル
```

## 使用している主要なライブラリ

- **Svelte** - リアクティブなUIフレームワーク
- **Vite** - 高速な開発サーバーとビルドツール
- **Leaflet** - インタラクティブな地図表示
- **Chart.js** - データのグラフ表示
- **国土地理院タイル** - 地図データ提供

## データ仕様

### 予測データ
- 光化学オキシダント濃度（ppm）
- 24時間先までの1時間ごとの予測値
- 注意報発令レベル（120ppm）超過確率

### 地理データ
- 初期表示位置：平塚市中心部（北緯35.331586度、東経139.349782度）
- ズームレベル：12（デフォルト）

## 開発環境のセットアップ

Visual Studio Codeを使用している場合は、以下の拡張機能をインストールすることを推奨します：
- [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)

## ビルドと本番環境での実行

本番用にアプリケーションをビルドするには：

```bash
npm run build
```

ビルドされたアプリケーションをプレビューするには：

```bash
npm run preview
```

## デプロイ

### Vercelへのデプロイ

1. [Vercel](https://vercel.com)アカウントを作成
2. Vercel CLIをインストール：
```bash
npm install -g vercel
```
3. プロジェクトをデプロイ：
```bash
vercel
```

## 注意事項

- 予測データは参考値であり、実際の値とは異なる場合があります
- 地図の移動時にデータの更新が発生するため、モバイル回線での使用時はデータ通信量にご注意ください

## 貢献について

1. このリポジトリをフォーク
2. 機能開発用のブランチを作成
3. 変更をコミット
4. プルリクエストを作成

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

---

```
yum install nodejs npm
npm install
npm run dev
cd public/images
make
```



# svelte app

This is a project template for [Svelte](https://svelte.dev) apps. It lives at https://github.com/sveltejs/template.

To create a new project based on this template using [degit](https://github.com/Rich-Harris/degit):

```bash
npx degit sveltejs/template svelte-app
cd svelte-app
```

*Note that you will need to have [Node.js](https://nodejs.org) installed.*


## Get started

Install the dependencies...

```bash
cd svelte-app
npm install
```

...then start [Rollup](https://rollupjs.org):

```bash
npm run dev
```

Navigate to [localhost:8080](http://localhost:8080). You should see your app running. Edit a component file in `src`, save it, and reload the page to see your changes.

By default, the server will only respond to requests from localhost. To allow connections from other computers, edit the `sirv` commands in package.json to include the option `--host 0.0.0.0`.

If you're using [Visual Studio Code](https://code.visualstudio.com/) we recommend installing the official extension [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode). If you are using other editors you may need to install a plugin in order to get syntax highlighting and intellisense.

## Building and running in production mode

To create an optimised version of the app:

```bash
npm run build
```

You can run the newly built app with `npm run start`. This uses [sirv](https://github.com/lukeed/sirv), which is included in your package.json's `dependencies` so that the app will work when you deploy to platforms like [Heroku](https://heroku.com).


## Single-page app mode

By default, sirv will only respond to requests that match files in `public`. This is to maximise compatibility with static fileservers, allowing you to deploy your app anywhere.

If you're building a single-page app (SPA) with multiple routes, sirv needs to be able to respond to requests for *any* path. You can make it so by editing the `"start"` command in package.json:

```js
"start": "sirv public --single"
```

## Using TypeScript

This template comes with a script to set up a TypeScript development environment, you can run it immediately after cloning the template with:

```bash
node scripts/setupTypeScript.js
```

Or remove the script via:

```bash
rm scripts/setupTypeScript.js
```

If you want to use `baseUrl` or `path` aliases within your `tsconfig`, you need to set up `@rollup/plugin-alias` to tell Rollup to resolve the aliases. For more info, see [this StackOverflow question](https://stackoverflow.com/questions/63427935/setup-tsconfig-path-in-svelte).

## Deploying to the web

### With [Vercel](https://vercel.com)

Install `vercel` if you haven't already:

```bash
npm install -g vercel
```

Then, from within your project folder:

```bash
cd public
vercel deploy --name my-project
```

### With [surge](https://surge.sh/)

Install `surge` if you haven't already:

```bash
npm install -g surge
```

Then, from within your project folder:

```bash
npm run build
surge public my-project.surge.sh
```
