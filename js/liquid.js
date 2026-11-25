/**
 * Liquid "water drop" selector — plain-JS port of Nimbus UI · Liquid Navbar "Waterline"
 * (original React component by guglielmogiannattasio.it).
 * The active drop stretches toward the option you pick, splits into droplets on long jumps
 * and merges back with a ripple. Water is drawn by a tiny WebGL shader inside the bar;
 * without WebGL it falls back to a CSS drop. No dependencies.
 *
 * Adapted for Coach: tinted per workout day (neon red / pink / orange), no hover effects
 * (touch phone), and the animation loop stops when idle or off-screen to save battery.
 */

const PAD = 14; // canvas bleed around the bar, for glow and ripples

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAG = `precision highp float;
uniform vec2 uRes;uniform float uDpr;uniform float uTime;uniform vec4 uPill;
uniform vec4 uBlob[6];uniform float uSy[6];uniform vec4 uRip[6];uniform float uDark;uniform float uAmb;uniform vec3 uTint;
float sdRB(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float sdCap(vec2 p,vec4 B,float sy){p-=B.xy;p.y/=sy;p.x=max(abs(p.x)-B.z,0.);return(length(p)-B.w)*min(1.,sy);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float dropD(vec2 p){float d=1e4;for(int i=0;i<6;i++){if(uBlob[i].w>.5){d=smin(d,sdCap(p,uBlob[i],uSy[i]),13.);}}return d;}
float pillD(vec2 p){vec2 h=uPill.zw*.5;return sdRB(p-uPill.xy-h,h,h.y);}
float lens(float d,float w){float t=clamp(-d/w,0.,1.);return sqrt(1.-(1.-t)*(1.-t));}
float waves(vec2 p){float w=0.;
 for(int i=0;i<6;i++){vec4 R=uRip[i];if(R.w>0.){float x=length(p-R.xy)-R.z*240.;w+=R.w*exp(-R.z*1.7)*sin(x*.3)*exp(-x*x/700.);}}
 w+=uAmb*(sin(p.x*.05+uTime*1.2)*.45+sin(p.x*.13-uTime*.85+p.y*.2)*.25);return w;}
float H(vec2 p){float dp=pillD(p);return lens(dp,uPill.w*.36)*2.4+lens(dropD(p),11.)*7.5+waves(p)*smoothstep(0.,7.,-dp);}
float caus(vec2 p,float t){vec2 q=p;float c=0.;for(int i=0;i<3;i++){q+=vec2(sin(q.y*1.1+t),cos(q.x*1.3-t*.7))*.6;c+=1./(1.+16.*abs(sin(q.x)*sin(q.y)));}return c/3.;}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y*uDpr-gl_FragCoord.y)/uDpr;
 float dp=pillD(p);float dd=dropD(p);
 float h0=H(p);vec3 n=normalize(vec3(h0-H(p+vec2(1.,0.)),h0-H(p+vec2(0.,1.)),1.));
 vec3 V=vec3(0.,0.,1.);
 float spec=pow(max(dot(reflect(-normalize(vec3(-.45,-.8,.85)),n),V),0.),70.);
 float spec2=pow(max(dot(reflect(-normalize(vec3(.6,.75,.7)),n),V),0.),22.)*.3;
 float fres=clamp((1.-n.z)*4.,0.,1.);
 vec3 irid=.5+.5*cos(6.2831*(vec3(0.,.33,.67)+fres*.85+p.x*.0028+uTime*.035));
 irid=mix(irid,uTint,.55);
 float pm=smoothstep(1.,-1.,dp);float dm=smoothstep(1.,-1.,dd)*smoothstep(1.,-2.,dp);
 // neon glow of the drop, spilling softly around it
 float glow=exp(-max(dd,0.)/7.)*(1.-dm)*pm*(.32+.18*uDark);
 vec3 c=uTint*glow;float a=glow;
 float sh=smoothstep(9.,-9.,dropD(p-vec2(0.,5.)))*(1.-dm)*pm*(.1+.06*uDark);
 c+=uTint*.25*sh;a=a+sh*(1.-a);
 float pa=clamp(pm*(fres*.45+spec*.9+spec2),0.,1.);
 c=mix(vec3(1.),irid,.5*fres)*pa+c*(1.-pa);a=pa+a*(1.-pa);
 float th=lens(dd,11.);
 float cs=caus((p+n.xy*th*18.)*.085,uTime*.9);
 vec3 tint=mix(mix(vec3(1.),uTint,.35),mix(vec3(1.),uTint,.55),uDark);
 float rim=dm*(1.-smoothstep(0.,8.,-dd));
 float cres=dm*smoothstep(.12,.55,dot(n.xy,normalize(vec2(.55,.85))))*smoothstep(0.,3.,-dd);
 float body=.5+.5*clamp(-n.y*3.,-1.,1.);
 float da=dm*(.2+.12*body)*(1.-.3*uDark);vec3 dc=mix(tint,vec3(1.),body*.5);
 float la=rim*.55;vec3 lc=uTint;dc=lc*la+dc*da*(1.-la);da=la+da*(1.-la);
 la=clamp(cres*.7+smoothstep(.6,1.,cs)*.28*th*dm,0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=clamp(dm*(spec*1.2+spec2*.5),0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=dm*smoothstep(-2.,0.,dd)*.4;dc=mix(vec3(1.),irid,.35)*la+dc*(1.-la);da=la+da*(1.-la);
 c=dc+c*(1.-da);a=da+a*(1.-da);
 gl_FragColor=vec4(c,a);
}`;

