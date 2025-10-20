// Canvas-based Jump Jump game
// Uses 2D canvas API for broad compatibility

interface Vector2 { x: number; y: number; }

interface Platform {
  id: number;
  position: Vector2; // center position
  size: Vector2; // width, height
  color: string;
}

interface GameState {
  gameStarted: boolean;
  gameOver: boolean;
  showOverlay: boolean;
  score: number;
}

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

Page({
  data: {
    gameStarted: false,
    gameOver: false,
    showOverlay: true,
    score: 0
  } as GameState,

  ctx: null as any as WechatMiniprogram.CanvasContext,
  canvasWidth: 0,
  canvasHeight: 0,
  dpr: 1,

  // Game objects
  player: {
    position: { x: 0, y: 0 } as Vector2,
    velocity: { x: 0, y: 0 } as Vector2,
    radius: 18,
    color: "#ffdd57",
    onGround: false
  },
  platforms: [] as Platform[],
  currentPlatformId: 0,
  targetPlatformId: 0,
  pressStartTime: 0,
  isPressing: false,
  gravity: 2000, // px/s^2
  chargeFactor: 4.2, // velocity per second of press
  horizontalFactor: 0.6, // horizontal share of power

  onLoad() {
    this.initCanvas();
  },

  onReady() {
    // setup after first render
  },

  async initCanvas() {
    const sys = wx.getSystemInfoSync();
    const dpr = sys.pixelRatio || 1;
    this.dpr = dpr;
    this.canvasWidth = sys.windowWidth;
    this.canvasHeight = sys.windowHeight;

    const query = wx.createSelectorQuery();
    query.select('#gameCanvas').fields({ node: true, size: true } as any);
    query.exec((res) => {
      const canvas = res && res[0] && (res[0] as any).node as any;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // adjust for DPR
      canvas.width = this.canvasWidth * dpr;
      canvas.height = this.canvasHeight * dpr;
      ctx.scale(dpr, dpr);
      this.ctx = ctx as any;
      // store canvas raf
      (this as any).requestAnimationFrame = canvas.requestAnimationFrame?.bind(canvas) || ((cb: Function) => setTimeout(() => cb(Date.now()), 16));

      this.resetWorld();
      this.renderLoop(0);
    });
  },

  resetWorld() {
    this.platforms = [];
    this.currentPlatformId = 0;
    this.targetPlatformId = 1;
    this.data.score = 0;
    this.player.radius = Math.round(this.canvasWidth / 20);

    const baseY = Math.round(this.canvasHeight * 0.7);

    // initial platforms
    this.platforms.push({
      id: 0,
      position: { x: Math.round(this.canvasWidth * 0.3), y: baseY },
      size: { x: Math.round(this.canvasWidth * 0.22), y: Math.round(this.canvasWidth * 0.06) },
      color: '#4ecca3'
    });
    this.platforms.push(this.generateNextPlatform(this.platforms[0]));

    // player starts on first platform
    this.player.position = { x: this.platforms[0].position.x, y: this.platforms[0].position.y - this.player.radius - 6 };
    this.player.velocity = { x: 0, y: 0 };
    this.player.onGround = true;

    this.setData({ score: 0 });
  },

  generateNextPlatform(prev: Platform): Platform {
    const minDx = Math.round(this.canvasWidth * 0.22);
    const maxDx = Math.round(this.canvasWidth * 0.45);
    const dx = randInt(minDx, maxDx) * (Math.random() > 0.5 ? 1 : -1);
    const minW = Math.round(this.canvasWidth * 0.16);
    const maxW = Math.round(this.canvasWidth * 0.28);
    const width = randInt(minW, maxW);
    const height = Math.max(12, Math.round(width * 0.28));

    const x = clamp(prev.position.x + dx, Math.round(this.canvasWidth * 0.18), Math.round(this.canvasWidth * 0.82));
    const yVariance = Math.round(this.canvasHeight * 0.06);
    const y = clamp(prev.position.y + randInt(-yVariance, yVariance), Math.round(this.canvasHeight * 0.35), Math.round(this.canvasHeight * 0.8));

    return {
      id: prev.id + 1,
      position: { x, y },
      size: { x: width, y: height },
      color: ['#4ecca3', '#f95959', '#3f72af', '#ffd460'][randInt(0, 3)]
    };
  },

  startGame() {
    if (this.data.gameStarted) return;
    this.setData({ gameStarted: true, gameOver: false, showOverlay: false });
    this.resetWorld();
  },

  restartGame() {
    this.setData({ gameOver: false, showOverlay: false });
    this.resetWorld();
  },

  noop() {},

  onTouchStart() {
    if (!this.data.gameStarted || this.data.gameOver) return;
    this.isPressing = true;
    this.pressStartTime = Date.now();
  },

  onTouchEnd() {
    if (!this.data.gameStarted || this.data.gameOver) return;
    if (!this.isPressing) return;
    this.isPressing = false;
    const dtMs = Date.now() - this.pressStartTime;
    const power = Math.min(dtMs / 1000, 1.2) * this.chargeFactor * this.canvasWidth; // scale with width

    // direction towards target platform
    const current = this.platforms[this.currentPlatformId];
    const target = this.platforms[this.targetPlatformId];
    const dirX = target.position.x - current.position.x;
    const dirY = target.position.y - current.position.y;
    const len = Math.max(1, Math.hypot(dirX, dirY));
    const nx = dirX / len;
    const ny = dirY / len;

    this.player.onGround = false;
    this.player.velocity.x = nx * power * this.horizontalFactor;
    this.player.velocity.y = ny * power * 0.4 - power * 0.8; // upward impulse
  },

  update(dt: number) {
    if (!this.ctx) return;

    // charging effect: slight squash
    const squash = this.isPressing && this.player.onGround ? clamp((Date.now() - this.pressStartTime) / 600, 0, 0.25) : 0;

    // physics
    if (!this.player.onGround) {
      this.player.velocity.y += this.gravity * dt;
      this.player.position.x += this.player.velocity.x * dt;
      this.player.position.y += this.player.velocity.y * dt;

      // landing check
      const target = this.platforms[this.targetPlatformId];
      if (this.checkLanding(target)) {
        this.player.onGround = true;
        this.player.velocity = { x: 0, y: 0 };
        this.currentPlatformId = target.id;
        this.targetPlatformId = target.id + 1;
        this.platforms.push(this.generateNextPlatform(target));
        this.setData({ score: this.data.score + 1 });
        this.recenterWorld();
      }

      // miss check (fell below screen)
      if (this.player.position.y - this.player.radius > this.canvasHeight + 80) {
        this.endGame();
      }
    }

    this.draw(squash);
  },

  checkLanding(platform: Platform): boolean {
    const px = this.player.position.x;
    const py = this.player.position.y + this.player.radius; // bottom point
    const left = platform.position.x - platform.size.x / 2;
    const right = platform.position.x + platform.size.x / 2;
    const top = platform.position.y - platform.size.y / 2 - 2;
    const bottom = platform.position.y + platform.size.y / 2 + 4;

    const withinX = px >= left && px <= right;
    const withinY = py >= top && py <= bottom && this.player.velocity.y >= 0;
    return withinX && withinY;
  },

  recenterWorld() {
    // Smoothly move platforms so current stays around 30% width viewport
    const desiredX = Math.round(this.canvasWidth * 0.3);
    const current = this.platforms[this.currentPlatformId];
    const dx = desiredX - current.position.x;
    if (dx === 0) return;
    for (const p of this.platforms) {
      p.position.x += dx;
    }
    // also move player to keep relative position
    this.player.position.x += dx;

    // trim platforms array to keep last few to avoid unbounded growth
    if (this.platforms.length > 8) {
      this.platforms = this.platforms.slice(-6);
      this.currentPlatformId = this.platforms[0].id; // maintain id continuity
      this.targetPlatformId = this.currentPlatformId + 1;
    }
  },

  endGame() {
    this.setData({ gameOver: true, showOverlay: true, gameStarted: true });
  },

  draw(squash: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    // clear
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    // subtle gradient sky
    const grad = ctx.createLinearGradient(0, 0, 0, this.canvasHeight);
    grad.addColorStop(0, '#0b1020');
    grad.addColorStop(1, '#111428');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    // draw platforms (with shadow)
    for (const p of this.platforms) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      const x = Math.round(p.position.x - p.size.x / 2);
      const y = Math.round(p.position.y - p.size.y / 2);
      const r = Math.min(12, Math.round(p.size.y * 0.6));
      this.roundRect(ctx, x, y, p.size.x, p.size.y, r, p.color);
      ctx.restore();
    }

    // draw player (squash/stretch)
    ctx.save();
    const pr = this.player.radius;
    const px = this.player.position.x;
    const py = this.player.position.y;
    const scaleY = 1 - squash;
    const scaleX = 1 + squash * 0.9;
    ctx.translate(px, py);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-px, -py);

    ctx.beginPath();
    ctx.fillStyle = this.player.color;
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(px - pr * 0.35, py - pr * 0.2, pr * 0.12, 0, Math.PI * 2);
    ctx.arc(px + pr * 0.35, py - pr * 0.2, pr * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // base shadow
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    const shadowY = this.player.position.y + this.player.radius + 6;
    ctx.ellipse(px, shadowY, pr * 0.9, pr * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // draw aim line when pressing
    if (this.isPressing && this.player.onGround) {
      const current = this.platforms[this.currentPlatformId];
      const target = this.platforms[this.targetPlatformId];
      const t = clamp((Date.now() - this.pressStartTime) / 1200, 0, 1);
      ctx.save();
      ctx.strokeStyle = `rgba(255,221,87,${0.4 + 0.4 * t})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(current.position.x, current.position.y - this.player.radius - 8);
      ctx.lineTo(target.position.x, target.position.y - this.player.radius - 8);
      ctx.stroke();
      ctx.restore();
    }

    // score (top-left) is in WXML, but we can also render fallback
    if (!this.data.gameStarted || this.data.gameOver) {
      // overlay handled by WXML
    }
  },

  roundRect(ctx: WechatMiniprogram.CanvasContext, x: number, y: number, w: number, h: number, r: number, color: string) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  },

  lastTs: 0,
  renderLoop(ts: number) {
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min(0.033, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.update(dt);
    (this as any).requestAnimationFrame(this.renderLoop.bind(this));
  }
});
