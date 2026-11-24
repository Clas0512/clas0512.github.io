# clas0512.github.io

**EN** · Personal portfolio of Adem Berke Nargül, software engineer (AI agent evaluation & game/simulation programming). A single page with experience, projects, a **Lab** of live simulations (raycaster, Verlet physics) and an **Arcade** of small browser games (Snake, Breakout, Pong). Hand-written HTML, CSS and vanilla JavaScript: no framework, no build step, no external requests. Turkish and English.

**TR** · Adem Berke Nargül'ün kişisel portfolyo sitesi. Deneyim, projeler, canlı simülasyonların bulunduğu **Lab** (raycaster, Verlet fiziği) ve tarayıcıda oynanan küçük oyunların bulunduğu **Oyunlar** bölümünden oluşan tek sayfalık bir site. HTML, CSS ve saf JavaScript ile elle yazıldı: framework, derleme adımı ya da dış istek yok. Türkçe ve İngilizce.

## Structure / Yapı

```
index.html            page shell / sayfa iskeleti
css/site.css          styles, design tokens on :root / stiller, :root üzerinde tasarım değişkenleri
js/i18n.js            TR/EN dictionary + window.SiteI18n / TR/EN sözlüğü + window.SiteI18n
js/main.js            hero figure, Lab mounting, game viewer, copy email / hero çizimi, Lab, oyun penceresi, e-posta kopyalama
lab/raycaster.js      window.LabDemos.raycaster: the Cub3D algorithm (a 42 Istanbul pair project, C) rewritten in JavaScript / Cub3D algoritması (42 İstanbul ikili projesi, C), JavaScript ile yeniden yazıldı
lab/verlet.js         window.LabDemos.verlet
games/<name>/index.html   snake, breakout, pong (accept ?lang=tr|en)
assets/favicon.svg
.nojekyll             serve files as-is on GitHub Pages / GitHub Pages dosyaları olduğu gibi sunsun
```

All scripts are classic scripts (no modules, no build). The shell and Lab files use ES5 style (`var`, IIFE); the games use ES2015+ (`const`, classes, arrow functions). / Tüm betikler klasik betik (modül ya da derleme yok). Kabuk ve Lab dosyaları ES5 tarzında (`var`, IIFE), oyunlar ES2015+ (`const`, sınıflar, ok fonksiyonları) ile yazıldı.

## Run locally / Yerelde çalıştırma

```sh
cd clas0512.github.io
python3 -m http.server 8000
# open / açın: http://localhost:8000
```

Opening `index.html` directly from disk (file://) also works; the games' Esc-to-close shortcut needs a server. / `index.html` doğrudan diskten (file://) açıldığında da çalışır; oyun içindeyken Esc ile kapatma için sunucu gerekir.

## Publish on GitHub Pages / GitHub Pages'te yayınlama

1. Create a public repository named exactly `clas0512.github.io`. / Adı tam olarak `clas0512.github.io` olan herkese açık bir repo oluşturun.
2. Push the contents of this folder to the `main` branch root. / Bu klasörün içeriğini `main` dalının köküne push edin.
   ```sh
   git init && git add . && git commit -m "Portfolio"
   git branch -M main
   git remote add origin https://github.com/Clas0512/clas0512.github.io.git
   git push -u origin main
   ```
3. Settings → Pages → Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)`. / Ayarlar → Pages → Kaynak: *Deploy from a branch*, dal: `main`, klasör `/ (root)`.
4. The site is live at https://clas0512.github.io after a minute or two. / Site bir iki dakika içinde https://clas0512.github.io adresinde yayında olur.