function initGL(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  gl.useProgram(p);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(p, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (const n of ['uRes', 'uDpr', 'uTime', 'uPill', 'uBlob', 'uSy', 'uRip', 'uDark', 'uAmb', 'uTint']) u[n] = gl.getUniformLocation(p, n);
  return { gl, u };
}

const hexToRgb = (h) => { const m = h.replace('#', ''); const n = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

/**
 * Turn a bar element containing option buttons into a liquid selector.
 * @param {HTMLElement} bar   positioned container (the glass bar)
 * @param {object} opts       { items: NodeList/Array of buttons, active, tint: '#hex', dark: bool, sound: bool }
 * @returns {{ setActive(i), setTint(hex), setDark(bool), destroy() }}
 */
export function createLiquid(bar, opts) {
  const items = [...opts.items];
  const s = {
    a: { x: 0, v: 0 }, b: { x: 0, v: 0 }, sy: { s: 1, v: 0 }, lead: 0, lagFrom: 0,
    sats: [], rips: [], t: { x: 0, cy: 0, q: 0, r: 21 }, q: 0,
    moving: false, split: false, ready: false, w: 0, h: 0, visible: true, raf: 0, last: 0, time: 0,
    idleUntil: 0, glc: null, active: opts.active || 0, tint: hexToRgb(opts.tint || '#ff3b30'), dark: opts.dark ? 1 : 0,
    reduce: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  };

  const canvas = document.createElement('canvas');
  canvas.className = 'lq-water'; canvas.setAttribute('aria-hidden', 'true');
  const drop = document.createElement('span');
  drop.className = 'lq-drop'; drop.setAttribute('aria-hidden', 'true');
  bar.prepend(drop); bar.prepend(canvas);
  s.glc = initGL(canvas);
  bar.dataset.gl = s.glc ? 'on' : 'off';
  const lost = (e) => { e.preventDefault(); s.glc = null; bar.dataset.gl = 'off'; };
  canvas.addEventListener('webglcontextlost', lost);

  function draw() {
    const T = s.t;
    const sep = Math.abs(s.a.x - s.b.x);
    const thin = Math.min(sep / (2 * (s.q + T.r) || 1), 1);
    const r = T.r * (1 - 0.3 * thin);
    if (s.glc) {
      const { gl: g, u } = s.glc;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
      g.uniform2f(u.uRes, s.w + PAD * 2, s.h + PAD * 2);
      g.uniform1f(u.uDpr, dpr);
      g.uniform1f(u.uTime, s.time);
      g.uniform4f(u.uPill, PAD, PAD, s.w, s.h);
      const blobs = new Float32Array(24), sy = new Float32Array(6).fill(1);
      const head = s.lead === 0 ? s.a : s.b, tail = s.lead === 0 ? s.b : s.a;
      blobs.set([head.x, T.cy, s.q * (1 - 0.25 * thin), T.r * (1 - 0.12 * thin), tail.x, T.cy, s.q * (1 - 0.8 * thin), T.r * (1 - 0.5 * thin)], 0);
      sy[0] = sy[1] = s.sy.s;
      s.sats.slice(0, 4).forEach((d, i) => blobs.set([d.x, d.y, 0, d.r], 8 + i * 4));
      g.uniform4fv(u.uBlob, blobs);
      g.uniform1fv(u.uSy, sy);
      const rips = new Float32Array(24);
      s.rips.slice(-6).forEach((p, i) => rips.set([p.x, p.y, p.age, p.amp], i * 4));
      g.uniform4fv(u.uRip, rips);
      g.uniform1f(u.uDark, s.dark);
      g.uniform1f(u.uAmb, s.reduce ? 0 : 1);
      g.uniform3f(u.uTint, ...s.tint);
      g.clearColor(0, 0, 0, 0);
      g.clear(g.COLOR_BUFFER_BIT);
      g.drawArrays(g.TRIANGLES, 0, 3);
    } else {
      const left = Math.min(s.a.x, s.b.x) - s.q - r - PAD;
      drop.style.width = `${sep + 2 * (s.q + r)}px`;
      drop.style.transform = `translateX(${left}px) scaleY(${s.sy.s})`;
    }
  }

  function step(dt, now) {
    const T = s.t;
    s.time += dt;
    s.q += (T.q - s.q) * Math.min(1, dt * 12);
    const bodies = [s.a, s.b];
    let still = true;
    if (s.reduce) {
      s.a.x = s.b.x = T.x; s.a.v = s.b.v = 0; s.sy.s = 1; s.sats = [];
    } else {
      bodies.forEach((B, i) => {
        const lead = i === s.lead;
        const k = lead ? 210 : 72, c = lead ? 25 : 13;
        const f = !lead && now < s.lagFrom ? 0.08 : 1;
        B.v += (k * (T.x - B.x) - c * B.v) * dt * f;
        B.x += B.v * dt;
        const lo = PAD + 6 + s.q + T.r - 3, hi = PAD + s.w - 6 - s.q - T.r + 3;
        if (B.x < lo || B.x > hi) { s.sy.v -= Math.min(Math.abs(B.v), 900) * 0.0016; B.x = Math.max(lo, Math.min(hi, B.x)); B.v *= -0.25; }
        if (Math.abs(T.x - B.x) > 0.3 || Math.abs(B.v) > 3) still = false;
      });
      const L = bodies[s.lead];
      const syT = 1 - 0.2 * Math.min(Math.abs(L.v) / 1500, 1);
      s.sy.v += (280 * (syT - s.sy.s) - 9 * s.sy.v) * dt;
      s.sy.s += s.sy.v * dt;
      if (Math.abs(s.sy.s - 1) > 0.002 || Math.abs(s.sy.v) > 0.02) still = false;
      // the neck breaks on long jumps: droplets spawn between head and tail
      const sep = Math.abs(s.a.x - s.b.x);
      const r = T.r * (1 - 0.3 * Math.min(sep / (2 * (T.q + T.r) || 1), 1));
      if (!s.split && s.moving && sep - 2 * T.q - 2 * r > -6) {
        s.split = true;
        const lo = bodies[1 - s.lead], hi = bodies[s.lead];
        [0.3, 0.5, 0.72].forEach((t, j) => s.sats.push({
          x: lo.x + (hi.x - lo.x) * t + (Math.random() - 0.5) * 6, y: T.cy + (Math.random() - 0.5) * 10,
          vx: (lo.v + hi.v) * 0.45, vy: (Math.random() - 0.5) * 60, r: 5 + Math.random() * 3 - j * 0.5, k: 70 + Math.random() * 90,
        }));
      }
      s.sats = s.sats.filter((d) => {
        d.vx += (d.k * (T.x - d.x) - 9 * d.vx) * dt; d.vy += (90 * (T.cy - d.y) - 7 * d.vy) * dt;
        d.x += d.vx * dt; d.y += d.vy * dt;
        d.x = Math.max(PAD + 8 + d.r, Math.min(PAD + s.w - 8 - d.r, d.x));
        d.y = Math.max(T.cy - T.r + d.r, Math.min(T.cy + T.r - d.r, d.y));
        if (Math.abs(T.x - d.x) < T.q + T.r * 0.5) d.r -= dt * 26;
        return d.r > 0.6;
      });
      if (s.sats.length) still = false;
    }
    if (s.moving && still) { s.moving = false; s.rips.push({ x: T.x, y: T.cy, age: 0, amp: s.split ? 1.2 : 0.7 }); s.idleUntil = now + 2600; }
    s.rips.forEach((p) => { p.age += dt; });
    s.rips = s.rips.filter((p) => p.age < 2.4);
  }

  function loop() {
    if (s.raf || !s.visible) return;
    s.last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - s.last) / 1000, 1 / 30);
      s.last = now;
      step(dt, now);
      draw();
      // Battery: animate while something moves, then a short ambient shimmer, then stop.
      const busy = s.moving || s.rips.length || s.sats.length || now < s.idleUntil;
      s.raf = s.visible && busy ? requestAnimationFrame(tick) : 0;
    };
    s.raf = requestAnimationFrame(tick);
  }

  function measure(jump) {
    const el = items[s.active];
    if (!el) return;
    s.w = bar.offsetWidth; s.h = bar.offsetHeight;
    const T = s.t;
    T.r = el.offsetHeight / 2;
    T.q = Math.max(0, el.offsetWidth / 2 - T.r);
    T.cy = PAD + el.offsetTop + el.offsetHeight / 2;
    const nx = PAD + el.offsetLeft + el.offsetWidth / 2;
    if (!s.ready || jump) { s.a.x = s.b.x = nx; s.q = T.q; s.ready = true; }
    else if (Math.abs(nx - T.x) > 0.5) {
      s.lead = Math.abs(nx - s.a.x) <= Math.abs(nx - s.b.x) ? 0 : 1;
      s.lagFrom = performance.now() + 70; s.moving = true; s.split = false;
    }
    T.x = nx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = s.w + PAD * 2, Hh = s.h + PAD * 2;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(Hh * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${Hh}px`;
    }
    s.idleUntil = Math.max(s.idleUntil, performance.now() + 1500);
    loop();
  }

  // a ripple wherever the finger touches the bar
  const onDown = (e) => {
    if (s.reduce) return;
    const r = bar.getBoundingClientRect();
    s.rips.push({ x: e.clientX - r.left + PAD, y: e.clientY - r.top + PAD, age: 0, amp: 0.8 });
    s.idleUntil = performance.now() + 2400; loop();
  };
  bar.addEventListener('pointerdown', onDown);

  let actx;
  const plip = () => {
    if (!opts.sound) return;
    try {
      actx ||= new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(420 + Math.random() * 80, t);
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.18);
    } catch { /* no audio */ }
  };

  const io = new IntersectionObserver(([e]) => { s.visible = e.isIntersecting; if (s.visible) loop(); });
  io.observe(bar);
  const ro = new ResizeObserver(() => measure(true));
  ro.observe(bar);
  const vis = () => { s.visible = document.visibilityState === 'visible'; if (s.visible) loop(); };
  document.addEventListener('visibilitychange', vis);

  measure(true);

  return {
    setActive(i) { if (i === s.active) return; s.active = i; plip(); measure(false); },
    setTint(hex) { s.tint = hexToRgb(hex); s.idleUntil = performance.now() + 800; loop(); },
    setDark(d) { s.dark = d ? 1 : 0; loop(); },
    destroy() {
      cancelAnimationFrame(s.raf); s.raf = 0; io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', vis);
      bar.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.remove(); drop.remove();
    },
  };
}
