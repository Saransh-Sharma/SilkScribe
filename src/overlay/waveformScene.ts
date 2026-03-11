import {
  Application,
  BlurFilter,
  Container,
  FillGradient,
  Graphics,
  RenderTexture,
  Sprite,
} from "pixi.js";
import { shapeWaveformLevel, WAVEFORM_BUCKET_COUNT } from "./waveformConfig";

const DISPLAY_SAMPLE_COUNT = 32;
const PARTICLE_COUNT = 24;
const STAGE_RADIUS = 14;
const IDLE_FLOOR = 0.065;
const SMOOTH_ALPHA = 0.85;
const FEEDBACK_ALPHA = 0.82;

const COLORS = {
  forest: 0x293a18,
  magenta: 0xb1205f,
  marigold: 0xfebf2b,
  crimson: 0xc11317,
  ochre: 0x9e5f0a,
} as const;

export type WaveformSceneController = {
  updateLevels: (levels: number[]) => void;
  setActive: (active: boolean) => void;
  resize: (width: number, height: number) => void;
  setReducedMotion: (reduced: boolean) => void;
  destroy: () => void;
};

export type CreateWaveformSceneOptions = {
  width: number;
  height: number;
  reducedMotion: boolean;
};

type SamplePoint = {
  x: number;
  top: number;
  bottom: number;
  energy: number;
};

type Particle = {
  sprite: Graphics;
  active: boolean;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, alpha: number) =>
  from + (to - from) * alpha;

const createPointBuffer = (): SamplePoint[] =>
  Array.from({ length: DISPLAY_SAMPLE_COUNT }, () => ({
    x: 0,
    top: 0,
    bottom: 0,
    energy: 0,
  }));

const interpolateLevel = (levels: Float32Array, position: number) => {
  const maxIndex = levels.length - 1;
  const scaled = position * maxIndex;
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(maxIndex, leftIndex + 1);
  const mix = scaled - leftIndex;

  return levels[leftIndex] * (1 - mix) + levels[rightIndex] * mix;
};

const createHorizontalGradient = (
  width: number,
  stops: ReadonlyArray<{ offset: number; color: number }>,
) =>
  new FillGradient({
    type: "linear",
    start: { x: 0, y: 0.5 },
    end: { x: width, y: 0.5 },
    textureSpace: "global",
    colorStops: stops.map((stop) => ({
      offset: stop.offset,
      color: stop.color,
    })),
  });

const createVerticalGradient = (
  height: number,
  stops: ReadonlyArray<{ offset: number; color: number }>,
) =>
  new FillGradient({
    type: "linear",
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: height },
    textureSpace: "global",
    colorStops: stops.map((stop) => ({
      offset: stop.offset,
      color: stop.color,
    })),
  });

const updatePointBuffer = (
  samples: Float32Array,
  points: SamplePoint[],
  width: number,
  height: number,
  bodyThickness: number,
  amplitudeFactor: number,
) => {
  const centerY = height / 2;
  const span = Math.max(width - 10, 1);
  const amplitudeCap = Math.max(height * amplitudeFactor, 1);

  for (let index = 0; index < points.length; index += 1) {
    const progress =
      points.length > 1 ? index / (points.length - 1) : 0;
    const sample = samples[index];
    const amplitude = amplitudeCap * sample;
    const thickness = bodyThickness + sample * 2.2;
    const top = centerY - amplitude - thickness;
    const bottom = centerY + amplitude + thickness;

    points[index].x = 5 + span * progress;
    points[index].top = clamp(top, 0, height);
    points[index].bottom = clamp(bottom, 0, height);
    points[index].energy = sample;
  }
};

const drawRibbon = (
  graphic: Graphics,
  points: SamplePoint[],
  fill: FillGradient,
  alpha: number,
  width: number,
  height: number,
) => {
  if (points.length === 0) {
    graphic.clear();
    return;
  }

  graphic.clear();
  graphic.moveTo(0, height / 2);
  graphic.lineTo(points[0].x, points[0].top);

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const controlX = (previous.x + current.x) / 2;

    graphic.quadraticCurveTo(controlX, previous.top, current.x, current.top);
  }

  const lastPoint = points[points.length - 1];
  graphic.lineTo(width, lastPoint.top);
  graphic.lineTo(width, height / 2);
  graphic.lineTo(width, lastPoint.bottom);

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const next = points[index + 1];
    const current = points[index];
    const controlX = (next.x + current.x) / 2;

    graphic.quadraticCurveTo(controlX, next.bottom, current.x, current.bottom);
  }

  graphic.lineTo(0, height / 2);
  graphic.closePath();
  graphic.fill({ fill, alpha });
};

