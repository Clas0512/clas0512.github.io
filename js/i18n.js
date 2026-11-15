/*
 * i18n for the portfolio shell. Classic script, no modules.
 *
 * Markup:
 *   data-i18n="key"                    -> element.textContent
 *   data-i18n-attr="attr:key,attr:key" -> element attributes
 *   data-i18n-date (on <time datetime="YYYY-MM">) -> localized "Mon YYYY"
 *
 * API:
 *   window.SiteI18n.lang        current language ("en" | "tr"), read-only
 *   window.SiteI18n.onChange(cb) cb(lang) after every language switch
 *   window.SiteI18n.t(key, vars) look up a string, "{name}" placeholders filled from vars
 *   window.SiteI18n.set(lang)   switch language
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'site-lang';
  var SUPPORTED = ['en', 'tr'];

  var MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  };

  var DICT = {
    en: {
      'meta.title': 'Adem Berke Nargül · Cloud & AI Engineer',
      'meta.desc': 'Portfolio of Adem Berke Nargül, a Cloud & AI engineer: backend, cloud infrastructure, AI evaluation, and low-level C/C++, including a raycasting engine built with a teammate at 42 Istanbul. Live simulations and browser games included.',

      'nav.skip': 'Skip to content',
      'nav.home': 'Adem Berke Nargül, back to top',
      'nav.label': 'Main',
      'nav.lab': 'Lab',
      'nav.arcade': 'Arcade',
      'nav.experience': 'Experience',
      'nav.projects': 'Projects',
      'nav.about': 'About',
      'nav.contact': 'Contact',
      'nav.langGroup': 'Language',
      'nav.langEn': 'EN, English',
      'nav.langTr': 'TR, Turkish',

      'hero.role': 'Cloud & AI Engineer',
      'hero.intro': 'I build backends and cloud infrastructure, and I evaluate how AI models handle real software-engineering work. Away from the cloud I write low-level C and C++: with a teammate at 42 Istanbul I built a raycasting engine in C, and the Lab below runs the same algorithm, rewritten in JavaScript for this site.',
      'hero.ctaProjects': 'Projects',
      'hero.ctaGithub': 'GitHub',
      'hero.figAlt': 'Diagram of rays cast from one point across a grid map until each ray hits a wall.',
      'hero.figCap': 'Rays stepped through a grid with DDA, computed in your browser. Move the pointer over the map to aim.',
      'hero.ddaStat': '{rays} rays, {cells} cells stepped',

      'lab.title': 'Lab',
      'lab.lede': 'Two simulations written for this site, running live. Click or tab into a canvas to use the keyboard: drive the raycaster, or drop balls into the Verlet scene and reset it.',
      'lab.pause': 'Pause',
      'lab.resume': 'Resume',
      'lab.playShort': 'Play',
      'lab.play': 'Start simulation',
      'lab.unavailTitle': 'Demo unavailable',
      'lab.unavailText': 'The simulation script did not load. The rest of the page works normally.',
      'lab.reducedText': 'Animation is off because your system asks for reduced motion.',
      'lab.ray.canvas': 'Raycaster demo. Focus it to move with the keyboard.',
      'lab.ray.title': 'Raycaster',
      'lab.ray.text': 'The algorithm behind Cub3D, a 42 Istanbul pair project, rewritten in JavaScript for this site. For each column of the screen, one ray steps through the map grid cell by cell (DDA) until it hits a wall. The distance to that hit decides how tall the column’s wall slice is drawn.',
      'lab.ray.kMove': 'move',
      'lab.ray.kTurn': 'turn',
      'lab.ray.kIdle': 'idle',
      'lab.ray.kAuto': 'autopilot takes over',
      'lab.verlet.canvas': 'Verlet physics demo. Drag bodies with the pointer. With the keyboard, Space or Enter drops a ball and R resets the scene.',
      'lab.verlet.title': 'Verlet physics',
      'lab.verlet.text': 'Verlet integration moves each point from its current and previous position instead of storing a velocity, then constraints pull the points back into shape. It is the same idea games use for ragdolls, rope and cloth.',
      'lab.verlet.kDragK': 'drag',
      'lab.verlet.kDrag': 'throw a body',
      'lab.verlet.kClickK': 'click / tap',
      'lab.verlet.kClick': 'empty space to add a ball',
      'lab.verlet.kDrop': 'drop a ball',
      'lab.verlet.kReset': 'reset the scene',
      'keys.left': 'Left arrow',
      'keys.right': 'Right arrow',

      'arc.title': 'Arcade',
      'arc.lede': 'Three small games written for this site. Each one opens in a viewer and runs in your browser.',
      'arc.controls': 'Controls',
      'arc.play': 'Play',
      'arc.snake.title': 'Snake',
      'arc.snake.text': 'The classic: eat, grow longer, and don’t run into yourself.',
      'arc.snake.keys': 'arrow keys or WASD, or swipe',
      'arc.snake.playLabel': 'Play Snake',
      'arc.breakout.title': 'Breakout',
      'arc.breakout.text': 'Bounce the ball off your paddle and clear the wall of bricks.',
      'arc.breakout.keys': '← → or mouse, touch drag, Space to launch',
      'arc.breakout.playLabel': 'Play Breakout',
      'arc.pong.title': 'Pong',
      'arc.pong.text': 'Two paddles, one ball. You play against the computer.',
      'arc.pong.keys': 'W / S or ↑ / ↓, touch drag; on a tall screen the court turns vertical: ← → or A / D',
      'arc.pong.playLabel': 'Play Pong',

      'viewer.restart': 'Restart',
      'viewer.fullscreen': 'Fullscreen',
      'viewer.exitFullscreen': 'Exit fullscreen',
      'viewer.newtab': 'Open in new tab',
      'viewer.close': 'Close',
      'viewer.closeLabel': 'Close game',
      'viewer.frameTitle': '{game} game',

      'exp.title': 'Experience',
      'exp.lede': 'AI evaluation, cloud platforms and full-stack delivery, most recent first.',
      'exp.tags': 'Technologies',
      'exp.j1.role': 'Software Engineer Tutor',
      'exp.j1.org': 'AI research company · US, remote',
      'exp.j1.b1': 'Write and evaluate complex software-engineering tasks for AI coding agents, including tasks that take advanced models more than 15 minutes of reasoning.',
      'exp.j1.b2': 'Review model solutions across languages for correctness, reasoning depth, instruction following and debugging, and work out the correct engineering fix.',
      'exp.j1.b3': 'Work with coding agents, computer-control agents and agents that operate everyday software, with a focus on reliability and task completion.',
      'exp.j2.role': 'Full Stack & Infrastructure',
      'exp.j2.org': 'Confidential client · Turkey, hybrid · project-based',
      'exp.j2.b1': 'Designed and built a modular CRM / ERP platform covering customers, machines, quotations, sales processes, visits, accounting and document generation.',
      'exp.j2.b2': 'Modelled the PostgreSQL schema and split the system into services; document generation and file storage run on Gotenberg and MinIO.',
      'exp.j2.b3': 'Containerized every service with Docker, deployed on Railway, and added Cloudflare R2 as a backup storage layer.',
      'exp.j3.role': 'Cloud & AI Engineer',
      'exp.j3.org': 'Skyloop AI · Istanbul, hybrid',
      'exp.j3.b1': 'In a three-person team, integrated mcp-use and Langfuse into a custom application, and independently designed and built its entire RAG and Inspector modules.',
      'exp.j3.b2': 'Built the RAG pipeline: documents are chunked and managed across four stores, a vector DB, chunk DB, file DB and metadata DB.',
      'exp.j3.b3': 'Worked on a dual-plane EKS architecture on AWS for a platform that generates customizable workflows.',
      'exp.j4.role': 'AI Evaluation & Training Engineer',
      'exp.j4.org': 'Outlier AI · US, remote · project-based',
      'exp.j4.b1': 'Engineered evaluation pipelines for LLMs across supervised fine-tuning (SFT), RLHF and agent-based coding tasks in large-scale training projects.',
      'exp.j4.b2': 'Designed rubric frameworks, automated test harnesses and failure-driven prompts to benchmark model robustness in real engineering scenarios.',
      'exp.j4.b3': 'Built coding task suites in C++, JavaScript, TypeScript, C#, Python and Go that measure reasoning depth, debugging and multi-step accuracy.',
      'exp.j5.role': 'Autonomous Developer',
      'exp.j5.org': 'YTU Formula Student Racing · Istanbul',
      'exp.j5.b1': 'Went from team member to Perception Lead within six months, then took on the Autonomous Team Lead role.',
      'exp.j5.b2': 'Oversaw the integration of SLAM, RRT, LiDAR and ROS-based systems.',
      'exp.j5.b3': 'Mentored 16 junior engineers and set up a support team for knowledge transfer and continuity.',

      'tag.agentEval': 'Agent evaluation',
      'tag.codeReview': 'Code review',
      'tag.multiLang': 'Multi-language',
      'tag.harness': 'Test harnesses',
      'tag.memory': 'Manual memory',
      'tag.windows': 'Windows desktop',
      'tag.stock': 'Stock tracking',

      'proj.title': 'Projects',
      'proj.lede': 'From a C raycaster to production backends. Client work stays unnamed and unlinked.',
      'proj.cub.meta': '42 Istanbul · pair project',
      'proj.cub.text': 'A raycasting engine built in C with a teammate at 42 Istanbul. Rays step through the map grid with DDA, walls are textured column by column, and every allocation is managed by hand. The raycaster in the Lab above is the same algorithm, rewritten in JavaScript for this site.',
      'proj.cub.link': 'Source on GitHub',
      'proj.cub.lab': 'Try it in the Lab',
      'proj.crm.title': 'CRM / ERP platform',
      'proj.crm.meta': 'Confidential client',
      'proj.crm.text': 'A modular platform for customers, machines, quotations, sales, visits, accounting and R&D. Microservice-oriented Django and React on PostgreSQL, with generated documents stored in MinIO, all containerized and deployed on Railway.',
      'proj.rag.title': 'RAG and Inspector modules',
      'proj.rag.meta': 'Skyloop AI',
      'proj.rag.text': 'Two modules I designed and built alone for an MCP-based platform. The RAG pipeline chunks documents and manages them across vector, chunk, file and metadata databases.',
      'proj.status.progress': 'In progress',
      'proj.status.group': 'Group project · in progress',
      'proj.kombin.text': 'An Android outfit app in progress, built around AI virtual try-on and outfit recommendations. Stack: Kotlin (client), Python/FastAPI, PostgreSQL, Cloudflare R2, Railway.',
      'proj.depo.text': 'Smart Warehouse Placement: a university Windows desktop app that places products by usage frequency, size, expiry date and type, and keeps track of stock.',
      'proj.auv.meta': 'Software unit',
      'proj.auv.text': 'Member of the software unit of an autonomous underwater vehicle team, working with ROS 2 Humble and the Gazebo simulator.',

      'about.title': 'About',
      'about.lede': 'Backend and infrastructure by trade, low-level C by habit.',
      'about.p1': 'I’m a software engineer working across backend services, cloud infrastructure and AI evaluation. Most of my C and C++ comes from 42 Istanbul’s project-based curriculum, and I’m now in my second year of Software Engineering at Beykent University.',
      'about.p2': 'I like systems I can reason about end to end, from a PostgreSQL schema and a Kubernetes deployment down to a single ray stepping through a grid.',
      'about.edu': 'Education',
      'about.skills': 'Skills',
      'about.present': 'present',
      'about.edu1.name': 'Istanbul Beykent University',
      'about.edu1.what': 'Software Engineering, 2nd year',
      'about.edu2.name': 'Istanbul University',
      'about.edu2.what': 'Computer Programming',
      'about.edu3.name': '42 Istanbul',
      'about.edu3.what': 'Computer Science, peer-driven and project-based: algorithms, C, C++, Python, Bash',

      'sk.lang': 'Programming languages',
      'sk.web': 'Web & API',
      'sk.backend': 'Backend',
      'sk.frontend': 'Frontend',
      'sk.cloud': 'Cloud & infrastructure',
      'sk.devops': 'DevOps & automation',
      'sk.devopsList': 'ArgoCD, Jenkins, Shell/Bash scripting, Ansible',
      'sk.mon': 'Monitoring & logging',
      'sk.net': 'Networking',
      'sk.netList': 'Nginx, DNS management, subnet masking',
      'sk.db': 'Databases',
      'sk.method': 'Methodologies',
      'sk.methodList': 'Agile, Scrum, object-oriented programming',
      'sk.tools': 'Tools & platforms',
      'sk.spoken': 'Languages',
      'sk.spokenList': 'Turkish (native), English (intermediate, B1)',

      'contact.title': 'Contact',
      'contact.lede': 'Email is the fastest way to reach me.',
      'contact.mailLabel': 'Send an email to ademberke@mail.com',
      'contact.copy': 'Copy address',
      'contact.write': 'Write an email',
      'contact.copied': 'Copied to clipboard',
      'contact.copyFail': 'Copy failed. Select the address and copy it manually.',
      'contact.linkedin': 'LinkedIn',
      'contact.github': 'GitHub',

      'footer.line': 'Hand-built with HTML, CSS and vanilla JavaScript, no framework and no build step. The Lab demos and Arcade games were written for this site.'
    },

    tr: {
      'meta.title': 'Adem Berke Nargül · Bulut ve Yapay Zekâ Mühendisi',
      'meta.desc': 'Bulut ve yapay zekâ mühendisi Adem Berke Nargül’ün portfolyosu: backend, bulut altyapısı, yapay zekâ değerlendirmesi ve 42 İstanbul’da bir takım arkadaşıyla yazılan raycasting motoru dahil düşük seviyeli C/C++. Canlı simülasyonlar ve tarayıcıda oynanabilen oyunlar da burada.',

      'nav.skip': 'İçeriğe geç',
      'nav.home': 'Adem Berke Nargül, sayfa başına dön',
      'nav.label': 'Ana menü',
      'nav.lab': 'Lab',
      'nav.arcade': 'Oyunlar',
      'nav.experience': 'Deneyim',
      'nav.projects': 'Projeler',
      'nav.about': 'Hakkımda',
      'nav.contact': 'İletişim',
      'nav.langGroup': 'Dil',
      'nav.langEn': 'EN, İngilizce',
      'nav.langTr': 'TR, Türkçe',

      'hero.role': 'Bulut ve Yapay Zekâ Mühendisi',
      'hero.intro': 'Backend sistemleri ve bulut altyapısı kuruyor, yapay zekâ modellerinin gerçek yazılım mühendisliği işlerinde ne kadar başarılı olduğunu değerlendiriyorum. Bulutun dışında düşük seviyeli C ve C++ yazıyorum: 42 İstanbul’da bir takım arkadaşımla birlikte C ile bir raycasting motoru yazdık; aşağıdaki Lab bölümünde aynı algoritmanın bu site için JavaScript’le yeniden yazılmış hâlini deneyebilirsiniz.',
      'hero.ctaProjects': 'Projeler',
      'hero.ctaGithub': 'GitHub',
      'hero.figAlt': 'Bir noktadan çıkan ışınların, her biri bir duvara çarpana kadar ızgara harita üzerinde ilerlediğini gösteren diyagram.',
      'hero.figCap': 'DDA ile ızgarada adım adım ilerleyen ışınlar; hesaplama tarayıcınızda yapılıyor. Nişan almak için imleci haritanın üzerinde gezdirin.',
      'hero.ddaStat': '{rays} ışın, {cells} hücre adımı',

      'lab.title': 'Lab',
      'lab.lede': 'Bu site için yazılmış, canlı çalışan iki simülasyon. Klavyeyi kullanmak için tuvale tıklayın ya da Tab tuşuyla üzerine gelin: raycaster’ı sürebilir, Verlet sahnesine top bırakıp sahneyi sıfırlayabilirsiniz.',
      'lab.pause': 'Duraklat',
      'lab.resume': 'Devam et',
      'lab.playShort': 'Başlat',
      'lab.play': 'Simülasyonu başlat',
      'lab.unavailTitle': 'Demo şu an kullanılamıyor',
      'lab.unavailText': 'Simülasyon betiği yüklenemedi. Sayfanın geri kalanı normal şekilde çalışıyor.',
      'lab.reducedText': 'Sisteminiz azaltılmış hareket tercih ettiği için animasyon kapalı.',
      'lab.ray.canvas': 'Raycaster demosu. Klavyeyle hareket etmek için üzerine odaklanın.',
      'lab.ray.title': 'Raycaster',
      'lab.ray.text': '42 İstanbul’da ikili proje olarak yazılan Cub3D’nin algoritması, bu site için JavaScript’le yeniden yazıldı. Ekrandaki her sütun için bir ışın, bir duvara çarpana kadar harita ızgarasında hücre hücre ilerler (DDA). Çarpma noktasına olan uzaklık, o sütundaki duvar diliminin ne kadar uzun çizileceğini belirler.',
      'lab.ray.kMove': 'hareket',
      'lab.ray.kTurn': 'dönüş',
      'lab.ray.kIdle': 'boşta',
      'lab.ray.kAuto': 'otomatik pilot devreye girer',
      'lab.verlet.canvas': 'Verlet fizik demosu. Cisimleri imleçle sürükleyin. Klavyede Space ya da Enter top bırakır, R sahneyi sıfırlar.',
      'lab.verlet.title': 'Verlet fiziği',
      'lab.verlet.text': 'Verlet integrasyonu, hızı ayrıca saklamak yerine her noktayı mevcut ve bir önceki konumundan yola çıkarak hareket ettirir; ardından kısıtlar noktaları yeniden şekline oturtur. Oyunlarda ragdoll, ip ve kumaş simülasyonlarında kullanılan fikir de budur.',
      'lab.verlet.kDragK': 'sürükleme',
      'lab.verlet.kDrag': 'cismi fırlatır',
      'lab.verlet.kClickK': 'tıklama',
      'lab.verlet.kClick': 'boş alana yeni top ekler',
      'lab.verlet.kDrop': 'top bırakır',
      'lab.verlet.kReset': 'sahneyi sıfırlar',
      'keys.left': 'Sol ok',
      'keys.right': 'Sağ ok',

      'arc.title': 'Oyunlar',
      'arc.lede': 'Bu site için yazılmış üç küçük oyun. Her biri ayrı bir pencerede açılır ve doğrudan tarayıcınızda çalışır.',
      'arc.controls': 'Kontroller',
      'arc.play': 'Oyna',
      'arc.snake.title': 'Yılan',
      'arc.snake.text': 'Klasik oyun: yemleri yiyerek uzayın, kendinize çarpmayın.',
      'arc.snake.keys': 'ok tuşları ya da WASD, dokunmatikte kaydırma',
      'arc.snake.playLabel': 'Yılan’ı oyna',
      'arc.breakout.title': 'Tuğla Kırma',
      'arc.breakout.text': 'Topu raketle sektirip tuğla duvarı temizleyin.',
      'arc.breakout.keys': '← → ya da fare, dokunarak sürükleme, fırlatmak için Space',
      'arc.breakout.playLabel': 'Tuğla Kırma’yı oyna',
      'arc.pong.title': 'Pong',
      'arc.pong.text': 'İki raket, bir top. Bilgisayara karşı oynarsınız.',
      'arc.pong.keys': 'W / S ya da ↑ / ↓, dokunarak sürükleme; dikey ekranda saha da dikey olur: ← → ya da A / D',
      'arc.pong.playLabel': 'Pong’u oyna',

      'viewer.restart': 'Yeniden başlat',
      'viewer.fullscreen': 'Tam ekran',
      'viewer.exitFullscreen': 'Tam ekrandan çık',
      'viewer.newtab': 'Yeni sekmede aç',
      'viewer.close': 'Kapat',
      'viewer.closeLabel': 'Oyunu kapat',
      'viewer.frameTitle': '{game} oyunu',

      'exp.title': 'Deneyim',
      'exp.lede': 'Yapay zekâ değerlendirmesi, bulut platformları ve uçtan uca yazılım geliştirme; en yeniden eskiye.',
      'exp.tags': 'Teknolojiler',
      'exp.j1.role': 'Yazılım Mühendisi – Yapay Zekâ Eğitmeni',
      'exp.j1.org': 'Yapay zekâ araştırma şirketi · ABD, uzaktan',
      'exp.j1.b1': 'Yapay zekâ kodlama ajanları için karmaşık yazılım mühendisliği görevleri yazıp değerlendiriyorum; bunların arasında gelişmiş modellerin 15 dakikadan uzun düşünmesini gerektiren görevler de var.',
      'exp.j1.b2': 'Modellerin farklı dillerdeki çözümlerini doğruluk, akıl yürütme derinliği, talimatlara uyum ve hata ayıklama açısından inceliyor, doğru mühendislik çözümünü ortaya koyuyorum.',
      'exp.j1.b3': 'Kodlama ajanları, bilgisayar kontrol ajanları ve yaygın yazılımları kullanan ajanlarla çalışıyor; güvenilirlik ve görev tamamlama üzerine yoğunlaşıyorum.',
      'exp.j2.role': 'Full Stack ve Altyapı',
      'exp.j2.org': 'Adı paylaşılmayan müşteri · Türkiye, hibrit · proje bazlı',
      'exp.j2.b1': 'Müşteri, makine, teklif, satış süreci, ziyaret, muhasebe ve doküman üretimini kapsayan modüler bir CRM / ERP platformu tasarlayıp geliştirdim.',
      'exp.j2.b2': 'PostgreSQL şemasını modelleyip sistemi servislere ayırdım; doküman üretimi ve dosya depolama Gotenberg ile MinIO üzerinde çalışıyor.',
      'exp.j2.b3': 'Tüm servisleri Docker ile konteynerleştirip Railway’e deploy ettim, yedek depolama katmanı olarak Cloudflare R2’yi ekledim.',
      'exp.j3.role': 'Bulut ve Yapay Zekâ Mühendisi',
      'exp.j3.org': 'Skyloop AI · İstanbul, hibrit',
      'exp.j3.b1': 'Üç kişilik bir ekiple mcp-use ve Langfuse’u özel bir uygulamaya entegre ettik; uygulamanın RAG ve Inspector modüllerinin tamamını tek başıma tasarlayıp geliştirdim.',
      'exp.j3.b2': 'RAG pipeline’ını kurdum: dokümanlar parçalara bölünüyor ve vektör, chunk, dosya ve metadata olmak üzere dört ayrı veritabanında yönetiliyor.',
      'exp.j3.b3': 'AWS üzerinde, özelleştirilebilir iş akışları üreten bir platform için dual-plane EKS mimarisiyle çalıştım.',
      'exp.j4.role': 'Yapay Zekâ Değerlendirme ve Eğitim Mühendisi',
      'exp.j4.org': 'Outlier AI · ABD, uzaktan · proje bazlı',
      'exp.j4.b1': 'Büyük ölçekli eğitim projelerinde LLM’ler için denetimli ince ayar (SFT), RLHF ve ajan tabanlı kodlama görevlerini kapsayan değerlendirme pipeline’ları geliştirdim.',
      'exp.j4.b2': 'Model dayanıklılığını gerçek mühendislik senaryolarında ölçmek için rubrik çerçeveleri, otomatik test düzenekleri ve hata odaklı prompt sistemleri tasarladım.',
      'exp.j4.b3': 'C++, JavaScript, TypeScript, C#, Python ve Go ile akıl yürütme derinliğini, hata ayıklama becerisini ve çok adımlı doğruluğu ölçen kodlama görev setleri hazırladım.',
      'exp.j5.role': 'Otonom Sistemler Geliştiricisi',
      'exp.j5.org': 'YTÜ Formula Student Racing · İstanbul',
      'exp.j5.b1': 'Altı ay içinde takım üyeliğinden Algılama (Perception) Lideri’ne yükseldim, ardından Otonom Takım Lideri rolünü üstlendim.',
      'exp.j5.b2': 'SLAM, RRT, LiDAR ve ROS tabanlı sistemlerin entegrasyonunu yönettim.',
      'exp.j5.b3': '16 junior mühendise mentorluk yaptım; bilgi aktarımı ve ekibin sürekliliği için bir destek ekibi kurdum.',

      'tag.agentEval': 'Ajan değerlendirme',
      'tag.codeReview': 'Kod incelemesi',
      'tag.multiLang': 'Çok dilli',
      'tag.harness': 'Test düzenekleri',
      'tag.memory': 'Elle bellek yönetimi',
      'tag.windows': 'Windows masaüstü',
      'tag.stock': 'Stok takibi',

      'proj.title': 'Projeler',
      'proj.lede': 'C ile yazılmış bir raycaster’dan canlıda çalışan backend’lere. Müşteri işlerinin adı ve bağlantısı paylaşılmıyor.',
      'proj.cub.meta': '42 İstanbul · ikili proje',
      'proj.cub.text': '42 İstanbul’da bir takım arkadaşımla birlikte C ile yazdığımız bir raycasting motoru. Işınlar harita ızgarasında DDA ile ilerliyor, duvarlar sütun sütun dokulanıyor ve bellek tamamen elle yönetiliyor. Yukarıdaki Lab’deki raycaster, aynı algoritmanın bu site için JavaScript’le yeniden yazılmış hâli.',
      'proj.cub.link': 'GitHub’da kaynak kodu',
      'proj.cub.lab': 'Lab’de deneyin',
      'proj.crm.title': 'CRM / ERP platformu',
      'proj.crm.meta': 'Adı paylaşılmayan müşteri',
      'proj.crm.text': 'Müşteri, makine, teklif, satış, ziyaret, muhasebe ve Ar-Ge süreçleri için modüler bir platform. PostgreSQL üzerinde mikroservis odaklı Django ve React; üretilen dokümanlar MinIO’da saklanıyor, her şey konteynerleştirilmiş hâlde Railway’de çalışıyor.',
      'proj.rag.title': 'RAG ve Inspector modülleri',
      'proj.rag.meta': 'Skyloop AI',
      'proj.rag.text': 'MCP tabanlı bir platform için tek başıma tasarlayıp geliştirdiğim iki modül. RAG pipeline’ı dokümanları parçalara bölüyor ve vektör, chunk, dosya ve metadata veritabanlarında yönetiyor.',
      'proj.status.progress': 'Devam ediyor',
      'proj.status.group': 'Grup projesi · devam ediyor',
      'proj.kombin.text': 'Geliştirme aşamasındaki bir Android kombin uygulaması; yapay zekâ destekli sanal deneme ve kombin önerileri üzerine kurulu. Teknolojiler: Kotlin (istemci), Python/FastAPI, PostgreSQL, Cloudflare R2, Railway.',
      'proj.depo.text': 'Üniversitede grup projesi olarak geliştirdiğimiz bir Windows masaüstü uygulaması. Ürünleri kullanım sıklığı, boyut, son kullanma tarihi ve türüne göre depoya yerleştiriyor, stokları da takip ediyor.',
      'proj.auv.meta': 'Yazılım birimi',
      'proj.auv.text': 'Otonom bir su altı aracı takımının yazılım biriminde yer alıyorum; ROS 2 Humble ve Gazebo simülatörüyle çalışıyorum.',

      'about.title': 'Hakkımda',
      'about.lede': 'İşim backend ve altyapı, tutkum düşük seviyeli C.',
      'about.p1': 'Backend servisleri, bulut altyapısı ve yapay zekâ değerlendirmesi alanlarında çalışan bir yazılım mühendisiyim. C ve C++ birikimimin büyük kısmı 42 İstanbul’un proje tabanlı eğitiminden geliyor; şu anda Beykent Üniversitesi Yazılım Mühendisliği bölümünde ikinci sınıftayım.',
      'about.p2': 'Uçtan uca kavrayabildiğim sistemleri seviyorum: bir PostgreSQL şemasından ve Kubernetes deployment’ından, ızgarada adım adım ilerleyen tek bir ışına kadar.',
      'about.edu': 'Eğitim',
      'about.skills': 'Yetenekler',
      'about.present': 'devam ediyor',
      'about.edu1.name': 'İstanbul Beykent Üniversitesi',
      'about.edu1.what': 'Yazılım Mühendisliği, 2. sınıf',
      'about.edu2.name': 'İstanbul Üniversitesi',
      'about.edu2.what': 'Bilgisayar Programcılığı',
      'about.edu3.name': '42 İstanbul',
      'about.edu3.what': 'Bilgisayar bilimleri; akran öğrenmesine dayalı, proje tabanlı eğitim: algoritmalar, C, C++, Python, Bash',

      'sk.lang': 'Programlama dilleri',
      'sk.web': 'Web ve API',
      'sk.backend': 'Backend',
      'sk.frontend': 'Frontend',
      'sk.cloud': 'Bulut ve altyapı',
      'sk.devops': 'DevOps ve otomasyon',
      'sk.devopsList': 'ArgoCD, Jenkins, Shell/Bash betikleri, Ansible',
      'sk.mon': 'İzleme ve loglama',
      'sk.net': 'Ağ',
      'sk.netList': 'Nginx, DNS yönetimi, alt ağ (subnet) hesaplama',
      'sk.db': 'Veritabanları',
      'sk.method': 'Yöntemler',
      'sk.methodList': 'Agile, Scrum, nesne yönelimli programlama',
      'sk.tools': 'Araçlar ve platformlar',
      'sk.spoken': 'Diller',
      'sk.spokenList': 'Türkçe (ana dil), İngilizce (orta seviye, B1)',

      'contact.title': 'İletişim',
      'contact.lede': 'Bana ulaşmanın en hızlı yolu e-posta.',
      'contact.mailLabel': 'ademberke@mail.com adresine e-posta gönder',
      'contact.copy': 'Adresi kopyala',
      'contact.write': 'E-posta yaz',
      'contact.copied': 'Panoya kopyalandı',
      'contact.copyFail': 'Kopyalanamadı. Adresi seçip elle kopyalayın.',
      'contact.linkedin': 'LinkedIn',
      'contact.github': 'GitHub',

      'footer.line': 'HTML, CSS ve saf JavaScript ile elle yazıldı; framework ya da derleme adımı yok. Lab demoları ve oyunlar bu site için yazıldı.'
    }
  };

  function normalize(l) {
    if (!l) return null;
    l = String(l).toLowerCase();
    if (l.indexOf('tr') === 0) return 'tr';
    if (l.indexOf('en') === 0) return 'en';
    return null;
  }

  function readSaved() {
    try { return normalize(window.localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }
  function save(l) {
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch (e) { /* storage blocked: ignore */ }
  }

  function detect() {
    var saved = readSaved();
    if (saved) return saved;
    var langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    // Only the first preference decides: tr* -> TR, anything else -> EN.
    return normalize(langs[0]) === 'tr' ? 'tr' : 'en';
  }

  var current = detect();
  var listeners = [];

  function t(key, vars) {
    var table = DICT[current] || DICT.en;
    var s = Object.prototype.hasOwnProperty.call(table, key) ? table[key]
      : (Object.prototype.hasOwnProperty.call(DICT.en, key) ? DICT.en[key] : key);
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
      });
    }
    return s;
  }

  function apply(root) {
    root = root || document;
    var i, els, el;

    els = root.querySelectorAll('[data-i18n]');
    for (i = 0; i < els.length; i++) {
      el = els[i];
      el.textContent = t(el.getAttribute('data-i18n'));
    }

    els = root.querySelectorAll('[data-i18n-attr]');
    for (i = 0; i < els.length; i++) {
      el = els[i];
      var pairs = el.getAttribute('data-i18n-attr').split(',');
      for (var j = 0; j < pairs.length; j++) {
        var p = pairs[j].split(':');
        if (p.length === 2) el.setAttribute(p[0].trim(), t(p[1].trim()));
      }
    }

    els = root.querySelectorAll('time[data-i18n-date]');
    for (i = 0; i < els.length; i++) {
      el = els[i];
      var m = /^(\d{4})-(\d{2})/.exec(el.getAttribute('datetime') || '');
      if (m) el.textContent = MONTHS[current][parseInt(m[2], 10) - 1] + ' ' + m[1];
    }

    document.documentElement.setAttribute('lang', current);

    var btns = document.querySelectorAll('.lang__btn');
    for (i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-lang') === current ? 'true' : 'false');
    }
  }

  function set(l) {
    l = normalize(l);
    if (!l || SUPPORTED.indexOf(l) < 0) return;
    var changed = l !== current;
    current = l;
    save(l);
    apply();
    if (!changed) return;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](current); } catch (e) {
        if (window.console) console.warn('SiteI18n listener failed', e);
      }
    }
  }

  var api = {
    onChange: function (cb) { if (typeof cb === 'function') listeners.push(cb); },
    t: t,
    set: set,
    apply: apply,
    dict: DICT
  };
  Object.defineProperty(api, 'lang', { get: function () { return current; }, enumerable: true });
  window.SiteI18n = api;

  apply();

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.lang__btn') : null;
    if (b) set(b.getAttribute('data-lang'));
  });
})();
