/* Resolution-independent illustration layer. Physics and level coordinates stay in game pixels. */
(() => {
  "use strict";
  const TAU = Math.PI * 2, cache = new Map();
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const valley = new Image(); valley.decoding = "async"; valley.src = "assets/mario-art/painted-valley.png";
  const winter = new Image(); winter.decoding = "async";
  const cavern = new Image(); cavern.decoding = "async";
  const gradient = (ctx, x, y, radius, light, dark) => {
    const g = ctx.createRadialGradient(x - radius * .35, y - radius * .45, 1, x, y, radius * 1.3);
    g.addColorStop(0, light); g.addColorStop(1, dark); return g;
  };
  function oval(ctx, x, y, rx, ry, light, dark = light, stroke = "#293648", width = 1.6) {
    if (light === dark && /^#[\da-f]{6}$/i.test(light)) {
      const channels = light.slice(1).match(/../g).map(v => parseInt(v, 16));
      dark = `rgb(${channels.map(v => Math.round(v * .76)).join(",")})`;
      light = `rgb(${channels.map(v => Math.min(255, Math.round(v * 1.1 + 12))).join(",")})`;
    }
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), 0, 0, TAU);
    ctx.fillStyle = gradient(ctx, x, y, Math.max(rx, ry), light, dark); ctx.fill();
    if (width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function path(ctx, points, fill, stroke = "#293648", width = 1.6) {
    ctx.beginPath(); points(ctx); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function glow(ctx, x, y, radius, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color); g.addColorStop(1, "transparent");
    ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  function player(ctx, camera, p) {
    if (p.invincible > 0 && Math.floor(p.invincible * 12) % 2 === 0) return;
    const x = p.x - camera.x + p.w / 2, bottom = p.y - camera.y + p.h;
    ctx.save();
    if (p.grounded) { ctx.globalAlpha = .2; oval(ctx, x, bottom + 2, 21, 4, "#132530", "#132530", "", 0); ctx.globalAlpha = 1; }
    if (p.starTimer > 0) glow(ctx, x, bottom - 26, 48, "rgba(255,234,116,.55)");
    ctx.translate(x, bottom);
    const size = p.powered ? 1.06 : .78, facing = p.spinJumping && Math.sin(p.runTime * 3) < 0 ? -p.facing : p.facing;
    ctx.scale(size * facing, size * (p.crouching ? .76 : 1));
    const step = p.grounded ? Math.sin(p.runTime * 1.8) * Math.min(1, Math.abs(p.vx) / 160) : .65;
    const red = p.fire ? "#fffdf3" : "#ff655c", redDark = p.fire ? "#ccdce4" : "#b9203f";
    const blue = p.fire ? "#fb7156" : "#448edb", blueDark = p.fire ? "#b4293c" : "#224b91";
    if (p.cape) {
      path(ctx, c => { c.moveTo(-9, -43); c.bezierCurveTo(-24, -38, -42, -36 - (p.capeGliding ? 14 : 0), -39, -20); c.quadraticCurveTo(-25, -7, -9, -16); }, gradient(ctx, -20, -28, 28, "#fff39b", "#df982e"));
      ctx.strokeStyle = "#fff8bf"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, -38); ctx.quadraticCurveTo(-27, -26, -31, -19); ctx.stroke();
    }
    // Limbs articulate independently so running, jumping and braking read clearly.
    oval(ctx, -9 - step * 4, -13 + step * 4, 7, 11, blue, blueDark);
    oval(ctx, -9 - step * 7, -5 + step * 3, 10, 5, "#996944", "#50332c");
    oval(ctx, 8 + step * 4, -12 - step * 4, 7, 11, blue, blueDark);
    oval(ctx, 10 + step * 8, -4 - step * 3, 11, 5, "#aa7950", "#59372c");
    oval(ctx, -11, -32, 8, 11, red, redDark);
    oval(ctx, -15 - step * 3, -24 - step * 5, 6, 6, "#ffffff", "#b8cfdd");
    oval(ctx, 1, -30, 16, 17, red, redDark);
    path(ctx, c => { c.moveTo(-12, -33); c.lineTo(-8, -40); c.lineTo(-4, -39); c.lineTo(-4, -29); c.lineTo(7, -29); c.lineTo(8, -40); c.lineTo(12, -38); c.lineTo(15, -24); c.quadraticCurveTo(1, -11, -13, -23); }, gradient(ctx, 0, -30, 20, blue, blueDark));
    oval(ctx, -5, -29, 2, 2, "#fff4a0", "#dda336", "", 0); oval(ctx, 9, -29, 2, 2, "#fff4a0", "#dda336", "", 0);
    oval(ctx, 13, -33 - step * 3, 7, 9, red, redDark);
    oval(ctx, 18, -27 - step * 6, 7, 6, "#ffffff", "#c6dce7");
    oval(ctx, 1, -49, 15, 14, "#ffd4a3", "#d88c65");
    oval(ctx, -12, -47, 5, 6, "#f7bc88", "#d99468");
    oval(ctx, -9, -54, 5, 7, "#74422d", "#442832", "", 0);
    oval(ctx, 8, -52, 4, 6, "#ffffff", "#f7fcff", "", 0);
    oval(ctx, 9.5, -51, 1.8, 3.7, "#47a5cd", "#162e56", "", 0);
    oval(ctx, 15, -46, 8, 6.2, "#ffdaa6", "#de9972");
    path(ctx, c => { c.moveTo(-1, -45); c.quadraticCurveTo(4, -40, 15, -41); c.quadraticCurveTo(14, -35, 8, -38); c.quadraticCurveTo(3, -34, 0, -39); c.quadraticCurveTo(-6, -37, -5, -42); }, "#4b3030", "", 0);
    oval(ctx, 0, -60, 17, 8.5, red, redDark);
    oval(ctx, 11, -58, 14, 3.6, red, redDark);
    oval(ctx, 4, -63, 5.4, 5, "#fffef4", "#f3e5d4", "", 0);
    ctx.fillStyle = "#d63447"; ctx.font = "900 8px Arial"; ctx.textAlign = "center"; ctx.fillText("M", 4, -60);
    ctx.strokeStyle = "rgba(255,255,255,.42)"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(-2, -63, 11, 3, -.15, Math.PI, TAU); ctx.stroke();
    if (p.spinJumping) { ctx.strokeStyle = "#fff1a3"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -28, 34, 9, -.15, .3, 5.6); ctx.stroke(); }
    ctx.restore();
  }

  function coin(ctx, camera, c) {
    const x = c.x - camera.x, y = c.y - camera.y + Math.sin(c.phase) * 2, width = 4 + Math.abs(Math.cos(c.phase)) * 8;
    glow(ctx, x, y, 26, "rgba(255,222,108,.14)");
    oval(ctx, x, y, width + 1.5, 17, "#fff0a2", "#bb6916", "#9c5b20", 1.3);
    oval(ctx, x, y - .5, width - 1, 14, "#fff7b6", "#f2b333", "#e5a134", 1);
    ctx.fillStyle = "#bd771e"; ctx.fillRect(x - width * .18, y - 8, width * .36, 16);
    if (Math.sin(c.phase * .7) > .7) { ctx.strokeStyle = "#fffde2"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 10, y - 25); ctx.lineTo(x + 10, y - 13); ctx.moveTo(x + 4, y - 19); ctx.lineTo(x + 16, y - 19); ctx.stroke(); }
  }

  function powerUp(ctx, camera, p) {
    const x = p.x - camera.x + p.w / 2, y = p.y - camera.y + p.h / 2;
    ctx.save(); glow(ctx, x, y, 33, "rgba(255,239,142,.22)");
    if (p.type === "mushroom" || p.type === "life") {
      oval(ctx, x, y + 9, 12, 10, "#fff3cf", "#dbaa86");
      oval(ctx, x, y - 5, 20, 15, p.type === "life" ? "#91e875" : "#ff8c69", p.type === "life" ? "#2b9e69" : "#d7314b");
      oval(ctx, x - 5, y - 11, 7, 5, "#fff9dc", "#ffeac2", "", 0); oval(ctx, x + 12, y - 3, 4, 6, "#fff9dc", "#ffeac2", "", 0);
      for (const dx of [-4, 4]) oval(ctx, x + dx, y + 9, 1.5, 3.4, "#25303a", "#25303a", "", 0);
    } else if (p.type === "star") {
      path(ctx, c => { for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 10 : 22; if (!i) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } }, gradient(ctx, x, y, 24, "#fffbc0", "#f4b72f"), "#bc8025");
      for (const dx of [-4, 4]) oval(ctx, x + dx, y, 1.6, 4, "#423b36", "#423b36", "", 0);
    } else if (p.type === "flower") {
      oval(ctx, x, y + 14, 3, 11, "#5edb8f", "#228360");
      oval(ctx, x - 8, y + 17, 8, 4, "#8ce494", "#34874f"); oval(ctx, x + 8, y + 12, 8, 4, "#8ce494", "#34874f");
      for (let i = 0; i < 6; i++) oval(ctx, x + Math.cos(i * TAU / 6) * 10, y - 7 + Math.sin(i * TAU / 6) * 10, 9, 8, "#ffad68", "#e75145", "#b43547", 1);
      oval(ctx, x, y - 7, 10, 8, "#fff7b3", "#f4ca64");
      for (const dx of [-3, 3]) oval(ctx, x + dx, y - 7, 1.2, 3, "#293641", "#293641", "", 0);
    } else {
      ctx.translate(x, y); ctx.rotate(-.3 + Math.sin(p.phase) * .2);
      oval(ctx, 0, -3, 11, 23, "#fff5b4", "#eaae3f", "#bd8731");
      ctx.strokeStyle = "#be872e"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(0, 24);
      for (let i = -16; i < 16; i += 6) { ctx.moveTo(0, i); ctx.lineTo(7, i - 4); ctx.moveTo(0, i + 3); ctx.lineTo(-7, i - 1); } ctx.stroke();
    }
    ctx.restore();
  }

  function terrain(ctx, x, y, tx, ty, biome, top, palette) {
    const key = [biome, top, tx % 4, ty % 3, palette.dirt, palette.grass].join(":");
    if (!cache.has(key)) {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 96;
      const c = canvas.getContext("2d"); c.scale(2, 2);
      const cave = biome === "underground" || biome === "castle", snow = biome === "snow";
      const dirt = c.createLinearGradient(0, 0, 0, 48);
      dirt.addColorStop(0, cave ? "#666e82" : snow ? "#809eb3" : "#b58153"); dirt.addColorStop(1, cave ? "#434859" : snow ? "#5a7999" : "#896445");
      c.fillStyle = dirt; c.fillRect(0, 0, 48, 48);
      for (let i = 0; i < 19; i++) {
        const px = (i * 17 + tx * 7) % 48, py = (i * 13 + ty * 5) % 48;
        oval(c, px, py, 3 + i % 3, 1.8 + i % 2, cave ? "#7d8292" : snow ? "#a6c5d8" : "#c09465", cave ? "#4a5066" : snow ? "#61829e" : "#8c6447", "", 0);
      }
      if (cave) { c.strokeStyle = "rgba(17,26,46,.4)"; c.lineWidth = 2; c.strokeRect(1, 1, 46, 23); c.strokeRect(-23, 25, 46, 23); c.strokeRect(25, 25, 46, 23); }
      if (top) {
        c.fillStyle = "rgba(19,36,37,.26)"; c.fillRect(0, 10, 48, 10);
        const green = c.createLinearGradient(0, 0, 0, 18); green.addColorStop(0, snow ? "#ffffff" : cave ? "#a0a6b2" : "#c4ed83"); green.addColorStop(1, snow ? "#aed8eb" : cave ? "#6e798e" : "#4b9354");
        path(c, p => { p.moveTo(0, 0); p.lineTo(48, 0); p.lineTo(48, 12); for (let i = 48; i >= 0; i -= 8) p.quadraticCurveTo(i - 4, 23, i - 8, 12); }, green, "", 0);
        c.fillStyle = snow ? "#ffffff" : cave ? "#b9c4cf" : "#d6f4a1"; c.fillRect(0, 0, 48, 3);
        if (!snow && !cave) for (let i = 0; i < 7; i++) { c.strokeStyle = "#6db663"; c.lineWidth = 1; c.beginPath(); c.moveTo(i * 8, 10); c.quadraticCurveTo(i * 8 - 2, 5, i * 8 + 3, 3); c.stroke(); }
        if (snow) for (const px of [8, 30]) path(c, p => { p.moveTo(px, 14); p.lineTo(px + 3, 29); p.lineTo(px + 7, 13); }, "#b8e8f2", "", 0);
      }
      cache.set(key, canvas);
    }
    ctx.drawImage(cache.get(key), x, y, 48, 48);
  }

  function tree(ctx, x, y, height, snow, dark) {
    const trunk = gradient(ctx, x, y - height / 2, height, "#9c806f", "#4e5360");
    path(ctx, p => { p.moveTo(x - 7, y); p.lineTo(x - 4, y - height); p.lineTo(x + 5, y - height); p.lineTo(x + 10, y); }, trunk, "", 0);
    if (snow) {
      for (let n = 0; n < 4; n++) {
        const top = y - height - 38 + n * 33, width = 30 + n * 17;
        path(ctx, p => { p.moveTo(x, top); p.quadraticCurveTo(x - width * .3, top + 35, x - width, top + 65); p.quadraticCurveTo(x, top + 77, x + width, top + 65); p.quadraticCurveTo(x + width * .4, top + 35, x, top); }, gradient(ctx, x - 12, top + 20, width * 2, dark ? "#96bccd" : "#f5fcff", dark ? "#577d9f" : "#a1c7da"), "", 0);
      }
    } else {
      for (let n = 0; n < 7; n++) oval(ctx, x + Math.cos(n * 2.4) * 37, y - height + Math.sin(n * 2.4) * 29, 40 + n % 3 * 8, 35, dark ? "#4e797d" : "#82b986", dark ? "#355e71" : "#387f70", "", 0);
    }
  }

  function background(ctx, game) {
    const biome = game.level.definition.biome, snow = biome === "snow", night = biome === "night", castle = biome === "castle", cave = biome === "underground", t = motionPreference.matches ? 0 : game.level.clock;
    const scrollX = motionPreference.matches ? 0 : game.camera.x;
    const sky = ctx.createLinearGradient(0, 0, 0, 648);
    sky.addColorStop(0, cave || castle ? "#182538" : night ? "#1f355c" : snow ? "#639bc6" : "#68bedf");
    sky.addColorStop(1, cave || castle ? "#3c3b54" : night ? "#668199" : snow ? "#e6f3f9" : "#e7f3cd");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 864, 648);
    if (cave || castle) {
      if(!cavern.getAttribute("src"))cavern.src="assets/mario-art/painted-cavern.png";
      if(cavern.complete && cavern.naturalWidth){
        const width=1080,scroll=scrollX*.1,first=Math.floor(scroll/width);
        for(let n=first;n<=first+1;n++){ctx.save();ctx.translate(n*width-scroll+(n%2?width:0),0);ctx.scale(n%2?-1:1,1);ctx.drawImage(cavern,0,-30,width,720);ctx.restore();}
        if(castle){ctx.fillStyle="rgba(65,19,52,.22)";ctx.fillRect(0,0,864,648);}
      }else{
      for (let layer = 0; layer < 2; layer++) for (let i = -1; i < 7; i++) {
        const x = i * 210 - scrollX * (.06 + layer * .07) % 210, y = 90 + layer * 30;
        const wall = ctx.createLinearGradient(x, 0, x + 180, 0); wall.addColorStop(0, "#435369"); wall.addColorStop(.5, "#28354b"); wall.addColorStop(1, "#172338");
        ctx.globalAlpha = layer ? .7 : .35; ctx.fillStyle = wall; ctx.beginPath(); ctx.roundRect(x, y, 170, 480, [85, 85, 0, 0]); ctx.fill();
        ctx.strokeStyle = "#738598"; ctx.lineWidth = 9; ctx.stroke();
        ctx.globalAlpha = 1;
        if (layer && castle) { glow(ctx, x + 187, 290, 95, "rgba(255,154,60,.26)"); oval(ctx, x + 187, 290, 8, 16 + Math.sin(t * 8 + i) * 3, "#fff3a2", "#eb873c", "", 0); }
        else if (layer) for (let n = 0; n < 3; n++) {
          const px = x + 40 + n * 28, py = 530;
          path(ctx, p => { p.moveTo(px, py); p.lineTo(px - 9, py - 48 - n * 17); p.lineTo(px + 4, py - 72 - n * 17); p.lineTo(px + 20, py - 26); p.lineTo(px + 15, py); }, gradient(ctx, px, py - 50, 90, "#a9fbef", "#488cb2"), "#3d779d", 1);
          glow(ctx, px + 4, py - 50, 35, "rgba(109,241,231,.18)");
        }
      }
      }
    } else {
      if(snow && !winter.getAttribute("src"))winter.src="assets/mario-art/painted-winter.png";
      const landscape=snow?winter:valley;
      if (landscape.complete && landscape.naturalWidth) {
        const width = 1080, scroll = scrollX * .12, first = Math.floor(scroll / width);
        for (let n = first; n <= first + 1; n++) { ctx.save(); const x = n * width - scroll; ctx.translate(x + (n % 2 ? width : 0), 0); ctx.scale(n % 2 ? -1 : 1, 1); ctx.drawImage(landscape, 0, -30, width, 720); ctx.restore(); }
        if (night) { ctx.fillStyle = "rgba(17,35,81,.69)"; ctx.fillRect(0, 0, 864, 648); }
      } else {
        for (let layer = 0; layer < 3; layer++) for (let i = -1; i < 7; i++) {
          const x = i * 250 - scrollX * (.035 + layer * .025) % 250, peak = 200 + layer * 63 + Math.sin(i * 4) * 32;
          path(ctx, p => { p.moveTo(x - 130, 610); p.lineTo(x + 80, peak); p.lineTo(x + 260, 610); }, gradient(ctx, x + 20, peak, 380, layer ? "#bed7e6" : "#ecf6fa", layer ? "#688eaf" : "#9bb6d1"), "", 0);
          path(ctx, p => { p.moveTo(x + 80, peak); p.lineTo(x + 21, peak + 112); p.lineTo(x + 80, peak + 72); p.lineTo(x + 113, peak + 123); p.lineTo(x + 130, peak + 91); }, "#eff8fc", "", 0);
        }
      }
      if (night) { glow(ctx, 687, 103, 94, "rgba(236,245,255,.35)"); oval(ctx, 687, 103, 28, 28, "#fffdf0", "#dde8eb", "", 0); }
      for (let layer = 0; layer < 2; layer++) {
        ctx.globalAlpha = layer ? .9 : .55;
        for (let i = -1; i < 6; i++) { const spacing = layer ? 360 : 270, x = i * spacing - scrollX * (layer ? .3 : .19) % spacing; tree(ctx, x + 55, 570, layer ? 160 : 125, snow, night || !layer); }
      }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 30; i++) {
      const x = ((i * 137 - scrollX * .35 + Math.sin(t + i) * 9) % 864 + 864) % 864, y = (i * 89 + t * (snow ? 20 : -6) + 8000) % 580;
      ctx.globalAlpha = .25 + Math.sin(t * 1.4 + i) * .2;
      oval(ctx, x, y, snow ? 2.1 : 1.6, snow ? 2.1 : 1.6, snow ? "#ffffff" : "#fff2b3", snow ? "#ffffff" : "#fff2b3", "", 0);
    }
    ctx.globalAlpha = 1;
  }
  function adventure(ctx, camera, level) {
    for (const platform of level.platforms) {
      const x = platform.x - camera.x, y = platform.y - camera.y;
      ctx.fillStyle = "rgba(13,33,41,.2)"; ctx.beginPath(); ctx.roundRect(x + 3, y + 5, platform.w, platform.h, 5); ctx.fill();
      const wood = ctx.createLinearGradient(0, y, 0, y + platform.h);
      wood.addColorStop(0, platform.crumble ? "#f1c98e" : "#a6e4cd"); wood.addColorStop(1, platform.crumble ? "#9d7058" : "#397d78");
      ctx.fillStyle = wood; ctx.strokeStyle = "#405d63"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x, y, platform.w, platform.h, 4); ctx.fill(); ctx.stroke();
      for (let i = 12; i < platform.w; i += 22) {
        ctx.strokeStyle = "rgba(31,59,61,.3)"; ctx.beginPath(); ctx.moveTo(x + i, y + 2); ctx.lineTo(x + i - (platform.crumble ? 4 : 0), y + platform.h - 1); ctx.stroke();
        oval(ctx, x + i - 5, y + 5, 1.3, 1.3, "#eff7db", "#eff7db", "", 0);
      }
      if (platform.crumble && platform.age > .3) { ctx.strokeStyle = "#674a43"; ctx.beginPath(); ctx.moveTo(x + platform.w * .4, y); ctx.lineTo(x + platform.w * .48, y + 7); ctx.lineTo(x + platform.w * .44, y + platform.h); ctx.stroke(); }
    }
    for (const spring of level.springs) {
      const x = spring.x - camera.x, y = spring.y - camera.y, top = y - (spring.pulse ? 8 : 0);
      ctx.strokeStyle = "#527b91"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 9, top + 6);
      for (let i = 0; i < 5; i++) ctx.lineTo(x + (i % 2 ? 10 : spring.w - 10), top + 6 + i * (y + 18 - top - 6) / 4); ctx.stroke();
      ctx.strokeStyle = "#e9f8ff"; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = "#486575"; ctx.beginPath(); ctx.roundRect(x + 4, y + 17, spring.w - 8, 4, 2); ctx.fill();
      const cap = ctx.createLinearGradient(0, top, 0, top + 8); cap.addColorStop(0, "#ffbfac"); cap.addColorStop(1, "#d74c68");
      ctx.fillStyle = cap; ctx.beginPath(); ctx.roundRect(x, top, spring.w, 8, 3); ctx.fill();
    }
    for (const secret of level.secrets) {
      const x = secret.x - camera.x, y = secret.y - camera.y, center = x + secret.w / 2;
      glow(ctx, center, y + secret.h / 2, 65, "rgba(191,143,255,.3)");
      const portal = ctx.createLinearGradient(0, y, 0, y + secret.h); portal.addColorStop(0, "#9b8ac9"); portal.addColorStop(.4, "#433d83"); portal.addColorStop(1, "#29264d");
      ctx.fillStyle = portal; ctx.strokeStyle = "#e5bc76"; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(x, y, secret.w, secret.h, [secret.w / 2, secret.w / 2, 3, 3]); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 6; i++) { const a = level.clock * .8 + i * TAU / 6; oval(ctx, center + Math.cos(a) * (secret.w * .28), y + secret.h * .5 + Math.sin(a) * 22, 1.5, 1.5, "#fff3b6", "#fff3b6", "", 0); }
      ctx.fillStyle = "#fff3bb"; ctx.font = "bold 23px system-ui"; ctx.textAlign = "center"; ctx.fillText("★", center, y + secret.h * .58);
      ctx.font = "800 10px system-ui"; ctx.fillText("HEMMELIG", center, y - 12); ctx.textAlign = "left";
    }
    for (const shot of level.enemyShots) {
      const x = shot.x - camera.x + 11, y = shot.y - camera.y + 9;
      glow(ctx, x, y, 33, "rgba(255,152,62,.4)");
      oval(ctx, x, y, shot.wave ? 19 : 11, 9, "#ffe9a0", "#f47737", "#d95038", 1);
      oval(ctx, x + 2, y - 1, 5, 4, "#fffbdb", "#ffd672", "", 0);
    }
  }
  window.MarioArt = { player, coin, powerUp, terrain, background, adventure, oval, glow };
})();
