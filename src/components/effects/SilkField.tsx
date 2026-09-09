import { useEffect, useRef } from "react";

interface SilkFieldProps {
  className?: string;
  intensity?: "quiet" | "immersive";
}

const VERTEX_SHADER = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  uniform vec2 u_resolution;
  uniform vec2 u_pointer;
  uniform vec2 u_ripple_origin;
  uniform float u_time;
  uniform float u_dark;
  uniform float u_ripple_age;
  uniform float u_intensity;

  float hash(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);

    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));

    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float weight = 0.5;
    for (int index = 0; index < 4; index++) {
      value += noise(point) * weight;
      point = point * 2.03 + vec2(17.13, 9.71);
      weight *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0));
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 point = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
    vec2 pointer = vec2((u_pointer.x - 0.5) * aspect, u_pointer.y - 0.5);
    vec2 rippleOrigin = vec2(
      (u_ripple_origin.x - 0.5) * aspect,
      u_ripple_origin.y - 0.5
    );

    float time = u_time * 0.055;
    vec2 flow = vec2(
      fbm(point * 2.1 + vec2(time, -time * 0.72)),
      fbm(point * 2.0 + vec2(-time * 0.61, time * 0.84))
    ) - 0.5;
    vec2 warped = point + flow * (0.09 + u_intensity * 0.025);

    float ribbonA = exp(-pow(length(
      warped - vec2(0.38 * aspect, 0.34)
    ) * 1.38, 2.0));
    float ribbonB = exp(-pow(length(
      warped - vec2(-0.43 * aspect, -0.39)
    ) * 1.5, 2.0));
    float pointerField = exp(-pow(length(warped - pointer) * 2.25, 2.0));

    float ripple = 0.0;
    if (u_ripple_age >= 0.0 && u_ripple_age < 1.0) {
      float distanceFromRipple = length(point - rippleOrigin);
      float front = u_ripple_age * 1.45;
      float envelope = exp(-pow((distanceFromRipple - front) * 14.0, 2.0));
      ripple = sin(distanceFromRipple * 36.0 - u_ripple_age * 28.0)
        * envelope
        * (1.0 - u_ripple_age);
    }

    vec3 lightBase = vec3(0.972, 0.962, 0.944);
    vec3 darkBase = vec3(0.071, 0.061, 0.061);
    vec3 base = mix(lightBase, darkBase, u_dark);
    vec3 berry = mix(vec3(0.65, 0.12, 0.28), vec3(0.78, 0.23, 0.39), u_dark);
    vec3 gold = mix(vec3(0.78, 0.57, 0.22), vec3(0.84, 0.65, 0.31), u_dark);

    float berryWeight = ribbonA * (0.048 + u_intensity * 0.018);
    float goldWeight = ribbonB * (0.052 + u_intensity * 0.02);
    float pointerWeight = pointerField * (0.022 + u_intensity * 0.012);
    vec3 color = base;
    color = mix(color, berry, berryWeight);
    color = mix(color, gold, goldWeight);
    color += mix(vec3(0.025), vec3(0.015), u_dark) * pointerWeight;
    color += mix(vec3(0.02), berry * 0.035, u_dark) * ripple;

    float grain = (hash(gl_FragCoord.xy + floor(u_time * 3.0)) - 0.5) * 0.007;
    color += grain;

    float alpha = mix(0.82, 0.7, u_dark);
    gl_FragColor = vec4(color, alpha);
  }
