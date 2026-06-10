export async function loadConfigs() {
  const configs = {};
  const modules = [
    "player", "enemies", "weapons", "difficulty",
    "upgrades", "rarity", "progression", "camera", "particles", "hub", "engine", "power"
  ];
  for (const name of modules) {
    try {
      const mod = await import(`../src/configs/${name}.js`);
      Object.assign(configs, mod);
    } catch (e) {
      console.warn(`Failed to load config: ${name}`, e);
    }
  }
  return configs;
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function getConfigValue(config, path) {
  const parts = path.split(".");
  let current = config;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  if (current && typeof current === "object" && "value" in current) return current.value;
  return current;
}

export function setConfigValue(config, path, newValue) {
  const parts = path.split(".");
  let current = config;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] == null) return;
    current = current[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (current[last] && typeof current[last] === "object" && "value" in current[last]) {
    current[last].value = newValue;
  } else {
    current[last] = newValue;
  }
}

export function getUnit(config, path) {
  const parts = path.split(".");
  let current = config;
  for (const part of parts) {
    if (current == null) return "";
    current = current[part];
  }
  if (current && typeof current === "object" && "unit" in current) return current.unit;
  return "";
}

export function saveToUrl(config, paths) {
  const params = new URLSearchParams();
  for (const path of paths) {
    const val = getConfigValue(config, path);
    if (val !== undefined) params.set(path, String(val));
  }
  window.history.replaceState(null, "", `?${params.toString()}`);
}

export function loadFromUrl(config, paths) {
  const params = new URLSearchParams(window.location.search);
  for (const path of paths) {
    const raw = params.get(path);
    if (raw !== null) {
      const num = Number(raw);
      setConfigValue(config, path, isNaN(num) ? raw : num);
    }
  }
}

export function generateConfigSnippet(config, paths) {
  const lines = [];
  for (const path of paths) {
    const val = getConfigValue(config, path);
    const unit = getUnit(config, path);
    if (val !== undefined) {
      lines.push(`// ${path} (${unit})`);
      lines.push(`setConfigValue(configs, "${path}", ${val});`);
    }
  }
  return lines.join("\n");
}

export function createSlider(container, label, min, max, step, value, unit, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "slider-row";

  const labelEl = document.createElement("label");
  labelEl.textContent = `${label}: `;

  const valueEl = document.createElement("span");
  valueEl.className = "slider-value";
  const displayVal = (value != null && typeof value === "number") ? (step < 1 ? value.toFixed(2) : String(value)) : "—";
  valueEl.textContent = `${displayVal} ${unit}`;

  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = value;

  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    const dv = step < 1 ? v.toFixed(2) : String(v);
    valueEl.textContent = `${dv} ${unit}`;
    onChange(v);
  });

  labelEl.appendChild(valueEl);
  wrapper.appendChild(labelEl);
  wrapper.appendChild(input);
  container.appendChild(wrapper);

  return { input, valueEl, wrapper };
}

export function createCopyButton(container, getSnippet) {
  const btn = document.createElement("button");
  btn.textContent = "Copy Config";
  btn.className = "copy-btn";
  btn.addEventListener("click", () => {
    navigator.clipboard.writeText(getSnippet()).then(() => {
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy Config"; }, 1500);
    });
  });
  container.appendChild(btn);
}

export const CHART_COLORS = {
  cyan: "#00e0ff",
  green: "#52ff94",
  purple: "#b967ff",
  yellow: "#ffe15c",
  orange: "#ff8a2a",
  pink: "#ff2e9a",
  white: "#f6fbff"
};
