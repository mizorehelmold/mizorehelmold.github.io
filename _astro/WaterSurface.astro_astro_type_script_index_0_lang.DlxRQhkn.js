var e=null;function t(){e?.(),e=null;let t=document.querySelector(`[data-water]`);if(!t)return;let n=t.getContext(`webgl`,{antialias:!1,alpha:!1,powerPreference:`low-power`});if(!n)return t.remove();let r=(e,t)=>{let r=n.createShader(e);if(n.shaderSource(r,t),n.compileShader(r),!n.getShaderParameter(r,n.COMPILE_STATUS))throw Error(n.getShaderInfoLog(r)??`shader`);return r},i;try{if(i=n.createProgram(),n.attachShader(i,r(n.VERTEX_SHADER,`
    attribute vec2 a;
    void main() { gl_Position = vec4(a, 0.0, 1.0); }
  `)),n.attachShader(i,r(n.FRAGMENT_SHADER,`
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform vec3 uTop, uMid, uDeep, uPatch, uRim, uGlow; // 主题色，来自 CSS 的 --w-*
    uniform float uSky; // 场景：0 = 海，1 = 天空，2 = 极光森林（CSS 的 --w-sky）
    uniform vec3 uTint, uLift; // 时段色温（CSS 的 --w-tint / --w-lift）
    uniform float uMoon; // 月亮亮度

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
      return v;
    }
    float fbm3(vec2 p) { // 便宜一点的版本，给光柱和焦散用
      float v = 0.0, a = 0.5;
      mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 3; i++) { v += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
      return v / 0.875;
    }

    // 海：从水下往上看
    vec3 sea(vec2 frag) {
      float depth = 1.0 - frag.y / uRes.y;               // 0 = 画面顶部（水面），1 = 底部
      // 按短边归一：电脑上按高度、手机竖屏按宽度，波纹在两种屏幕上大小相当、不拉伸
      float norm = min(uRes.x, uRes.y);
      vec2 p = vec2(frag.x, uRes.y - frag.y) / norm;
      float t = uTime;

      // 水的底色：上浅下深
      vec3 col = mix(uTop, uMid, smoothstep(0.0, 0.55, depth));
      col = mix(col, uDeep, smoothstep(0.45, 1.05, depth));

      // —— 水面光斑：透视下近处（顶部）的波纹大、远处小 ——
      float persp = 0.55 + depth * 1.6;
      vec2 q = vec2(p.x * 1.15, p.y * 3.2) * persp + uMouse * 0.08;
      vec2 warp = vec2(fbm(q * 0.9 + vec2(t * 0.045, 0.0)), fbm(q * 0.9 + vec2(5.2, -t * 0.04)));
      float n = fbm(vec2(q.x * 1.4, q.y * 2.6) + warp * 1.35 + vec2(t * 0.06, t * 0.025));
      float edge = 0.012 * persp;                         // 平涂色块的边缘柔和度（抗锯齿）
      float patchA = smoothstep(0.56, 0.56 + edge, n);
      float shine = smoothstep(0.66, 0.66 + edge, n);
      float rim = patchA - smoothstep(0.585, 0.585 + edge, n); // 光斑外缘一圈更亮的细边
      float surface = (1.0 - smoothstep(0.08, 0.62, depth)) * (0.35 + 0.65 * smoothstep(0.0, 0.07, depth));
      col = mix(col, uPatch, patchA * 0.62 * surface);
      col = mix(col, uRim, rim * 0.55 * surface);
      col = mix(col, vec3(1.0), shine * 0.9 * surface);

      // —— 光柱：从水面斜射下来，缓慢摇摆 ——
      float slant = p.x - depth * 0.38 + sin(t * 0.13) * 0.04 + uMouse.x * 0.03;
      float rays = fbm3(vec2(slant * 5.5, t * 0.07)) * fbm3(vec2(slant * 13.0 + 3.1, t * 0.11));
      rays = smoothstep(0.2, 0.45, rays) * smoothstep(1.0, 0.1, depth) * smoothstep(0.02, 0.2, depth);
      col += uGlow * rays * 0.16;

      // —— 焦散：水下很淡的网状光纹 ——
      vec2 cq = p * vec2(5.0, 7.0) + vec2(t * 0.05, -t * 0.03);
      float c = 1.0 - abs(fbm3(cq + fbm3(cq * 0.7 + t * 0.04) * 1.6) * 2.0 - 1.0);
      c = pow(c, 9.0) * smoothstep(0.15, 0.5, depth) * smoothstep(1.0, 0.55, depth);
      col += uGlow * c * 0.13;

      return col;
    }

    // 天空：往上看的天，底部近地平线最亮，越往上越深；平涂动画风的云从右往左飘，右上有一团日光
    vec3 sky(vec2 frag) {
      float h = frag.y / uRes.y;                          // 0 = 底部（地平线），1 = 顶部
      float norm = min(uRes.x, uRes.y);
      vec2 p = frag / norm;
      float t = uTime;

      vec3 col = mix(uTop, uMid, smoothstep(0.0, 0.6, h));
      col = mix(col, uDeep, smoothstep(0.5, 1.1, h));

      // 日光：右上角的柔光 + 缓缓转动的放射光束
      vec2 sun = vec2(uRes.x / norm * 0.82, uRes.y / norm * 0.9) + uMouse * 0.04;
      vec2 d = p - sun;
      float r = length(d);
      col += uGlow * exp(-r * 2.6) * 0.35;
      float ang = atan(d.y, d.x);
      float beams = fbm3(vec2(ang * 4.0 + t * 0.02, t * 0.05)) * fbm3(vec2(ang * 11.0 - t * 0.03, 2.0));
      col += uGlow * smoothstep(0.22, 0.5, beams) * exp(-r * 1.1) * 0.1;

      // 云：近地平线的云又扁又小（透视），往上变大；只在中下部出现
      float persp = 0.7 + (1.0 - h) * 1.9;
      vec2 q = vec2(p.x * 1.6, p.y * 4.5) * persp + vec2(t * 0.018, 0.0) + uMouse * 0.06;
      vec2 warp = vec2(fbm(q * 0.8 + vec2(t * 0.01, 3.0)), fbm(q * 0.8 + vec2(7.1, t * 0.012)));
      float n = fbm(q + warp * 0.9);
      float nUp = fbm(q + vec2(0.0, -0.05 * persp) + warp * 0.9);   // 往上偏一点采样：判断云的受光面
      float edge = 0.014 * persp;
      float mask = 1.0 - smoothstep(0.4, 0.8, h);
      float body = smoothstep(0.48, 0.48 + edge, n) * mask;
      float lit = smoothstep(0.52, 0.52 + edge, nUp) * body;            // 云顶受光
      float core = smoothstep(0.57, 0.57 + edge, n) * mask;           // 云心最亮
      col = mix(col, uRim, body * 0.95);          // 云的阴影面带一点天色
      col = mix(col, uPatch, lit * 0.9);
      col = mix(col, vec3(1.0), core * 0.85);

      // 很淡的星屑：只在上方深色的天里闪
      vec2 g = floor(frag / 5.0);
      float star = step(0.9975, hash(g)) * (0.5 + 0.5 * sin(t * 2.0 + hash(g + 3.0) * 30.0));
      col += star * smoothstep(0.55, 0.95, h) * 0.6;
      return col;
    }

    // ---------- 极光森林（Dark Hour） ----------
    // 极光：三层弯弯曲曲的光帘，底边清楚、往上慢慢淡掉；帘子上有竖向的褶（光柱），整体缓缓起伏、明灭。
    // 底边是绿（uPatch），往上过渡到一点青紫（uRim）
    vec3 auroraLight(vec2 p, float H, float t) {
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float base = H * (0.5 + fi * 0.1) + (fbm3(vec2(p.x * 0.45 + fi * 3.7 + t * 0.018, fi * 1.3)) - 0.5) * 0.32 + uMouse.y * 0.02;
        float above = p.y - base;
        float edge = smoothstep(-0.02, 0.012, above);                 // 底边：清楚但不生硬
        float fade = exp(-max(above, 0.0) * (5.0 + fi * 2.5));        // 往上淡
        float fold = fbm3(vec2(p.x * 1.3 + fi * 2.0, t * 0.04 + fi));
        float rays = fbm3(vec2(p.x * 16.0 + fold * 5.0 + uMouse.x * 0.4, t * 0.12 + fi * 5.0));
        rays = 0.3 + 1.0 * smoothstep(0.3, 0.85, rays);
        float shimmer = 0.7 + 0.3 * sin(t * 0.5 + p.x * 2.5 + fi * 2.1);
        float I = edge * fade * rays * shimmer * (0.85 - fi * 0.22);
        acc += mix(uPatch, uRim, smoothstep(0.0, 0.28, above)) * I;
      }
      return acc;
    }
    // 一棵树的轮廓（返回这一列的树顶高度；没有树返回 -1）。每个格子随机决定：
    // 有没有树（留空隙）、站在格子里的哪个位置、多高（偶尔一棵特别高的）、胖瘦、左右两边不对称（像被风吹过）、
    // 枝层的疏密。全是针叶树：剪影里填到地面，圆冠的阔叶树会变成一根根方柱，不好看
    float tree(float u, float c, float seed, float density, float ground, float amp) {
      float r = hash(vec2(c, seed)), r2 = hash(vec2(c, seed + 1.7)), r3 = hash(vec2(c, seed + 4.3)), r4 = hash(vec2(c, seed + 9.1));
      if (r4 < 0.18) return -1.0;
      float cx = c + 0.5 + (r2 - 0.5) * 0.9;
      float hgt = amp * (0.25 + 0.75 * pow(r, 0.85)) * (r3 > 0.93 ? 1.35 : 1.0);
      float dx = (u - cx) / density;
      float slope = hgt * density * (3.2 + 2.6 * r2) * (1.0 + (r3 - 0.5) * 0.5 * sign(dx)); // 瘦高、两边不一样陡
      float top = ground + hgt - abs(dx) * slope;
      float d = ground + hgt - top;
      top += 0.005 * (0.4 + r3) * step(0.45 + 0.2 * r4, fract(d * (18.0 + 26.0 * r) + r)); // 枝层
      top = max(top, abs(dx) < 0.0025 ? ground + hgt * 0.08 : -1.0); // 树脚露一点树干
      return top;
    }
    float trees(float x, float density, float seed, float ground, float amp) {
      float u = x * density;
      float best = -1.0;
      for (int k = -2; k <= 2; k++) best = max(best, tree(u, floor(u) + float(k), seed, density, ground, amp));
      return best;
    }
    // 一道林子：两层不同疏密的树叠在一起（打乱节奏），地面本身也高低起伏
    float woods(float x, float density, float seed, float ground, float amp) {
      float a = trees(x, density, seed, ground, amp);
      float b = trees(x + 0.37, density * 1.55, seed + 11.0, ground, amp * 0.72);
      return max(max(a, b), ground);
    }
    vec3 forest(vec2 frag) {
      float norm = min(uRes.x, uRes.y);
      vec2 p = frag / norm;
      float H = uRes.y / norm;
      float h = frag.y / uRes.y;
      float t = uTime;

      // 夜空：地平线附近一点点亮，越往上越黑
      vec3 col = mix(uTop, uMid, smoothstep(0.15, 0.55, h));
      col = mix(col, uDeep, smoothstep(0.5, 1.05, h));
      // 星星：只在上面
      vec2 g = floor(frag / 3.0);
      float star = step(0.9972, hash(g)) * (0.5 + 0.5 * sin(t * 1.4 + hash(g + 7.0) * 40.0));
      col += star * smoothstep(0.35, 0.8, h) * 0.75;
      // 极光
      vec3 au = auroraLight(p, H, t);
      col += au * 0.85;
      // 林边的雾光：极光映在雾上
      float ridge1 = H * 0.3 + (fbm(vec2(p.x * 0.9 + 3.0, 1.0)) - 0.5) * 0.16;
      col += uGlow * exp(-abs(p.y - ridge1 - 0.03) * 14.0) * 0.07;

      // 远处的林子（稍浅，有一点空气感，随鼠标动得少）
      float back = woods(p.x + uMouse.x * 0.012, 11.0, 1.0, ridge1, 0.1);
      float inBack = smoothstep(back + 0.002, back - 0.002, p.y);
      vec3 backCol = mix(col, vec3(0.018, 0.04, 0.036), 0.88);
      backCol += uPatch * 0.05 * smoothstep(back - 0.025, back, p.y); // 树梢被极光照到一点
      col = mix(col, backCol, inBack);
      // 近处的林子（几乎全黑，随鼠标动得多）
      float ridge2 = H * 0.16 + (fbm(vec2(p.x * 0.7, 7.0)) - 0.5) * 0.12;
      float front = woods(p.x + uMouse.x * 0.03, 5.2, 5.0, ridge2, 0.22);
      float inFront = smoothstep(front + 0.002, front - 0.002, p.y);
      col = mix(col, vec3(0.004, 0.01, 0.009), inFront);

      // 萤火虫：在林边慢慢飘，一闪一闪；离得近的大一点、亮一点
      float W = uRes.x / norm;
      for (int i = 0; i < 18; i++) {
        float fi = float(i);
        float a = hash(vec2(fi, 2.7)), b = hash(vec2(fi, 8.1)), c = hash(vec2(fi, 4.4));
        vec2 fp = vec2(
          fract(a + t * (0.004 + 0.006 * b) * (c > 0.5 ? 1.0 : -1.0) + sin(t * 0.4 + fi) * 0.01) * W,
          H * (0.12 + 0.32 * b) + sin(t * (0.3 + 0.4 * c) + fi * 2.0) * 0.03
        );
        fp.x += uMouse.x * 0.04 * (0.5 + c);
        float d = length(p - fp);
        float blink = pow(0.5 + 0.5 * sin(t * (0.7 + 1.3 * a) + fi * 7.0), 3.0);
        float size = 0.6 + 0.8 * c;
        col += vec3(0.78, 1.0, 0.45) * blink * (exp(-d * 260.0 / size) * 1.2 + exp(-d * 30.0 / size) * 0.12);
      }
      return col;
    }

    void main() {
      vec2 frag = gl_FragCoord.xy;
      vec3 col = uSky > 1.5 ? forest(frag) : uSky > 0.5 ? sky(frag) : sea(frag);

      // 时段色温
      col = col * uTint + uLift;
      // 月亮：天空里是清楚的圆盘；海里隔着水面，只是一团化开的光
      if (uMoon > 0.0) {
        float norm = min(uRes.x, uRes.y);
        vec2 mp = vec2(uRes.x * 0.76, uRes.y * 0.8);
        float md = length(frag - mp) / norm;
        float rad = 0.055;
        float blur = uSky > 0.5 ? 0.004 : 0.05;
        vec3 mc = vec3(1.0, 0.98, 0.9);
        col = mix(col, mc, smoothstep(rad + blur, rad - blur, md) * uMoon * (uSky > 0.5 ? 1.0 : 0.5));
        col += mc * exp(-md * 8.0) * 0.22 * uMoon;
      }

      // 四角轻微压暗
      vec2 v = frag / uRes - 0.5;
      col *= 1.0 - dot(v, v) * 0.35;

      gl_FragColor = vec4(col, 1.0);
    }
  `)),n.linkProgram(i),!n.getProgramParameter(i,n.LINK_STATUS))throw Error(n.getProgramInfoLog(i)??`link`)}catch(e){return console.warn(`water shader:`,e),t.remove()}n.useProgram(i),n.bindBuffer(n.ARRAY_BUFFER,n.createBuffer()),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW);let a=n.getAttribLocation(i,`a`);n.enableVertexAttribArray(a),n.vertexAttribPointer(a,2,n.FLOAT,!1,0,0);let o=n.getUniformLocation(i,`uRes`),s=n.getUniformLocation(i,`uTime`),c=n.getUniformLocation(i,`uMouse`),l=n.getUniformLocation(i,`uSky`),u=n.getUniformLocation(i,`uTint`),d=n.getUniformLocation(i,`uLift`),f=n.getUniformLocation(i,`uMoon`),p=[`top`,`mid`,`deep`,`patch`,`rim`,`glow`],m=p.map(e=>n.getUniformLocation(i,`u`+e[0].toUpperCase()+e.slice(1))),h=()=>{let e=getComputedStyle(document.documentElement);p.forEach((t,r)=>{let[i,a,o]=e.getPropertyValue(`--w-${t}`).trim().split(/\s+/).map(Number);n.uniform3f(m[r],i||0,a||0,o||0)}),n.uniform1f(l,Number(e.getPropertyValue(`--w-sky`).trim())||0);let t=(t,n)=>{let r=e.getPropertyValue(t).trim().split(/\s+/).map(Number);return[r[0]??n,r[1]??n,r[2]??n]};n.uniform3f(u,...t(`--w-tint`,1)),n.uniform3f(d,...t(`--w-lift`,0)),n.uniform1f(f,Number(e.getPropertyValue(`--w-moon`).trim())||0)};h();let g=()=>{let e=Math.min((devicePixelRatio||1)*.75,1.2),r=Math.round(t.clientWidth*e),i=Math.round(t.clientHeight*e);(t.width!==r||t.height!==i)&&(t.width=r,t.height=i,n.viewport(0,0,r,i)),n.uniform2f(o,r,i)},_=matchMedia(`(prefers-reduced-motion: reduce)`).matches,v={x:0,y:0,tx:0,ty:0},y=e=>{v.tx=e.clientX/innerWidth-.5,v.ty=e.clientY/innerHeight-.5},b=performance.now()-4e4*Math.random(),x=0,S=!0,C=(performance.now()-b)/1e3,w=performance.now(),T=e=>{C+=Math.min(.1,(e-w)/1e3),w=e,g(),v.x+=(v.tx-v.x)*.04,v.y+=(v.ty-v.y)*.04,n.uniform2f(c,v.x,v.y),n.uniform1f(s,C),n.drawArrays(n.TRIANGLES,0,3),!_&&S&&!document.hidden&&(x=requestAnimationFrame(T))},E=()=>{cancelAnimationFrame(x),x=requestAnimationFrame(T)},D=new IntersectionObserver(([e])=>{S=e.isIntersecting,S&&E()});D.observe(t);let O=()=>{document.hidden||E()};document.addEventListener(`visibilitychange`,O),addEventListener(`pointermove`,y,{passive:!0}),addEventListener(`resize`,E);let k=()=>{h(),E()};document.addEventListener(`themechange`,k),document.addEventListener(`phasechange`,k),E(),t.classList.add(`on`),e=()=>{cancelAnimationFrame(x),D.disconnect(),document.removeEventListener(`visibilitychange`,O),removeEventListener(`pointermove`,y),removeEventListener(`resize`,E),document.removeEventListener(`themechange`,k),document.removeEventListener(`phasechange`,k),n.getExtension(`WEBGL_lose_context`)?.loseContext()}}document.addEventListener(`astro:page-load`,t),document.addEventListener(`astro:before-swap`,()=>{e?.(),e=null});