/**
 * gateway-config — browser half.
 *
 * Registers an "LLM 网关配置" settings section for the supported
 * OpenAI-compatible gateways — the fixed provider presets only (cindy,
 * sub2api); official/other providers are out of scope. The panel is a
 * three-step wizard: (1) gateway & credentials, (2) model discovery with
 * checkbox selection, (3) review & import. Per-model capabilities
 * (reasoning efforts, input modalities) are derived automatically per model
 * family and shown in the model list. A stored key for the current route is
 * reused: discoverModels inherits it via the existing provider route, so
 * refreshing the model list does not require pasting the key again. Uses the
 * shipped client API surface (api.llm.discoverModels / api.settings.describe
 * / api.settings.mutate / api.credentials.describe / api.credentials.set)
 * and the primitives Button/Input components with dsw theme tokens.
 */
window.__ModuleLoader__.load({
	id: "gateway-config",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let React = require("react");
		let { Button, Input } = require("@deepseek-ai/dsh-client-ui-primitives");

		const DEFAULT_BASE_URL = "";
		const SETTINGS_NS = "llm-pi-ai";
		const STEPS = ["网关与密钥", "选择模型", "导入"];
		const DONE_STEP = STEPS.length + 1;

		/** Fixed provider presets — must mirror the host half. */
		const PRESETS = [
			{ route: "cindy", displayName: "Cindy" },
			{ route: "sub2api", displayName: "Sub2API" },
			{ route: "generic", displayName: "通用" },
			{ route: "deepseek", displayName: "DeepSeek", baseURL: "https://api.deepseek.com/v1" },
			{ route: "moonshot", displayName: "Kimi", baseURL: "https://api.moonshot.cn/v1" },
			{ route: "zhipu", displayName: "智谱 GLM", baseURL: "https://open.bigmodel.cn/api/paas/v4" },
			{ route: "qwen", displayName: "通义千问", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
			{ route: "openrouter", displayName: "OpenRouter", baseURL: "https://openrouter.ai/api/v1" },
			{ route: "siliconflow", displayName: "SiliconFlow", baseURL: "https://api.siliconflow.cn/v1" },
			{ route: "xai", displayName: "xAI Grok", baseURL: "https://api.x.ai/v1" },
		];

		function deriveKeyRef(route) {
			return `${route.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
		}

		/** Same filter as the host half: keep only chat-capable models. */
		const NON_CHAT_PATTERN = /(^|[/_.-])(image|img|embedding|embed|voyage|seedream|seedance|happyhorse|t2v|i2v|r2v|video|realtime|asr|whisper|tts|speech|audio|doc)([/_.-]|$)/i;
		const DEEPSEEK_PATTERN = /(^|[/_.-])deepseek([/_.-]|$)/i;
		const GPT56_PATTERN = /(^|[/_.-])gpt-5\.6([/_.:-]|$)/i;
		const GPT54_55_PATTERN = /(^|[/_.-])gpt-5\.(4|5)([/_.:-]|$)/i;
		const GEMINI_FLASH_PATTERN = /(^|[/_.-])(gemini-.*flash|omni-flash)([/_.-]|$)/i;
		const GEMINI_PRO_PATTERN = /(^|[/_.-])gemini-.*pro([/_.-]|$)/i;
		const IMAGE_INPUT_PATTERN = /(^|[/_.-])(gpt-5\.(4|5|6)|grok-4\.[5-9]|gemini-(?!.*image)|omni-flash)([/_.:-]|$)/i;

		function inputFor(model) {
			const declared = model && (model.input || model.inputModalities || model.modalities);
			if (Array.isArray(declared) && declared.length > 0) return declared.includes("image") ? ["text", "image"] : ["text"];
			if (model && (model.supportsImages === true || model.imageInput === true)) return ["text", "image"];
			return IMAGE_INPUT_PATTERN.test(String((model && model.id) || "")) ? ["text", "image"] : ["text"];
		}
		function isChatModel(modelId) {
			return !NON_CHAT_PATTERN.test(modelId);
		}
		function reasoningFor(modelId) {
			if (DEEPSEEK_PATTERN.test(modelId)) return { off: null, high: "high", max: "max" };
			if (GPT56_PATTERN.test(modelId)) return { off: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" };
			if (GPT54_55_PATTERN.test(modelId)) return { off: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh" };
			if (GEMINI_FLASH_PATTERN.test(modelId)) return { off: null, high: "high" };
			if (GEMINI_PRO_PATTERN.test(modelId)) return { low: "low", high: "high" };
			return { off: null, low: "low", medium: "medium", high: "high" };
		}
		function compatFor(modelId) {
			return DEEPSEEK_PATTERN.test(modelId) ? { thinkingFormat: "deepseek" } : { thinkingFormat: "openai" };
		}
		function effortChoices(modelId) {
			return Object.keys(reasoningFor(modelId));
		}
		function capabilityNote(model) {
			const input = inputFor(model);
			return (input.includes("image") ? "文+图" : "文本") + " · 档位 " + effortChoices(model.id).join("/");
		}

		const fieldStyle = { display: "block", margin: "10px 0 0" };
		const labelStyle = {
			display: "block", margin: "0 0 4px", fontSize: 12, fontWeight: 500,
			color: "var(--dsw-alias-label-secondary)", lineHeight: "18px",
		};
		const selectStyle = {
			boxSizing: "border-box", border: "1px solid var(--dsw-alias-border-l2)",
			width: "100%", height: 32, font: "inherit", borderRadius: 8, padding: "0 10px",
			fontSize: 14, lineHeight: "22px", cursor: "pointer", maxWidth: 360,
			background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)",
		};
		const statusStyle = (kind) => ({
			margin: "12px 0 0", padding: "10px 12px", fontSize: 13, lineHeight: "20px",
			borderRadius: 8,
			border: kind === "error"
				? "1px solid var(--dsw-alias-state-error-primary)"
				: "1px solid var(--dsw-alias-border-l2)",
			background: "var(--dsw-alias-bg-module-platform)",
			color: kind === "error"
				? "var(--dsw-alias-state-error-primary)"
				: "var(--dsw-alias-label-primary)",
			whiteSpace: "pre-wrap", wordBreak: "break-all",
		});
		const summaryRow = (label, value) => React.createElement("div", {
			style: { display: "flex", gap: 8, fontSize: 13, lineHeight: "22px", margin: "2px 0" },
		},
			React.createElement("span", { style: { minWidth: 96, color: "var(--dsw-alias-label-secondary)" } }, label),
			React.createElement("span", { style: { color: "var(--dsw-alias-label-primary)", wordBreak: "break-all" } }, value),
		);

		function GatewaySection(props) {
			const api = props && props.api;
			if (api === void 0) return null;
			const [step, setStep] = React.useState(1);
			const [baseURL, setBaseURL] = React.useState(DEFAULT_BASE_URL);
			const [apiKey, setApiKey] = React.useState("");
			const [route, setRoute] = React.useState(PRESETS[0].route);
			const [displayName, setDisplayName] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const [storedKey, setStoredKey] = React.useState(false);
			const [models, setModels] = React.useState([]);
			const [included, setIncluded] = React.useState({});
			const [filtered, setFiltered] = React.useState(0);
			const [defaultModel, setDefaultModel] = React.useState("");
			const [effort, setEffort] = React.useState("off");
			const [cleanup, setCleanup] = React.useState(true);
			const [message, setMessage] = React.useState(null);
			const [result, setResult] = React.useState(null);

			const typedKey = apiKey.trim();
			const hasAuth = typedKey.length > 0 || storedKey;
			const preset = PRESETS.find((p) => p.route === route);
			const known = preset;
			const selectedModels = models.filter((m) => included[m.id]);

			const toggleModel = (id, checked) => {
				setIncluded((prev) => {
					const next = { ...prev, [id]: checked };
					if (!checked && defaultModel === id) {
						const fallback = models.find((m) => next[m.id]);
						setDefaultModel(fallback ? fallback.id : "");
					}
					return next;
				});
			};

			const setAllModels = (checked) => {
				const next = {};
				models.forEach((m) => { next[m.id] = checked; });
				setIncluded(next);
				if (!checked) {
					setDefaultModel("");
				} else if (!next[defaultModel]) {
					const preferred = models.find((m) => /deepseek/i.test(m.id)) || models[0];
					setDefaultModel(preferred ? preferred.id : "");
					setEffort(preferred ? effortChoices(preferred.id)[0] : "off");
				}
			};

			const bulkButton = (label, onClick) => React.createElement("button", {
				type: "button",
				onClick,
				style: {
					border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 6,
					background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)",
					font: "inherit", fontSize: 12, lineHeight: "18px", padding: "2px 10px", cursor: "pointer",
				},
			}, label);

			// Key presence for the effective route (reused instead of re-pasting).
			React.useEffect(() => {
				let cancelled = false;
				const ref = deriveKeyRef(route);
				api.credentials.describe({ refs: [ref] }).then((response) => {
					if (cancelled) return;
					const views = response && response.result && response.result.ok
						? (response.result.value.credentials || {})
						: {};
					const hit = views[ref];
					setStoredKey(Boolean(hit && hit.configured));
				}).catch(() => {
					if (!cancelled) setStoredKey(false);
				});
				return () => { cancelled = true; };
			}, [api, route]);

			// Per-route memory of each gateway's address: localStorage first,
			// then the provider profiles saved in llm-pi-ai settings (baseURL
			// is not a secret, so it rides the redacted describe view).
			const [knownURLs, setKnownURLs] = React.useState(() => {
				const memo = {};
				try {
					PRESETS.forEach((p) => {
						const v = localStorage.getItem("gateway-config.baseURL." + p.route);
						if (v) memo[p.route] = v;
					});
				} catch (_e) { /* private mode etc. — non-fatal */ }
				return memo;
			});

			React.useEffect(() => {
				let cancelled = false;
				api.settings.describe({}).then((response) => {
					if (cancelled) return;
					const ok = response && response.result && response.result.ok;
					if (!ok) return;
					const ns = (response.result.value.namespaces || []).find((n) => n && n.ns === SETTINGS_NS);
					const providers = (ns && ns.value && ns.value.providers) || {};
					setKnownURLs((prev) => {
						const next = { ...prev };
						Object.keys(providers).forEach((r) => {
							const u = providers[r] && providers[r].baseURL;
							if (typeof u === "string" && u.trim()) next[r] = u.trim();
						});
						return next;
					});
				}).catch(() => {});
				return () => { cancelled = true; };
			}, [api]);

			// Switch the field with the route: the last-used address for that
			// route wins, then the preset's documented default, then empty.
			React.useEffect(() => {
				setBaseURL(knownURLs[route] || (preset && preset.baseURL) || "");
			}, [route, knownURLs]);

			const field = (label, value, onChange, placeholder, type) => React.createElement("label", { style: { ...fieldStyle, width: "100%", boxSizing: "border-box" } },
				React.createElement("span", { style: labelStyle }, label),
				React.createElement(Input, {
					value, type: type || "text", placeholder,
					onChange: (e) => onChange(e.target.value),
					style: { width: "100%", maxWidth: "none", boxSizing: "border-box" },
				}),
			);

			const fetchModels = async () => {
				if (busy) return;
				if (!baseURL.trim()) {
					setMessage({ kind: "error", text: "请先填写 Base URL（OpenAI 兼容、支持 /models 查询的网关地址）。" });
					return;
				}
				setBusy(true);
				setMessage(null);
				try {
					const response = await api.llm.discoverModels({
						settingsNs: SETTINGS_NS,
						provider: route,
						baseURL,
						api: "openai-completions",
						...(typedKey ? { apiKey: typedKey } : {}),
					});
					if (!response || !response.result || !response.result.ok) {
						const err = ((response && response.result && response.result.error) || {});
						setMessage({ kind: "error", text: "拉取失败：" + (err.message || "未知错误") });
						return;
					}
					const found = response.result.value.models;
					const chat = found.filter((m) => isChatModel(m.id));
					const keep = {};
					chat.forEach((m) => { keep[m.id] = true; });
					setModels(chat);
					setIncluded(keep);
					setFiltered(found.length - chat.length);
					const preferred = chat.find((m) => /deepseek/i.test(m.id)) || chat[0];
					setDefaultModel(preferred ? preferred.id : "");
					setEffort(preferred ? effortChoices(preferred.id)[0] : "off");
					rememberBaseURL();
					setMessage({ kind: "ok", text: `拉取到 ${found.length} 个模型，过滤掉 ${found.length - chat.length} 个非聊天模型。请勾选要写入的模型；输入模态与推理档位已按模型家族自动录入。` });
				} catch (error) {
					setMessage({ kind: "error", text: "拉取失败：" + String((error && error.message) || error) });
				} finally {
					setBusy(false);
				}
			};

			const rememberBaseURL = () => {
				const url = baseURL.trim();
				setKnownURLs((prev) => (prev[route] === url ? prev : { ...prev, [route]: url }));
				try { localStorage.setItem("gateway-config.baseURL." + route, url); }
				catch (_e) { /* private mode etc. — non-fatal */ }
			};

			const applyConfig = async () => {
				if (busy || selectedModels.length === 0) return;
				if (!baseURL.trim()) {
					setMessage({ kind: "error", text: "Base URL 不能为空：请返回第一步重新填写网关地址。" });
					return;
				}
				setBusy(true);
				setMessage(null);
				try {
					const ref = deriveKeyRef(route);
					const profile = {
						displayName: displayName.trim() || (known && known.displayName) || route.charAt(0).toUpperCase() + route.slice(1),
						apiKeyEnv: ref,
						api: "openai-completions",
						baseURL,
						models: selectedModels.map((m) => ({
							id: m.id,
							...(m.name ? { name: m.name } : {}),
							...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
							...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
							input: inputFor(m),
							reasoningEfforts: reasoningFor(m.id),
							compat: compatFor(m.id),
						})),
					};
					const ops = [];
					if (cleanup) ops.push({ op: "unset", path: ["providers", "openai"] });
					ops.push({ op: "set", path: ["providers", route], value: profile });
					const mutated = await api.settings.mutate({ ns: SETTINGS_NS, ops });
					if (!mutated || !mutated.result || !mutated.result.ok) {
						const err = ((mutated && mutated.result && mutated.result.error) || {});
						setMessage({ kind: "error", text: "写入配置失败：" + (err.message || "未知错误") });
						return;
					}
					let keyNote = "沿用已保存的 " + ref;
					if (typedKey) {
						const stored = await api.credentials.set({ ref, value: typedKey });
						if (!stored || !stored.result || !stored.result.ok) {
							const err = ((stored && stored.result && stored.result.error) || {});
							setMessage({ kind: "error", text: "存储 key 失败：" + (err.message || "未知错误") });
							return;
						}
						setStoredKey(true);
						keyNote = "key 存入 " + ref;
					} else if (!storedKey) {
						setMessage({ kind: "error", text: "还没有可用的 API key：请返回第一步输入一次，或确认该 route 已保存 " + ref + "。" });
						return;
					}
					let defaultSaved = "";
					const chosenDefault = included[defaultModel] ? defaultModel : selectedModels[0] && selectedModels[0].id;
					if (chosenDefault) {
						const dm = await api.settings.mutate({
							ns: "agent-default-model",
							ops: [{ op: "set", path: [], value: { provider: route, model: chosenDefault } }],
						});
						if (dm && dm.result && dm.result.ok) defaultSaved = "，默认模型已切换";
					}
					rememberBaseURL();
					setResult({
						route,
						displayName: profile.displayName,
						keyNote,
						count: selectedModels.length,
						skipped: models.length - selectedModels.length,
						filtered,
						defaultModel: chosenDefault || "",
						defaultSaved,
					});
					setStep(DONE_STEP);
				} catch (error) {
					setMessage({ kind: "error", text: "写入失败：" + String((error && error.message) || error) });
				} finally {
					setBusy(false);
				}
			};

			const goNext = () => {
				if (step === 1) {
					if (!baseURL.trim()) {
						setMessage({ kind: "error", text: "请先填写 Base URL 再进入下一步。" });
						return;
					}
					if (!hasAuth) {
						setMessage({ kind: "error", text: "请先填写 API key（已保存过可留空）。" });
						return;
					}
					rememberBaseURL();
				}
				if (step === 2) {
					if (models.length === 0) {
						setMessage({ kind: "error", text: "请先拉取模型列表。" });
						return;
					}
					if (selectedModels.length === 0) {
						setMessage({ kind: "error", text: "请至少勾选一个模型。" });
						return;
					}
				}
				setMessage(null);
				setStep((s) => Math.min(s + 1, STEPS.length));
			};
			const goPrev = () => {
				setMessage(null);
				setStep((s) => Math.max(s - 1, 1));
			};
			const restart = () => {
				setResult(null);
				setMessage(null);
				setModels([]);
				setIncluded({});
				setFiltered(0);
				setDefaultModel("");
				setEffort("off");
				setApiKey("");
				setStep(1);
			};

			const onPickProvider = (value) => {
				setRoute(value);
				const picked = PRESETS.find((p) => p.route === value);
				setDisplayName(picked && picked.displayName && picked.displayName !== value ? picked.displayName : "");
			};

			const stepBar = React.createElement("div", {
				style: { display: "flex", gap: 6, alignItems: "center", margin: "8px 0 4px", fontSize: 12, color: "var(--dsw-alias-label-secondary)" },
			}, STEPS.map((label, i) => {
				const n = i + 1;
				const active = n === step;
				const done = n < step;
				return React.createElement("span", {
					key: label,
					style: {
						display: "inline-flex", alignItems: "center", gap: 4,
						padding: "3px 10px", borderRadius: 999,
						border: `1px solid ${active ? "var(--dsw-alias-border-l2)" : "transparent"}`,
						fontWeight: active ? 600 : 400,
						color: done ? "var(--dsw-alias-label-primary)" : active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-tertiary)",
					},
				},
					React.createElement("span", null, done ? "✓" : `${n}`),
					React.createElement("span", null, label),
					n < STEPS.length ? React.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)" } }, "→") : null,
				);
			}));

			const nextDisabled = busy
				|| (step === 1 && (!baseURL.trim() || !hasAuth))
				|| (step === 2 && (models.length === 0 || selectedModels.length === 0));

			const nav = (extra) => React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 14 } },
				step > 1 ? React.createElement(Button, { variant: "outline", onClick: goPrev, disabled: busy }, "上一步") : null,
				extra,
				step < STEPS.length ? React.createElement(Button, { variant: "primary", onClick: goNext, disabled: nextDisabled }, "下一步") : null,
			);

			let stepBody;
			if (step === DONE_STEP) {
				stepBody = [
					React.createElement("div", {
						key: "done",
						style: { ...fieldStyle, textAlign: "center", padding: "18px 0 6px" },
					},
						React.createElement("div", { style: { fontSize: 40, lineHeight: "48px" } }, "✅"),
						React.createElement("div", { style: { fontSize: 15, fontWeight: 500, color: "var(--dsw-alias-label-primary)", margin: "6px 0" } },
							`导入成功：${result.displayName}（${result.route}）`),
						React.createElement("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, lineHeight: "22px" } },
							`写入 ${result.count} 个模型${result.skipped > 0 ? `，跳过 ${result.skipped} 个未勾选` : ""}${result.filtered > 0 ? `，过滤 ${result.filtered} 个非聊天模型` : ""}；${result.keyNote}${result.defaultSaved ? `；默认模型：${result.defaultModel}` : ""}`),
					),
					React.createElement("div", { key: "actions", style: { display: "flex", gap: 8, justifyContent: "center", marginTop: 14 } },
						React.createElement(Button, { variant: "primary", onClick: restart }, "返回继续导入"),
					),
				];
			} else if (step === 1) {
				stepBody = [
					field(storedKey ? `API key（${deriveKeyRef(route)} 已保存，可留空继续用）` : "API key", apiKey, setApiKey, storedKey ? "留空则沿用已保存的 key" : "sk-...", "password"),
					field("Base URL（已配置的 provider 会自动回填）", baseURL, setBaseURL, "https://<网关地址>/v1"),
					React.createElement("label", { key: "provider", style: fieldStyle },
						React.createElement("span", { style: labelStyle }, "Provider（已支持的网关）"),
						React.createElement("select", {
							value: route,
							onChange: (e) => onPickProvider(e.target.value),
							style: selectStyle,
						},
							PRESETS.map((p) => React.createElement("option", { key: p.route, value: p.route },
								`${p.route}（${p.displayName}）`)),
						),
					),
					field("Provider 显示名称（可选）", displayName, setDisplayName, (known && known.displayName) || ""),
					nav(null),
				];
			} else if (step === 2) {
				stepBody = [
					nav(React.createElement(Button, {
						key: "fetch",
						variant: "outline",
						onClick: fetchModels,
						disabled: busy || !hasAuth || !baseURL.trim(),
					}, busy ? "拉取中…" : "拉取模型")),
					models.length > 0
						? React.createElement("div", { key: "list", style: { ...fieldStyle, maxHeight: 260, overflowY: "auto", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "6px 10px" } },
							React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
								React.createElement("span", { style: { ...labelStyle, flex: 1 } },
									`模型列表（勾选后写入，共 ${selectedModels.length}/${models.length} 个；● 标记默认模型）`),
								bulkButton("全不选", () => setAllModels(false)),
								bulkButton("全选", () => setAllModels(true)),
							),
							models.map((m) => React.createElement("div", {
								key: m.id,
								style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, lineHeight: "26px" },
							},
								React.createElement("input", {
									type: "checkbox",
									checked: Boolean(included[m.id]),
									onChange: (e) => toggleModel(m.id, e.target.checked),
								}),
								React.createElement("input", {
									type: "radio",
									name: "gateway-config-default-model",
									checked: defaultModel === m.id,
									disabled: !included[m.id],
									onChange: () => { setDefaultModel(m.id); setEffort(effortChoices(m.id)[0]); },
									title: "设为默认模型",
								}),
								React.createElement("span", { style: { color: "var(--dsw-alias-label-primary)", wordBreak: "break-all" } },
									`${m.name || m.id} · ${capabilityNote(m)}`),
							)),
						)
						: React.createElement("p", { key: "hint", style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, margin: "10px 0 0" } },
							"点击「拉取模型」获取网关的聊天模型列表；非聊天模型（图像/视频/嵌入/语音等）会自动过滤。"),
					defaultModel
						? React.createElement("label", { key: "effort", style: fieldStyle },
							React.createElement("span", { style: labelStyle }, "默认推理强度"),
							React.createElement("select", {
								value: effort,
								onChange: (e) => setEffort(e.target.value),
								style: selectStyle,
							}, effortChoices(defaultModel).map((level) => React.createElement("option", { key: level, value: level }, level))),
						)
						: null,
				];
			} else {
				const chosenDefault = included[defaultModel] ? defaultModel : selectedModels[0] && selectedModels[0].id;
				const shown = selectedModels.slice(0, 8).map((m) => m.id).join("、");
				const more = selectedModels.length > 8 ? ` 等 ${selectedModels.length} 个` : "";
				stepBody = [
					React.createElement("div", { key: "summary", style: { ...fieldStyle, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "10px 12px" } },
						summaryRow("Provider", `${route}（${displayName.trim() || (known && known.displayName) || route}）`),
						summaryRow("Base URL", baseURL),
						summaryRow("API key", storedKey ? `${deriveKeyRef(route)} 已保存${typedKey ? "，将更新为新填入的 key" : "，沿用"}` : typedKey ? `将存入 ${deriveKeyRef(route)}` : "未提供"),
						summaryRow("写入模型", `${selectedModels.length} 个：${shown}${more}`),
						summaryRow("过滤模型", `${filtered} 个非聊天模型`),
						summaryRow("默认模型", chosenDefault ? `${chosenDefault} · 档位 ${effort}` : "未选择"),
					),
					React.createElement("label", { key: "cleanup", style: { display: "flex", alignItems: "center", gap: 6, margin: "12px 0 0", fontSize: 13, color: "var(--dsw-alias-label-secondary)" } },
						React.createElement("input", { type: "checkbox", checked: cleanup, onChange: (e) => setCleanup(e.target.checked) }),
						" 清理现有 openai provider（模型 id 含空格，无效）",
					),
					nav(React.createElement(Button, {
						key: "apply",
						variant: "primary",
						onClick: applyConfig,
						disabled: busy || selectedModels.length === 0,
					}, busy ? "导入中…" : "导入配置")),
				];
			}

			const status = message
				? React.createElement("div", { style: statusStyle(message.kind) }, message.text)
				: null;

			return React.createElement("div", { style: { maxWidth: 560 } },
				React.createElement("div", { style: { fontSize: 16, fontWeight: 500, lineHeight: "24px", color: "var(--dsw-alias-label-primary)", margin: 0 } },
					step === DONE_STEP ? "LLM 网关配置 · 导入完成" : `LLM 网关配置 · 第 ${step} 步 / 共 ${STEPS.length} 步`),
				stepBar,
				...stepBody,
				status,
			);
		}

		const inject = ["slots", "connection"];

		function apply(ctx) {
			const slots = ctx.get("slots");
			const connection = ctx.get("connection");
			if (slots === void 0 || connection === void 0) return;
			const api = connection.api;
			slots.inject("settings.section", () => slots.register({
				name: "settings.section",
				id: "gateway-config",
				order: 30,
				label: () => "LLM 网关配置",
				inject: () => ({ api }),
			}, GatewaySection));
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
