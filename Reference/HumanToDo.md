# ヒューマン・ToDoガイド (使い方＆テスト手順)

このドキュメントでは、PCでのテスト方法、QRコードの準備方法、実際の運用手順について説明します。

## 1. アプリの仕組み (基本)
このアプリは「URLを開くこと」でデータを記録します。
スマホのカメラでQRコードを読み取る行為は、技術的には「QRコードに含まれているURLにブラウザでアクセスする」ことと同じ処理です。

つまり、**QRコードがなくても、URLをブラウザのアドレスバーに直接入力することでテストや利用が可能**です。

## 2. PCでのテスト方法 (カメラなし)
PCのブラウザで `index.html` を開いた状態で、アドレスバーのURLを直接編集してエンターキーを押すことで、QRコード読み取りをシミュレート（擬似体験）できます。

### 手順
1. `index.html` をブラウザ（ChromeやEdgeなど）で開きます。
   - アドレスバーには `file:///c:/.../index.html` のように表示されています。
   - この時点では「現在の標高」は 0m です。
2. アドレスバーの末尾をクリックし、以下の文字列を追加して書き換えます。
   - **追加する文字**: `?id=test1&steps=10`
   - **完成形のイメージ**: `.../index.html?id=test1&steps=10`
   - (`?` は「ここからパラメータです」という合図、`&` は項目の区切りです)
3. **Enterキー** を押してページを再読み込みします。
4. 画面上に「10段上りました！」と緑色の通知が出れば成功です。標高が増えます。
   - ※通知が出ない場合、もう一度Enterを押してみてください。

### 追加テスト（連続記録）
- **別の場所として記録する場合**:
  - `id` の部分を書き換えます (例: `id=test2`)。
  - URL: `.../index.html?id=test2&steps=15` -> Enter
- **同じ場所を連続で記録する場合**:
  - 重複防止機能が働くため、同じ `id` で連続アクセスするとエラー（赤色の通知）になります。
  - 別のIDを一度挟むか、クールタイム（現在はテスト用に3秒）待ってからアクセスしてください。

## 3. 本番での利用準備 (環境構築 & QRコード作成)
実際にスマホで階段を登りながら使うには、まず「データの保存場所（Supabase）」を用意し、アプリをインターネット上に公開する必要があります。

### 手順S: Supabase (データベース) の準備
このアプリは登山者の位置情報を共有するために Supabase というサービスを使用します。

1. **Supabaseプロジェクトの作成**: [Supabase](https://supabase.com/) にアクセスし、新しいプロジェクトを作成します。
2. **SQLの設定**: 左メニューの「SQL Editor」を開き、以下のSQLを実行してテーブルを作成します。
   ```sql
   -- 1. 登山者データテーブルの作成
   create table if not exists climbers (
     username text primary key,
     total_steps integer default 0,
     station text,
     last_updated timestamp with time zone default now()
   );

   -- 2. リアルタイム更新の有効化
   alter publication supabase_realtime add table climbers;
   
   -- 3. （必要に応じて）匿名アクセスの許可ポリシー
   -- 誰でも読み書きできるようにする場合（簡易版）
   alter table climbers enable row level security;
   create policy "Enable all access for all users" on climbers for all using (true) with check (true);
   ```
3. **接続情報の確認**:
   - `Project URL` と `Anon Key` を取得し、`app.js` の `SUPABASE_URL` と `SUPABASE_KEY` を書き換えます。（※今回は設定済みです）

### 手順A: アプリの公開 (GitHub Pages)
スマホからアクセスするには、Webサーバーへの公開が必要です。最も簡単な「GitHub Pages」を使う方法を案内します。

#### 1. GitHubリポジトリの作成
1. GitHubにログインし、右上の「＋」アイコンから **[New repository]** を選択。
2. **Repository name** に名前を入力 (例: `fujisan-step`)。
3. **Public** (公開) を選択。
   - ※PrivateでもPagesは使えますが、無料プランでは制限がある場合があります。
4. **[Create repository]** をクリック。

#### 2. ファイルのアップロード
1. 作成されたリポジトリのページで **[uploading an existing file]** のリンクをクリック。
2. このフォルダにある以下のファイルをドラッグ＆ドロップ:
   - `index.html`
   - `app.js`
   - (あれば画像ファイルなど)
3. 下部の **Commit changes** ボタンをクリックして保存。

#### 3. GitHub Pagesの有効化
1. リポジトリの **[Settings]** タブを開く。
2. 左メニューから **[Pages]** を選択。
3. **Build and deployment** > **Branch** の項目で:
   - branch: `main` (または `master`) を選択。
   - folder: `/(root)` を選択。
4. **[Save]** をクリック。

数分待つと、画面上部に「**Your site is live at...**」とURLが表示されます。
これこそが、あなたのアプリの公開URLです！
（例: `https://your-username.github.io/fujisan-step/`）

### 手順B: QRコードの作成
各階段に貼るためのURLを決定し、それをQRコードにします。無料の「QRコード作成サイト」などが利用できます。

**作成例:**
- **1階から2階への階段 (20段)**
  - URL: `https://example.com/fujisan/?id=area_1f_2f&steps=20`
  - このURLをQRコードに変換して印刷します。
- **3階から4階への階段 (15段)**
  - URL: `https://example.com/fujisan/?id=area_3f_4f&steps=15`

※ `id` は場所ごとに違う名前（英数字推奨）、`steps` はその階段の実際の段数を指定してください。

### 手順C: 設置と利用
印刷したQRコードを、各階段の「登りきった場所」に貼ります。
ユーザーは以下の流れで利用します。
1. 階段を登る。
2. 登りきった場所にあるQRコードをスマホのカメラで読む。
3. ブラウザが開き、段数が加算される。

## 4. デバッグ・リセット
- 画面一番下の「データリセット」ボタンを押すと、記録を全て消去して初期状態（0段）に戻せます。