const drawCircleParticle = (
  graphic: Graphics,
  radius: number,
  color: number,
  alpha: number,
) => {
  graphic.clear();
  graphic.circle(0, 0, radius);
  graphic.fill({ color, alpha });
};

export const createWaveformScene = async (
  host: HTMLDivElement,
  options: CreateWaveformSceneOptions,
): Promise<WaveformSceneController> => {
  const app = new Application();
  await app.init({
    width: options.width,
    height: options.height,
    antialias: true,
    autoDensity: true,
    autoStart: false,
    backgroundAlpha: 0,
    preference: "webgl",
    powerPreference: "high-performance",
    resolution:
      typeof window !== "undefined"
        ? Math.min(window.devicePixelRatio || 1, 1.5)
        : 1,
  });

  app.canvas.className = "gpu-waveform-canvas";
  host.replaceChildren(app.canvas);

  const root = new Container();
  const maskedLayer = new Container();
  const clipMask = new Graphics();

  const backgroundBase = new Graphics();
  const edgeShadowLeft = new Graphics();
  const edgeShadowRight = new Graphics();
  const ambientAura = new Graphics();
  const trailDisplaySprite = new Sprite();
  const trailRibbon = new Graphics();
  const ribbonBack = new Graphics();
  const ribbonFront = new Graphics();
  const peakHalo = new Graphics();
  const particleLayer = new Container();

  const trailSourceContainer = new Container();
  const trailSourceRibbon = new Graphics();
  const trailSourceHalo = new Graphics();
  trailSourceContainer.addChild(trailSourceRibbon, trailSourceHalo);

  const edgeBlur = new BlurFilter();
  const auraBlur = new BlurFilter();
  const trailBlur = new BlurFilter();
  const ribbonBlur = new BlurFilter();

  edgeShadowLeft.filters = [edgeBlur];
  edgeShadowRight.filters = [edgeBlur];
  ambientAura.filters = [auraBlur];
  trailRibbon.filters = [trailBlur];
  ribbonBack.filters = [ribbonBlur];
  peakHalo.filters = [auraBlur];

  trailDisplaySprite.blendMode = "add";
  ribbonFront.blendMode = "add";
  peakHalo.blendMode = "add";
  particleLayer.blendMode = "add";
  trailSourceRibbon.blendMode = "add";
  trailSourceHalo.blendMode = "add";

  maskedLayer.mask = clipMask;
  maskedLayer.addChild(
    backgroundBase,
    edgeShadowLeft,
    edgeShadowRight,
    ambientAura,
    trailDisplaySprite,
    trailRibbon,
    ribbonBack,
    ribbonFront,
    peakHalo,
    particleLayer,
  );
  root.addChild(maskedLayer, clipMask);
  app.stage.addChild(root);

  const particles: Particle[] = [];
  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const sprite = new Graphics();
    sprite.visible = false;
    sprite.blendMode = "add";
    particleLayer.addChild(sprite);
    particles.push({
      sprite,
      active: false,
      life: 0,
      maxLife: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 0,
    });
  }

  let width = Math.max(options.width, 1);
  let height = Math.max(options.height, 1);
  let reducedMotion = options.reducedMotion;
  let elapsed = 0;
  let lastEmission = 0;
  let usePrimaryTrailTarget = true;

  const inputLevels = new Float32Array(WAVEFORM_BUCKET_COUNT);
  const targetSamples = new Float32Array(DISPLAY_SAMPLE_COUNT);
  const smoothedSamples = new Float32Array(DISPLAY_SAMPLE_COUNT);
  const trailSamples = new Float32Array(DISPLAY_SAMPLE_COUNT);
  smoothedSamples.fill(IDLE_FLOOR);
  trailSamples.fill(IDLE_FLOOR);

  const trailPoints = createPointBuffer();
  const backPoints = createPointBuffer();
  const frontPoints = createPointBuffer();

  let backgroundGradient = createVerticalGradient(height, [
    { offset: 0, color: COLORS.forest },
    { offset: 0.36, color: COLORS.ochre },
    { offset: 1, color: COLORS.forest },
  ]);
  let ribbonBackGradient = createHorizontalGradient(width, [
    { offset: 0, color: COLORS.ochre },
    { offset: 0.46, color: COLORS.marigold },
    { offset: 1, color: COLORS.magenta },
  ]);
  let ribbonFrontGradient = createHorizontalGradient(width, [
    { offset: 0, color: COLORS.ochre },
    { offset: 0.4, color: COLORS.marigold },
    { offset: 0.76, color: COLORS.magenta },
    { offset: 1, color: COLORS.magenta },
  ]);
  let trailGradient = createHorizontalGradient(width, [
    { offset: 0, color: COLORS.forest },
    { offset: 0.38, color: COLORS.marigold },
    { offset: 1, color: COLORS.magenta },
  ]);
  let peakGradient = createHorizontalGradient(width, [
    { offset: 0, color: COLORS.marigold },
    { offset: 0.52, color: COLORS.magenta },
    { offset: 1, color: COLORS.crimson },
  ]);

  let trailTextureA = RenderTexture.create({ width, height });
  let trailTextureB = RenderTexture.create({ width, height });
  const trailFadeSprite = new Sprite(trailTextureB);

  const emptyContainer = new Container();

  const rebuildGradients = () => {
    backgroundGradient = createVerticalGradient(height, [
      { offset: 0, color: COLORS.forest },
      { offset: 0.36, color: COLORS.ochre },
      { offset: 1, color: COLORS.forest },
    ]);
    ribbonBackGradient = createHorizontalGradient(width, [
      { offset: 0, color: COLORS.ochre },
      { offset: 0.46, color: COLORS.marigold },
      { offset: 1, color: COLORS.magenta },
    ]);
    ribbonFrontGradient = createHorizontalGradient(width, [
      { offset: 0, color: COLORS.ochre },
      { offset: 0.4, color: COLORS.marigold },
      { offset: 0.76, color: COLORS.magenta },
      { offset: 1, color: COLORS.magenta },
    ]);
    trailGradient = createHorizontalGradient(width, [
      { offset: 0, color: COLORS.forest },
      { offset: 0.38, color: COLORS.marigold },
      { offset: 1, color: COLORS.magenta },
    ]);
    peakGradient = createHorizontalGradient(width, [
      { offset: 0, color: COLORS.marigold },
      { offset: 0.52, color: COLORS.magenta },
      { offset: 1, color: COLORS.crimson },
    ]);
  };

  const rebuildTrailTextures = () => {
    trailTextureA.destroy(true);
    trailTextureB.destroy(true);
    trailTextureA = RenderTexture.create({ width, height });
    trailTextureB = RenderTexture.create({ width, height });
    trailDisplaySprite.texture = trailTextureA;
    trailFadeSprite.texture = trailTextureB;
    trailDisplaySprite.width = width;
    trailDisplaySprite.height = height;
    trailFadeSprite.width = width;
    trailFadeSprite.height = height;
    usePrimaryTrailTarget = true;
    app.renderer.render({
      container: emptyContainer,
      target: trailTextureA,
      clear: true,
    });
    app.renderer.render({
      container: emptyContainer,
      target: trailTextureB,
      clear: true,
    });
  };

  const applyMotionSettings = () => {
    edgeBlur.strength = reducedMotion ? 8 : 12;
    auraBlur.strength = reducedMotion ? 8 : 16;
    trailBlur.strength = reducedMotion ? 4 : 10;
    ribbonBlur.strength = reducedMotion ? 2 : 4;
  };

  const renderStaticBed = (averageEnergy: number) => {
    const shimmer = reducedMotion ? 0 : Math.sin(elapsed * 1.2) * 0.03;
    const auraShift = reducedMotion ? 0 : Math.sin(elapsed * 1.6) * 0.03;
    const auraAlpha = 0.1 + averageEnergy * 0.16 + shimmer;

    clipMask.clear();
    clipMask.roundRect(0, 0, width, height, STAGE_RADIUS);
    clipMask.fill({ color: 0xffffff });

    backgroundBase.clear();
    backgroundBase.roundRect(0, 0, width, height, STAGE_RADIUS);
    backgroundBase.fill({
      fill: backgroundGradient,
      alpha: clamp(0.24 + averageEnergy * 0.08, 0.24, 0.36),
    });

    edgeShadowLeft.clear();
    edgeShadowLeft.ellipse(width * 0.08, height * 0.5, width * 0.22, height * 0.7);
    edgeShadowLeft.fill({ color: COLORS.forest, alpha: 0.26 });

    edgeShadowRight.clear();
    edgeShadowRight.ellipse(width * 0.92, height * 0.5, width * 0.22, height * 0.7);
    edgeShadowRight.fill({ color: COLORS.forest, alpha: 0.26 });

    ambientAura.clear();
    ambientAura.ellipse(
      width * (0.5 + auraShift),
      height * 0.5,
      width * (0.18 + averageEnergy * 0.18),
      height * (0.28 + averageEnergy * 0.16),
    );
    ambientAura.fill({
      fill: peakGradient,
      alpha: clamp(auraAlpha, 0.08, 0.34),
    });
  };

  const drawPeakHalo = (
    graphic: Graphics,
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    intensity: number,
    baseAlpha: number,
  ) => {
    graphic.clear();
    if (intensity <= 0.42) {
      return;
    }

    graphic.ellipse(centerX, centerY, radiusX, radiusY);
    graphic.fill({
      color: intensity > 0.82 ? COLORS.crimson : COLORS.magenta,
      alpha: clamp(baseAlpha, 0, 1),
    });
  };

  const spawnParticles = (
    hottestPoint: SamplePoint,
    hottestEnergy: number,
    deltaSeconds: number,
  ) => {
    if (reducedMotion || hottestEnergy < 0.52) {
      return;
    }

    lastEmission += deltaSeconds;
    const emissionInterval = hottestEnergy > 0.86 ? 0.035 : 0.07;
    if (lastEmission < emissionInterval) {
      return;
    }
    lastEmission = 0;

    const spawnCount = hottestEnergy > 0.86 ? 3 : 1;
    for (let count = 0; count < spawnCount; count += 1) {
      const particle = particles.find((candidate) => !candidate.active);
      if (!particle) {
        break;
      }

      const isHot = hottestEnergy > 0.88 && count === spawnCount - 1;
      const color = isHot
        ? COLORS.crimson
        : count % 2 === 0
          ? COLORS.marigold
          : COLORS.magenta;

      particle.active = true;
      particle.life = 0;
      particle.maxLife = 0.18 + Math.random() * 0.14;
      particle.x = hottestPoint.x + (Math.random() - 0.5) * 10;
      particle.y =
        (hottestPoint.top + hottestPoint.bottom) / 2 +
        (Math.random() - 0.5) * 6;
      particle.vx = (Math.random() - 0.5) * 12;
      particle.vy = -(18 + Math.random() * 22);
      particle.radius = 0.8 + Math.random() * 1.8;
      particle.sprite.visible = true;
      particle.sprite.x = particle.x;
      particle.sprite.y = particle.y;
      drawCircleParticle(
        particle.sprite,
        particle.radius,
        color,
        isHot ? 0.92 : 0.78,
      );
    }
  };

  const updateParticles = (deltaSeconds: number) => {
    for (const particle of particles) {
      if (!particle.active) {
        continue;
      }

      particle.life += deltaSeconds;
      if (particle.life >= particle.maxLife) {
        particle.active = false;
        particle.sprite.visible = false;
        continue;
      }

      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.vy *= 0.985;

      const lifeProgress = 1 - particle.life / particle.maxLife;
      particle.sprite.x = particle.x;
      particle.sprite.y = particle.y;
      particle.sprite.alpha = clamp(lifeProgress * 0.95, 0, 1);
      particle.sprite.scale.set(0.85 + lifeProgress * 0.55);
    }
  };

  const renderFeedbackTrail = (averageEnergy: number) => {
    if (reducedMotion) {
      trailDisplaySprite.alpha = 0;
      return;
    }

    const targetTexture = usePrimaryTrailTarget ? trailTextureA : trailTextureB;
    const previousTexture = usePrimaryTrailTarget ? trailTextureB : trailTextureA;

    trailFadeSprite.texture = previousTexture;
    trailFadeSprite.width = width;
    trailFadeSprite.height = height;
    trailFadeSprite.alpha = FEEDBACK_ALPHA;

    app.renderer.render({
      container: trailFadeSprite,
      target: targetTexture,
      clear: true,
    });
    app.renderer.render({
      container: trailSourceContainer,
      target: targetTexture,
      clear: false,
    });

    trailDisplaySprite.texture = targetTexture;
    trailDisplaySprite.width = width;
    trailDisplaySprite.height = height;
    trailDisplaySprite.alpha = clamp(0.1 + averageEnergy * 0.24, 0.1, 0.34);
    usePrimaryTrailTarget = !usePrimaryTrailTarget;
  };

  const tick = () => {
    const deltaSeconds = app.ticker.deltaMS / 1000;
    elapsed += deltaSeconds;

    let energySum = 0;
    let peakValue = 0;
    let hottestIndex = 0;

    for (let index = 0; index < DISPLAY_SAMPLE_COUNT; index += 1) {
      const progress =
        DISPLAY_SAMPLE_COUNT > 1 ? index / (DISPLAY_SAMPLE_COUNT - 1) : 0;
      const interpolated = interpolateLevel(inputLevels, progress);
      const centerDistance =
        Math.abs(index - (DISPLAY_SAMPLE_COUNT - 1) / 2) /
        ((DISPLAY_SAMPLE_COUNT - 1) / 2);
      const centerBoost = 1 + (1 - centerDistance) * 0.35;
      const targetValue = clamp(
        shapeWaveformLevel(interpolated) * centerBoost,
        IDLE_FLOOR,
        1,
      );

      targetSamples[index] = targetValue;
      smoothedSamples[index] = lerp(
        smoothedSamples[index],
        targetValue,
        SMOOTH_ALPHA,
      );
      trailSamples[index] = reducedMotion
        ? smoothedSamples[index]
        : lerp(trailSamples[index], smoothedSamples[index], 0.11);

      energySum += smoothedSamples[index];
      if (smoothedSamples[index] > peakValue) {
        peakValue = smoothedSamples[index];
        hottestIndex = index;
      }
    }

    const averageEnergy = energySum / DISPLAY_SAMPLE_COUNT;
    renderStaticBed(averageEnergy);

    updatePointBuffer(
      trailSamples,
      trailPoints,
      width,
      height,
      1.4,
      0.26 + averageEnergy * 0.34,
    );
    updatePointBuffer(
      smoothedSamples,
      backPoints,
      width,
      height,
      1.1,
      0.3 + averageEnergy * 0.38,
    );
    updatePointBuffer(
      smoothedSamples,
      frontPoints,
      width,
      height,
      1.6,
      0.34 + averageEnergy * 0.42,
    );

    if (reducedMotion) {
      drawRibbon(
        trailRibbon,
        trailPoints,
        trailGradient,
        0.08,
        width,
        height,
      );
    } else {
      trailRibbon.clear();
    }

    drawRibbon(
      ribbonBack,
      backPoints,
      ribbonBackGradient,
      clamp(0.26 + averageEnergy * 0.2, 0.26, 0.48),
      width,
      height,
    );
    drawRibbon(
      ribbonFront,
      frontPoints,
      ribbonFrontGradient,
      clamp(0.42 + averageEnergy * 0.34, 0.42, 0.82),
      width,
      height,
    );

    const hottestPoint =
      frontPoints[hottestIndex] ?? frontPoints[Math.floor(frontPoints.length / 2)];
    const peakCenterY = (hottestPoint.top + hottestPoint.bottom) / 2;

    drawPeakHalo(
      peakHalo,
      hottestPoint.x,
      peakCenterY,
      10 + peakValue * 18,
      5 + peakValue * 8,
      peakValue,
      0.12 + peakValue * 0.22,
    );

    drawRibbon(
      trailSourceRibbon,
      frontPoints,
      ribbonFrontGradient,
      clamp(0.24 + averageEnergy * 0.26, 0.24, 0.52),
      width,
      height,
    );
    drawPeakHalo(
      trailSourceHalo,
      hottestPoint.x,
      peakCenterY,
      12 + peakValue * 20,
      6 + peakValue * 10,
      peakValue,
      0.18 + peakValue * 0.28,
    );

    renderFeedbackTrail(averageEnergy);
    spawnParticles(hottestPoint, peakValue, deltaSeconds);
    updateParticles(deltaSeconds);
  };

  const resize = (nextWidth: number, nextHeight: number) => {
    width = Math.max(nextWidth, 1);
    height = Math.max(nextHeight, 1);
    app.renderer.resize(width, height);
    rebuildGradients();
    rebuildTrailTextures();
  };

  applyMotionSettings();
  rebuildTrailTextures();
  app.ticker.add(tick);

  return {
    updateLevels: (levels: number[]) => {
      for (let index = 0; index < WAVEFORM_BUCKET_COUNT; index += 1) {
        inputLevels[index] = levels[index] ?? 0;
      }
    },
    setActive: (active: boolean) => {
      if (active) {
        app.ticker.start();
      } else {
        app.ticker.stop();
      }
    },
    resize,
    setReducedMotion: (nextReducedMotion: boolean) => {
      reducedMotion = nextReducedMotion;
      applyMotionSettings();
      if (reducedMotion) {
        trailDisplaySprite.alpha = 0;
      }
    },
    destroy: () => {
      app.ticker.stop();
      app.ticker.remove(tick);
      trailTextureA.destroy(true);
      trailTextureB.destroy(true);
      app.destroy(true, { children: true, texture: true, textureSource: true });
      host.replaceChildren();
    },
  };
};