`;

const createShader = (
  context: WebGLRenderingContext,
  type: number,
  source: string,
) => {
  const shader = context.createShader(type);
  if (!shader) return null;

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    console.warn("Silk field shader failed:", context.getShaderInfoLog(shader));
    context.deleteShader(shader);
    return null;
  }

  return shader;
};

export const SilkField = ({
  className = "",
  intensity = "quiet",
}: SilkFieldProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    });
    if (!context) {
      canvas.dataset.fallback = "true";
      return;
    }

    const vertexShader = createShader(
      context,
      context.VERTEX_SHADER,
      VERTEX_SHADER,
    );
    const fragmentShader = createShader(
      context,
      context.FRAGMENT_SHADER,
      FRAGMENT_SHADER,
    );
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) context.deleteShader(vertexShader);
      if (fragmentShader) context.deleteShader(fragmentShader);
      canvas.dataset.fallback = "true";
      return;
    }

    const program = context.createProgram();
    if (!program) {
      context.deleteShader(vertexShader);
      context.deleteShader(fragmentShader);
      return;
    }
    context.attachShader(program, vertexShader);
    context.attachShader(program, fragmentShader);
    context.linkProgram(program);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      console.warn(
        "Silk field program failed:",
        context.getProgramInfoLog(program),
      );
      canvas.dataset.fallback = "true";
      context.deleteProgram(program);
      context.deleteShader(vertexShader);
      context.deleteShader(fragmentShader);
      return;
    }

    const buffer = context.createBuffer();
    if (!buffer) {
      canvas.dataset.fallback = "true";
      context.deleteProgram(program);
      context.deleteShader(vertexShader);
      context.deleteShader(fragmentShader);
      return;
    }
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      context.STATIC_DRAW,
    );

    const position = context.getAttribLocation(program, "a_position");
    const resolution = context.getUniformLocation(program, "u_resolution");
    const pointer = context.getUniformLocation(program, "u_pointer");
    const rippleOrigin = context.getUniformLocation(program, "u_ripple_origin");
    const time = context.getUniformLocation(program, "u_time");
    const dark = context.getUniformLocation(program, "u_dark");
    const rippleAge = context.getUniformLocation(program, "u_ripple_age");
    const intensityUniform = context.getUniformLocation(program, "u_intensity");

    context.useProgram(program);
    context.enableVertexAttribArray(position);
    context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targetPointer = { x: 0.76, y: 0.74 };
    const renderedPointer = { ...targetPointer };
    const renderedRipple = { x: 0.5, y: 0.5 };
    let rippleStartedAt = Number.NEGATIVE_INFINITY;
    let animationFrame = 0;
    let lastFrame = 0;
    let running = true;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        context.viewport(0, 0, width, height);
      }
    };

    const render = (timestamp: number) => {
      if (!running) return;
      animationFrame = window.requestAnimationFrame(render);

      const reducedMotion = motionQuery.matches;
      if (!reducedMotion && timestamp - lastFrame < 30) return;
      if (reducedMotion && lastFrame > 0) return;
      lastFrame = timestamp;

      resize();
      renderedPointer.x += (targetPointer.x - renderedPointer.x) * 0.055;
      renderedPointer.y += (targetPointer.y - renderedPointer.y) * 0.055;

      const themeIsDark =
        document.documentElement.dataset.theme === "dark" ? 1 : 0;
      const age = (timestamp - rippleStartedAt) / 1200;

      context.useProgram(program);
      context.uniform2f(resolution, canvas.width, canvas.height);
      context.uniform2f(pointer, renderedPointer.x, renderedPointer.y);
      context.uniform2f(rippleOrigin, renderedRipple.x, renderedRipple.y);
      context.uniform1f(time, reducedMotion ? 0 : timestamp / 1000);
      context.uniform1f(dark, themeIsDark);
      context.uniform1f(rippleAge, reducedMotion ? -1 : age);
      context.uniform1f(intensityUniform, intensity === "immersive" ? 1 : 0);
      context.drawArrays(context.TRIANGLES, 0, 6);
    };

    const handlePointerMove = (event: PointerEvent) => {
      targetPointer.x = event.clientX / Math.max(window.innerWidth, 1);
      targetPointer.y = 1 - event.clientY / Math.max(window.innerHeight, 1);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (motionQuery.matches || event.button !== 0) return;
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !target.closest(
          "button, a, [role='button'], .ss-model-card, .ss-history-item",
        )
      ) {
        return;
      }

      renderedRipple.x = event.clientX / Math.max(window.innerWidth, 1);
      renderedRipple.y = 1 - event.clientY / Math.max(window.innerHeight, 1);
      rippleStartedAt = performance.now();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        running = false;
        window.cancelAnimationFrame(animationFrame);
        return;
      }

      if (!running) {
        running = true;
        lastFrame = 0;
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    const handleMotionPreference = () => {
      lastFrame = 0;
    };

    const handleResize = () => {
      lastFrame = 0;
      resize();
    };

    const themeObserver = new MutationObserver(() => {
      lastFrame = 0;
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerdown", handlePointerDown, {
      passive: true,
    });
    window.addEventListener("resize", handleResize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    motionQuery.addEventListener("change", handleMotionPreference);
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      running = false;
      window.cancelAnimationFrame(animationFrame);
      themeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      motionQuery.removeEventListener("change", handleMotionPreference);
      context.deleteBuffer(buffer);
      context.deleteProgram(program);
      context.deleteShader(vertexShader);
      context.deleteShader(fragmentShader);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      className={`ss-silk-field ${className}`}
      aria-hidden="true"
    />
  );
};
